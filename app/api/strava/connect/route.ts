import { NextResponse } from "next/server";
import { createOAuthState } from "@/lib/oauthState";
import { stravaAuthorizeUrl } from "@/lib/strava";

export async function GET() {
  return NextResponse.redirect(stravaAuthorizeUrl(await createOAuthState("strava")));
}
