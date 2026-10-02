import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { APP_URL } from '@shared/brand'
import { reportEmail } from '@shared/email/report'
import { COL, ROOT } from '@shared/paths'
import { checkNarrative, sanitizeNarrative } from '@shared/reports/check'
import { composeReport } from '@shared/reports/compose'
import type { FactsSession } from '@shared/reports/facts'
import { REPORT_RESPONSE_SCHEMA, REPORT_SYSTEM_PROMPT, buildReportInput, sectionInstruction, sectionSchema } from '@shared/reports/prompt'
import {
  NARRATIVE_KEYS,
  NARRATIVE_LABELS,
  type NarrativeKey,
  type ProgressReportDoc,
  type ReportNarrative,
  type ReportPreset,
  type SectionMeta,
} from '@shared/reports/types'
import type { SessionLog } from '@shared/sessions/logs'
import { resolveBusinessRules } from '@shared/settings/businessRules'
import type { BranchSettings } from '@shared/settings/defaults'
import { resolveSettings } from '@shared/settings/resolve'
import { addDays, diffDays, isDateKey, todayKey } from '@shared/time'
import type { Branch, Student } from '@shared/types'
import { aiConfigured, aiJson, geminiKey } from './ai'
import { db } from './app'
import { gmailAppPassword, sendMail } from './email'
import { callerFor } from './sessions'

type Caller = Awaited<ReturnType<typeof callerFor>>

const PRESETS: ReportPreset[] = ['since_last', 'last_month', 'this_month', 'last_30', 'last_90', 'since_conference', 'custom']

const ms = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? 0

function canCreate(caller: Caller, settings: BranchSettings) {
  return caller.isAdmin || (caller.isTutor && settings.progressReports.tutorsCanCreate && settings.sessionLogs.tutorsSeeAllLogs)
}

function canEdit(caller: Caller, doc: Pick<ProgressReportDoc, 'generatedBy'>) {
  return caller.isAdmin || (caller.isTutor && !!caller.staffId && doc.generatedBy?.staffId === caller.staffId)
}

async function audit(branchId: string, caller: Caller, a: { action: string; reportId: string; studentId: string; studentName: string; summary: string; changes?: unknown[] }) {
  await db.collection(`${ROOT.branches}/${branchId}/${COL.auditLog}`).add({
    at: FieldValue.serverTimestamp(),
    actorUid: caller.uid,
    actorEmail: caller.email,
    actorName: caller.name,
    actorRole: caller.superAdmin ? 'super_admin' : caller.isAdmin ? 'admin' : 'tutor',
    action: a.action,
    category: 'sessions',
    entityType: 'progressReport',
    entityId: a.reportId,
    summary: a.summary,
    context: '',
    studentId: a.studentId,
    studentName: a.studentName,
    changes: a.changes ?? [],
    via: 'function',
  })
}

