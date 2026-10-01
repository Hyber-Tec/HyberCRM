/**
 * Branch-time helpers. Business logic never uses the browser's time zone:
 * every "today", lock and cut-off is computed in the branch's IANA zone.
 *
 * - `DateKey`: a wall-clock date in the branch zone, `YYYY-MM-DD`.
 * - minutes: minutes after local midnight (0–1440).
 * - instants: absolute `Date`s (stored as Firestore Timestamps).
 */

export type DateKey = string

export type Weekday =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'

export const WEEKDAYS: readonly Weekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
}

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  sunday: 'Sun',
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
}

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatterCache.set(timeZone, f)
  }
  return f
}

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function zonedParts(instant: Date | number, timeZone: string): ZonedParts {
  const date = typeof instant === 'number' ? new Date(instant) : instant
  const out: Record<string, number> = {}
  for (const p of zoneFormatter(timeZone).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  }
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (New York in winter: -300). */
export function tzOffsetMinutes(instant: Date | number, timeZone: string): number {
  const ms = typeof instant === 'number' ? instant : instant.getTime()
  const p = zonedParts(ms, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const truncated = Math.floor(ms / 1000) * 1000
  return Math.round((asUtc - truncated) / MINUTE_MS)
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export function makeDateKey(year: number, month: number, day: number): DateKey {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`
}

export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const { year, month, day } = parseDateKey(value)
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const [y, m, d] = key.split('-').map(Number)
  return { year: y, month: m, day: d }
}

/** The calendar date as a UTC-midnight Date. Only for calendar math and formatting. */
function keyToUtcDate(key: DateKey): Date {
  const { year, month, day } = parseDateKey(key)
  return new Date(Date.UTC(year, month - 1, day))
}

function utcDateToKey(d: Date): DateKey {
  return makeDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function dateKeyOf(instant: Date | number, timeZone: string): DateKey {
  const p = zonedParts(instant, timeZone)
  return makeDateKey(p.year, p.month, p.day)
}

/** Minutes after local midnight in the zone (seconds dropped). */
export function minutesOf(instant: Date | number, timeZone: string): number {
  const p = zonedParts(instant, timeZone)
  return p.hour * 60 + p.minute
}

export function todayKey(timeZone: string, now: Date | number = Date.now()): DateKey {
  return dateKeyOf(now, timeZone)
}

export function nowMinutes(timeZone: string, now: Date | number = Date.now()): number {
  return minutesOf(now, timeZone)
}

/**
 * The instant at which the wall clock in `timeZone` shows `dateKey` + `minutes`.
 * `minutes` may be 1440 (= next midnight). Times inside a DST gap resolve forward.
 */
export function toInstant(dateKey: DateKey, minutes: number, timeZone: string): Date {
  const { year, month, day } = parseDateKey(dateKey)
  const wallAsUtc = Date.UTC(year, month - 1, day) + minutes * MINUTE_MS
  const offset1 = tzOffsetMinutes(wallAsUtc, timeZone)
  let candidate = wallAsUtc - offset1 * MINUTE_MS
  const offset2 = tzOffsetMinutes(candidate, timeZone)
  if (offset2 !== offset1) candidate = wallAsUtc - offset2 * MINUTE_MS
  return new Date(candidate)
}

/** First instant of the next local day: when `dateKey` has fully passed. */
export function dayEndInstant(dateKey: DateKey, timeZone: string): Date {
  return toInstant(addDays(dateKey, 1), 0, timeZone)
}

export function addDays(key: DateKey, days: number): DateKey {
  return utcDateToKey(new Date(keyToUtcDate(key).getTime() + days * DAY_MS))
}

export function addMonths(key: DateKey, months: number): DateKey {
  const { year, month, day } = parseDateKey(key)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  return makeDateKey(target.getUTCFullYear(), target.getUTCMonth() + 1, Math.min(day, lastDay))
}

/** b − a in whole days. */
export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((keyToUtcDate(b).getTime() - keyToUtcDate(a).getTime()) / DAY_MS)
}

export function compareDateKeys(a: DateKey, b: DateKey): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function weekdayIndex(key: DateKey): number {
  return keyToUtcDate(key).getUTCDay()
}

export function weekdayOf(key: DateKey): Weekday {
  return WEEKDAYS[weekdayIndex(key)]
}

export function startOfWeek(key: DateKey, weekStartsOn: Weekday = 'sunday'): DateKey {
  const startIdx = WEEKDAYS.indexOf(weekStartsOn)
  const delta = (weekdayIndex(key) - startIdx + 7) % 7
  return addDays(key, -delta)
}

export function weekDays(key: DateKey, weekStartsOn: Weekday = 'sunday'): DateKey[] {
  const start = startOfWeek(key, weekStartsOn)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Weekdays in display order for a given week start. */
export function orderedWeekdays(weekStartsOn: Weekday = 'sunday'): Weekday[] {
  const start = WEEKDAYS.indexOf(weekStartsOn)
  return Array.from({ length: 7 }, (_, i) => WEEKDAYS[(start + i) % 7])
}

export function startOfMonth(key: DateKey): DateKey {
  const { year, month } = parseDateKey(key)
  return makeDateKey(year, month, 1)
}

export function endOfMonth(key: DateKey): DateKey {
  const { year, month } = parseDateKey(key)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return makeDateKey(year, month, last)
}

/** 6×7 grid of dates covering the month of `key`, starting on `weekStartsOn`. */
export function monthGrid(key: DateKey, weekStartsOn: Weekday = 'sunday'): DateKey[] {
  const first = startOfWeek(startOfMonth(key), weekStartsOn)
  return Array.from({ length: 42 }, (_, i) => addDays(first, i))
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = []
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k)
  return out
}

export function isSameMonth(a: DateKey, b: DateKey): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

// ---------------------------------------------------------------- formatting

/** 960 → "4:00 PM" (or "16:00" when `hour12` is false). 1440 → "12:00 AM". */
export function formatMinutes(minutes: number, hour12 = true): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = pad2(m % 60)
  if (!hour12) return `${pad2(h)}:${mm}`
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${mm} ${suffix}`
}

/** 960 → "4 PM", 990 → "4:30 PM" (compact axis labels). */
export function formatMinutesShort(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m % 60 === 0 ? `${h12} ${suffix}` : `${h12}:${pad2(m % 60)} ${suffix}`
}

export function formatTimeRange(startMin: number, endMin: number): string {
  return `${formatMinutes(startMin)} - ${formatMinutes(endMin)}`
}

/** "16:30" → 990. Returns NaN for malformed input. */
export function parseHHMM(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return Number.NaN
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return Number.NaN
  return h * 60 + min
}

export function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  return `${pad2(h)}:${pad2(minutes % 60)}`
}

export type DateKeyStyle =
  | 'short' // 9/30/2026
  | 'medium' // Sep 30, 2026
  | 'long' // September 30, 2026
  | 'weekdayShort' // Wed, 9/30
  | 'weekdayMedium' // Wed, Sep 30
  | 'weekdayLong' // Wednesday, September 30, 2026
  | 'monthYear' // September 2026
  | 'monthDay' // Sep 30

const dateKeyFormats: Record<DateKeyStyle, Intl.DateTimeFormatOptions> = {
  short: { month: 'numeric', day: 'numeric', year: 'numeric' },
  medium: { month: 'short', day: 'numeric', year: 'numeric' },
  long: { month: 'long', day: 'numeric', year: 'numeric' },
  weekdayShort: { weekday: 'short', month: 'numeric', day: 'numeric' },
  weekdayMedium: { weekday: 'short', month: 'short', day: 'numeric' },
  weekdayLong: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
  monthYear: { month: 'long', year: 'numeric' },
  monthDay: { month: 'short', day: 'numeric' },
}

export function formatDateKey(key: DateKey, style: DateKeyStyle = 'medium', locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { ...dateKeyFormats[style], timeZone: 'UTC' }).format(keyToUtcDate(key))
}

/** Formats an instant in the branch zone, e.g. "Sep 30, 2026, 4:02 PM". */
export function formatInstant(
  instant: Date | number,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
  locale = 'en-US',
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(instant)
}

export function formatInstantTime(instant: Date | number, timeZone: string): string {
  return formatMinutes(minutesOf(instant, timeZone))
}

/** Minutes → "1h 50m" / "45m". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r}m`
  return r === 0 ? `${h}h` : `${h}h ${r}m`
}

/** A small curated list for pickers; any valid IANA zone is accepted. */
export const COMMON_TIME_ZONES: readonly string[] = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
]
