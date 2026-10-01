import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { COL, ROOT } from '@shared/paths'
import { db } from './app'
import { billedHours } from '@shared/schedule/hours'
import { type LogAi, type LogContent, accuracy, canLog, firstMissing, localLogAi, topicString } from '@shared/sessions/logs'
import { type ReportMetrics, type ReportNarrative, localNarrative } from '@shared/sessions/reports'
import { resolveSettings } from '@shared/settings/resolve'
import type { Branch } from '@shared/types'

export const geminiKey = defineSecret('GEMINI_API_KEY')
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

// ------------------------------------------------------------------ Gemini

async function gemini<T>(system: string, payload: unknown, schema: Record<string, unknown>): Promise<T | null> {
  const key = geminiKey.value()
  if (!key || key === 'unset') return null
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema },
      }),
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) {
      console.warn('Gemini error', res.status, await res.text())
      return null
    }
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    return text ? (JSON.parse(text) as T) : null
  } catch (e) {
    console.warn('Gemini call failed', e)
    return null
  }
}

const finish = (s: unknown) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t && !/[.!?]$/.test(t) ? `${t}.` : t
}
const str = { type: 'STRING' }
const arr = { type: 'ARRAY', items: { type: 'STRING' } }

async function logAi(content: LogContent, subject: string): Promise<LogAi> {
  const out = await gemini<Record<string, string>>(
    'You generate structured tutor action items from an existing session log. Do not invent specific facts not implied by input. Keep outputs concise and actionable. Risk alert should clearly indicate concern level. Return JSON matching schema.',
    { subject, ...content },
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

async function callerFor(branchId: string, auth: { uid: string; token: Record<string, unknown> } | undefined) {
  if (!auth || typeof auth.token.email !== 'string' || auth.token.email_verified !== true) throw new HttpsError('unauthenticated', 'Sign in first.')
  const email = (auth.token.email as string).toLowerCase()
  const [platform, member] = await Promise.all([
    db.doc(`${ROOT.platformAdmins}/${email}`).get(),
    db.doc(`${ROOT.branches}/${branchId}/${COL.members}/${email}`).get(),
  ])
  const m = member.exists && member.data()!.status === 'active' ? member.data()! : null
  const roles: string[] = m?.roles ?? []
  return {
    uid: auth.uid,
    email,
    name: (m?.displayName as string) || (auth.token.name as string) || email,
    isAdmin: platform.exists || roles.includes('admin'),
    isTutor: roles.includes('tutor'),
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
  const missing = firstMissing(content, settings.sessionLogs.ratingDimensions)
  if (missing) throw new HttpsError('invalid-argument', `“${missing}” is required before submitting.`)

  const clean: LogContent = {
    ...content,
    topicCovered: topicString(content.sessionType, content.topics ?? [], content.topicCovered ?? ''),
    materials: (content.materials ?? []).filter((m) => m.label?.trim()).map((m) => ({ label: m.label.trim(), url: m.url ?? '', type: m.type === 'link' ? 'link' : 'text' })),
  }
  const ai = settings.sessionLogs.ai.enabled ? await logAi(clean, session.subject) : localLogAi(clean, session.subject)
  const usedHours = billedHours(session.endMin - session.startMin, settings.students.hourRounding)
  const studentRef = db.doc(`${ROOT.branches}/${branchId}/${COL.students}/${session.studentId}`)

  await db.runTransaction(async (tx) => {
    const [logNow, student] = await Promise.all([tx.get(logRef), tx.get(studentRef)])
    const prev = logNow.exists ? logNow.data()! : null
    const prevUsed = prev?.status === 'submitted' ? (prev.usedHours as number) || 0 : 0
    const enteredByAdmin = prev?.enteredByAdmin ?? (caller.isAdmin && !isOwnTutor ? { email: caller.email, name: caller.name } : null)
    tx.set(logRef, {
      sessionId,
      ...clean,
      accuracyPercent: accuracy(clean.questionsAttempted, clean.questionsWrong),
      status: 'submitted',
      submittedAt: prev?.submittedAt ?? FieldValue.serverTimestamp(),
      tutorId: session.tutorId,
      tutorName: session.tutorName,
      studentId: session.studentId,
      studentName: session.studentName,
      subject: session.subject,
      dateKey: session.dateKey,
      startMin: session.startMin,
      endMin: session.endMin,
      startAt: session.startAt,
      endAt: session.endAt,
      usedHours,
      ai,
      enteredByAdmin,
      ...(prev ? {} : { createdAt: FieldValue.serverTimestamp(), createdBy: caller.email }),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: caller.email,
    })
    tx.update(sessionRef, {
      status: 'present',
      logStatus: 'submitted',
      logSubmittedAt: prev?.submittedAt ?? FieldValue.serverTimestamp(),
      attendanceMarkedBy: 'session_log',
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: caller.email,
    })
    if (student.exists) {
      const s = student.data()!
      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
      const delta = Math.round((usedHours - prevUsed) * 100) / 100
      if (delta !== 0) patch.totalSessionHours = FieldValue.increment(delta)
      if (!s.lastSessionDate || session.dateKey > s.lastSessionDate) patch.lastSessionDate = session.dateKey
      if (!s.firstSessionDate || session.dateKey < s.firstSessionDate) patch.firstSessionDate = session.dateKey
      const auto = settings.students.autoStatus
      const manualLock = auto.respectManual && s.statusSource === 'manual'
      if (auto.enabled && !manualLock && (s.status === 'signed_up' || s.status === 'paused')) {
        patch.status = 'enrolled'
        patch.statusSource = 'auto'
      }
      tx.update(studentRef, patch)
    }
    tx.set(db.collection(`${ROOT.branches}/${branchId}/${COL.auditLog}`).doc(), {
      at: FieldValue.serverTimestamp(),
      actorUid: caller.uid,
      actorEmail: caller.email,
      actorName: caller.name,
      actorRole: caller.superAdmin ? 'super_admin' : caller.isAdmin ? 'admin' : 'tutor',
      action: prev?.status === 'submitted' ? 'sessionLog.edit' : 'sessionLog.submit',
      category: 'sessions',
      entityType: 'sessionLog',
      entityId: sessionId,
      summary: `${prev?.status === 'submitted' ? 'Updated' : 'Submitted'} the session log for ${session.studentName}`,
      context: '',
      dateKey: session.dateKey,
      studentId: session.studentId,
      studentName: session.studentName,
      tutorId: session.tutorId,
      tutorName: session.tutorName,
      changes: [],
      via: 'function',
    })
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
    const pick = (k: string) => finish(out?.[k] ?? src[k])
    return {
      lessonActivity: pick('lessonActivity'),
      learningInsight: pick('learningInsight'),
      nextFocus: pick('nextFocus'),
      homeworkGiven: pick('homeworkGiven'),
      provider: out ? 'ai' : 'local_fallback',
    }
  }

  if (mode === 'report') {
    const metrics = payload.metrics as ReportMetrics
    const studentName = String(payload.studentName ?? '')
    const out = await gemini<Omit<ReportNarrative, 'provider'>>(
      'You are writing sections of a comprehensive, professional student academic progress report. The audience is parents, tutors, and administrators. Each narrative section should be 2–4 sentences: professional, specific, warm, and encouraging where appropriate. Base all observations strictly on the provided data. Do not invent test scores, grades, or facts not present. keyStrengths and areasForImprovement should each have 2–4 bullet-style short sentences. goalsAndActionPlan should have 3–5 specific, actionable items. instructorComments should be a personalized 2–3 sentence note as if written by the tutor. Set riskLevel to exactly one of: On Track, Needs Attention, At Risk. Return structured JSON matching the schema exactly.',
      payload,
      {
        type: 'OBJECT',
        properties: {
          riskLevel: str,
          overallProgress: str,
          academicProgress: str,
          classPerformance: str,
          homeworkAnalysis: str,
          learningHabitsNarrative: str,
          instructorComments: str,
          keyStrengths: arr,
          areasForImprovement: arr,
          goalsAndActionPlan: arr,
        },
        required: [
          'riskLevel',
          'overallProgress',
          'academicProgress',
          'classPerformance',
          'homeworkAnalysis',
          'learningHabitsNarrative',
          'instructorComments',
          'keyStrengths',
          'areasForImprovement',
          'goalsAndActionPlan',
        ],
      },
    )
    if (!out || !out.overallProgress) return localNarrative(metrics, studentName)
    const list = (a: unknown) => (Array.isArray(a) ? a.map((x) => finish(x)).filter(Boolean).slice(0, 6) : [])
    const risk = ['On Track', 'Needs Attention', 'At Risk'].includes(out.riskLevel) ? out.riskLevel : metrics.riskLevel
    return {
      riskLevel: risk,
      overallProgress: finish(out.overallProgress),
      academicProgress: finish(out.academicProgress),
      classPerformance: finish(out.classPerformance),
      homeworkAnalysis: finish(out.homeworkAnalysis),
      learningHabitsNarrative: finish(out.learningHabitsNarrative),
      instructorComments: finish(out.instructorComments),
      keyStrengths: list(out.keyStrengths),
      areasForImprovement: list(out.areasForImprovement),
      goalsAndActionPlan: list(out.goalsAndActionPlan),
      provider: 'ai',
    } satisfies ReportNarrative
  }
  throw new HttpsError('invalid-argument', 'Unknown mode.')
})