/** Everything a report is built from: the student, the period's sessions and logs, what's booked next and the last shared report. */
async function loadContext(branchId: string, studentId: string, from: string, to: string) {
  const branchRef = db.doc(`${ROOT.branches}/${branchId}`)
  const studentRef = db.doc(`${ROOT.branches}/${branchId}/${COL.students}/${studentId}`)
  const [branchSnap, studentSnap] = await Promise.all([branchRef.get(), studentRef.get()])
  if (!branchSnap.exists) throw new HttpsError('not-found', 'Branch not found.')
  if (!studentSnap.exists) throw new HttpsError('not-found', 'Student not found.')
  const branch = branchSnap.data() as Branch
  const student = studentSnap.data() as Student
  const settings = resolveSettings(branch.settings)
  const rules = resolveBusinessRules(branch.businessRules)
  const today = todayKey(branch.timezone || 'America/New_York')
  const sessionsCol = db.collection(`${ROOT.branches}/${branchId}/${COL.sessions}`)
  const [sessionSnap, upcomingSnap, logSnap, prevSnap] = await Promise.all([
    sessionsCol.where('studentId', '==', studentId).where('dateKey', '>=', from).where('dateKey', '<=', to).get(),
    sessionsCol.where('studentId', '==', studentId).where('dateKey', '>=', today).where('dateKey', '<=', addDays(today, 27)).get(),
    db
      .collection(`${ROOT.branches}/${branchId}/${COL.sessionLogs}`)
      .where('studentId', '==', studentId)
      .where('status', '==', 'submitted')
      .where('dateKey', '>=', from)
      .where('dateKey', '<=', to)
      .get(),
    db.collection(`${ROOT.branches}/${branchId}/${COL.progressReports}`).where('studentId', '==', studentId).where('status', '==', 'shared').orderBy('generatedAt', 'desc').limit(12).get(),
  ])
  const sessions: FactsSession[] = sessionSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as Record<string, unknown> & { id: string })
    .filter((s) => s.isDeleted !== true)
    .map((s) => ({
      id: s.id,
      dateKey: String(s.dateKey),
      startMin: Number(s.startMin),
      endMin: Number(s.endMin),
      endAtMs: ms(s.endAt),
      status: s.status as FactsSession['status'],
      logStatus: String(s.logStatus ?? 'none'),
      subject: String(s.subject ?? ''),
      tutorName: String(s.tutorName ?? ''),
    }))
  const upcoming = upcomingSnap.docs
    .map((d) => d.data())
    .filter((s) => s.isDeleted !== true && s.status !== 'canceled' && s.status !== 'no_show' && ms(s.startAt) > Date.now())
    .map((s) => ({ dateKey: String(s.dateKey), startMin: Number(s.startMin), subject: String(s.subject ?? ''), tutorName: String(s.tutorName ?? '') }))
  const logs = logSnap.docs.map((d) => d.data() as SessionLog)
  const prevDoc = prevSnap.docs.find((d) => d.data().schemaVersion === 2 && String(d.data().endDate) < from)
  const previous = prevDoc ? { id: prevDoc.id, doc: prevDoc.data() as ProgressReportDoc } : null
  return { branch, student, settings, rules, today, sessions, upcoming, logs, previous }
}

type Ctx = Awaited<ReturnType<typeof loadContext>>

const firstNameOf = (s: Student) => s.firstName?.trim() || s.name.trim().split(/\s+/)[0] || 'The student'
const lastNameOf = (s: Student) => s.lastName?.trim() || s.name.trim().split(/\s+/).slice(1).join(' ')

function compose(ctx: Ctx, studentId: string, period: { from: string; to: string; preset: ReportPreset }, caller: Caller) {
  const { branch, student, settings, rules } = ctx
  return composeReport({
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
      firstName: firstNameOf(student),
      lastName: lastNameOf(student),
      grade: student.grade ?? '',
      school: student.school ?? '',
      totalSessionHours: student.totalSessionHours ?? 0,
      conferenceBaselineHours: student.conference?.baselineHours ?? 0,
    },
    period,
    sessions: ctx.sessions,
    logs: ctx.logs,
    upcoming: ctx.upcoming,
    previous: ctx.previous,
    today: ctx.today,
    nowMs: Date.now(),
    generatedBy: { email: caller.email, name: caller.name, role: caller.isAdmin ? 'admin' : 'tutor', staffId: caller.staffId },
  })
}

function describeIssues(issues: Partial<Record<NarrativeKey, string[]>>) {
  return Object.entries(issues)
    .map(([k, r]) => `${k}: ${(r ?? []).join('; ')}`)
    .join('\n')
}

/**
 * The AI-written sections, checked against the facts: one retry with the
 * problems spelled out, then whatever still fails is marked for review. Empty
 * sections fall back to the template text. Null when AI is off or unavailable.
 */
