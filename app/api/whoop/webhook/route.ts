import { NextResponse, after } from "next/server";
import { localDay } from "@/lib/dates";
import { getPlan } from "@/lib/coach";
import { runDaily } from "@/lib/daily";
import { loadToken } from "@/lib/tokens";
import { deleteWhoopWorkout, syncWhoop, verifyWhoopSignature } from "@/lib/whoop";

export const maxDuration = 300;

interface WhoopEvent {
  user_id: number;
  id: string;
  type: string; // e.g. recovery.updated, sleep.updated, workout.updated, workout.deleted
  trace_id: string;
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (
    !verifyWhoopSignature(
      raw,
      req.headers.get("x-whoop-signature-timestamp"),
      req.headers.get("x-whoop-signature"),
    )
  ) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const event = JSON.parse(raw) as WhoopEvent;
  const token = await loadToken("whoop");
  if (!token || (token.athlete_id && token.athlete_id !== String(event.user_id))) {
    return NextResponse.json({ ignored: true });
  }

  try {
    if (event.type === "workout.deleted") {
      await deleteWhoopWorkout(event.id);
    } else if (event.type.endsWith(".deleted")) {
      // Sleep/recovery deletions are rare; the next sync reconciles them.
    } else {
      // Events only carry ids; re-pull the last couple of days so the linked
      // sleep, recovery and cycle records all land together.
      await syncWhoop(2);
      // The morning recovery score is the trigger for the daily plan.
      if (event.type === "recovery.updated" && !(await getPlan(localDay()))) {
        after(() => runDaily().catch((err) => console.error("daily run from webhook failed", err)));
      }
    }
  } catch (err) {
    console.error("whoop webhook handling failed", err);
  }
  return NextResponse.json({ ok: true });
}
