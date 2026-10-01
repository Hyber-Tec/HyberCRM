/**
 * Teaching vs admin pay segmentation (True Education's kiosk algorithm).
 * A shift is split by the tutor's teaching windows: time inside sessions is
 * teaching, the rest is admin. Simultaneous students count once (windows merge),
 * back-to-back sessions merge, and sessions outside the shift are clipped away.
 * Hours are rounded to 0.01 h and pay is computed from the rounded hours.
 */

export type PayType = 'teaching' | 'admin'

export interface Interval {
  startMs: number
  endMs: number
}

export interface Segment extends Interval {
  type: PayType
}

export interface PricedSegment extends Segment {
  hours: number
  rate: number
  pay: number
}

export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

export function hoursOf(ms: number): number {
  return round2(ms / 3_600_000)
}

/** Sort and merge intervals; touching intervals merge. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.endMs > i.startMs).sort((a, b) => a.startMs - b.startMs)
  const out: Interval[] = []
  for (const i of sorted) {
    const last = out[out.length - 1]
    if (last && i.startMs <= last.endMs) last.endMs = Math.max(last.endMs, i.endMs)
    else out.push({ ...i })
  }
  return out
}

export function segmentShift(shift: Interval, teachingWindows: readonly Interval[]): Segment[] {
  const { startMs: S, endMs: E } = shift
  if (E <= S) return []
  const windows = mergeIntervals(teachingWindows)
    .map((w) => ({ startMs: Math.max(w.startMs, S), endMs: Math.min(w.endMs, E) }))
    .filter((w) => w.endMs > w.startMs)
  const segs: Segment[] = []
  let cursor = S
  for (const w of windows) {
    if (w.startMs > cursor) segs.push({ type: 'admin', startMs: cursor, endMs: w.startMs })
    const a = Math.max(w.startMs, cursor)
    const b = Math.min(w.endMs, E)
    if (b > a) segs.push({ type: 'teaching', startMs: a, endMs: b })
    if (w.endMs > cursor) cursor = w.endMs
  }
  if (E > cursor) segs.push({ type: 'admin', startMs: cursor, endMs: E })
  // Merge adjacent segments of the same type.
  const merged: Segment[] = []
  for (const s of segs) {
    const last = merged[merged.length - 1]
    if (last && last.type === s.type && last.endMs === s.startMs) last.endMs = s.endMs
    else merged.push({ ...s })
  }
  return merged
}

export interface Rates {
  teaching: number
  admin: number
}

export type EffectivePayModel = 'teaching_admin_split' | 'single_rate'

/**
 * Prices a shift. `single_rate` pays the whole shift at the admin rate (one
 * segment); a forced type pays the whole shift as that type.
 */
export function priceShift(
  shift: Interval,
  teachingWindows: readonly Interval[],
  rates: Rates,
  model: EffectivePayModel,
  forcedType: PayType | null = null,
): PricedSegment[] {
  if (shift.endMs <= shift.startMs) return []
  const segs: Segment[] =
    forcedType
      ? [{ type: forcedType, ...shift }]
      : model === 'single_rate'
        ? [{ type: 'admin', ...shift }]
        : segmentShift(shift, teachingWindows)
  return segs.map((s) => {
    const hours = hoursOf(s.endMs - s.startMs)
    const rate = s.type === 'teaching' ? rates.teaching : rates.admin
    return { ...s, hours, rate, pay: round2(hours * rate) }
  })
}

export interface PayTotals {
  teaching: { hours: number; pay: number }
  admin: { hours: number; pay: number }
  total: { hours: number; pay: number }
}

export function totals(segments: readonly PricedSegment[]): PayTotals {
  const t = { teaching: { hours: 0, pay: 0 }, admin: { hours: 0, pay: 0 } }
  for (const s of segments) {
    t[s.type].hours += s.hours
    t[s.type].pay += s.pay
  }
  const fix = (v: { hours: number; pay: number }) => ({ hours: round2(v.hours), pay: round2(v.pay) })
  const teaching = fix(t.teaching)
  const admin = fix(t.admin)
  return { teaching, admin, total: { hours: round2(teaching.hours + admin.hours), pay: round2(teaching.pay + admin.pay) } }
}

/** Which pay model applies to an employee. */
export function payModelFor(opts: {
  branchModel: EffectivePayModel
  personModel: 'branch_default' | EffectivePayModel | undefined
  isAdminStaff: boolean
  adminStaffSingleRate: boolean
}): EffectivePayModel {
  if (opts.personModel && opts.personModel !== 'branch_default') return opts.personModel
  if (opts.isAdminStaff && opts.adminStaffSingleRate) return 'single_rate'
  return opts.branchModel
}
