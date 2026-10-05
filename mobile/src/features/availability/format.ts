import { formatMinutesShort } from "@shared/time";

const NBSP = " ";
const BREAK = "​";

/**
 * A range for a small calendar box: "2–6 PM", "2:30–6 PM", "10 AM–2 PM" (the AM/PM once when both times share it).
 * A narrow box wraps it only after the dash ("2 PM–" / "4:30 PM"), never inside a time (DECISIONS §6).
 */
export function boxRange(startMin: number, endMin: number): string {
  const [a, am] = formatMinutesShort(startMin).split(" ");
  const [b, bm] = formatMinutesShort(endMin).split(" ");
  return am === bm ? `${a}–${BREAK}${b}${NBSP}${bm}` : `${a}${NBSP}${am}–${BREAK}${b}${NBSP}${bm}`;
}

/** "2 weeks", "10 days": the lead time in words. */
export function daysInWords(days: number): string {
  if (days > 0 && days % 7 === 0) return days === 7 ? "week" : `${days / 7} weeks`;
  return days === 1 ? "day" : `${days} days`;
}
