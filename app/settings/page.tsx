import { sql, getSetting } from "@/lib/db";
import { PROFILE_KEY, type AthleteProfile } from "@/lib/context";
import { ProfileForm, Connections, Notifications, Logout } from "@/components/SettingsClient";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  strava_state: "Strava connection failed (session expired). Please try again.",
  strava_scope: "Please allow access to your activities when connecting Strava.",
  whoop_state: "WHOOP connection failed (session expired). Please try again.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const params = await searchParams;
  const [tokens, profile, counts] = await Promise.all([
    sql<{ provider: string; updated_at: Date }[]>`SELECT provider, updated_at FROM oauth_tokens`,
    getSetting<AthleteProfile>(PROFILE_KEY, {}),
    sql<{ source: string; n: number; latest: Date | null }[]>`
      SELECT source, count(*)::int AS n, max(start_time) AS latest FROM activities GROUP BY source`,
  ]);
  const recoveryCount = await sql<{ n: number; latest: string | null }[]>`
    SELECT count(*)::int AS n, to_char(max(day), 'YYYY-MM-DD') AS latest FROM recovery`;

  const status = {
    strava: {
      connected: tokens.some((t) => t.provider === "strava"),
      detail: (() => {
        const c = counts.find((x) => x.source === "strava");
        return c ? `${c.n} activities · latest ${new Date(c.latest!).toISOString().slice(0, 10)}` : "No activities yet";
      })(),
    },
    whoop: {
      connected: tokens.some((t) => t.provider === "whoop"),
      detail: recoveryCount[0].n
        ? `${recoveryCount[0].n} recovery days · latest ${recoveryCount[0].latest}`
        : "No recovery data yet",
    },
  };

  return (
    <main className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Data sources, notifications and your athlete profile.</p>
      {params.error && <div className="notice">{ERRORS[params.error] ?? params.error}</div>}
      {params.connected && (
        <div className="notice">
          {params.connected === "strava" ? "Strava" : "WHOOP"} connected. Your history has been imported.
        </div>
      )}
      <Connections status={status} />
      <Notifications vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
      <ProfileForm initial={profile} />
      <Logout />
    </main>
  );
}