async function aiNarrative(ctx: Ctx, draft: ReturnType<typeof compose>): Promise<{ narrative: ReportNarrative; sections: Partial<Record<NarrativeKey, SectionMeta>> } | null> {
  if (!ctx.settings.progressReports.ai.enabled || !aiConfigured()) return null
  const input = buildReportInput({
    centerName: ctx.branch.name,
    period: draft.period,
    firstName: draft.student.firstName,
    grade: draft.student.grade,
    facts: draft.facts,
    level: draft.progress.level,
    logs: ctx.logs,
  })
  const ask = (instruction?: string) =>
    aiJson<Record<string, unknown>>(REPORT_SYSTEM_PROMPT, input, REPORT_RESPONSE_SCHEMA, { tier: 'report', temperature: 0.3, timeoutMs: 60_000, maxOutputTokens: 4000, instruction })
  let raw = await ask()
  if (!raw) return null
  let narrative = sanitizeNarrative(raw)
  let issues = checkNarrative(narrative, draft.facts, draft.progress.level, draft.student.firstName)
  if (Object.keys(issues).length) {
    const retry = await ask(`Your previous draft had these problems. Fix them and return the whole JSON again:\n${describeIssues(issues)}`)
    if (retry) {
      const n2 = sanitizeNarrative(retry)
      const i2 = checkNarrative(n2, draft.facts, draft.progress.level, draft.student.firstName)
      if (Object.keys(i2).length <= Object.keys(issues).length) {
        raw = retry
        narrative = n2
        issues = i2
      }
    }
  }
  const template = draft.narrative
  const fixed: ReportNarrative = { ...narrative }
  const sections: Partial<Record<NarrativeKey, SectionMeta>> = {}
  for (const k of NARRATIVE_KEYS) {
    const v = narrative[k]
    const empty = Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim()
    // Required sections never stay empty; practice, previous goals and the tutor note may.
    if (empty && !['practice', 'previousGoals', 'tutorNote'].includes(k)) {
      ;(fixed as unknown as Record<string, unknown>)[k] = template[k]
      sections[k] = { source: 'template' }
    } else {
      sections[k] = issues[k] ? { source: 'ai', needsReview: true, reasons: issues[k] } : { source: 'ai' }
    }
  }
  if (!draft.facts.practice) fixed.practice = ''
  if (!draft.facts.previous?.goals.length) fixed.previousGoals = []
  return { narrative: fixed, sections }
}

function periodOf(data: { from?: string; to?: string; preset?: string }, today: string) {
  const { from, to } = data
  if (!from || !to || !isDateKey(from) || !isDateKey(to)) throw new HttpsError('invalid-argument', 'Choose a period.')
  if (from > to) throw new HttpsError('invalid-argument', 'The period ends before it starts.')
  if (to > today) throw new HttpsError('invalid-argument', 'The period can’t end after today.')
  if (diffDays(from, to) > 366) throw new HttpsError('invalid-argument', 'A report covers at most a year.')
  const preset = PRESETS.includes(data.preset as ReportPreset) ? (data.preset as ReportPreset) : 'custom'
  return { from, to, preset }
}

/**
 * Creates a progress report draft: facts and status computed here, written
 * sections by AI (checked) or from the template. A draft for the same student,
 * period and logs is reopened instead of duplicated.
 */
