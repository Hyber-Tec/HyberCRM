import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { COL, ROOT } from '@shared/paths'
import { aiJson, geminiKey } from './ai'
import { db, LIGHT } from './app'
import { billedHours } from '@shared/schedule/hours'
import {
  FLAG_LABELS,
  type LogAi,
  type LogContent,
  type StudentFlag,
  accuracy,
  canLog,
  finishText,
  localLogAi,
  ratingKey,
  submitError,
} from '@shared/sessions/logs'
import { type LogSession, type LogStudent, cleanLogContent, logSubmitWrites } from '@shared/sessions/submit'
import { resolveBusinessRules } from '@shared/settings/businessRules'
import { formatMinutes } from '@shared/time'
import { resolveSettings } from '@shared/settings/resolve'
import type { Branch } from '@shared/types'

/** The AI call for logs (quick tier); the report functions use their own tier. */
const gemini = <T>(system: string, payload: unknown, schema: Record<string, unknown>) => aiJson<T>(system, payload, schema)

// Keeps the tutor's paragraphs and lists (only extra spaces go) and ends with a full stop.
const finish = finishText
const str = { type: 'STRING' }

/** True Education's AI input for a log: flat fields, flag and ratings by label, no names. */
function logAiPayload(content: LogContent, subject: string, dimensions: string[]) {
  return {
    subject,
    topicCovered: content.topicCovered,
    lessonActivity: content.lessonActivity,
    learningInsight: content.learningInsight,
    nextFocus: content.nextFocus,
    homeworkGiven: content.homeworkGiven,
    homeworkComments: content.homeworkComments,
    studentFlag: content.studentFlag ? FLAG_LABELS[content.studentFlag as StudentFlag] : '',
    ...Object.fromEntries(dimensions.map((d) => [ratingKey(d), String(content.ratings[ratingKey(d)] ?? '')])),
    accuracyPercent: accuracy(content.questionsAttempted, content.questionsWrong),
    questionsAttempted: content.questionsAttempted,
    questionsWrong: content.questionsWrong,
    homeworkStatus: content.homeworkStatus,
    sessionType: content.sessionType,
  }
}

async function logAi(content: LogContent, subject: string, dimensions: string[]): Promise<LogAi> {
  const out = await gemini<Record<string, string>>(
    'You generate structured tutor action items from an existing session log. Do not invent specific facts not implied by input. Keep outputs concise and actionable. Risk alert should clearly indicate concern level. Return JSON matching schema.',
    logAiPayload(content, subject, dimensions),
    {
      type: 'OBJECT',
      properties: { homeworkAssigned: str, sessionSummary: str, nextSessionPlan: str, riskAlert: str },
      required: ['homeworkAssigned', 'sessionSummary', 'nextSessionPlan', 'riskAlert'],
    },
  )
  if (!out) return localLogAi(content, subject)
  return {
    sessionSummary: finish(out.sessionSummary),
    homeworkAssigned: finish(out.homeworkAssigned),
    nextSessionPlan: finish(out.nextSessionPlan),
    riskAlert: finish(out.riskAlert),
    provider: 'ai',
  }
}

// ----------------------------------------------------------------- helpers

export async function callerFor(branchId: string, auth: { uid: string; token: Record<string, unknown> } | undefined) {
  if (!auth || typeof auth.token.email !== 'string' || auth.token.email_verified !== true) throw new HttpsError('unauthenticated', 'Sign in first.')
  const email = (auth.token.email as string).toLowerCase()
  const [platform, member] = await Promise.all([
    db.doc(`${ROOT.platformAdmins}/${email}`).get(),
    db.doc(`${ROOT.branches}/${branchId}/${COL.members}/${email}`).get(),
  ])
  const m = member.exists && member.data()!.status === 'active' ? member.data()! : null
  const role = (m?.role as string | undefined) ?? null
  return {
    uid: auth.uid,
    email,
    name: (m?.displayName as string) || (auth.token.name as string) || email,
    isAdmin: platform.exists || role === 'owner' || role === 'admin',
    isTutor: role === 'tutor',
    staffId: (m?.staffId as string | null) ?? null,
    superAdmin: platform.exists,
  }
}

// ----------------------------------------------------------------- submit

