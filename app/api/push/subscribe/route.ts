import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST(req: Request) {
  const sub = (await req.json()) as { endpoint?: string; keys?: { p256dh: string; auth: string } };
  if (!sub.endpoint || !sub.keys) return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  await sql`
    INSERT INTO push_subscriptions (endpoint, keys) VALUES (${sub.endpoint}, ${sql.json(sub.keys)})
    ON CONFLICT (endpoint) DO UPDATE SET keys = EXCLUDED.keys`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { endpoint } = (await req.json()) as { endpoint?: string };
  if (endpoint) await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
  return NextResponse.json({ ok: true });
}
