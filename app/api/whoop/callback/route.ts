import { NextResponse } from "next/server";
import { appUrl } from "@/lib/env";
import { checkOAuthState } from "@/lib/oauthState";
import { exchangeWhoopCode, syncWhoop } from "@/lib/whoop";

export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!(await checkOAuthState("whoop", url.searchParams.get("state"))) || !code) {
    return NextResponse.redirect(`${appUrl()}/settings?error=whoop_state`);
  }
  await exchangeWhoopCode(code);
  await syncWhoop(60).catch((err) => console.error("whoop backfill failed", err));
  return NextResponse.redirect(`${appUrl()}/settings?connected=whoop`);
}