/**
 * Submits (or re-submits) a session log atomically: validates it, writes the log
 * with AI notes, marks the session Present, and updates the student's hours,
 * last session and status. Edits after submitting adjust the hours by the delta.
 */
export const submitSessionLog = onCall({ secrets: [geminiKey], timeoutSeconds: 60 }, async (req) => {
  const { branchId, sessionId, content } = (req.data ?? {}) as { branchId?: string; sessionId?: string; content?: LogContent }
  if (!branchId || !sessionId || !content) throw new HttpsError('invalid-argument', 'Missing data.')
  const caller = await callerFor(branchId, req.auth)
  const branchSnap = await db.doc(`${ROOT.branches}/${branchId}`).get()
  if (!branchSnap.exists) throw new HttpsError('not-found', 'Branch not found.')
  const settings = resolveSettings((branchSnap.data() as Branch).settings)
  const sessionRef = db.doc(`${ROOT.branches}/${branchId}/${COL.sessions}/${sessionId}`)
  const logRef = db.doc(`${ROOT.branches}/${branchId}/${COL.sessionLogs}/${sessionId}`)
  const [sessionSnap, existingSnap] = await Promise.all([sessionRef.get(), logRef.get()])
  if (!sessionSnap.exists || sessionSnap.data()!.isDeleted) throw new HttpsError('not-found', 'Session not found.')
  const session = sessionSnap.data()!
  const isOwnTutor = caller.isTutor && caller.staffId === session.tutorId
  if (!caller.isAdmin && !isOwnTutor) throw new HttpsError('permission-denied', 'You can only log your own sessions.')
  const existing = existingSnap.exists ? existingSnap.data()! : null
  if (existing?.status === 'submitted' && !caller.isAdmin && !settings.sessionLogs.allowEditAfterSubmit) {
    throw new HttpsError('failed-precondition', 'This log was already submitted.')
  }
  if (!(existing?.status === 'submitted') && !canLog(session.status, settings.sessionLogs.allowForStatuses)) {
    throw new HttpsError('failed-precondition', 'Canceled and No Show sessions can’t be logged.')
  }
  const invalid = submitError(content, settings.sessionLogs.ratingDimensions)
  if (invalid) throw new HttpsError('invalid-argument', invalid)
  // Submitting marks attendance, bills hours and creates teaching pay: only once the session has started.
  if (session.startAt && (session.startAt as Timestamp).toMillis() > Date.now()) {
    throw new HttpsError('failed-precondition', `You can submit this log once the session starts at ${formatMinutes(session.startMin)}. Drafts save any time.`)
  }

  const clean = cleanLogContent(content)
  const dims = settings.sessionLogs.ratingDimensions
  const ai = settings.sessionLogs.ai.enabled ? await logAi(clean, session.subject, dims) : localLogAi(clean, session.subject)
  const usedHours = billedHours(session.endMin - session.startMin, settings.students.hourRounding)
  const studentRef = db.doc(`${ROOT.branches}/${branchId}/${COL.students}/${session.studentId}`)

  await db.runTransaction(async (tx) => {
    const [logNow, student] = await Promise.all([tx.get(logRef), tx.get(studentRef)])
    const now = FieldValue.serverTimestamp()
    const w = logSubmitWrites({
      sessionId,
      session: session as LogSession,
      content: clean,
      ai,
      prev: logNow.exists ? logNow.data()! : null,
      student: student.exists ? (student.data() as LogStudent) : null,
      settings,
      author: { email: caller.email, name: caller.name, asAdmin: caller.isAdmin && !isOwnTutor },
      auditActor: { uid: caller.uid, email: caller.email, name: caller.name, role: caller.superAdmin ? 'super_admin' : caller.isAdmin ? 'admin' : 'tutor' },
      now,
    })
    tx.set(logRef, w.log)
    tx.update(sessionRef, w.sessionPatch)
    if (w.studentPatch) tx.update(studentRef, { ...w.studentPatch, ...(w.hoursDelta !== 0 ? { totalSessionHours: FieldValue.increment(w.hoursDelta) } : {}) })
    tx.set(db.collection(`${ROOT.branches}/${branchId}/${COL.auditLog}`).doc(), w.audit)
  })
  return { ok: true, ai, usedHours, submittedAt: Timestamp.now().toMillis() }
})

// --------------------------------------------------------------------- AI

