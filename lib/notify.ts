import webpush from "web-push";
import { sql } from "./db";
import { optionalEnv } from "./env";
import type { Plan } from "./coach";

export const MODE_LABEL: Record<Plan["mode"], string> = {
  rest: "Rest day",
  active_recovery: "Active recovery",
  easy_endurance: "Easy endurance",
  long_endurance: "Long endurance",
  tempo: "Tempo",
  threshold: "Threshold",
  vo2max: "VO₂max intervals",
  strength: "Strength",
  mobility: "Mobility",
};

const READINESS_EMOJI = { green: "🟢", yellow: "🟡", red: "🔴" } as const;

function configureWebPush(): boolean {
  const pub = optionalEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  const priv = optionalEnv("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return false;
  webpush.setVapidDetails(optionalEnv("VAPID_SUBJECT") ?? "mailto:coach@example.com", pub, priv);
  return true;
}

export async function sendPush(title: string, body: string, url = "/") {
  if (!configureWebPush()) return { sent: 0, skipped: "VAPID keys not configured" };
  const subs = await sql<{ endpoint: string; keys: { p256dh: string; auth: string } }[]>`
    SELECT endpoint, keys FROM push_subscriptions`;
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys },
        JSON.stringify({ title, body, url }),
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410: the browser dropped the subscription.
      if (status === 404 || status === 410) {
        await sql`DELETE FROM push_subscriptions WHERE endpoint = ${s.endpoint}`;
      } else {
        console.error("web push failed", status, err);
      }
    }
  }
  return { sent };
}

export async function sendTelegram(text: string) {
  const token = optionalEnv("TELEGRAM_BOT_TOKEN");
  const chatId = optionalEnv("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return { sent: false, skipped: "Telegram not configured" };
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!res.ok) console.error("telegram failed", res.status, await res.text());
  return { sent: res.ok };
}

export async function notifyPlan(plan: Plan, appUrl: string) {
  const title = `${READINESS_EMOJI[plan.readiness]} ${MODE_LABEL[plan.mode]} · ${Math.round(plan.workout.duration_min)} min`;
  const push = await sendPush(title, plan.headline, "/");
  const telegramText = [
    title,
    "",
    plan.summary,
    "",
    ...plan.workout.structure.map((s) => `• ${s}`),
    "",
    `Open the coach: ${appUrl}`,
  ].join("\n");
  const telegram = await sendTelegram(telegramText);
  return { push, telegram };
}
