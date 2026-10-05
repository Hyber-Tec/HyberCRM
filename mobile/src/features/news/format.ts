import { addDays, type DateKey, dateKeyOf, diffDays, formatDateKey, formatInstant, parseDateKey, todayKey } from "@shared/time";

/** A Firestore timestamp as it comes from a snapshot (null while the server hasn't stamped it yet). */
type Stamp = { toMillis?: () => number } | null | undefined;

export const millisOf = (t: unknown): number | null => (t as Stamp)?.toMillis?.() ?? null;

/** "Today", "Yesterday", "Monday" (this past week), "Sep 30", "Sep 30, 2025": a day in the branch's zone. */
export function dayLabel(day: DateKey, today: DateKey): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  const ago = diffDays(day, today);
  if (ago > 0 && ago < 7) return formatDateKey(day, "weekdayLong").split(",")[0];
  return parseDateKey(day).year === parseDateKey(today).year ? formatDateKey(day, "monthDay") : formatDateKey(day, "medium");
}

/** "Just now", "5 min ago", "2 hours ago" (today), then the day as `dayLabel` says it. */
export function relativeTime(ms: number | null, timezone: string, now = Date.now()): string {
  if (ms == null) return "Just now";
  const diff = now - ms;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  const today = todayKey(timezone, now);
  const day = dateKeyOf(ms, timezone);
  if (day === today) {
    const h = Math.floor(diff / 3_600_000);
    return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  }
  return dayLabel(day, today);
}

/** "Sep 30, 2026, 4:02 PM" in the branch's zone, as the website's post page says it. */
export function fullDate(ms: number | null, timezone: string): string {
  if (ms == null) return "Just now";
  return formatInstant(ms, timezone, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatBytes(n: number): string {
  if (!n || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
