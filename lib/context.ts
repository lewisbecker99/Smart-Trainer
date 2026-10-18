import { sql, getSetting } from "./db";
import { addDays, localDay, weekday } from "./dates";

export interface AthleteProfile {
  name?: string;
  goals?: string;          // e.g. "Sub-3h marathon in April, stay strong"
  sports?: string;         // e.g. "running, cycling, gym"
  weeklyHours?: number;    // available training time
  constraints?: string;    // injuries, schedule, equipment
  preferences?: string;    // likes/dislikes
}

export const PROFILE_KEY = "profile";

interface ActivityRow {
  id: string;
  source: string;
  sport: string;
  name: string | null;
  start_time: Date;
  duration_s: number | null;
  distance_m: number | null;
  elevation_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_watts: number | null;
  suffer_score: number | null;
  strain: number | null;
}

export interface Activity extends ActivityRow {
  day: string;
  load: number;
  loadSource: "strava_relative_effort" | "whoop_strain_estimate" | "duration_estimate";
}

export interface RecoveryRow {
  day: string;
  recovery_score: number | null;
  hrv_rmssd_ms: number | null;
  resting_hr: number | null;
}

export interface SleepRow {
  day: string;
  performance_pct: number | null;
  total_sleep_min: number | null;
  deep_min: number | null;
  rem_min: number | null;
}

export interface LoadMetrics {
  fitness: number; // CTL, 42-day EWMA of daily load
  fatigue: number; // ATL, 7-day EWMA
  form: number;    // TSB = CTL - ATL (yesterday's values, i.e. form going into today)
  last7Load: number;
  prev7Load: number;
}

export interface Snapshot {
  today: string;
  profile: AthleteProfile;
  activities: Activity[];
  recovery: RecoveryRow[];
  sleep: SleepRow[];
  load: LoadMetrics;
  connected: { strava: boolean; whoop: boolean };
}

// WHOOP strain is logarithmic (0-21). Map it onto a Strava-relative-effort-like
// scale so both sources share one load unit: ~50 at strain 10, ~120 at 14, ~290 at 18.
const strainToLoad = (strain: number) => 50 * Math.exp(0.22 * (strain - 10));

function activityLoad(a: ActivityRow): Pick<Activity, "load" | "loadSource"> {
  if (a.suffer_score != null && a.suffer_score > 0) {
    return { load: a.suffer_score, loadSource: "strava_relative_effort" };
  }
  if (a.strain != null && a.strain > 0) {
    return { load: strainToLoad(a.strain), loadSource: "whoop_strain_estimate" };
  }
  return { load: ((a.duration_s ?? 0) / 60) * 0.8, loadSource: "duration_estimate" };
}

/**
 * Strava and WHOOP often record the same session. Keep the Strava record
 * (richer: distance, power, name) and copy WHOOP's strain onto it.
 */
function mergeDuplicates(rows: ActivityRow[]): ActivityRow[] {
  const strava = rows.filter((r) => r.source === "strava");
  const out = [...strava];
  for (const w of rows.filter((r) => r.source === "whoop")) {
    const match = strava.find(
      (s) => Math.abs(new Date(s.start_time).getTime() - new Date(w.start_time).getTime()) < 20 * 60_000,
    );
    if (match) {
      match.strain ??= w.strain;
      match.avg_hr ??= w.avg_hr;
    } else {
      out.push(w);
    }
  }
  return out.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
}

function computeLoad(activities: Activity[], today: string): LoadMetrics {
  const byDay = new Map<string, number>();
  for (const a of activities) byDay.set(a.day, (byDay.get(a.day) ?? 0) + a.load);

  let ctl = 0;
  let atl = 0;
  // Walk 120 days up to yesterday so the EWMAs settle.
  for (let i = 120; i >= 1; i--) {
    const load = byDay.get(addDays(today, -i)) ?? 0;
    ctl += (load - ctl) / 42;
    atl += (load - atl) / 7;
  }
  const sumRange = (from: number, to: number) => {
    let s = 0;
    for (let i = from; i <= to; i++) s += byDay.get(addDays(today, -i)) ?? 0;
    return s;
  };
  return {
    fitness: Math.round(ctl),
    fatigue: Math.round(atl),
    form: Math.round(ctl - atl),
    last7Load: Math.round(sumRange(0, 6)),
    prev7Load: Math.round(sumRange(7, 13)),
  };
}

