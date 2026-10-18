import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { loadToken } from "@/lib/tokens";
import { deleteStravaActivity, syncStravaActivity } from "@/lib/strava";

// Strava's subscription handshake.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") === env("STRAVA_WEBHOOK_VERIFY_TOKEN")
  ) {
    return NextResponse.json({ "hub.challenge": url.searchParams.get("hub.challenge") });
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

interface StravaEvent {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  owner_id: number;
  subscription_id: number;
  updates?: Record<string, string>;
}

// Strava webhooks are unsigned, so only act on events for the connected
// athlete, and always re-fetch the activity from the API rather than trusting
// the payload.
export async function POST(req: Request) {
  const event = (await req.json()) as StravaEvent;
  const token = await loadToken("strava");
  if (!token || token.athlete_id !== String(event.owner_id)) {
    return NextResponse.json({ ignored: true });
  }
  try {
    if (event.object_type === "activity") {
      if (event.aspect_type === "delete") await deleteStravaActivity(event.object_id);
      else await syncStravaActivity(event.object_id);
    }
  } catch (err) {
    // Strava expects a 200 within 2 seconds; the daily sync will catch up.
    console.error("strava webhook handling failed", err);
  }
  return NextResponse.json({ ok: true });
}