export const generateProgressReport = onCall({ secrets: [geminiKey], timeoutSeconds: 180, memory: '512MiB' }, async (req) => {
  const data = (req.data ?? {}) as { branchId?: string; studentId?: string; from?: string; to?: string; preset?: string }
  const { branchId, studentId } = data
  if (!branchId || !studentId) throw new HttpsError('invalid-argument', 'Missing data.')
  const caller = await callerFor(branchId, req.auth)
  const branchSnap = await db.doc(`${ROOT.branches}/${branchId}`).get()
  const settings = resolveSettings((branchSnap.data() as Branch | undefined)?.settings)
  if (!canCreate(caller, settings)) throw new HttpsError('permission-denied', 'You can’t create progress reports in this center.')
  const today = todayKey((branchSnap.data() as Branch | undefined)?.timezone || 'America/New_York')
  const period = periodOf(data, today)
  const ctx = await loadContext(branchId, studentId, period.from, period.to)
  if (!ctx.logs.length) throw new HttpsError('failed-precondition', 'There are no submitted session logs in this period.')

  const draft = compose(ctx, studentId, period, caller)
  const col = db.collection(`${ROOT.branches}/${branchId}/${COL.progressReports}`)
  const same = await col.where('studentId', '==', studentId).where('status', '==', 'draft').orderBy('generatedAt', 'desc').limit(10).get()
  const twin = same.docs.find((d) => {
    const r = d.data() as ProgressReportDoc
    return r.startDate === period.from && r.endDate === period.to && r.source?.fingerprint === draft.source.fingerprint
  })
  if (twin) return { reportId: twin.id, reused: true, source: (twin.data() as ProgressReportDoc).narrativeMeta?.source ?? 'template' }

  const ai = await aiNarrative(ctx, draft)
  const narrative = ai?.narrative ?? draft.narrative
  const ref = col.doc()
  await ref.set({
    ...draft,
    narrative,
    narrativeOriginal: narrative,
    narrativeMeta: { source: ai ? 'ai' : 'template', generatedAt: FieldValue.serverTimestamp(), sections: ai?.sections ?? draft.narrativeMeta.sections },
    generatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    sharedAt: null,
  })
  await audit(branchId, caller, {
    action: 'report.generate',
    reportId: ref.id,
    studentId,
    studentName: ctx.student.name,
    summary: `Created a progress report draft for ${ctx.student.name} (${draft.period.label})`,
  })
  logger.info(`Report ${ref.id} for ${studentId}: ${ctx.logs.length} logs, ${ai ? 'AI' : 'template'} text`)
  return { reportId: ref.id, reused: false, source: ai ? 'ai' : 'template' }
})

/**
 * Rewrites one written section of a draft with AI (or all of them), or brings
 * a draft's figures up to date with logs edited since (`refresh`), keeping the
 * sections staff have edited.
 */
