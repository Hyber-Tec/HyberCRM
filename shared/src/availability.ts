import type { BranchSettings, DayHours } from './settings/defaults'
import { type DateKey, addDays, toInstant, weekdayOf } from './time'
import type { AvailabilityRange, DayConfig } from './types'

/** Opening hours of a date: an explicit day config wins over the branch's default week. */
export function dayHours(
  dateKey: DateKey,
  settings: Pick<BranchSettings, 'schedule'>,
  dayConfigs?: Map<DateKey, Pick<DayConfig, 'isOpen' | 'openMin' | 'closeMin'>> | null,
): DayHours {
  const cfg = dayConfigs?.get(dateKey)
  if (cfg) return { isOpen: cfg.isOpen, openMin: cfg.openMin, closeMin: cfg.closeMin }
  const d = settings.schedule.defaultWeek[weekdayOf(dateKey)]
  return { isOpen: d.isOpen, openMin: d.openMin, closeMin: d.closeMin }
}

/** Sorts ranges and merges overlapping or touching ones; drops empty ranges. */
export function normalizeRanges(ranges: readonly AvailabilityRange[]): AvailabilityRange[] {
  const sorted = ranges
    .filter((r) => Number.isFinite(r.startMin) && Number.isFinite(r.endMin) && r.endMin > r.startMin)
    .map((r) => ({ startMin: r.startMin, endMin: r.endMin }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  const out: AvailabilityRange[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.startMin <= last.endMin) last.endMin = Math.max(last.endMin, r.endMin)
    else out.push(r)
  }
  return out
}

/** Clips ranges to opening hours; returns the clipped ranges and whether anything changed. */
export function clipToHours(ranges: readonly AvailabilityRange[], hours: DayHours): { ranges: AvailabilityRange[]; clipped: boolean } {
  const out = normalizeRanges(
    ranges.map((r) => ({ startMin: Math.max(r.startMin, hours.openMin), endMin: Math.min(r.endMin, hours.closeMin) })),
  )
  const clipped = JSON.stringify(out) !== JSON.stringify(normalizeRanges(ranges))
  return { ranges: out, clipped }
}

/**
 * The part of saved availability that counts on a date: clipped to that date's
 * opening hours, none when the center is closed. Saved ranges stay as they are,
 * so reopening a day or widening its hours brings them back.
 */
export function effectiveRanges(ranges: readonly AvailabilityRange[], hours: DayHours): AvailabilityRange[] {
  return hours.isOpen ? clipToHours(ranges, hours).ranges : []
}

export type FitResult =
  | { ok: true; ranges: AvailabilityRange[]; trimmed: boolean }
  | { ok: false; reason: 'closed' | 'outside' | 'too_many' }

/**
 * Availability must sit inside that date's opening hours (per-date hours
 * included) and closed days take none (owner rule, round 2). Ranges are merged,
 * trimmed to the hours, and slivers shorter than the minimum dropped.
 */
export function fitRangesToDay(
  ranges: readonly AvailabilityRange[],
  hours: DayHours,
  opts: { minBlockMinutes: number; maxRangesPerDay: number },
): FitResult {
  const merged = normalizeRanges(ranges)
  if (merged.length === 0) return { ok: true, ranges: [], trimmed: false }
  if (!hours.isOpen) return { ok: false, reason: 'closed' }
  const { ranges: clipped, clipped: wasClipped } = clipToHours(merged, hours)
  const kept = clipped.filter((r) => r.endMin - r.startMin >= opts.minBlockMinutes)
  if (kept.length === 0) return { ok: false, reason: 'outside' }
  if (kept.length > opts.maxRangesPerDay) return { ok: false, reason: 'too_many' }
  return { ok: true, ranges: kept, trimmed: wasClipped || kept.length !== clipped.length }
}

/** True when [startMin, endMin] lies fully inside one of the ranges. */
export function rangesContain(ranges: readonly AvailabilityRange[], startMin: number, endMin: number): boolean {
  return ranges.some((r) => r.startMin <= startMin && r.endMin >= endMin)
}

/** Midnight at the start of `dateKey` in the branch zone. */
export function dayStartInstant(dateKey: DateKey, timeZone: string): Date {
  return toInstant(dateKey, 0, timeZone)
}

/**
 * Tutors can't add, change or remove availability for a day that starts within
 * `lockDays` of now (owner decision Q10; enforced by the security rules too).
 */
export function isLockedForTutor(dateKey: DateKey, timeZone: string, lockDays: number, now: Date = new Date()): boolean {
  if (lockDays <= 0) return dayStartInstant(dateKey, timeZone).getTime() <= now.getTime()
  return dayStartInstant(dateKey, timeZone).getTime() <= now.getTime() + lockDays * 86_400_000
}

/** Effective tutor lock window, including a blocking lead time. */
export function effectiveLockDays(settings: Pick<BranchSettings, 'availability'>): number {
  const a = settings.availability
  return a.leadTimeEnforcement === 'block' ? Math.max(a.lockWindowDays, a.leadTimeDays) : a.lockWindowDays
}

/** Inside the lead window but not locked: the tutor should have set availability already. */
export function isInsideLeadTime(dateKey: DateKey, timeZone: string, leadDays: number, now: Date = new Date()): boolean {
  return dayStartInstant(dateKey, timeZone).getTime() < now.getTime() + leadDays * 86_400_000
}

/**
 * Open days a tutor should still give times for: inside the lead window, not
 * locked yet, and without availability inside that date's hours. They are the
 * amber days of the tutor's calendar and the "availability still to set" of
 * Today (web and phone), so both always count the same days. A branch that
 * doesn't ask for notice (lead time "Do nothing") has none.
 */
export function availabilityGaps(input: {
  today: DateKey
  timeZone: string
  settings: Pick<BranchSettings, 'availability' | 'schedule'>
  dayConfigs?: Map<DateKey, Pick<DayConfig, 'isOpen' | 'openMin' | 'closeMin'>> | null
  /** A date's hours, when the caller already has them (instead of `dayConfigs`). */
  hoursOf?: (dateKey: DateKey) => DayHours
  /** Saved ranges of a date (as stored; clipped to the date's hours here). */
  rangesOn: (dateKey: DateKey) => readonly AvailabilityRange[] | null | undefined
  now?: Date
}): DateKey[] {
  const { today, timeZone, settings } = input
  if (settings.availability.leadTimeEnforcement === 'off') return []
  const now = input.now ?? new Date()
  const lead = settings.availability.leadTimeDays
  const lockDays = effectiveLockDays(settings)
  const out: DateKey[] = []
  for (let i = 0; i <= lead; i++) {
    const d = addDays(today, i)
    if (!isInsideLeadTime(d, timeZone, lead, now)) break
    const hours = input.hoursOf ? input.hoursOf(d) : dayHours(d, settings, input.dayConfigs)
    if (!hours.isOpen || isLockedForTutor(d, timeZone, lockDays, now)) continue
    if (effectiveRanges(input.rangesOn(d) ?? [], hours).length === 0) out.push(d)
  }
  return out
}

/** Dates `weeks` weeks after `dateKey` on the same weekday (repeat weekly). */
export function weeklyRepeats(dateKey: DateKey, weeks: number): DateKey[] {
  return Array.from({ length: weeks }, (_, i) => addDays(dateKey, 7 * (i + 1)))
}

export function rangesEqual(a: readonly AvailabilityRange[], b: readonly AvailabilityRange[]): boolean {
  const na = normalizeRanges(a)
  const nb = normalizeRanges(b)
  return na.length === nb.length && na.every((r, i) => r.startMin === nb[i].startMin && r.endMin === nb[i].endMin)
}

export function totalMinutes(ranges: readonly AvailabilityRange[]): number {
  return normalizeRanges(ranges).reduce((sum, r) => sum + (r.endMin - r.startMin), 0)
}
