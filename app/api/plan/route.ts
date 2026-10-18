import { NextResponse } from "next/server";
import { localDay } from "@/lib/dates";
import { CoachRefusalError, getPlan } from "@/lib/coach";
import { runDaily } from "@/lib/daily";

export const maxDuration = 300;

export async function GET() {
  const day = localDay();
  return NextResponse.json({ day, plan: await getPlan(day) });
}

// Regenerate today's plan on demand (also re-sends the notification).
export async function POST() {
  try {
    await runDaily({ force: true });
    const day = localDay();
    return NextResponse.json({ day, plan: await getPlan(day) });
  } catch (err) {
    const status = err instanceof CoachRefusalError ? 422 : 500;
    console.error("plan generation failed", err);
    return NextResponse.json({ error: String(err) }, { status });
  }
}