export const regenerateReportSection = onCall({ secrets: [geminiKey], timeoutSeconds: 180, memory: '512MiB' }, async (req) => {
  const data = (req.data ?? {}) as { branchId?: string; reportId?: string; section?: string; hint?: string; refresh?: boolean }
  const { branchId, reportId } = data
  if (!branchId || !reportId) throw new HttpsError('invalid-argument', 'Missing data.')
  const caller = await callerFor(branchId, req.auth)
  const ref = db.doc(`${ROOT.branches}/${branchId}/${COL.progressReports}/${reportId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Report not found.')
  const doc = snap.data() as ProgressReportDoc
  if (doc.schemaVersion !== 2) throw new HttpsError('failed-precondition', 'This report was made with an older version. Create a new one.')
  if (doc.status !== 'draft') throw new HttpsError('failed-precondition', 'Stop sharing the report before changing it.')
  if (!canEdit(caller, doc)) throw new HttpsError('permission-denied', 'You can only change your own drafts.')
  const ctx = await loadContext(branchId, doc.studentId, doc.startDate, doc.endDate)
  const fresh = compose(ctx, doc.studentId, { from: doc.startDate, to: doc.endDate, preset: doc.period.preset }, caller)
  const meta = { ...(doc.narrativeMeta?.sections ?? {}) }

  if (data.refresh) {
    // New figures; sections staff wrote stay, the rest are written again.
    const ai = await aiNarrative(ctx, fresh)
    const base = ai?.narrative ?? fresh.narrative
    const narrative = { ...base } as ReportNarrative
    for (const k of NARRATIVE_KEYS) {
      if (meta[k]?.source === 'staff') (narrative as unknown as Record<string, unknown>)[k] = doc.narrative[k]
      else meta[k] = ai?.sections[k] ?? { source: 'template' }
    }
    await ref.update({
      facts: fresh.facts,
      series: fresh.series,
      progress: fresh.progress,
      source: fresh.source,
      sessionCount: fresh.sessionCount,
      narrative,
      narrativeOriginal: base,
      'narrativeMeta.sections': meta,
      'narrativeMeta.generatedAt': FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: caller.email,
    })
    await audit(branchId, caller, { action: 'report.refresh', reportId, studentId: doc.studentId, studentName: doc.studentName, summary: `Updated the figures of ${doc.studentName}'s progress report` })
    return { ok: true }
  }

  const section = data.section as NarrativeKey | 'all'
  if (section !== 'all' && !NARRATIVE_KEYS.includes(section)) throw new HttpsError('invalid-argument', 'Unknown section.')
  if (!doc.narrative || !ctx.settings.progressReports.ai.enabled || !aiConfigured()) throw new HttpsError('unavailable', 'AI isn’t available right now. You can edit the text yourself.')
  const level = doc.progress?.level ?? null

  if (section === 'all') {
    const ai = await aiNarrative(ctx, { ...fresh, facts: doc.facts, progress: doc.progress })
    if (!ai) throw new HttpsError('unavailable', 'AI isn’t available right now. Please try again.')
    await ref.update({
      narrative: ai.narrative,
      narrativeOriginal: ai.narrative,
      'narrativeMeta.sections': ai.sections,
      'narrativeMeta.source': 'ai',
      'narrativeMeta.generatedAt': FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: caller.email,
    })
    await audit(branchId, caller, { action: 'report.regenerate', reportId, studentId: doc.studentId, studentName: doc.studentName, summary: `Rewrote ${doc.studentName}'s progress report with AI` })
    return { ok: true }
  }

  const input = buildReportInput({ centerName: ctx.branch.name, period: doc.period, firstName: doc.student.firstName, grade: doc.student.grade, facts: doc.facts, level, logs: ctx.logs, sections: [section] })
  const out = await aiJson<Record<string, unknown>>(REPORT_SYSTEM_PROMPT, input, sectionSchema(section), {
    tier: 'report',
    temperature: 0.4,
    timeoutMs: 60_000,
    instruction: sectionInstruction(section, doc.narrative, data.hint),
  })
  if (!out || out[section] === undefined) throw new HttpsError('unavailable', 'AI isn’t available right now. Please try again.')
  const value = sanitizeNarrative({ ...doc.narrative, [section]: out[section] })[section]
  const next = { ...doc.narrative, [section]: value } as ReportNarrative
  const issues = checkNarrative(next, doc.facts, level, doc.student.firstName)[section]
  await ref.update({
    [`narrative.${section}`]: value,
    [`narrativeOriginal.${section}`]: value,
    [`narrativeMeta.sections.${section}`]: issues ? { source: 'ai', needsReview: true, reasons: issues } : { source: 'ai' },
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: caller.email,
  })
  await audit(branchId, caller, {
    action: 'report.regenerate',
    reportId,
    studentId: doc.studentId,
    studentName: doc.studentName,
    summary: `Rewrote “${NARRATIVE_LABELS[section]}” in ${doc.studentName}'s progress report with AI`,
    changes: [{ field: `narrative.${section}`, label: NARRATIVE_LABELS[section], from: null, to: 'rewritten' }],
  })
  return { ok: true }
})

