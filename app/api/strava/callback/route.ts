import { NextResponse } from "next/server";
import { appUrl } from "@/lib/env";
import { checkOAuthState } from "@/lib/oauthState";
import { exchangeStravaCode, syncStravaActivities } from "@/lib/strava";

export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!(await checkOAuthState("strava", url.searchParams.get("state"))) || !code) {
    return NextResponse.redirect(`${appUrl()}/settings?error=strava_state`);
  }
  const scope = url.searchParams.get("scope");
  if (!scope?.includes("activity:read")) {
    return NextResponse.redirect(`${appUrl()}/settings?error=strava_scope`);
  }
  await exchangeStravaCode(code, scope);
  // Backfill enough history for the 42-day fitness average to be meaningful.
  await syncStravaActivities(120).catch((err) => console.error("strava backfill failed", err));
  return NextResponse.redirect(`${appUrl()}/settings?connected=strava`);
}
