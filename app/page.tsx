import Link from "next/link";
import { buildSnapshot } from "@/lib/context";
import { getPlan } from "@/lib/coach";
import { weekday } from "@/lib/dates";
import PlanCard from "@/components/PlanCard";

export const dynamic = "force-dynamic";

const r0 = (n: number | null | undefined) => (n == null ? "–" : Math.round(n));

export default async function TodayPage() {
  const snapshot = await buildSnapshot();
  const plan = await getPlan(snapshot.today);
  const rec = snapshot.recovery.find((r) => r.day === snapshot.today) ?? null;
  const lastSleep = snapshot.sleep[0];
  const recColor =
    rec?.recovery_score == null ? "" : rec.recovery_score >= 67 ? "green" : rec.recovery_score >= 34 ? "yellow" : "red";
  const recent = snapshot.activities.slice(0, 5);
  const noSources = !snapshot.connected.strava && !snapshot.connected.whoop;

  return (
    <main className="page">
      <p className="page-sub" style={{ margin: 0 }}>
        {weekday(snapshot.today)}, {snapshot.today}
      </p>
      <h1 className="page-title">
        {snapshot.profile.name ? `Morning, ${snapshot.profile.name}` : "Today"}
      </h1>
      <div style={{ height: 12 }} />

      {noSources && (
        <div className="notice">
          Connect Strava and WHOOP in <Link href="/settings">Settings</Link> so your coach can see your data.
        </div>
      )}

      <div className="card">
        <h2>Readiness</h2>
        <div className="stats">
          <div className="stat">
            <div className="label">Recovery</div>
            <div className="value">
              {recColor && <span className={`dot ${recColor}`} style={{ marginRight: 6 }} />}
              {r0(rec?.recovery_score)}
              {rec?.recovery_score != null && <span className="small">%</span>}
            </div>
            <div className="hint">WHOOP</div>
          </div>
          <div className="stat">
            <div className="label">HRV</div>
            <div className="value">{r0(rec?.hrv_rmssd_ms)}</div>
            <div className="hint">ms · RHR {r0(rec?.resting_hr)}</div>
          </div>
          <div className="stat">
            <div className="label">Sleep</div>
            <div className="value">
              {lastSleep?.total_sleep_min ? (lastSleep.total_sleep_min / 60).toFixed(1) : "–"}
              <span className="small">h</span>
            </div>
            <div className="hint">perf. {r0(lastSleep?.performance_pct)}%</div>
          </div>
        </div>
      </div>

      <PlanCard initialPlan={plan} />

      <div className="card">
        <h2>Training load</h2>
        <div className="stats">
          <div className="stat">
            <div className="label">Fitness</div>
            <div className="value">{snapshot.load.fitness}</div>
            <div className="hint">42-day</div>
          </div>
          <div className="stat">
            <div className="label">Fatigue</div>
            <div className="value">{snapshot.load.fatigue}</div>
            <div className="hint">7-day</div>
          </div>
          <div className="stat">
            <div className="label">Form</div>
            <div className="value">{snapshot.load.form > 0 ? `+${snapshot.load.form}` : snapshot.load.form}</div>
            <div className="hint">fitness − fatigue</div>
          </div>
        </div>
        <p className="muted small" style={{ margin: "10px 0 0" }}>
          Last 7 days: {snapshot.load.last7Load} · previous 7: {snapshot.load.prev7Load}. Calculated from Strava Relative
          Effort and WHOOP strain.
        </p>
      </div>

      <div className="card">
        <h2>Recent sessions</h2>
        {recent.length === 0 && <p className="muted small">No sessions synced yet.</p>}
        <ul className="list">
          {recent.map((a) => (
            <li key={a.id}>
              <span>
                <strong>{a.name || a.sport}</strong>
                <br />
                <span className="muted small">
                  {a.day} · {a.sport}
                  {a.distance_m ? ` · ${(a.distance_m / 1000).toFixed(1)} km` : ""}
                  {a.duration_s ? ` · ${Math.round(a.duration_s / 60)} min` : ""}
                </span>
              </span>
              <span className="muted small" style={{ whiteSpace: "nowrap" }}>
                load {Math.round(a.load)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
