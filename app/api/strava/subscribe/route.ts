import { NextResponse } from "next/server";
import { getStravaWebhook, registerStravaWebhook } from "@/lib/strava";

export async function GET() {
  return NextResponse.json({ subscriptions: await getStravaWebhook() });
}

export async function POST() {
  try {
    const existing = await getStravaWebhook();
    if (existing.length > 0) return NextResponse.json({ ok: true, subscription: existing[0] });
    return NextResponse.json({ ok: true, subscription: await registerStravaWebhook() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
