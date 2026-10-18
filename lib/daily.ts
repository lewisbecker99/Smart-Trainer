import { appUrl } from "./env";
import { localDay } from "./dates";
import { generateDailyPlan, getPlan } from "./coach";
import { notifyPlan } from "./notify";
import { syncAll } from "./sync";

/**
 * Syncs fresh data, writes today's plan and sends it out. Runs once per day
 * unless forced: triggered by today's WHOOP recovery webhook (so the message
 * arrives right after you wake up) with the daily cron as a fallback.
 */
export async function runDaily({ force = false, syncDays = 3 } = {}) {
  const today = localDay();
  if (!force && (await getPlan(today))) return { skipped: "plan already exists for today" };

  const sync = await syncAll(syncDays);
  const { plan } = await generateDailyPlan();
  const notified = await notifyPlan(plan, appUrl());
  return { day: today, mode: plan.mode, sync, notified };
}
