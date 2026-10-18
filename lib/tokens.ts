import { sql } from "./db";

export type Provider = "strava" | "whoop";

export interface StoredToken {
  provider: Provider;
  athlete_id: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  scope: string | null;
}

export async function saveToken(t: Omit<StoredToken, "expires_at"> & { expires_at: Date }) {
  await sql`
    INSERT INTO oauth_tokens (provider, athlete_id, access_token, refresh_token, expires_at, scope, updated_at)
    VALUES (${t.provider}, ${t.athlete_id}, ${t.access_token}, ${t.refresh_token}, ${t.expires_at}, ${t.scope}, now())
    ON CONFLICT (provider) DO UPDATE SET
      athlete_id    = COALESCE(EXCLUDED.athlete_id, oauth_tokens.athlete_id),
      access_token  = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      expires_at    = EXCLUDED.expires_at,
      scope         = COALESCE(EXCLUDED.scope, oauth_tokens.scope),
      updated_at    = now()`;
}

export async function loadToken(provider: Provider): Promise<StoredToken | null> {
  const rows = await sql<StoredToken[]>`SELECT * FROM oauth_tokens WHERE provider = ${provider}`;
  return rows[0] ?? null;
}

export async function deleteToken(provider: Provider) {
  await sql`DELETE FROM oauth_tokens WHERE provider = ${provider}`;
}

/**
 * Returns a valid access token, refreshing it via `refresh` when it expires
 * within the next two minutes. Returns null when the provider isn't connected.
 */
export async function getAccessToken(
  provider: Provider,
  refresh: (refreshToken: string) => Promise<Omit<StoredToken, "provider" | "athlete_id">>,
): Promise<string | null> {
  const token = await loadToken(provider);
  if (!token) return null;
  if (new Date(token.expires_at).getTime() - Date.now() > 120_000) return token.access_token;

  const fresh = await refresh(token.refresh_token);
  await saveToken({ provider, athlete_id: token.athlete_id, ...fresh });
  return fresh.access_token;
}
