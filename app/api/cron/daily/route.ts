import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runDaily } from "@/lib/daily";

export const maxDuration = 300;

// Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET".
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env("CRON_SECRET")}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runDaily());
  } catch (err) {
    console.error("daily run failed", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
