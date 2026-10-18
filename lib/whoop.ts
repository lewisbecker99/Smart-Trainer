import { createHmac, timingSafeEqual } from "node:crypto";
import { appUrl, env } from "./env";
import { sql } from "./db";
import { localDay } from "./dates";
import { getAccessToken, saveToken } from "./tokens";

const OAUTH = "https://api.prod.whoop.com/oauth/oauth2";
const API = "https://api.prod.whoop.com/developer/v2";
const SCOPES = "offline read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement";

export const whoopRedirectUri = () => `${appUrl()}/api/whoop/callback`;

export function whoopAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: env("WHOOP_CLIENT_ID"),
    redirect_uri: whoopRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    state, // WHOOP requires at least 8 characters
  });
  return `${OAUTH}/auth?${params}`;
}

interface WhoopTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<WhoopTokenResponse> {
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("WHOOP_CLIENT_ID"),
      client_secret: env("WHOOP_CLIENT_SECRET"),
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`WHOOP token request failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function exchangeWhoopCode(code: string) {
  const t = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: whoopRedirectUri(),
  });
  const profile = await fetch(`${API}/user/profile/basic`, {
    headers: { Authorization: `Bearer ${t.access_token}` },
  }).then((r) => (r.ok ? (r.json() as Promise<{ user_id: number }>) : null));
  await saveToken({
    provider: "whoop",
    athlete_id: profile ? String(profile.user_id) : null,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: new Date(Date.now() + t.expires_in * 1000),
    scope: t.scope ?? SCOPES,
  });
}

async function whoopToken() {
  return getAccessToken("whoop", async (refreshToken) => {
    const t = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "offline",
    });
    return {
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: new Date(Date.now() + t.expires_in * 1000),
      scope: t.scope ?? null,
    };
  });
}

/** Iterates a paginated WHOOP collection between `start` and now. */
async function* collection<T>(path: string, start: Date): AsyncGenerator<T> {
  const token = await whoopToken();
  if (!token) return;
  let nextToken: string | undefined;
  for (let page = 0; page < 40; page++) {
    const params = new URLSearchParams({ start: start.toISOString(), limit: "25" });
    if (nextToken) params.set("nextToken", nextToken);
    const res = await fetch(`${API}${path}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`WHOOP GET ${path} failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { records: T[]; next_token?: string | null };
    for (const r of body.records) yield r;
    if (!body.next_token) break;
    nextToken = body.next_token;
  }
}

interface WhoopSleep {
  id: string;
  start: string;
  end: string;
  nap: boolean;
  score_state: string;
  score?: {
    stage_summary?: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_rem_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
    };
    respiratory_rate?: number;
    sleep_performance_percentage?: number;
    sleep_efficiency_percentage?: number;
  };
}

interface WhoopRecovery {
  cycle_id: number;
  sleep_id: string;
  created_at: string;
  score_state: string;
  score?: {
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  };
}

interface WhoopWorkout {
  id: string;
  start: string;
  end: string;
  sport_name?: string;
  score_state: string;
  score?: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
    distance_meter?: number;
    altitude_gain_meter?: number;
  };
}

interface WhoopCycle {
  id: number;
  start: string;
  end?: string | null;
  score_state: string;
  score?: { strain: number; kilojoule: number; average_heart_rate: number };
}

const minutes = (ms?: number) => (ms == null ? null : ms / 60000);

export async function syncWhoop(days: number) {
  const start = new Date(Date.now() - days * 86400_000);
  const sleepDayById = new Map<string, string>();
  let counts = { sleep: 0, recovery: 0, workouts: 0, cycles: 0 };

  for await (const s of collection<WhoopSleep>("/activity/sleep", start)) {
    const day = localDay(s.end);
    sleepDayById.set(s.id, day);
    const st = s.score?.stage_summary;
    const total = st ? st.total_in_bed_time_milli - st.total_awake_time_milli : undefined;
    await sql`
      INSERT INTO sleep (id, day, start_time, end_time, is_nap, performance_pct, efficiency_pct,
                         total_sleep_min, rem_min, deep_min, respiratory_rate, raw, updated_at)
      VALUES (${s.id ?? null}, ${day ?? null}, ${s.start ?? null}, ${s.end ?? null}, ${s.nap ?? null},
              ${s.score?.sleep_performance_percentage ?? null}, ${s.score?.sleep_efficiency_percentage ?? null},
              ${minutes(total) ?? null}, ${minutes(st?.total_rem_sleep_time_milli) ?? null},
              ${minutes(st?.total_slow_wave_sleep_time_milli) ?? null}, ${s.score?.respiratory_rate ?? null},
              ${sql.json(s as never)}, now())
      ON CONFLICT (id) DO UPDATE SET
        day = EXCLUDED.day, start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
        is_nap = EXCLUDED.is_nap, performance_pct = EXCLUDED.performance_pct,
        efficiency_pct = EXCLUDED.efficiency_pct, total_sleep_min = EXCLUDED.total_sleep_min,
        rem_min = EXCLUDED.rem_min, deep_min = EXCLUDED.deep_min,
        respiratory_rate = EXCLUDED.respiratory_rate, raw = EXCLUDED.raw, updated_at = now()`;
    counts.sleep++;
  }

  for await (const r of collection<WhoopRecovery>("/recovery", start)) {
    if (r.score_state !== "SCORED" || !r.score) continue;
    // Recovery belongs to the morning you woke up from the associated sleep.
    const day = sleepDayById.get(r.sleep_id) ?? localDay(r.created_at);
    await sql`
      INSERT INTO recovery (day, sleep_id, recovery_score, hrv_rmssd_ms, resting_hr, spo2, skin_temp_c, raw, updated_at)
      VALUES (${day ?? null}, ${r.sleep_id ?? null}, ${r.score.recovery_score ?? null}, ${r.score.hrv_rmssd_milli ?? null},
              ${r.score.resting_heart_rate ?? null}, ${r.score.spo2_percentage ?? null}, ${r.score.skin_temp_celsius ?? null},
              ${sql.json(r as never)}, now())
      ON CONFLICT (day) DO UPDATE SET
        sleep_id = EXCLUDED.sleep_id, recovery_score = EXCLUDED.recovery_score,
        hrv_rmssd_ms = EXCLUDED.hrv_rmssd_ms, resting_hr = EXCLUDED.resting_hr,
        spo2 = EXCLUDED.spo2, skin_temp_c = EXCLUDED.skin_temp_c, raw = EXCLUDED.raw, updated_at = now()`;
    counts.recovery++;
  }

  for await (const w of collection<WhoopWorkout>("/activity/workout", start)) {
    const duration = Math.round((new Date(w.end).getTime() - new Date(w.start).getTime()) / 1000);
    await sql`
      INSERT INTO activities (id, source, sport, name, start_time, duration_s, distance_m, elevation_m,
                              avg_hr, max_hr, strain, kilojoules, raw, updated_at)
      VALUES (${`whoop:${w.id}`}, 'whoop', ${w.sport_name ?? "activity"}, ${w.sport_name ?? null},
              ${w.start ?? null}, ${duration ?? null}, ${w.score?.distance_meter ?? null}, ${w.score?.altitude_gain_meter ?? null},
              ${w.score?.average_heart_rate ?? null}, ${w.score?.max_heart_rate ?? null}, ${w.score?.strain ?? null},
              ${w.score?.kilojoule ?? null}, ${sql.json(w as never)}, now())
      ON CONFLICT (id) DO UPDATE SET
        sport = EXCLUDED.sport, start_time = EXCLUDED.start_time, duration_s = EXCLUDED.duration_s,
        distance_m = EXCLUDED.distance_m, elevation_m = EXCLUDED.elevation_m,
        avg_hr = EXCLUDED.avg_hr, max_hr = EXCLUDED.max_hr, strain = EXCLUDED.strain,
        kilojoules = EXCLUDED.kilojoules, raw = EXCLUDED.raw, updated_at = now()`;
    counts.workouts++;
  }

  for await (const c of collection<WhoopCycle>("/cycle", start)) {
    await sql`
      INSERT INTO cycles (id, day, strain, kilojoules, avg_hr, raw, updated_at)
      VALUES (${String(c.id) ?? null}, ${localDay(c.start) ?? null}, ${c.score?.strain ?? null}, ${c.score?.kilojoule ?? null},
              ${c.score?.average_heart_rate ?? null}, ${sql.json(c as never)}, now())
      ON CONFLICT (id) DO UPDATE SET
        day = EXCLUDED.day, strain = EXCLUDED.strain, kilojoules = EXCLUDED.kilojoules,
        avg_hr = EXCLUDED.avg_hr, raw = EXCLUDED.raw, updated_at = now()`;
    counts.cycles++;
  }

  return counts;
}

export async function deleteWhoopWorkout(id: string) {
  await sql`DELETE FROM activities WHERE id = ${`whoop:${id}`}`;
}

/**
 * Verifies a WHOOP webhook: base64(HMAC-SHA256(timestamp + rawBody, client_secret))
 * must equal the X-WHOOP-Signature header.
 */
export function verifyWhoopSignature(rawBody: string, timestamp: string | null, signature: string | null) {
  if (!timestamp || !signature) return false;
  const expected = createHmac("sha256", env("WHOOP_CLIENT_SECRET"))
    .update(timestamp + rawBody)
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