/** Shares a report with the student's family (admins), emailing them a link, or stops sharing it. */
export const shareProgressReport = onCall({ secrets: [gmailAppPassword], timeoutSeconds: 60 }, async (req) => {
  const data = (req.data ?? {}) as { branchId?: string; reportId?: string; share?: boolean; notify?: boolean }
  const { branchId, reportId } = data
  if (!branchId || !reportId) throw new HttpsError('invalid-argument', 'Missing data.')
  const caller = await callerFor(branchId, req.auth)
  if (!caller.isAdmin) throw new HttpsError('permission-denied', 'Only admins can share reports with families.')
  const ref = db.doc(`${ROOT.branches}/${branchId}/${COL.progressReports}/${reportId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Report not found.')
  const doc = snap.data() as ProgressReportDoc
  if (doc.schemaVersion !== 2) throw new HttpsError('failed-precondition', 'This report was made with an older version. Create a new one.')

  if (!data.share) {
    await ref.update({ status: 'draft', sharedWithParents: false, updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.email })
    await audit(branchId, caller, { action: 'report.unshare', reportId, studentId: doc.studentId, studentName: doc.studentName, summary: `Stopped sharing ${doc.studentName}'s progress report` })
    return { ok: true, notify: null }
  }

  // Who receives it: active parent accounts linked to the student, and the student's own account.
  const members = db.collection(`${ROOT.branches}/${branchId}/${COL.members}`)
  const [parents, students] = await Promise.all([members.where('studentIds', 'array-contains', doc.studentId).get(), members.where('studentId', '==', doc.studentId).get()])
  const recipients = [...parents.docs, ...students.docs]
    .map((d) => d.data())
    .filter((m) => m.status === 'active' && (m.role === 'parent' || m.role === 'student'))
    .filter((m, i, all) => all.findIndex((x) => x.email === m.email) === i)
  const branch = (await db.doc(`${ROOT.branches}/${branchId}`).get()).data() as Branch
  const settings = resolveSettings(branch.settings)
  let notify: ProgressReportDoc['notify'] = { status: 'skipped', at: FieldValue.serverTimestamp(), recipients: [], error: null }
  if (data.notify && settings.progressReports.emailFamiliesOnShare && recipients.length) {
    const results = []
    for (const m of recipients) {
      const url = `${APP_URL}/login?next=${encodeURIComponent(`/${branchId}/progress-report/${reportId}`)}&email=${encodeURIComponent(String(m.email))}`
      const mail = reportEmail({
        to: String(m.email),
        name: String(m.displayName ?? ''),
        studentFirstName: doc.student.firstName,
        branchName: branch.name,
        periodLabel: doc.period.label,
        sessions: doc.facts.attendance.attended,
        hours: doc.facts.hours.total,
        url,
        contact: { phone: branch.contact?.phone ?? '', email: branch.contact?.email ?? '' },
        forStudent: m.role === 'student',
      })
      results.push(await sendMail({ to: String(m.email), subject: mail.subject, html: mail.html, text: mail.text, fromName: `${branch.name} via Hyber CRM`, replyTo: branch.contact?.email || null }))
    }
    const failed = results.find((r) => r.status === 'failed')
    notify = {
      status: results.some((r) => r.status === 'not_configured') ? 'not_configured' : failed ? 'failed' : 'sent',
      at: FieldValue.serverTimestamp(),
      recipients: recipients.map((m) => String(m.email)),
      error: failed && failed.status === 'failed' ? failed.error : null,
    }
  }
  await ref.update({
    status: 'shared',
    sharedWithParents: true,
    sharedAt: FieldValue.serverTimestamp(),
    sharedBy: { email: caller.email, name: caller.name },
    notify,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: caller.email,
  })
  await audit(branchId, caller, {
    action: 'report.share',
    reportId,
    studentId: doc.studentId,
    studentName: doc.studentName,
    summary: `Shared ${doc.studentName}'s progress report (${doc.period.label}) with the family${notify?.status === 'sent' ? ' and emailed them' : ''}`,
  })
  return { ok: true, notify: { status: notify?.status ?? 'skipped', recipients: notify?.recipients.length ?? 0 } }
})

/** The family's first opening of a shared report shows as "Viewed" for staff. */
export const onReportViewed = onDocumentCreated(`${ROOT.branches}/{branchId}/${COL.progressReports}/{reportId}/views/{viewerKey}`, async (event) => {
  const { branchId, reportId } = event.params
  const ref = db.doc(`${ROOT.branches}/${branchId}/${COL.progressReports}/${reportId}`)
  await db.runTransaction(async (tx) => {
    const r = await tx.get(ref)
    if (r.exists && !r.data()!.firstViewedAt) tx.update(ref, { firstViewedAt: FieldValue.serverTimestamp() })
  })
})

