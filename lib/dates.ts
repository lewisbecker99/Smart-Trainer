import { tzName } from "./env";

/** YYYY-MM-DD for the given instant in the athlete's time zone. */
export function localDay(date: Date | string = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tzName(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function weekday(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
}
