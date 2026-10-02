import { effectiveRanges, rangesContain } from '../availability'
import { STUDENT_STATUS_LABELS } from '../people'
import type { DayHours, SessionStatus } from '../settings/defaults'
import { type DateKey, formatMinutes } from '../time'
import type { AvailabilityRange, StaffStatus, StudentStatus } from '../types'
import { fitsCapacity } from './lanes'

/**
 * Why a booked session may not happen as booked. Only sessions still ahead are
 * checked: pending or confirmed, not ended, no submitted log.
 *
 * - `center_closed`: the date is closed (weekly hours or that date's hours).
 * - `outside_hours`: it runs outside that date's opening hours.
 * - `tutor_inactive`: the tutor is on hold, has left, or their access is paused or removed.
 * - `tutor_unavailable`: the tutor's availability doesn't cover it (none that day, or only part).
 * - `over_capacity`: the tutor has more students at once than the branch allows.
 * - `student_double_booked`: the student has another session at the same time.
 * - `student_inactive`: the student is paused or no longer coming.
 */
export type ConflictKind =
  | 'center_closed'
  | 'outside_hours'
  | 'tutor_inactive'
  | 'tutor_unavailable'
  | 'over_capacity'
  | 'student_double_booked'
  | 'student_inactive'

export interface Conflict {
  kind: ConflictKind
  /** Plain sentence for admins, e.g. "Priya Raman is only available 2:00 PM to 5:00 PM." */
  message: string
}

export interface ConflictSession {
  id: string
  tutorId: string
  tutorName: string
  studentId: string
  studentName: string
  dateKey: DateKey
  startMin: number
  endMin: number
  status: SessionStatus
  logStatus?: string | null
  isDeleted?: boolean | null
}

/** What the tutor's records say about them. `removed`: no staff record any more. */
export type TutorState = 'active' | 'on_hold' | 'left' | 'paused' | 'removed'

export interface ConflictContext {
  /** That date's opening hours. */
  hours: DayHours
  /** The tutor's saved availability that day; null when nothing is saved. */
  availability: { ranges: readonly AvailabilityRange[]; unavailable: boolean } | null
  tutorState: TutorState
  /** The student's status; null when unknown. */
  studentStatus: StudentStatus | null
  /** The tutor's live sessions that day (may include this one). */
  tutorSessions: readonly ConflictSession[]
  /** The student's live sessions that day (may include this one). */
  studentSessions: readonly ConflictSession[]
  /** Students per tutor at once (branch rule). */
  maxPerTutor: number
}

const CHECKED: ReadonlySet<SessionStatus> = new Set<SessionStatus>(['pending', 'confirmed'])
const STUDENT_AWAY: ReadonlySet<StudentStatus> = new Set<StudentStatus>(['paused', 'finished', 'no_answer', 'not_interested'])

/** Pending or confirmed, not deleted and not logged: the kind of session that can be in conflict. */
export function isCheckable(s: Pick<ConflictSession, 'status' | 'logStatus' | 'isDeleted'>): boolean {
  return !s.isDeleted && CHECKED.has(s.status) && s.logStatus !== 'submitted'
}

/** Still ahead: later today or on a later date. */
export function isAhead(s: Pick<ConflictSession, 'dateKey' | 'endMin'>, today: DateKey, nowMin: number): boolean {
  return s.dateKey > today || (s.dateKey === today && s.endMin > nowMin)
}

