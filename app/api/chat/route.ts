import { NextResponse } from "next/server";
import { getThread, streamChat } from "@/lib/coach";

export const maxDuration = 300;

export async function GET(req: Request) {
  const thread = new URL(req.url).searchParams.get("thread");
  if (!thread) return NextResponse.json({ messages: [] });
  return NextResponse.json({ messages: await getThread(thread) });
}

export async function POST(req: Request) {
  const { thread, message } = (await req.json()) as { thread?: string; message?: string };
  if (!thread || !message?.trim()) {
    return NextResponse.json({ error: "thread and message are required" }, { status: 400 });
  }
  const body = await streamChat(thread, message.trim().slice(0, 8000));
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
