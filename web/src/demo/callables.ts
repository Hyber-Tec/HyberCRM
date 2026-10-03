import { collection, doc, getDoc, getDocs, increment, limit, orderBy, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { COL, ROOT, branchColPath } from '@shared/paths'
import { composeReport } from '@shared/reports/compose'
import type { FactsSession } from '@shared/reports/facts'
import type { ProgressReportDoc, ReportPreset } from '@shared/reports/types'
import { billedHours } from '@shared/schedule/hours'
import { type LogContent, type SessionLog, accuracy, canLog, localLogAi, submitError, topicString } from '@shared/sessions/logs'
import { resolveBusinessRules } from '@shared/settings/businessRules'
import { resolveSettings } from '@shared/settings/resolve'
import { addDays, dateKeyOf, diffDays, formatMinutes, isDateKey, minutesOf, todayKey } from '@shared/time'
import type { Branch, Session, Student, TimestampLike } from '@shared/types'
import { db } from '@/lib/firebase'
import { DEMO_OWNER, demoPins } from './data'
import { registerCallable } from './fake/functions'

/**
 * The server functions the demo runs in the browser instead, against the
 * in-memory database: session logs, progress reports (with the template text;
 * AI runs only in real centers) and the kiosk. Ported from `functions/src`.
 */

const AI_NOT_IN_DEMO = 'AI isn’t part of the demo. In your center, AI polishes tutors’ notes and drafts progress reports.'

const ms = (t: unknown) => (t as TimestampLike | null)?.toMillis?.() ?? 0
const col = (branchId: string, name: (typeof COL)[keyof typeof COL]) => branchColPath(branchId, name)
const owner = { email: DEMO_OWNER.email, name: DEMO_OWNER.displayName }

async function branchOf(branchId: string) {
  const snap = await getDoc(doc(db, ROOT.branches, branchId))
  if (!snap.exists()) throw new Error('Branch not found.')
  return snap.data() as Branch
}

function auditEntry(a: {
  action: string
  category: string
  entityType: string
  entityId: string
  summary: string
  dateKey?: string | null
  studentId?: string | null
  studentName?: string | null
  tutorId?: string | null
  tutorName?: string | null
  via?: string
}) {
  return {
    at: serverTimestamp(),
    actorUid: DEMO_OWNER.uid,
    actorEmail: owner.email,
    actorName: owner.name,
    actorRole: 'owner',
    context: '',
    dateKey: null,
    studentId: null,
    studentName: null,
    tutorId: null,
    tutorName: null,
    changes: [],
    via: 'function',
    ...a,
  }
}

// ---------------------------------------------------------------- session logs

registerCallable('submitSessionLog', async (raw) => {
  const { branchId, sessionId, content } = raw as { branchId: string; sessionId: string; content: LogContent }
  const settings = resolveSettings((await branchOf(branchId)).settings)
  const sessionRef = doc(db, col(branchId, COL.sessions), sessionId)
  const logRef = doc(db, col(branchId, COL.sessionLogs), sessionId)
  const [sessionSnap, logSnap] = await Promise.all([getDoc(sessionRef), getDoc(logRef)])
  if (!sessionSnap.exists() || sessionSnap.data().isDeleted) throw new Error('Session not found.')
  const session = sessionSnap.data() as Session
  const prev = logSnap.exists() ? (logSnap.data() as Record<string, unknown>) : null
  const wasSubmitted = prev?.status === 'submitted'
  if (!wasSubmitted && !canLog(session.status, settings.sessionLogs.allowForStatuses)) throw new Error('Canceled and No Show sessions can’t be logged.')
  const invalid = submitError(content, settings.sessionLogs.ratingDimensions)
  if (invalid) throw new Error(invalid)
  if (ms(session.startAt) > Date.now()) throw new Error(`You can submit this log once the session starts at ${formatMinutes(session.startMin)}. Drafts save any time.`)

  const clean: LogContent = {
    ...content,
    topicCovered: topicString(content.sessionType, content.topics ?? [], content.topicCovered ?? ''),
    materials: (content.materials ?? []).filter((m) => m.label?.trim()).map((m) => ({ label: m.label.trim(), url: m.url ?? '', type: m.type === 'link' ? 'link' : 'text' })),
  }
  const ai = localLogAi(clean, session.subject)
  const usedHours = billedHours(session.endMin - session.startMin, settings.students.hourRounding)
  const prevUsed = wasSubmitted ? Number(prev?.usedHours) || 0 : 0
  const studentRef = doc(db, col(branchId, COL.students), session.studentId)
  const student = (await getDoc(studentRef)).data() as Student | undefined
  const batch = writeBatch(db)
  batch.set(logRef, {
    sessionId,
    ...clean,
    accuracyPercent: accuracy(clean.questionsAttempted, clean.questionsWrong),
    status: 'submitted',
    submittedAt: prev?.submittedAt ?? serverTimestamp(),
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
    ai,
    enteredByAdmin: wasSubmitted ? (prev?.enteredByAdmin ?? null) : owner,
    enteredBy: wasSubmitted ? (prev?.enteredBy ?? null) : { role: 'admin', ...owner, at: serverTimestamp() },
    lastEditedBy: wasSubmitted ? { ...owner, at: serverTimestamp() } : null,
    editCount: wasSubmitted ? (Number(prev?.editCount) || 0) + 1 : 0,
    ...(prev ? {} : { createdAt: serverTimestamp(), createdBy: owner.email }),
    updatedAt: serverTimestamp(),
    updatedBy: owner.email,
  })
  batch.update(sessionRef, {
    status: 'present',
    logStatus: 'submitted',
    logSubmittedAt: prev?.submittedAt ?? serverTimestamp(),
    attendanceMarkedBy: 'session_log',
    updatedAt: serverTimestamp(),
    updatedBy: owner.email,
  })
  if (student) {
    const delta = Math.round((usedHours - prevUsed) * 100) / 100
    batch.update(studentRef, {
      updatedAt: serverTimestamp(),
      ...(delta ? { totalSessionHours: increment(delta) } : {}),
      ...(!student.lastSessionDate || session.dateKey > student.lastSessionDate ? { lastSessionDate: session.dateKey } : {}),
      ...(!student.firstSessionDate || session.dateKey < student.firstSessionDate ? { firstSessionDate: session.dateKey } : {}),
    })
  }
  batch.set(
    doc(db, col(branchId, COL.auditLog), `demo-${Date.now()}`),
    auditEntry({
      action: wasSubmitted ? 'sessionLog.edit' : 'sessionLog.submit',
      category: 'sessions',
      entityType: 'sessionLog',
      entityId: sessionId,
      summary: `${wasSubmitted ? 'Updated' : 'Submitted'} the session log for ${session.studentName}${wasSubmitted ? '' : ` on behalf of ${session.tutorName}`}`,
      dateKey: session.dateKey,
      studentId: session.studentId,
      studentName: session.studentName,
      tutorId: session.tutorId,
      tutorName: session.tutorName,
    }),
  )
  await batch.commit()
  return { ok: true, ai, usedHours, submittedAt: Date.now() }
})

registerCallable('sessionLogContext', async () => ({ conferenceNote: null }))

registerCallable('sessionAi', async () => {
  throw new Error(AI_NOT_IN_DEMO)
})

// ------------------------------------------------------------ progress reports

const PRESETS: ReportPreset[] = ['since_last', 'last_month', 'this_month', 'last_30', 'last_90', 'since_conference', 'custom']

registerCallable('generateProgressReport', async (raw) => {
  const data = raw as { branchId: string; studentId: string; from: string; to: string; preset: string }
  const { branchId, studentId, from, to } = data
  const branch = await branchOf(branchId)
  const today = todayKey(branch.timezone)
  if (!isDateKey(from) || !isDateKey(to)) throw new Error('Choose a period.')
  if (from > to) throw new Error('The period ends before it starts.')
  if (to > today) throw new Error('The period can’t end after today.')
  if (diffDays(from, to) > 366) throw new Error('A report covers at most a year.')
  const preset = PRESETS.includes(data.preset as ReportPreset) ? (data.preset as ReportPreset) : 'custom'
  const studentSnap = await getDoc(doc(db, col(branchId, COL.students), studentId))
  if (!studentSnap.exists()) throw new Error('Student not found.')
  const student = studentSnap.data() as Student
  const settings = resolveSettings(branch.settings)
  const rules = resolveBusinessRules(branch.businessRules)
  const sessionsOf = (a: string, b: string) =>
    query(collection(db, col(branchId, COL.sessions)), where('studentId', '==', studentId), where('dateKey', '>=', a), where('dateKey', '<=', b))
  const [sessionSnap, upcomingSnap, logSnap, prevSnap] = await Promise.all([
    getDocs(sessionsOf(from, to)),
    getDocs(sessionsOf(today, addDays(today, 27))),
    getDocs(
      query(
        collection(db, col(branchId, COL.sessionLogs)),
        where('studentId', '==', studentId),
        where('status', '==', 'submitted'),
        where('dateKey', '>=', from),
        where('dateKey', '<=', to),
      ),
    ),
    getDocs(
      query(collection(db, col(branchId, COL.progressReports)), where('studentId', '==', studentId), where('status', '==', 'shared'), orderBy('generatedAt', 'desc'), limit(12)),
    ),
  ])
  const logs = logSnap.docs.map((d) => d.data() as SessionLog)
  if (!logs.length) throw new Error('There are no submitted session logs in this period.')
  const sessions: FactsSession[] = sessionSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Session) }))
    .filter((s) => !s.isDeleted)
    .map((s) => ({
      id: s.id,
      dateKey: s.dateKey,
      startMin: s.startMin,
      endMin: s.endMin,
      endAtMs: ms(s.endAt),
      status: s.status,
      logStatus: String(s.logStatus ?? 'none'),
      subject: s.subject ?? '',
      tutorName: s.tutorName ?? '',
    }))
  const upcoming = upcomingSnap.docs
    .map((d) => d.data() as Session)
    .filter((s) => !s.isDeleted && s.status !== 'canceled' && s.status !== 'no_show' && ms(s.startAt) > Date.now())
    .map((s) => ({ dateKey: s.dateKey, startMin: s.startMin, subject: s.subject ?? '', tutorName: s.tutorName ?? '' }))
  const prevDoc = prevSnap.docs.find((d) => d.data().schemaVersion === 2 && String(d.data().endDate) < from)
  const draft = composeReport({
    branch: {
      name: branch.name,
      logoUrl: branch.branding?.logoUrl ?? null,
      accentColor: branch.branding?.accentColor ?? null,
      contact: { phone: branch.contact?.phone ?? '', email: branch.contact?.email ?? '', website: branch.contact?.website ?? '', address: branch.contact?.address ?? '' },
    },
    settings,
    conference: { enabled: rules.conferences.enabled, everyHours: rules.conferences.everyHours },
    student: {
      id: studentId,
      name: student.name,
      firstName: student.firstName?.trim() || student.name.split(/\s+/)[0],
      lastName: student.lastName?.trim() || student.name.split(/\s+/).slice(1).join(' '),
      grade: student.grade ?? '',
      school: student.school ?? '',
      totalSessionHours: student.totalSessionHours ?? 0,
      conferenceBaselineHours: student.conference?.baselineHours ?? 0,
    },
    period: { from, to, preset },
    sessions,
    logs,
    upcoming,
    previous: prevDoc ? { id: prevDoc.id, doc: prevDoc.data() as ProgressReportDoc } : null,
    today,
    nowMs: Date.now(),
    generatedBy: { email: owner.email, name: owner.name, role: 'admin', staffId: null },
  })
  const ref = doc(collection(db, col(branchId, COL.progressReports)))
  const batch = writeBatch(db)
  batch.set(ref, {
    ...draft,
    narrativeOriginal: draft.narrative,
    narrativeMeta: { source: 'template', generatedAt: serverTimestamp(), sections: draft.narrativeMeta.sections },
    generatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    sharedAt: null,
  })
  batch.set(
    doc(db, col(branchId, COL.auditLog), `demo-${Date.now()}`),
    auditEntry({
      action: 'report.generate',
      category: 'sessions',
      entityType: 'progressReport',
      entityId: ref.id,
      studentId,
      studentName: student.name,
      summary: `Created a progress report draft for ${student.name} (${draft.period.label})`,
    }),
  )
  await batch.commit()
  return { reportId: ref.id, reused: false, source: 'template' }
})

