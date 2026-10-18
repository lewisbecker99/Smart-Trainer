// Minimal single-user auth: an HMAC-signed session cookie.
// Uses Web Crypto so it runs in both the Edge middleware and Node routes.

export const SESSION_COOKIE = "st_session";
const SESSION_TTL_S = 60 * 60 * 24 * 90;

const encoder = new TextEncoder();

async function hmac(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing environment variable SESSION_SECRET");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Signs an arbitrary payload with an expiry: "<payload>.<exp>.<sig>". */
export async function sign(payload: string, ttlSeconds: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = `${payload}.${exp}`;
  return `${body}.${await hmac(body)}`;
}

export async function verify(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 3) return null;
  const sig = parts.pop()!;
  const exp = Number(parts.pop());
  const payload = parts.join(".");
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return null;
  const expected = await hmac(`${payload}.${exp}`);
  return timingSafeEqual(sig, expected) ? payload : null;
}

export const createSessionToken = () => sign("owner", SESSION_TTL_S);
export const sessionMaxAge = SESSION_TTL_S;

export async function isValidSession(token: string | undefined) {
  return (await verify(token)) === "owner";
}

export function checkPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new Error("Missing environment variable APP_PASSWORD");
  return timingSafeEqual(input, expected);
}