/** "Polish notes" for the log form, and the narrative for progress reports. */
export const sessionAi = onCall({ secrets: [geminiKey], timeoutSeconds: 60 }, async (req) => {
  const { branchId, mode, payload } = (req.data ?? {}) as { branchId?: string; mode?: string; payload?: Record<string, unknown> }
  if (!branchId || !payload) throw new HttpsError('invalid-argument', 'Missing data.')
  const caller = await callerFor(branchId, req.auth)
  if (!caller.isAdmin && !caller.isTutor) throw new HttpsError('permission-denied', 'Only staff can use this feature.')

  if (mode === 'polish') {
    const out = await gemini<Record<string, string>>(
      'You rewrite tutor session notes into concise professional language. Do not invent facts. Keep original meaning. Fix grammar and consistency only. Return JSON matching schema.',
      payload,
      {
        type: 'OBJECT',
        properties: { lessonActivity: str, learningInsight: str, nextFocus: str, homeworkGiven: str },
        required: ['lessonActivity', 'learningInsight', 'nextFocus', 'homeworkGiven'],
      },
    )
    const src = payload as Record<string, string>
    const pick = (k: string) => (out?.[k]?.trim() ? finish(out[k]) : (src[k] ?? ''))
    return {
      lessonActivity: pick('lessonActivity'),
      learningInsight: pick('learningInsight'),
      nextFocus: pick('nextFocus'),
      homeworkGiven: pick('homeworkGiven'),
      provider: out ? 'ai' : 'local_fallback',
    }
  }

  throw new HttpsError('invalid-argument', 'Unknown mode.')
})

// ----------------------------------------------------------- drafts, context

/**
 * Mirrors a draft onto its session (`logStatus: 'draft'`) so lists can show it;
 * a submitted log is never downgraded. A deleted draft clears it again.
 */
export const onSessionLogWritten = onDocumentWritten({ document: `${ROOT.branches}/{branchId}/${COL.sessionLogs}/{sessionId}`, ...LIGHT }, async (event) => {
  const { branchId, sessionId } = event.params
  const after = event.data?.after.exists ? event.data.after.data() : null
  const sessionRef = db.doc(`${ROOT.branches}/${branchId}/${COL.sessions}/${sessionId}`)
  await db.runTransaction(async (tx) => {
    const s = await tx.get(sessionRef)
    if (!s.exists) return
    const current = s.data()!.logStatus
    if (after?.status === 'draft' && current === 'none') tx.update(sessionRef, { logStatus: 'draft' })
    else if (!after && current === 'draft') tx.update(sessionRef, { logStatus: 'none' })
  })
})

/**
 * A submitted log follows its session (True Education: the snapshot always comes
 * from the schedule). When an admin moves, re-times, reassigns or re-subjects a
 * logged session, the log's copy is updated and the billed hours are corrected:
 * the difference goes to the student, or the hours move to the new student.
 */
