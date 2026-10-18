import { appUrl, env } from "./env";
import { sql } from "./db";
import { getAccessToken, saveToken } from "./tokens";

const API = "https://www.strava.com/api/v3";
const TOKEN_URL = "https://www.strava.com/oauth/token";

export const stravaRedirectUri = () => `${appUrl()}/api/strava/callback`;

export function stravaAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: env("STRAVA_CLIENT_ID"),
    redirect_uri: stravaRedirectUri(),
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,profile:read_all,activity:read_all",
    state,
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number };
}

async function tokenRequest(body: Record<string, string>): Promise<StravaTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env("STRAVA_CLIENT_ID"),
      client_secret: env("STRAVA_CLIENT_SECRET"),
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`Strava token request failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function exchangeStravaCode(code: string, scope: string | null) {
  const t = await tokenRequest({ code, grant_type: "authorization_code" });
  await saveToken({
    provider: "strava",
    athlete_id: t.athlete ? String(t.athlete.id) : null,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: new Date(t.expires_at * 1000),
    scope,
  });
}

async function stravaToken() {
  return getAccessToken("strava", async (refreshToken) => {
    const t = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
    return {
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: new Date(t.expires_at * 1000),
      scope: null,
    };
  });
}

async function stravaGet<T>(path: string): Promise<T | null> {
  const token = await stravaToken();
  if (!token) return null;
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Strava GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

interface StravaActivity {
  id: number;
  name: string;
  sport_type?: string;
  type: string;
  start_date: string;
  moving_time: number;
  elapsed_time: number;
  distance: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  suffer_score?: number | null;
  kilojoules?: number;
  description?: string | null;
}

async function upsertActivity(a: StravaActivity) {
  // Keep the payload lean; the full detail object can be large.
  const raw = {
    sport_type: a.sport_type ?? a.type,
    weighted_average_watts: a.weighted_average_watts ?? null,
    description: a.description ?? null,
    elapsed_time: a.elapsed_time,
  };
  await sql`
    INSERT INTO activities (id, source, sport, name, start_time, duration_s, distance_m, elevation_m,
                            avg_hr, max_hr, avg_watts, suffer_score, kilojoules, raw, updated_at)
    VALUES (${`strava:${a.id}`}, 'strava', ${a.sport_type ?? a.type}, ${a.name ?? null}, ${a.start_date ?? null},
            ${a.moving_time ?? null}, ${a.distance ?? null}, ${a.total_elevation_gain ?? null}, ${a.average_heartrate ?? null},
            ${a.max_heartrate ?? null}, ${a.average_watts ?? null}, ${a.suffer_score ?? null}, ${a.kilojoules ?? null},
            ${sql.json(raw)}, now())
    ON CONFLICT (id) DO UPDATE SET
      sport = EXCLUDED.sport, name = EXCLUDED.name, start_time = EXCLUDED.start_time,
      duration_s = EXCLUDED.duration_s, distance_m = EXCLUDED.distance_m,
      elevation_m = EXCLUDED.elevation_m, avg_hr = EXCLUDED.avg_hr, max_hr = EXCLUDED.max_hr,
      avg_watts = EXCLUDED.avg_watts, suffer_score = EXCLUDED.suffer_score,
      kilojoules = EXCLUDED.kilojoules, raw = EXCLUDED.raw, updated_at = now()`;
}

/** Pulls every activity started in the last `days` days. */
export async function syncStravaActivities(days: number): Promise<number> {
  const after = Math.floor(Date.now() / 1000) - days * 86400;
  let count = 0;
  for (let page = 1; page <= 10; page++) {
    const batch = await stravaGet<StravaActivity[]>(
      `/athlete/activities?after=${after}&per_page=100&page=${page}`,
    );
    if (!batch || batch.length === 0) break;
    for (const a of batch) await upsertActivity(a);
    count += batch.length;
    if (batch.length < 100) break;
  }
  return count;
}

export async function syncStravaActivity(id: number | string) {
  const a = await stravaGet<StravaActivity>(`/activities/${id}`);
  if (a) await upsertActivity(a);
}

export async function deleteStravaActivity(id: number | string) {
  await sql`DELETE FROM activities WHERE id = ${`strava:${id}`}`;
}

/** Registers this deployment's webhook endpoint with Strava (one per app). */
export async function registerStravaWebhook() {
  const form = new URLSearchParams({
    client_id: env("STRAVA_CLIENT_ID"),
    client_secret: env("STRAVA_CLIENT_SECRET"),
    callback_url: `${appUrl()}/api/strava/webhook`,
    verify_token: env("STRAVA_WEBHOOK_VERIFY_TOKEN"),
  });
  const res = await fetch(`${API}/push_subscriptions`, { method: "POST", body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(`Strava webhook registration failed: ${res.status} ${text}`);
  return JSON.parse(text) as { id: number };
}

export async function getStravaWebhook() {
  const params = new URLSearchParams({
    client_id: env("STRAVA_CLIENT_ID"),
    client_secret: env("STRAVA_CLIENT_SECRET"),
  });
  const res = await fetch(`${API}/push_subscriptions?${params}`);
  if (!res.ok) return [];
  return (await res.json()) as { id: number; callback_url: string }[];
}
