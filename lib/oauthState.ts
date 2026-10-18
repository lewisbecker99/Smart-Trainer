import { cookies } from "next/headers";
import { sign, verify } from "./auth";

// CSRF protection for OAuth: a random nonce stored in a short-lived signed cookie
// and echoed back by the provider in `state`.
const COOKIE = "st_oauth";

export async function createOAuthState(provider: string): Promise<string> {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  (await cookies()).set(COOKIE, await sign(`${provider}:${nonce}`, 600), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return nonce;
}

export async function checkOAuthState(provider: string, state: string | null): Promise<boolean> {
  const jar = await cookies();
  const payload = await verify(jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
  return !!state && payload === `${provider}:${state}`;
}
