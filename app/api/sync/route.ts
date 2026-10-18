import { NextResponse } from "next/server";
import { syncAll } from "@/lib/sync";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { days } = (await req.json().catch(() => ({}))) as { days?: number };
  return NextResponse.json(await syncAll(Math.min(Math.max(days ?? 7, 1), 180)));
}
