import { type WriteBatch, deleteDoc, doc, increment, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { dayStartInstant } from '@shared/availability'
import { COL, availabilityDocId } from '@shared/paths'
import { billedHours } from '@shared/schedule/hours'
import { SESSION_STATUS_LABELS } from '@shared/schedule/status'
import type { BranchSettings, SessionStatus } from '@shared/settings/defaults'
import { type DateKey, dayEndInstant, formatDateKey, formatTimeRange, toInstant, weekdayOf } from '@shared/time'
import type { AuditChange, AvailabilityRange, Session, WithId } from '@shared/types'
import { type Actor, type AuditInput, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'

export interface ScheduleCtx {
  branchId: string
  actor: Actor
  timezone: string
  settings: BranchSettings
}

export interface SessionDraft {
  tutorId: string
  tutorName: string
  studentId: string
  studentName: string
  studentGrade: string
  subjectId: string | null
  subject: string
  note: string
  status: SessionStatus
  dateKey: DateKey
  startMin: number
  endMin: number
}

export function timeFields(dateKey: DateKey, startMin: number, endMin: number, tz: string) {
  return {
    dateKey,
    weekday: weekdayOf(dateKey),
    startMin,
    endMin,
    startAt: toInstant(dateKey, startMin, tz),
    endAt: toInstant(dateKey, endMin, tz),
    dayEndAt: dayEndInstant(dateKey, tz),
  }
}

/** "Wednesday, 9/30/2026 (4:00 PM - 5:50 PM)". */
export function sessionContext(s: Pick<Session, 'dateKey' | 'startMin' | 'endMin'>): string {
  return `${formatDateKey(s.dateKey, 'weekdayLong').split(',')[0]}, ${formatDateKey(s.dateKey, 'short')} (${formatTimeRange(s.startMin, s.endMin)})`
}

function audit(batch: WriteBatch, ctx: ScheduleCtx, s: Pick<Session, 'dateKey' | 'startMin' | 'endMin' | 'studentId' | 'studentName' | 'tutorId' | 'tutorName'>, input: Omit<AuditInput, 'category' | 'entityType' | 'context' | 'dateKey' | 'studentId' | 'studentName' | 'tutorId' | 'tutorName'> & { context?: string }) {
  addAudit(batch, ctx.branchId, ctx.actor, {
    category: 'schedule',
    entityType: 'session',
    context: input.context ?? sessionContext(s),
    dateKey: s.dateKey,
    studentId: s.studentId,
    studentName: s.studentName,
    tutorId: s.tutorId,
    tutorName: s.tutorName,
    ...input,
  })
}

export function newSessionData(ctx: ScheduleCtx, d: SessionDraft, source: Session['source']) {
  return {
    tutorId: d.tutorId,
    tutorName: d.tutorName,
    studentId: d.studentId,
    studentName: d.studentName,
    studentGrade: d.studentGrade,
    subjectId: d.subjectId,
    subject: d.subject.trim(),
    note: d.note.trim(),
    status: d.status,
    ...timeFields(d.dateKey, d.startMin, d.endMin, ctx.timezone),
    visualOrder: 0,
    logStatus: 'none',
    logSubmittedAt: null,
    noShowAppliedHours: null,
    confirmedAt: null,
    confirmedBy: null,
    source,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    createdAt: serverTimestamp(),
    createdBy: ctx.actor.email,
    updatedAt: serverTimestamp(),
    updatedBy: ctx.actor.email,
  }
}

export async function createSession(ctx: ScheduleCtx, d: SessionDraft, source: Session['source'] = 'manual'): Promise<string> {
  const ref = doc(branchCol(ctx.branchId, COL.sessions))
  const batch = writeBatch(db)
  batch.set(ref, newSessionData(ctx, d, source))
  audit(batch, ctx, { ...d }, {
    action: 'session.create',
    entityId: ref.id,
    summary: `Created a session for ${d.studentName} with ${d.tutorName}`,
    changes: [{ field: 'status', label: 'Status', from: null, to: SESSION_STATUS_LABELS[d.status] }],
  })
  await batch.commit()
  return ref.id
}

export type SessionPatch = Partial<Pick<SessionDraft, 'tutorId' | 'tutorName' | 'studentId' | 'studentName' | 'studentGrade' | 'subjectId' | 'subject' | 'note' | 'status' | 'dateKey' | 'startMin' | 'endMin'>> & {
  visualOrder?: number
}

/** No Show bills the session's rounded hours to the student (and takes them back when undone). */
function noShowAccounting(batch: WriteBatch, ctx: ScheduleCtx, before: WithId<Session>, nextStatus: SessionStatus | undefined) {
  if (!nextStatus || nextStatus === before.status || !ctx.settings.schedule.noShow.countsTowardStudentHours) return {}
  const studentRef = branchDocRef(ctx.branchId, COL.students, before.studentId)
  if (nextStatus === 'no_show') {
    const h = billedHours(before.endMin - before.startMin, ctx.settings.students.hourRounding)
    batch.update(studentRef, { totalSessionHours: increment(h), updatedAt: serverTimestamp() })
    return { noShowAppliedHours: h }
  }
  if (before.status === 'no_show' && before.noShowAppliedHours) {
    batch.update(studentRef, { totalSessionHours: increment(-before.noShowAppliedHours), updatedAt: serverTimestamp() })
    return { noShowAppliedHours: null }
  }
  return {}
}

export async function updateSession(ctx: ScheduleCtx, before: WithId<Session>, patch: SessionPatch) {
  const next = { ...before, ...patch }
  const timeChanged = next.dateKey !== before.dateKey || next.startMin !== before.startMin || next.endMin !== before.endMin
  const changes: AuditChange[] = []
  const actions: string[] = []
  if (next.tutorId !== before.tutorId) {
    changes.push({ field: 'tutor', label: 'Tutor', from: before.tutorName, to: next.tutorName })
    actions.push('session.tutor')
  }
  if (timeChanged) {
    if (next.dateKey !== before.dateKey) {
      changes.push({ field: 'date', label: 'Date', from: formatDateKey(before.dateKey, 'weekdayMedium'), to: formatDateKey(next.dateKey, 'weekdayMedium') })
    }
    if (next.startMin !== before.startMin || next.endMin !== before.endMin) {
      changes.push({ field: 'time', label: 'Time', from: formatTimeRange(before.startMin, before.endMin), to: formatTimeRange(next.startMin, next.endMin) })
    }
    actions.push('session.move')
  }
  if (next.status !== before.status) {
    changes.push({ field: 'status', label: 'Status', from: SESSION_STATUS_LABELS[before.status], to: SESSION_STATUS_LABELS[next.status] })
    actions.push('session.status')
  }
  if ((next.subject ?? '') !== (before.subject ?? '')) {
    changes.push({ field: 'subject', label: 'Subject', from: before.subject || null, to: next.subject || null })
    actions.push('session.subject')
  }
  if ((next.note ?? '') !== (before.note ?? '')) {
    changes.push({ field: 'note', label: 'Note', from: before.note || null, to: next.note || null })
    actions.push('session.note')
  }
  if (next.studentId !== before.studentId) {
    changes.push({ field: 'student', label: 'Student', from: before.studentName, to: next.studentName })
    actions.push('session.student')
  }

  const batch = writeBatch(db)
  const ns = noShowAccounting(batch, ctx, before, patch.status)
  batch.update(branchDocRef(ctx.branchId, COL.sessions, before.id), {
    ...patch,
    ...(timeChanged ? timeFields(next.dateKey, next.startMin, next.endMin, ctx.timezone) : {}),
    ...ns,
    ...(patch.status === 'confirmed' && before.status !== 'confirmed' ? { confirmedAt: serverTimestamp(), confirmedBy: ctx.actor.email } : {}),
    updatedAt: serverTimestamp(),
    updatedBy: ctx.actor.email,
  })
  if (actions.length > 0) {
    const action = actions.length > 1 ? 'session.update' : actions[0]
    const verb: Record<string, string> = {
      'session.tutor': 'Changed the tutor of',
      'session.move': 'Moved',
      'session.status': 'Changed the status of',
      'session.subject': 'Changed the subject of',
      'session.note': 'Changed the note on',
      'session.student': 'Changed the student of',
      'session.update': 'Updated',
    }
    audit(batch, ctx, before, {
      action,
      entityId: before.id,
      summary: `${verb[action]} ${before.studentName}’s session`,
      changes,
    })
  }
  await batch.commit()
}

export async function deleteSession(ctx: ScheduleCtx, s: WithId<Session>) {
  const batch = writeBatch(db)
  batch.update(branchDocRef(ctx.branchId, COL.sessions, s.id), {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: ctx.actor.name,
    updatedAt: serverTimestamp(),
    updatedBy: ctx.actor.email,
  })
  audit(batch, ctx, s, { action: 'session.delete', entityId: s.id, summary: `Deleted ${s.studentName}’s session with ${s.tutorName}` })
  await batch.commit()
}

export async function restoreSession(ctx: ScheduleCtx, s: WithId<Session>) {
  const batch = writeBatch(db)
  batch.update(branchDocRef(ctx.branchId, COL.sessions, s.id), {
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    updatedAt: serverTimestamp(),
    updatedBy: ctx.actor.email,
  })
  audit(batch, ctx, s, { action: 'session.restore', entityId: s.id, summary: `Restored ${s.studentName}’s session from Trash` })
  await batch.commit()
}

export async function purgeSessions(ctx: ScheduleCtx, sessions: WithId<Session>[]) {
  for (let i = 0; i < sessions.length; i += 200) {
    const batch = writeBatch(db)
    for (const s of sessions.slice(i, i + 200)) batch.delete(branchDocRef(ctx.branchId, COL.sessions, s.id))
    if (i === 0) {
      addAudit(batch, ctx.branchId, ctx.actor, {
        action: 'session.purge',
        category: 'schedule',
        entityType: 'session',
        entityId: sessions.length === 1 ? sessions[0].id : 'many',
        summary: sessions.length === 1 ? `Permanently deleted ${sessions[0].studentName}’s session` : `Emptied Trash (${sessions.length} sessions)`,
      })
    }
    await batch.commit()
  }
}

export async function reorderSessions(ctx: ScheduleCtx, orders: { id: string; visualOrder: number }[]) {
  const batch = writeBatch(db)
  for (const o of orders) {
    batch.update(branchDocRef(ctx.branchId, COL.sessions, o.id), { visualOrder: o.visualOrder, updatedAt: serverTimestamp(), updatedBy: ctx.actor.email })
  }
  await batch.commit()
}

// ---------------------------------------------------------------- day setup

export async function saveDayConfig(ctx: ScheduleCtx, dateKey: DateKey, cfg: { isOpen: boolean; openMin: number; closeMin: number }, batch?: WriteBatch) {
  const b = batch ?? writeBatch(db)
  b.set(branchDocRef(ctx.branchId, COL.dayConfigs, dateKey), { dateKey, ...cfg, updatedAt: serverTimestamp(), updatedBy: ctx.actor.email })
  addAudit(b, ctx.branchId, ctx.actor, {
    action: 'dayConfig.update',
    category: 'schedule',
    entityType: 'dayConfig',
    entityId: dateKey,
    dateKey,
    summary: `${cfg.isOpen ? `Set opening hours to ${formatTimeRange(cfg.openMin, cfg.closeMin)}` : 'Closed the day'} on ${formatDateKey(dateKey, 'weekdayMedium')}`,
  })
  if (!batch) await b.commit()
}

export async function clearDayConfig(ctx: ScheduleCtx, dateKey: DateKey) {
  await deleteDoc(branchDocRef(ctx.branchId, COL.dayConfigs, dateKey))
}

/** Edit Day → availability override for one tutor on one date. */
export function setDayAvailability(
  batch: WriteBatch,
  ctx: ScheduleCtx,
  staffId: string,
  dateKey: DateKey,
  value: { ranges: AvailabilityRange[]; unavailable: boolean; hidden: boolean },
) {
  batch.set(branchDocRef(ctx.branchId, COL.availability, availabilityDocId(staffId, dateKey)), {
    staffId,
    dateKey,
    weekday: weekdayOf(dateKey),
    ranges: value.unavailable ? [] : value.ranges,
    unavailable: value.unavailable,
    hidden: value.hidden,
    dayStartAt: dayStartInstant(dateKey, ctx.timezone),
    updatedVia: 'admin',
    updatedAt: serverTimestamp(),
    updatedBy: ctx.actor.email,
  })
}

export async function saveTutorOrder(ctx: ScheduleCtx, order: string[], currentOverrides: Record<string, unknown>) {
  const schedule = { ...((currentOverrides.schedule as Record<string, unknown>) ?? {}), tutorOrder: order }
  await updateDoc(doc(db, 'branches', ctx.branchId), {
    settings: { ...currentOverrides, schedule },
    updatedAt: serverTimestamp(),
    updatedBy: ctx.actor.email,
  })
}


// ---------------------------------------------------------------- duplicate

export interface DuplicateSource {
  weekday: string
  startMin: number
  endMin: number
  tutorId: string
  tutorName: string
  studentId: string
  studentName: string
  studentGrade: string
  subjectId: string | null
  subject: string
  note: string
  visualOrder?: number
}

/**
 * Copies sessions into a target week (TE "Duplicate Week"): optionally clears the
 * target days first (only when there is something to copy), skips closed and past
 * days, and creates the copies with the paste status. Returns the number created.
 */
export async function duplicateIntoWeek(
  ctx: ScheduleCtx,
  opts: {
    sources: DuplicateSource[]
    targetDays: { dateKey: DateKey; weekday: string; open: boolean }[]
    existingTarget: WithId<Session>[]
    liveGrade: (studentId: string) => string | undefined
    label: string
  },
): Promise<number> {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: ctx.timezone }).format(new Date())
  const days = opts.targetDays.filter((d) => d.open && d.dateKey >= today)
  const plan = opts.sources.flatMap((src) => {
    const day = days.find((d) => d.weekday === src.weekday)
    return day ? [{ src, dateKey: day.dateKey }] : []
  })
  if (plan.length === 0) return 0
  const toClear = ctx.settings.schedule.duplicate.overwriteTargetDays
    ? opts.existingTarget.filter((s) => !s.isDeleted && days.some((d) => d.dateKey === s.dateKey))
    : []
  const ops: ((b: WriteBatch) => void)[] = []
  for (const s of toClear) {
    ops.push((b) =>
      b.update(branchDocRef(ctx.branchId, COL.sessions, s.id), {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: ctx.actor.name,
        updatedAt: serverTimestamp(),
        updatedBy: ctx.actor.email,
      }),
    )
  }
  for (const { src, dateKey } of plan) {
    ops.push((b) =>
      b.set(
        doc(branchCol(ctx.branchId, COL.sessions)),
        {
          ...newSessionData(
            ctx,
            {
              tutorId: src.tutorId,
              tutorName: src.tutorName,
              studentId: src.studentId,
              studentName: src.studentName,
              studentGrade: opts.liveGrade(src.studentId) ?? src.studentGrade,
              subjectId: src.subjectId,
              subject: src.subject,
              note: src.note,
              status: ctx.settings.schedule.pasteStatus,
              dateKey,
              startMin: src.startMin,
              endMin: src.endMin,
            },
            'duplicate_week',
          ),
          visualOrder: src.visualOrder ?? 0,
        },
      ),
    )
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db)
    for (const op of ops.slice(i, i + 400)) op(batch)
    if (i === 0) {
      addAudit(batch, ctx.branchId, ctx.actor, {
        action: 'schedule.duplicate_week',
        category: 'schedule',
        entityType: 'session',
        entityId: 'many',
        summary: `Duplicated ${plan.length} sessions (${opts.label})${toClear.length ? `, replacing ${toClear.length}` : ''}`,
      })
    }
    await batch.commit()
  }
  return plan.length
}
