import { type BusinessRules, payModelOn } from '../settings/businessRules'
import type { BranchSettings } from '../settings/defaults'
import type { ClockShift, Session, StaffRole } from '../types'
import { type PricedSegment, type Rates, payModelFor, priceShift } from './segment'

/** What a shift is worth: its priced segments, or `open` while the person is still clocked in. */
export interface ShiftPay<S> {
  shift: S
  segments: PricedSegment[]
  open: boolean
}

/** An employee's rates, and their role: owners and admins are paid one rate, tutors follow the branch pay model. */
export interface StaffPay {
  rates: Rates
  role: StaffRole | undefined
}

type PricedShiftInput = Pick<ClockShift, 'staffId' | 'dateKey' | 'inMin' | 'clockInAt' | 'clockOutAt' | 'forcedType'>
type TeachingSession = Pick<Session, 'tutorId' | 'isDeleted' | 'status' | 'startAt' | 'endAt'>

/**
 * Prices shifts with the shared engine, oldest first (the website's payroll pages and the phone app's payroll
 * history): teaching is time inside the person's sessions whose status counts as teaching
 * (`payroll.teachingSessionStatuses`, by default logged sessions only), the rest of the shift is admin time, and
 * each shift follows the branch's pay model on its date. Open shifts are listed without pay.
 */
export function priceShifts<S extends PricedShiftInput>(opts: {
  shifts: readonly S[]
  sessions: readonly TeachingSession[]
  settings: Pick<BranchSettings, 'payroll'>
  rules: Pick<BusinessRules, 'payModels'>
  ratesFor: (staffId: string) => StaffPay
}): ShiftPay<S>[] {
  const counted = new Set(opts.settings.payroll.teachingSessionStatuses)
  return opts.shifts
    .slice()
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.inMin - b.inMin)
    .map((shift) => {
      if (!shift.clockOutAt) return { shift, segments: [], open: true }
      const windows = opts.sessions
        .filter((s) => s.tutorId === shift.staffId && !s.isDeleted && counted.has(s.status))
        .map((s) => ({ startMs: s.startAt.toMillis(), endMs: s.endAt.toMillis() }))
      const { rates, role } = opts.ratesFor(shift.staffId)
      const model = payModelFor({ role, branchModel: payModelOn(opts.rules, shift.dateKey) })
      const segments = priceShift({ startMs: shift.clockInAt.toMillis(), endMs: shift.clockOutAt.toMillis() }, windows, rates, model, shift.forcedType)
      return { shift, segments, open: false }
    })
}
