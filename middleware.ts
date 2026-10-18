import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

// Routes reachable without a session: login, provider webhooks (verified by
// their own signatures), cron (verified by CRON_SECRET) and PWA assets.
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/login",
  "/api/strava/webhook",
  "/api/whoop/webhook",
  "/api/cron/",
  "/manifest.webmanifest",
  "/sw.js",
  "/icon",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