export async function buildSnapshot(): Promise<Snapshot> {
  const today = localDay();
  const since = addDays(today, -120);

  const [profile, rawActivities, recovery, sleep, tokens] = await Promise.all([
    getSetting<AthleteProfile>(PROFILE_KEY, {}),
    sql<ActivityRow[]>`
      SELECT id, source, sport, name, start_time, duration_s, distance_m, elevation_m,
             avg_hr, max_hr, avg_watts, suffer_score, strain
      FROM activities WHERE start_time >= ${since} ORDER BY start_time DESC`,
    sql<RecoveryRow[]>`
      SELECT to_char(day, 'YYYY-MM-DD') AS day, recovery_score, hrv_rmssd_ms, resting_hr
      FROM recovery WHERE day >= ${addDays(today, -28)} ORDER BY day DESC`,
    sql<SleepRow[]>`
      SELECT to_char(day, 'YYYY-MM-DD') AS day, performance_pct, total_sleep_min, deep_min, rem_min
      FROM sleep WHERE NOT is_nap AND day >= ${addDays(today, -14)} ORDER BY day DESC`,
    sql<{ provider: string }[]>`SELECT provider FROM oauth_tokens`,
  ]);

  const activities: Activity[] = mergeDuplicates(rawActivities).map((a) => ({
    ...a,
    day: localDay(a.start_time),
    ...activityLoad(a),
  }));

  return {
    today,
    profile,
    activities,
    recovery,
    sleep,
    load: computeLoad(activities, today),
    connected: {
      strava: tokens.some((t) => t.provider === "strava"),
      whoop: tokens.some((t) => t.provider === "whoop"),
    },
  };
}

const r0 = (n: number | null | undefined) => (n == null ? "–" : String(Math.round(n)));
const km = (m: number | null) => (m ? `${(m / 1000).toFixed(1)} km` : "");
const mins = (s: number | null) => (s ? `${Math.round(s / 60)} min` : "");

function mean(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Compact, model-friendly text rendering of the athlete's current state. */
export function renderSnapshot(s: Snapshot): string {
  const p = s.profile;
  const lines: string[] = [];
  lines.push(`Today: ${weekday(s.today)} ${s.today}`);
  lines.push(
    `Data sources connected: Strava=${s.connected.strava ? "yes" : "no"}, WHOOP=${s.connected.whoop ? "yes" : "no"}`,
  );

  lines.push("\n## Athlete profile");
  lines.push(`Name: ${p.name || "unknown"}`);
  lines.push(`Goals: ${p.goals || "not set"}`);
  lines.push(`Sports: ${p.sports || "not set"}`);
  lines.push(`Available hours/week: ${p.weeklyHours ?? "not set"}`);
  lines.push(`Constraints/injuries: ${p.constraints || "none stated"}`);
  lines.push(`Preferences: ${p.preferences || "none stated"}`);

  const todayRec = s.recovery.find((r) => r.day === s.today);
  const hrvBase = mean(s.recovery.filter((r) => r.day !== s.today).map((r) => r.hrv_rmssd_ms));
  const rhrBase = mean(s.recovery.filter((r) => r.day !== s.today).map((r) => r.resting_hr));
  lines.push("\n## Recovery (WHOOP)");
  if (todayRec) {
    lines.push(
      `Today: recovery ${r0(todayRec.recovery_score)}%, HRV ${r0(todayRec.hrv_rmssd_ms)} ms (28d avg ${r0(hrvBase)}), RHR ${r0(todayRec.resting_hr)} bpm (28d avg ${r0(rhrBase)})`,
    );
  } else {
    lines.push("Today: no recovery score yet.");
  }
  for (const r of s.recovery.slice(0, 10)) {
    lines.push(`- ${r.day}: recovery ${r0(r.recovery_score)}%, HRV ${r0(r.hrv_rmssd_ms)}, RHR ${r0(r.resting_hr)}`);
  }

  lines.push("\n## Sleep (WHOOP, last 7 nights)");
  for (const sl of s.sleep.slice(0, 7)) {
    lines.push(
      `- ${sl.day}: ${sl.total_sleep_min ? (sl.total_sleep_min / 60).toFixed(1) : "–"} h, performance ${r0(sl.performance_pct)}%, deep ${r0(sl.deep_min)} min, REM ${r0(sl.rem_min)} min`,
    );
  }
  if (s.sleep.length === 0) lines.push("No sleep data.");

  lines.push("\n## Training load (calculated by the app, not measured)");
  lines.push(
    `Fitness (42d) ${s.load.fitness}, fatigue (7d) ${s.load.fatigue}, form ${s.load.form} (negative = carrying fatigue). Load last 7 days ${s.load.last7Load} vs previous 7 days ${s.load.prev7Load}.`,
  );
  lines.push(
    "Load units ≈ Strava Relative Effort; WHOOP-only sessions use an estimate from strain, sessions without HR use a duration estimate.",
  );

  lines.push("\n## Sessions, last 21 days (newest first)");
  const cutoff = addDays(s.today, -21);
  const recent = s.activities.filter((a) => a.day >= cutoff);
  for (const a of recent) {
    const bits = [
      a.day,
      a.sport,
      a.name ? `"${a.name}"` : "",
      mins(a.duration_s),
      km(a.distance_m),
      a.elevation_m ? `${Math.round(a.elevation_m)} m up` : "",
      a.avg_hr ? `avg HR ${r0(a.avg_hr)}` : "",
      a.avg_watts ? `${r0(a.avg_watts)} W` : "",
      a.strain ? `strain ${a.strain.toFixed(1)}` : "",
      `load ${Math.round(a.load)}${a.loadSource === "strava_relative_effort" ? "" : " (est.)"}`,
    ].filter(Boolean);
    lines.push(`- ${bits.join(", ")}`);
  }
  if (recent.length === 0) lines.push("No sessions recorded.");

  return lines.join("\n");
}
