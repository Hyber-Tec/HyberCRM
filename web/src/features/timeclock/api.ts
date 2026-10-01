import { type DocumentData, type Query, doc, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import { type PayType, type PricedSegment, type Rates, payModelFor, priceShift } from '@shared/pay/segment'
import { type BusinessRules, payModelOn } from '@shared/settings/businessRules'
import type { BranchSettings } from '@shared/settings/defaults'
import { type DateKey, addDays, formatDateKey, formatMinutes, minutesOf, toInstant } from '@shared/time'
import type { Compensation, Session, Staff, StaffRole, TimestampLike, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef, useQuery } from '@/lib/firestore'

export interface ClockShift {
  staffId: string
  staffName: string
  dateKey: DateKey
  inMin: number
  clockInAt: TimestampLike
  clockOutAt: TimestampLike | null
  outDateKey: DateKey | null
  outMin: number | null
  status: 'open' | 'closed'
  source: 'kiosk' | 'admin' | 'auto'
  autoClosed: boolean
  autoCorrected: boolean
  forcedType: PayType | null
  note: string
}

/** Live shifts in a date range (optionally one employee). */
export function useShifts(from: DateKey, to: DateKey, staffId: string | null, enabled = true) {
  const { branchId } = useBranch()
  const q = useMemo((): Query<DocumentData> | null => {
    if (!enabled) return null
    const base = branchCol(branchId, COL.clockShifts)
    return staffId
      ? query(base, where('staffId', '==', staffId), where('dateKey', '>=', from), where('dateKey', '<=', to))
      : query(base, where('dateKey', '>=', from), where('dateKey', '<=', to))
  }, [branchId, from, to, staffId, enabled])
  return useQuery<ClockShift>(q, `shifts-${branchId}-${from}-${to}-${staffId}-${enabled}`)
}

/** Sessions (teaching windows) in a date range (optionally one tutor). */
export function useSessionsRange(from: DateKey, to: DateKey, tutorId: string | null, enabled = true) {
  const { branchId } = useBranch()
  const q = useMemo((): Query<DocumentData> | null => {
    if (!enabled) return null
    const base = branchCol(branchId, COL.sessions)
    return tutorId
      ? query(base, where('tutorId', '==', tutorId), where('dateKey', '>=', from), where('dateKey', '<=', to))
      : query(base, where('dateKey', '>=', from), where('dateKey', '<=', to))
  }, [branchId, from, to, tutorId, enabled])
  return useQuery<Session>(q, `pay-sessions-${branchId}-${from}-${to}-${tutorId}-${enabled}`)
}

export interface ShiftPay {
  shift: WithId<ClockShift>
  segments: PricedSegment[]
  open: boolean
}

/**
 * Prices closed shifts with the shared engine: teaching = time inside sessions
 * whose status counts as teaching (default: logged sessions only).
 */
export function priceShifts(opts: {
  shifts: WithId<ClockShift>[]
  sessions: WithId<Session>[]
  settings: BranchSettings
  /** The branch's pay model on each shift's date. */
  rules: BusinessRules
  timezone: string
  ratesFor: (staffId: string) => StaffPay
}): ShiftPay[] {
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
      const segments = priceShift(
        { startMs: shift.clockInAt.toMillis(), endMs: shift.clockOutAt.toMillis() },
        windows,
        rates,
        model,
        shift.forcedType,
      )
      return { shift, segments, open: false }
    })
}

export interface StaffPay {
  rates: Rates
  /** Owners and admins are paid one rate; tutors follow the branch pay model. */
  role: StaffRole | undefined
}

export function effectiveRates(staff: WithId<Staff> | undefined, comp: Compensation | null | undefined): StaffPay {
  return { rates: comp?.rates ?? { teaching: 0, admin: 0 }, role: staff?.role }
}

// ---------------------------------------------------------------- writes

export interface ShiftInput {
  staffId: string
  staffName: string
  dateKey: DateKey
  inMin: number
  outMin: number
  forcedType: PayType | null
  note: string
}

function shiftTimes(input: ShiftInput, tz: string) {
  const clockInAt = toInstant(input.dateKey, input.inMin, tz)
  const clockOutAt = toInstant(input.dateKey, input.outMin, tz)
  return {
    clockInAt,
    clockOutAt,
    outDateKey: input.outMin >= 1440 ? addDays(input.dateKey, 1) : input.dateKey,
    outMin: minutesOf(clockOutAt, tz),
  }
}

export async function saveShift(branchId: string, actor: Actor, tz: string, input: ShiftInput, existing: WithId<ClockShift> | null) {
  const batch = writeBatch(db)
  const ref = existing ? branchDocRef(branchId, COL.clockShifts, existing.id) : doc(branchCol(branchId, COL.clockShifts))
  const times = shiftTimes(input, tz)
  const data = {
    staffId: input.staffId,
    staffName: input.staffName,
    dateKey: input.dateKey,
    inMin: input.inMin,
    ...times,
    status: 'closed',
    forcedType: input.forcedType,
    note: input.note.trim(),
    autoCorrected: existing?.autoClosed ? true : (existing?.autoCorrected ?? false),
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  }
  if (existing) batch.update(ref, data)
  else batch.set(ref, { ...data, source: 'admin', autoClosed: false, createdAt: serverTimestamp(), createdBy: actor.email })
  if (existing?.status === 'open') batch.delete(branchDocRef(branchId, COL.openShifts, existing.staffId))
  addAudit(batch, branchId, actor, {
    action: existing ? 'shift.update' : 'shift.create',
    category: 'pay',
    entityType: 'shift',
    entityId: ref.id,
    tutorId: input.staffId,
    tutorName: input.staffName,
    dateKey: input.dateKey,
    summary: `${existing ? 'Changed' : 'Added'} a time entry for ${input.staffName}: ${formatDateKey(input.dateKey, 'weekdayMedium')} ${formatMinutes(input.inMin)} – ${formatMinutes(input.outMin)}`,
    changes: existing
      ? [
          {
            field: 'time',
            label: 'Time',
            from: `${formatMinutes(existing.inMin)} – ${existing.outMin != null ? formatMinutes(existing.outMin) : 'open'}`,
            to: `${formatMinutes(input.inMin)} – ${formatMinutes(input.outMin)}`,
          },
        ]
      : [],
  })
  await batch.commit()
}

export async function deleteShift(branchId: string, actor: Actor, shift: WithId<ClockShift>) {
  const batch = writeBatch(db)
  batch.delete(branchDocRef(branchId, COL.clockShifts, shift.id))
  if (shift.status === 'open') batch.delete(branchDocRef(branchId, COL.openShifts, shift.staffId))
  addAudit(batch, branchId, actor, {
    action: 'shift.delete',
    category: 'pay',
    entityType: 'shift',
    entityId: shift.id,
    tutorId: shift.staffId,
    tutorName: shift.staffName,
    dateKey: shift.dateKey,
    summary: `Deleted a time entry for ${shift.staffName} on ${formatDateKey(shift.dateKey, 'weekdayMedium')}`,
  })
  await batch.commit()
}
