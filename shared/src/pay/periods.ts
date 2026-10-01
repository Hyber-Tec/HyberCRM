import type { PayPeriodType } from '../settings/defaults'
import { type DateKey, addDays, diffDays, endOfMonth, parseDateKey, makeDateKey } from '../time'

export interface PayPeriod {
  start: DateKey
  end: DateKey
}

/** The pay period containing `date`. */
export function periodContaining(date: DateKey, type: PayPeriodType, anchor: DateKey): PayPeriod {
  if (type === 'weekly' || type === 'biweekly') {
    const len = type === 'weekly' ? 7 : 14
    const offset = ((diffDays(anchor, date) % len) + len) % len
    const start = addDays(date, -offset)
    return { start, end: addDays(start, len - 1) }
  }
  const { year, month, day } = parseDateKey(date)
  if (type === 'semimonthly') {
    return day <= 15
      ? { start: makeDateKey(year, month, 1), end: makeDateKey(year, month, 15) }
      : { start: makeDateKey(year, month, 16), end: endOfMonth(date) }
  }
  return { start: makeDateKey(year, month, 1), end: endOfMonth(date) }
}

/** `count` periods ending with the one containing `date`, newest first. */
export function recentPeriods(date: DateKey, type: PayPeriodType, anchor: DateKey, count: number): PayPeriod[] {
  const out: PayPeriod[] = []
  let p = periodContaining(date, type, anchor)
  for (let i = 0; i < count; i++) {
    out.push(p)
    p = periodContaining(addDays(p.start, -1), type, anchor)
  }
  return out
}

export function periodId(p: PayPeriod): string {
  return `${p.start}_${p.end}`
}
