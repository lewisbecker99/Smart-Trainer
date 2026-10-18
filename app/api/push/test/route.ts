import { NextResponse } from "next/server";
import { sendPush, sendTelegram } from "@/lib/notify";

export async function POST() {
  const push = await sendPush("🏋️ Smart Trainer", "Notifications work. Your daily plan will arrive here.");
  const telegram = await sendTelegram("🏋️ Smart Trainer: notifications work.");
  return NextResponse.json({ push, telegram });
}