function rangesText(ranges: readonly AvailabilityRange[]): string {
  const parts = ranges.map((r) => `${formatMinutes(r.startMin)} to ${formatMinutes(r.endMin)}`)
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

export function staffTutorState(staffStatus: StaffStatus | null | undefined, memberActive: boolean | null): TutorState {
  if (staffStatus === undefined || staffStatus === null) return 'removed'
  if (staffStatus === 'finished') return 'left'
  if (staffStatus === 'on_hold') return 'on_hold'
  if (memberActive === false) return 'paused'
  return 'active'
}

/** Every reason this session may not happen as booked (empty: none). Order: most fundamental first. */
export function sessionConflicts(s: ConflictSession, ctx: ConflictContext): Conflict[] {
  if (!isCheckable(s)) return []
  const out: Conflict[] = []
  const { hours } = ctx
  const tutor = s.tutorName || 'The tutor'

  if (!hours.isOpen) out.push({ kind: 'center_closed', message: 'The center is closed that day.' })
  else if (s.startMin < hours.openMin || s.endMin > hours.closeMin) {
    out.push({ kind: 'outside_hours', message: `It runs outside opening hours (${formatMinutes(hours.openMin)} to ${formatMinutes(hours.closeMin)}).` })
  }

  if (ctx.tutorState !== 'active') {
    const why: Record<Exclude<TutorState, 'active'>, string> = {
      on_hold: `${tutor} is on hold.`,
      left: `${tutor} no longer works here.`,
      paused: `${tutor}’s access is paused.`,
      removed: 'The tutor was removed.',
    }
    out.push({ kind: 'tutor_inactive', message: why[ctx.tutorState] })
  } else if (hours.isOpen) {
    const a = ctx.availability
    const ranges = a && !a.unavailable ? effectiveRanges(a.ranges, hours) : []
    if (ranges.length === 0) out.push({ kind: 'tutor_unavailable', message: `${tutor} isn’t available that day.` })
    else if (!rangesContain(ranges, s.startMin, s.endMin)) {
      out.push({ kind: 'tutor_unavailable', message: `${tutor} is only available ${rangesText(ranges)}.` })
    }
  }

  const tutorLive = ctx.tutorSessions.filter((o) => o.id !== s.id && isCheckable(o) && o.tutorId === s.tutorId && o.dateKey === s.dateKey)
  if (!fitsCapacity(tutorLive, s.startMin, s.endMin, Math.max(1, ctx.maxPerTutor))) {
    const max = Math.max(1, ctx.maxPerTutor)
    out.push({ kind: 'over_capacity', message: `${tutor} has more than ${max} student${max === 1 ? '' : 's'} at once.` })
  }

  const clash = ctx.studentSessions.find(
    (o) => o.id !== s.id && isCheckable(o) && o.studentId === s.studentId && o.dateKey === s.dateKey && o.startMin < s.endMin && s.startMin < o.endMin,
  )
  if (clash) {
    out.push({
      kind: 'student_double_booked',
      message: `${s.studentName || 'The student'} also has a session with ${clash.tutorName || 'another tutor'} at ${formatMinutes(clash.startMin)}.`,
    })
  }

  if (ctx.studentStatus && STUDENT_AWAY.has(ctx.studentStatus)) {
    out.push({ kind: 'student_inactive', message: `${s.studentName || 'The student'} is marked ${STUDENT_STATUS_LABELS[ctx.studentStatus]}.` })
  }
  return out
}

/** What the tutor reads on a session in conflict: it isn't certain, and the admin decides. */
export function tutorConflictText(conflicts: readonly Conflict[]): string | null {
  if (conflicts.length === 0) return null
  const kinds = new Set(conflicts.map((c) => c.kind))
  const why = kinds.has('center_closed')
    ? 'The center is closed that day.'
    : kinds.has('outside_hours')
      ? 'It’s outside the center’s opening hours.'
      : kinds.has('tutor_unavailable')
        ? 'You’re not available at this time.'
        : kinds.has('over_capacity')
          ? 'You have more students at once than allowed.'
          : kinds.has('student_double_booked')
            ? 'The student has another session at this time.'
            : kinds.has('student_inactive')
              ? 'The student isn’t attending right now.'
              : 'Something changed since it was booked.'
  return `${why} Waiting for the admin to move, reassign or cancel it.`
}

/** Short label for a conflict on cards and lists. */
export const CONFLICT_LABELS: Record<ConflictKind, string> = {
  center_closed: 'Center closed',
  outside_hours: 'Outside hours',
  tutor_inactive: 'Tutor inactive',
  tutor_unavailable: 'Tutor unavailable',
  over_capacity: 'Too many students',
  student_double_booked: 'Student double-booked',
  student_inactive: 'Student inactive',
}