export const onLoggedSessionUpdated = onDocumentUpdated({ document: `${ROOT.branches}/{branchId}/${COL.sessions}/{sessionId}`, ...LIGHT }, async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!before || !after || after.logStatus !== 'submitted') return
  const fields = ['dateKey', 'startMin', 'endMin', 'tutorId', 'tutorName', 'studentId', 'studentName', 'subject', 'subjectId'] as const
  if (fields.every((f) => (before[f] ?? null) === (after[f] ?? null))) return
  const { branchId, sessionId } = event.params
  const branch = (await db.doc(`${ROOT.branches}/${branchId}`).get()).data() as Branch | undefined
  const settings = resolveSettings(branch?.settings)
  const logRef = db.doc(`${ROOT.branches}/${branchId}/${COL.sessionLogs}/${sessionId}`)
  const studentRef = (id: string) => db.doc(`${ROOT.branches}/${branchId}/${COL.students}/${id}`)
  const actorEmail = String(after.updatedBy ?? '')
  const actor = actorEmail ? (await db.doc(`${ROOT.branches}/${branchId}/${COL.members}/${actorEmail.toLowerCase()}`).get()).data() : undefined

  await db.runTransaction(async (tx) => {
    const log = await tx.get(logRef)
    const l = log.data()
    if (!l || l.status !== 'submitted') return
    const prevUsed = Number(l.usedHours) || 0
    const usedHours = billedHours(Number(after.endMin) - Number(after.startMin), settings.students.hourRounding)
    const fromId = String(l.studentId ?? '')
    const toId = String(after.studentId ?? '')
    const [fromStudent, toStudent] = await Promise.all([fromId ? tx.get(studentRef(fromId)) : null, fromId !== toId && toId ? tx.get(studentRef(toId)) : null])
    const round = (n: number) => Math.round(n * 100) / 100
    if (fromId === toId) {
      const delta = round(usedHours - prevUsed)
      if (delta !== 0 && fromStudent?.exists) tx.update(studentRef(fromId), { totalSessionHours: FieldValue.increment(delta), updatedAt: FieldValue.serverTimestamp() })
    } else {
      if (prevUsed && fromStudent?.exists) tx.update(studentRef(fromId), { totalSessionHours: FieldValue.increment(-prevUsed), updatedAt: FieldValue.serverTimestamp() })
      if (usedHours && toStudent?.exists) tx.update(studentRef(toId), { totalSessionHours: FieldValue.increment(usedHours), updatedAt: FieldValue.serverTimestamp() })
    }
    tx.update(logRef, {
      tutorId: after.tutorId,
      tutorName: after.tutorName,
      studentId: after.studentId,
      studentName: after.studentName,
      subject: after.subject ?? '',
      subjectId: after.subjectId ?? null,
      dateKey: after.dateKey,
      startMin: after.startMin,
      endMin: after.endMin,
      startAt: after.startAt,
      endAt: after.endAt,
      usedHours,
      updatedAt: FieldValue.serverTimestamp(),
    })
    if (usedHours !== prevUsed || fromId !== toId) {
      tx.set(db.collection(`${ROOT.branches}/${branchId}/${COL.auditLog}`).doc(), {
        at: FieldValue.serverTimestamp(),
        actorUid: null,
        actorEmail,
        actorName: String(actor?.name || actorEmail || 'Schedule'),
        actorRole: 'admin',
        action: 'sessionLog.sync',
        category: 'sessions',
        entityType: 'sessionLog',
        entityId: sessionId,
        summary: `Updated the session log for ${after.studentName} to match the schedule`,
        context: '',
        dateKey: after.dateKey,
        studentId: after.studentId,
        studentName: after.studentName,
        tutorId: after.tutorId,
        tutorName: after.tutorName,
        via: 'function',
        changes: [
          ...(usedHours !== prevUsed ? [{ field: 'usedHours', label: 'Billed hours', from: prevUsed, to: usedHours }] : []),
          ...(fromId !== toId ? [{ field: 'student', label: 'Student', from: String(l.studentName ?? ''), to: String(after.studentName ?? '') }] : []),
        ],
      })
    }
  })
})

/**
 * Context for the log's Prepare step that the tutor can't read directly: the
 * student's latest parent conference note (when the branch holds conferences).
 * Only the session's tutor and admins get it.
 */
export const sessionLogContext = onCall(async (req) => {
  const { branchId, sessionId } = (req.data ?? {}) as { branchId?: string; sessionId?: string }
  if (!branchId || !sessionId) throw new HttpsError('invalid-argument', 'Missing data.')
  const caller = await callerFor(branchId, req.auth)
  const [branchSnap, sessionSnap] = await Promise.all([
    db.doc(`${ROOT.branches}/${branchId}`).get(),
    db.doc(`${ROOT.branches}/${branchId}/${COL.sessions}/${sessionId}`).get(),
  ])
  if (!branchSnap.exists || !sessionSnap.exists) throw new HttpsError('not-found', 'Session not found.')
  const session = sessionSnap.data()!
  if (!caller.isAdmin && !(caller.isTutor && caller.staffId === session.tutorId)) throw new HttpsError('permission-denied', 'Only the session’s tutor can see this.')
  if (!resolveBusinessRules((branchSnap.data() as Branch).businessRules).conferences.enabled) return { conferenceNote: null }
  const notes = await db
    .collection(`${ROOT.branches}/${branchId}/${COL.students}/${session.studentId}/conferenceNotes`)
    .orderBy('date', 'desc')
    .limit(1)
    .get()
  const n = notes.docs[0]?.data()
  return { conferenceNote: n ? { date: String(n.date ?? ''), text: String(n.text ?? ''), authorName: String(n.authorName ?? '') } : null }
})
