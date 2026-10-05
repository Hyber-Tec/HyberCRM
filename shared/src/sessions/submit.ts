import { billedHours } from '../schedule/hours'
import type { BranchSettings } from '../settings/defaults'
import { type LogAi, type LogContent, accuracy, diffLogContent, topicString } from './logs'

/**
 * What submitting a session log writes (the `submitSessionLog` function, and the live demo's sample logs): the log,
 * the session marked Present, the student's hours, first and last session and status, and the audit entry. Pure:
 * the caller passes the timestamp value to stamp with (the server's `serverTimestamp()`, or a date) and applies the
 * writes in one batch or transaction.
 */

/** The fields of a log's own content as stored: True Education's topic string, materials without empty rows. */
export function cleanLogContent(content: LogContent): LogContent {
  return {
    ...content,
    topicCovered: topicString(content.sessionType, content.topics ?? [], content.topicCovered ?? ''),
    materials: (content.materials ?? []).filter((m) => m.label?.trim()).map((m) => ({ label: m.label.trim(), url: m.url ?? '', type: m.type === 'link' ? 'link' : 'text' })),
  }
}

/** The session fields a log copies. */
export interface LogSession {
  tutorId: string
  tutorName: string
  studentId: string
  studentName: string
  subject: string
  subjectId?: string | null
  note?: string | null
  dateKey: string
  startMin: number
  endMin: number
  startAt: unknown
  endAt: unknown
}

/** The student fields submitting reads. */
export interface LogStudent {
  status?: string | null
  statusSource?: string | null
  firstSessionDate?: string | null
  lastSessionDate?: string | null
}

export interface LogSubmitInput<T> {
  sessionId: string
  session: LogSession
  /** Cleaned content (`cleanLogContent`). */
  content: LogContent
  ai: LogAi
  /** The log as it is now (a draft, a submitted log being edited), or null. */
  prev: Record<string, unknown> | null
  /** The student record, or null when it no longer exists. */
  student: LogStudent | null
  settings: Pick<BranchSettings, 'students' | 'sessionLogs'>
  /** Who the log is credited to (`enteredBy`, `lastEditedBy`, `createdBy`, `updatedBy`). */
  author: { email: string; name: string; asAdmin: boolean }
  /** Who the audit entry names. */
  auditActor: { uid: string | null; email: string; name: string; role: string }
  /** The time stamp for `createdAt`, `updatedAt` and the audit entry. */
  now: T
  /** When the log counts as submitted (defaults to `now`). */
  submittedAt?: T
}

export interface LogSubmitWrites {
  usedHours: number
  wasSubmitted: boolean
  /** The full log document (`sessionLogs/{sessionId}`, set). */
  log: Record<string, unknown>
  /** Fields to update on the session. */
  sessionPatch: Record<string, unknown>
  /** Fields to update on the student (null: no student record); the hours change is `hoursDelta`. */
  studentPatch: Record<string, unknown> | null
  /** Add to the student's `totalSessionHours` (0: leave it). */
  hoursDelta: number
  /** The audit entry (`auditLog`, created). */
  audit: Record<string, unknown>
}

export function logSubmitWrites<T>(input: LogSubmitInput<T>): LogSubmitWrites {
  const { sessionId, session, content: clean, prev, student, settings, author, auditActor, now } = input
  const at = input.submittedAt ?? now
  const usedHours = billedHours(session.endMin - session.startMin, settings.students.hourRounding)
  const wasSubmitted = prev?.status === 'submitted'
  const prevUsed = wasSubmitted ? Number(prev.usedHours) || 0 : 0
  const dims = settings.sessionLogs.ratingDimensions
  // The first submit decides who entered the log; later edits are recorded as edits, never as a new author.
  const asAdmin = author.asAdmin
  const enteredBy = wasSubmitted ? (prev.enteredBy ?? null) : { role: asAdmin ? 'admin' : 'tutor', email: author.email, name: author.name, at }
  const enteredByAdmin = wasSubmitted ? (prev.enteredByAdmin ?? null) : asAdmin ? { email: author.email, name: author.name } : null
  const lastEditedBy = wasSubmitted ? { email: author.email, name: author.name, at } : null
  const changes = wasSubmitted ? diffLogContent(prev as Partial<LogContent>, clean, dims) : []
  const log: Record<string, unknown> = {
    sessionId,
    ...clean,
    accuracyPercent: accuracy(clean.questionsAttempted, clean.questionsWrong),
    status: 'submitted',
    submittedAt: prev?.submittedAt ?? at,
    tutorId: session.tutorId,
    tutorName: session.tutorName,
    studentId: session.studentId,
    studentName: session.studentName,
    subject: session.subject,
    subjectId: session.subjectId ?? null,
    sessionNote: session.note ?? '',
    dateKey: session.dateKey,
    startMin: session.startMin,
    endMin: session.endMin,
    startAt: session.startAt,
    endAt: session.endAt,
    usedHours,
    ai: input.ai,
    enteredByAdmin,
    enteredBy,
    lastEditedBy,
    editCount: wasSubmitted ? (Number(prev.editCount) || 0) + 1 : 0,
    ...(prev ? {} : { createdAt: now, createdBy: author.email }),
    updatedAt: now,
    updatedBy: author.email,
  }
  const sessionPatch: Record<string, unknown> = {
    status: 'present',
    logStatus: 'submitted',
    logSubmittedAt: prev?.submittedAt ?? at,
    attendanceMarkedBy: 'session_log',
    updatedAt: now,
    updatedBy: author.email,
  }
  let studentPatch: Record<string, unknown> | null = null
  let hoursDelta = 0
  if (student) {
    studentPatch = { updatedAt: now }
    hoursDelta = Math.round((usedHours - prevUsed) * 100) / 100
    if (!student.lastSessionDate || session.dateKey > student.lastSessionDate) studentPatch.lastSessionDate = session.dateKey
    if (!student.firstSessionDate || session.dateKey < student.firstSessionDate) studentPatch.firstSessionDate = session.dateKey
    const auto = settings.students.autoStatus
    const manualLock = auto.respectManual && student.statusSource === 'manual'
    if (auto.enabled && !manualLock && (student.status === 'signed_up' || student.status === 'paused')) {
      studentPatch.status = 'enrolled'
      studentPatch.statusSource = 'auto'
    }
  }
  const audit: Record<string, unknown> = {
    at: now,
    actorUid: auditActor.uid,
    actorEmail: auditActor.email,
    actorName: auditActor.name,
    actorRole: auditActor.role,
    action: wasSubmitted ? 'sessionLog.edit' : 'sessionLog.submit',
    category: 'sessions',
    entityType: 'sessionLog',
    entityId: sessionId,
    summary: `${wasSubmitted ? 'Updated' : 'Submitted'} the session log for ${session.studentName}${asAdmin && !wasSubmitted ? ` on behalf of ${session.tutorName}` : ''}`,
    context: '',
    dateKey: session.dateKey,
    studentId: session.studentId,
    studentName: session.studentName,
    tutorId: session.tutorId,
    tutorName: session.tutorName,
    changes,
    via: 'function',
  }
  return { usedHours, wasSubmitted, log, sessionPatch, studentPatch, hoursDelta, audit }
}
