import { loadToken } from "./tokens";
import { syncStravaActivities } from "./strava";
import { syncWhoop } from "./whoop";

/** Pulls recent data from every connected provider. Errors are reported, not thrown. */
export async function syncAll(days: number) {
  const result: Record<string, unknown> = {};
  if (await loadToken("strava")) {
    try {
      result.strava = { activities: await syncStravaActivities(days) };
    } catch (err) {
      console.error("strava sync failed", err);
      result.strava = { error: String(err) };
    }
  }
  if (await loadToken("whoop")) {
    try {
      result.whoop = await syncWhoop(days);
    } catch (err) {
      console.error("whoop sync failed", err);
      result.whoop = { error: String(err) };
    }
  }
  return result;
}
