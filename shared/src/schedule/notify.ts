import type { NotificationType } from '../comms'
import { type DateKey, formatDateKey, formatMinutes } from '../time'
import { SESSION_STATUS_LABELS } from './status'

/** The session fields the notification rules look at. */
export interface SessionSnapshot {
  tutorId: string | null
  studentName: string
  subject: string
  status: string
  dateKey: DateKey
  startMin: number
  endMin: number
  /** Start instant in ms. */
  startMs: number
  isDeleted?: boolean
}

/** Which of the tutor's notification switches governs an item. */
export type SessionPref = 'sessionCreated' | 'sessionChanged' | 'sessionCanceled'

export interface SessionNotice {
  staffId: string
  type: NotificationType
  title: string
  body: string
  dateKey: DateKey
  pref: SessionPref
}

export interface NoticeContext {
  now: number
  /** Today in the branch zone. */
  today: DateKey
  /** Only sessions starting within this many hours notify (owner decision: 24). */
  windowHours: number
}

const date = (d: DateKey) => formatDateKey(d, 'weekdayShort') // "Wed, 9/30"
const time = (m: number) => formatMinutes(m) // "4:00 PM"
const range = (s: SessionSnapshot) => `${time(s.startMin)} – ${time(s.endMin)}`
const day = (s: SessionSnapshot, ctx: NoticeContext) => (s.dateKey === ctx.today ? 'today' : date(s.dateKey))
const statusLabel = (status: string) => SESSION_STATUS_LABELS[status as keyof typeof SESSION_STATUS_LABELS] ?? status

function inWindow(s: SessionSnapshot, ctx: NoticeContext) {
  return s.startMs >= ctx.now && s.startMs <= ctx.now + ctx.windowHours * 3_600_000
}

/**
 * A new session that starts inside the window (after auto-confirm): True
 * Education's "Session Confirmed". Pending and confirmed sessions only.
 */
export function sessionCreatedNotices(s: SessionSnapshot, ctx: NoticeContext): SessionNotice[] {
  if (!s.tutorId || s.isDeleted || !['pending', 'confirmed'].includes(s.status) || !inWindow(s, ctx)) return []
  return [
    {
      staffId: s.tutorId,
      type: 'session_created',
      title: 'Session Confirmed',
      body: `${s.studentName} on ${day(s, ctx)} at ${range(s)} has been confirmed.`,
      dateKey: s.dateKey,
      pref: 'sessionCreated',
    },
  ]
}

/**
 * True Education's decision table for session updates, limited to sessions
 * starting inside the window (before or after the change), plus Hyber's
 * delete/restore-from-trash notices. At most one notice per tutor.
 */
export function sessionChangeNotices(before: SessionSnapshot, after: SessionSnapshot, ctx: NoticeContext): SessionNotice[] {
  if (!inWindow(before, ctx) && !inWindow(after, ctx)) return []
  const out: SessionNotice[] = []
  const add = (staffId: string | null, n: Omit<SessionNotice, 'staffId' | 'dateKey'>, s: SessionSnapshot) => {
    if (staffId) out.push({ staffId, dateKey: s.dateKey, ...n })
  }

  // Moved to / back from the trash.
  if (!before.isDeleted && after.isDeleted) {
    if (before.status === 'confirmed') {
      add(before.tutorId, { type: 'session_deleted', title: 'Session Deleted', body: `${before.studentName} on ${day(before, ctx)} at ${range(before)} was removed from the schedule.`, pref: 'sessionCanceled' }, before)
    }
    return out
  }
  if (before.isDeleted && !after.isDeleted) {
    if (after.status === 'confirmed') {
      add(after.tutorId, { type: 'session_restored', title: 'Session Restored', body: `${after.studentName} on ${day(after, ctx)} at ${range(after)} is back on your schedule.`, pref: 'sessionCanceled' }, after)
    }
    return out
  }
  if (after.isDeleted) return out

  // Cancellations and their corrections.
  if (before.status === 'confirmed' && after.status === 'canceled') {
    const body =
      after.dateKey === ctx.today
        ? `${after.studentName}’s ${time(after.startMin)} session today is canceled.`
        : `${after.studentName} on ${date(after.dateKey)} at ${time(after.startMin)} has been canceled.`
    add(after.tutorId, { type: 'session_canceled', title: 'Cancellation Alert', body, pref: 'sessionCanceled' }, after)
    return out
  }
  if (before.status === 'canceled' && after.status !== 'canceled') {
    const body =
      after.dateKey === ctx.today
        ? `Correction: ${after.studentName}’s ${time(after.startMin)} session today is NOT canceled. Status: ${statusLabel(after.status)}.`
        : `Correction: ${after.studentName} on ${date(after.dateKey)} is NOT canceled. Status: ${statusLabel(after.status)}.`
    add(after.tutorId, { type: 'session_restored', title: 'Session Restored', body, pref: 'sessionCanceled' }, after)
    return out
  }
  if (after.status === 'canceled') return out
  // Tentative sessions don't notify.
  if (before.status === 'pending' && after.status === 'pending') return out

  // Another tutor: tell both, nothing else.
  if (before.tutorId !== after.tutorId) {
    add(before.tutorId, { type: 'session_reassigned_out', title: 'Session Removed', body: `You no longer have ${before.studentName} on ${date(before.dateKey)} at ${range(before)}.`, pref: 'sessionChanged' }, before)
    add(after.tutorId, { type: 'session_reassigned_in', title: 'Session Assigned', body: `You've been assigned to ${after.studentName}'s session on ${date(after.dateKey)} at ${range(after)}.`, pref: 'sessionChanged' }, after)
    return out
  }

  const changed = (n: Omit<SessionNotice, 'staffId' | 'dateKey' | 'pref'>) => add(after.tutorId, { ...n, pref: 'sessionChanged' }, after)
  if (after.status === 'no_show' && before.status !== 'no_show') {
    changed({ type: 'session_no_show', title: 'No Show', body: `${after.studentName}'s session on ${date(after.dateKey)} at ${time(after.startMin)} was marked No Show.` })
  } else if (before.dateKey !== after.dateKey) {
    changed({ type: 'session_date_changed', title: 'Session Date Changed', body: `${after.studentName}'s session moved from ${date(before.dateKey)} to ${date(after.dateKey)} at ${range(after)}.` })
  } else if (before.startMin !== after.startMin || before.endMin !== after.endMin) {
    changed({ type: 'session_time_changed', title: 'Time Changed', body: `${after.studentName}'s session on ${date(after.dateKey)}: ${range(before)} → ${range(after)}.` })
  } else if ((before.subject ?? '') !== (after.subject ?? '')) {
    changed({ type: 'session_subject_changed', title: 'Subject Changed', body: `${after.studentName}'s session on ${date(after.dateKey)}: subject changed from "${before.subject || 'none'}" to "${after.subject || 'none'}".` })
  }
  return out
}
