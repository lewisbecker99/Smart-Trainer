import { NextResponse } from "next/server";
import { createOAuthState } from "@/lib/oauthState";
import { whoopAuthorizeUrl } from "@/lib/whoop";

export async function GET() {
  return NextResponse.redirect(whoopAuthorizeUrl(await createOAuthState("whoop")));
}
