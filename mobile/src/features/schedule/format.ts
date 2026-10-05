import { type DateKey, formatMinutes, parseDateKey } from "@shared/time";

/**
 * How the schedule writes dates and times on the phone. Dates are the branch's wall-clock `dateKey`s, formatted as
 * calendar dates (never through the phone's zone); times are minutes after the branch's midnight.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function format(key: DateKey, options: Intl.DateTimeFormatOptions): string {
  const id = JSON.stringify(options);
  let f = formatters.get(id);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });
    formatters.set(id, f);
  }
  const { year, month, day } = parseDateKey(key);
  return f.format(new Date(Date.UTC(year, month - 1, day)));
}

/** "Sunday, October 4". */
export const longDay = (key: DateKey) => format(key, { weekday: "long", month: "long", day: "numeric" });
/** "Mon, Oct 5". */
export const shortDay = (key: DateKey) => format(key, { weekday: "short", month: "short", day: "numeric" });
/** "Oct 5". */
export const monthDay = (key: DateKey) => format(key, { month: "short", day: "numeric" });
/** "Monday". */
export const weekdayName = (key: DateKey) => format(key, { weekday: "long" });
/** "M". */
export const weekdayInitial = (key: DateKey) => format(key, { weekday: "narrow" });

/** "Oct 4 – 10, 2026", "Sep 27 – Oct 3, 2026", "Dec 28, 2025 – Jan 3, 2026". */
export function weekRange(first: DateKey, last: DateKey): string {
  const a = parseDateKey(first);
  const b = parseDateKey(last);
  if (a.year !== b.year) return `${format(first, { month: "short", day: "numeric", year: "numeric" })} – ${format(last, { month: "short", day: "numeric", year: "numeric" })}`;
  if (a.month !== b.month) return `${monthDay(first)} – ${monthDay(last)}, ${b.year}`;
  return `${monthDay(first)} – ${b.day}, ${b.year}`;
}

/** A time of day in the branch's format: "4:00 PM" or "16:00". */
export function clock(minutes: number, hour12 = true): string {
  return formatMinutes(minutes, hour12);
}

/** "4:00 – 5:50 PM" (one AM/PM when both share it), "11:30 AM – 1:20 PM", or "16:00 – 17:50". */
export function timeRange(startMin: number, endMin: number, hour12 = true): string {
  if (!hour12) return `${formatMinutes(startMin, false)} – ${formatMinutes(endMin, false)}`;
  const a = formatMinutes(startMin);
  const b = formatMinutes(endMin);
  const samePeriod = a.slice(-2) === b.slice(-2) && endMin < 1440;
  return samePeriod ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

/** 110 → "1h 50m", 45 → "45 min", 120 → "2h". */
export function duration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

/** Hours with at most one decimal: 110 min → "1.8 h", 120 → "2 h". */
export function hours(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

/** Time until something starts: "in 25 min", "in 1 h 5 min", "in 3 h", "now". */
export function startsIn(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return "now";
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `in ${r} min`;
  return r === 0 ? `in ${h} h` : `in ${h} h ${r} min`;
}

/** Time left: "40 min left", "1 h 5 min left", "less than a minute left". */
export function timeLeft(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 1) return "less than a minute left";
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min left`;
  return r === 0 ? `${h} h left` : `${h} h ${r} min left`;
}

/** "3 sessions", "1 session". */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

/** "Ava, Liam and Noah"; "Ava and Liam". */
export function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