registerCallable('regenerateReportSection', async () => {
  throw new Error(AI_NOT_IN_DEMO)
})

registerCallable('shareProgressReport', async (raw) => {
  const { branchId, reportId, share } = raw as { branchId: string; reportId: string; share: boolean }
  const ref = doc(db, col(branchId, COL.progressReports), reportId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Report not found.')
  const r = snap.data() as ProgressReportDoc
  const batch = writeBatch(db)
  batch.update(
    ref,
    share
      ? {
          status: 'shared',
          sharedWithParents: true,
          sharedAt: serverTimestamp(),
          sharedBy: owner,
          notify: { status: 'skipped', at: serverTimestamp(), recipients: [], error: null },
          updatedAt: serverTimestamp(),
          updatedBy: owner.email,
        }
      : { status: 'draft', sharedWithParents: false, updatedAt: serverTimestamp(), updatedBy: owner.email },
  )
  batch.set(
    doc(db, col(branchId, COL.auditLog), `demo-${Date.now()}`),
    auditEntry({
      action: share ? 'report.share' : 'report.unshare',
      category: 'sessions',
      entityType: 'progressReport',
      entityId: reportId,
      studentId: r.studentId,
      studentName: r.studentName,
      summary: share ? `Shared ${r.studentName}'s progress report (${r.period.label}) with the family` : `Stopped sharing ${r.studentName}'s progress report`,
    }),
  )
  await batch.commit()
  return { ok: true, notify: share ? { status: 'skipped', recipients: 0 } : null }
})

// ----------------------------------------------------------------------- kiosk

function staffForPin(pin: string) {
  const staffId = [...demoPins].find(([, p]) => p === pin)?.[0]
  if (!staffId) throw new Error('That PIN doesn’t match anyone. Try again.')
  return staffId
}

async function staffName(branchId: string, staffId: string) {
  return String((await getDoc(doc(db, col(branchId, COL.staff), staffId))).data()?.name ?? 'Employee')
}

registerCallable('kioskIdentify', async (raw) => {
  const { branchId, pin } = raw as { branchId: string; pin: string }
  const staffId = staffForPin(pin)
  const open = await getDoc(doc(db, col(branchId, COL.openShifts), staffId))
  return { staffId, name: await staffName(branchId, staffId), openSince: open.exists() ? ms(open.data().clockInAt) : null }
})

registerCallable('kioskPunch', async (raw) => {
  const { branchId, pin } = raw as { branchId: string; pin: string }
  const staffId = staffForPin(pin)
  const name = await staffName(branchId, staffId)
  const tz = (await branchOf(branchId)).timezone
  const now = new Date()
  const openRef = doc(db, col(branchId, COL.openShifts), staffId)
  const open = await getDoc(openRef)
  const batch = writeBatch(db)
  let result: { action: 'in' | 'out'; clockInAt: number | null; clockOutAt: number | null; shiftId: string }
  if (open.exists()) {
    const shiftId = String(open.data().shiftId)
    const shiftRef = doc(db, col(branchId, COL.clockShifts), shiftId)
    const shift = await getDoc(shiftRef)
    batch.update(shiftRef, {
      clockOutAt: now,
      outDateKey: dateKeyOf(now, tz),
      outMin: minutesOf(now, tz),
      status: 'closed',
      updatedAt: serverTimestamp(),
      updatedBy: `kiosk:${owner.email}`,
    })
    batch.delete(openRef)
    result = { action: 'out', clockInAt: ms(shift.data()?.clockInAt) || null, clockOutAt: now.getTime(), shiftId }
  } else {
    const shiftRef = doc(collection(db, col(branchId, COL.clockShifts)))
    batch.set(shiftRef, {
      staffId,
      staffName: name,
      dateKey: dateKeyOf(now, tz),
      inMin: minutesOf(now, tz),
      clockInAt: now,
      clockOutAt: null,
      outDateKey: null,
      outMin: null,
      status: 'open',
      source: 'kiosk',
      autoClosed: false,
      autoCorrected: false,
      forcedType: null,
      note: '',
      createdAt: serverTimestamp(),
      createdBy: `kiosk:${owner.email}`,
      updatedAt: serverTimestamp(),
      updatedBy: `kiosk:${owner.email}`,
    })
    batch.set(openRef, { shiftId: shiftRef.id, clockInAt: now })
    result = { action: 'in', clockInAt: now.getTime(), clockOutAt: null, shiftId: shiftRef.id }
  }
  batch.set(
    doc(db, col(branchId, COL.auditLog), `demo-${Date.now()}`),
    auditEntry({
      action: result.action === 'in' ? 'shift.clock_in' : 'shift.clock_out',
      category: 'pay',
      entityType: 'shift',
      entityId: result.shiftId,
      tutorId: staffId,
      tutorName: name,
      dateKey: dateKeyOf(now, tz),
      via: 'kiosk',
      summary: `${name} clocked ${result.action} at ${formatMinutes(minutesOf(now, tz))}`,
    }),
  )
  await batch.commit()
  return { ...result, name }
})

registerCallable('setKioskPin', async (raw) => {
  const { branchId, staffId, pin } = raw as { branchId: string; staffId: string; pin: string | null }
  if (pin && [...demoPins].some(([id, p]) => p === pin && id !== staffId)) throw new Error('Someone else already uses this PIN. Choose another one.')
  if (pin) demoPins.set(staffId, pin)
  else demoPins.delete(staffId)
  const batch = writeBatch(db)
  batch.update(doc(db, col(branchId, COL.staff), staffId), { hasKioskPin: !!pin, updatedAt: serverTimestamp(), updatedBy: owner.email })
  await batch.commit()
  return { ok: true }
})
