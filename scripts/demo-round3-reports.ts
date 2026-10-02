/**
 * Round 3 showcase for Demo Academy: Ava Patel gets the sample history the
 * seed now generates (about eleven weeks of SAT Math, SAT Reading & Writing
 * and Algebra 2 sessions with logs, in the past only), skipping any slot that
 * overlaps a session she already has, and her progress reports are rebuilt as
 * two shared v2 reports: last month and the month before (the newer one
 * compares with the older). Her total hours grow by the added sessions. Dry run
 * unless `--apply`.
 *
 *   npx tsx scripts/demo-round3-reports.ts [--apply]
 */
import { parseArgs } from 'node:util'
import { avaHistory } from '../shared/src/demo/history'
import { COL } from '../shared/src/paths'
import { composeReport } from '../shared/src/reports/compose'
import { type FactsSession, presetPeriod } from '../shared/src/reports/facts'
import { businessRoundedHours } from '../shared/src/schedule/hours'
import type { SessionLog } from '../shared/src/sessions/logs'
import { resolveBusinessRules } from '../shared/src/settings/businessRules'
import { resolveSettings } from '../shared/src/settings/resolve'
import { addDays, todayKey } from '../shared/src/time'
import type { Branch, Student } from '../shared/src/types'
import { type Write, commit, getDocument, listDocuments } from './lib/firestore-rest'

const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } })
const B = 'demo-academy'
const AVA = 'demo-student-ava-patel'
const now = new Date()

const branch = (await getDocument(`branches/${B}`)) as unknown as Branch | null
if (!branch) throw new Error('Demo Academy not found')
const student = (await getDocument(`branches/${B}/${COL.students}/${AVA}`)) as unknown as Student | null
if (!student) throw new Error('Ava Patel not found')
const timezone = branch.timezone || 'America/New_York'
const today = todayKey(timezone)
const settings = resolveSettings(branch.settings)
const rules = resolveBusinessRules(branch.businessRules)
const subjects = await listDocuments(`branches/${B}/${COL.subjects}`)
const subjectId = (name: string) => subjects.find((s) => String(s.data.name).toLowerCase() === name.toLowerCase())?.id ?? null

// 1. The history, minus anything overlapping her existing sessions.
const existing = (await listDocuments(`branches/${B}/${COL.sessions}`)).filter((s) => s.data.studentId === AVA && s.data.isDeleted !== true)
const history = avaHistory({ base: `branches/${B}`, today, timezone, now, createdBy: 'demo', subjectId })
const overlaps = (dateKey: string, a: number, b: number) =>
  existing.some((s) => s.data.dateKey === dateKey && Number(s.data.startMin) < b && Number(s.data.endMin) > a)
const keep = new Set(
  history.sessions.filter((s) => !overlaps(String(s.data.dateKey), Number(s.data.startMin), Number(s.data.endMin))).map((s) => s.path.split('/').pop()!),
)
const already = new Set(existing.map((s) => s.id))
const sessions = history.sessions.filter((s) => keep.has(s.path.split('/').pop()!) && !already.has(s.path.split('/').pop()!))
const logs = history.logs.filter((l) => keep.has(l.path.split('/').pop()!) && !already.has(l.path.split('/').pop()!))
const addedHours = sessions
  .filter((s) => s.data.status === 'present' || s.data.status === 'no_show')
  .reduce((n, s) => n + businessRoundedHours(Number(s.data.endMin) - Number(s.data.startMin)), 0)
console.log(`History: ${sessions.length} sessions and ${logs.length} logs to add (${history.sessions.length - sessions.length} skipped), +${addedHours} hours`)

// 2. Her reports, from the data as it will be.
const allSessions = [...existing.map((s) => ({ id: s.id, data: s.data })), ...sessions.map((s) => ({ id: s.path.split('/').pop()!, data: s.data }))]
const allLogs = [
  ...(await listDocuments(`branches/${B}/${COL.sessionLogs}`)).map((l) => l.data as unknown as SessionLog).filter((l) => l.studentId === AVA && l.status === 'submitted'),
  ...logs.map((l) => l.data as unknown as SessionLog),
]
const ms = (v: unknown) => (v instanceof Date ? v.getTime() : 0)
const factsSessions: FactsSession[] = allSessions.map((s) => ({
  id: s.id,
  dateKey: String(s.data.dateKey),
  startMin: Number(s.data.startMin),
  endMin: Number(s.data.endMin),
  endAtMs: ms(s.data.endAt),
  status: s.data.status as FactsSession['status'],
  logStatus: String(s.data.logStatus ?? 'none'),
  subject: String(s.data.subject ?? ''),
  tutorName: String(s.data.tutorName ?? ''),
}))
const totalHours = Math.round(((student.totalSessionHours ?? 0) + addedHours) * 100) / 100
const grace = { email: 'grace.liu@example.com', name: 'Grace Liu', role: 'admin', staffId: 'demo-grace-liu' }
const lastMonth = presetPeriod('last_month', today)
const monthBefore = presetPeriod('last_month', addDays(lastMonth.from, 1))
const make = (period: { from: string; to: string }, asOf: string, previous: Parameters<typeof composeReport>[0]['previous']) =>
  composeReport({
    branch: {
      name: branch.name,
      logoUrl: branch.branding?.logoUrl ?? null,
      accentColor: branch.branding?.accentColor ?? null,
      contact: { phone: branch.contact?.phone ?? '', email: branch.contact?.email ?? '', website: branch.contact?.website ?? '', address: branch.contact?.address ?? '' },
    },
    settings,
    conference: { enabled: rules.conferences.enabled, everyHours: rules.conferences.everyHours },
    student: {
      id: AVA,
      name: student.name,
      firstName: student.firstName,
      lastName: student.lastName,
      grade: student.grade,
      school: student.school,
      totalSessionHours: totalHours,
      conferenceBaselineHours: student.conference?.baselineHours ?? 0,
    },
    period: { ...period, preset: 'last_month' },
    sessions: factsSessions,
    logs: allLogs,
    upcoming: allSessions
      .filter((s) => String(s.data.dateKey) >= asOf && s.data.status !== 'canceled' && s.data.status !== 'no_show')
      .map((s) => ({ dateKey: String(s.data.dateKey), startMin: Number(s.data.startMin), subject: String(s.data.subject ?? ''), tutorName: String(s.data.tutorName ?? '') })),
    previous,
    today: asOf,
    nowMs: asOf === today ? now.getTime() : Date.parse(`${asOf}T15:00:00Z`),
    generatedBy: grace,
  })
const prevAt = new Date(Date.parse(`${addDays(monthBefore.to, 1)}T15:00:00Z`))
const prev = make(monthBefore, addDays(monthBefore.to, 1), null)
const current = make(lastMonth, today, { id: 'demo-r-ava-patel-prev', doc: prev })
const report = (doc: ReturnType<typeof composeReport>, at: Date, viewed: boolean) =>
  ({
    ...doc,
    status: 'shared',
    sharedWithParents: true,
    sharedAt: at,
    sharedBy: { email: grace.email, name: grace.name },
    firstViewedAt: viewed ? at : null,
    narrativeMeta: { ...doc.narrativeMeta, generatedAt: at },
    generatedAt: at,
    updatedAt: at,
    updatedBy: 'demo',
  }) as unknown as Record<string, unknown>
console.log(`Reports: ${prev.period.label} (${prev.facts.attendance.attended} sessions) and ${current.period.label} (${current.facts.attendance.attended} sessions, ${current.progress.level})`)

const writes: Write[] = [
  ...sessions.map((s) => ({ path: s.path, data: s.data })),
  ...logs.map((l) => ({ path: l.path, data: l.data })),
  { path: `branches/${B}/${COL.progressReports}/demo-r-ava-patel-prev`, data: report(prev, prevAt, true) },
  { path: `branches/${B}/${COL.progressReports}/demo-r-ava-patel`, data: report(current, now, false) },
]
if (!values.apply) {
  console.log(`${writes.length} writes (dry run; pass --apply)`)
} else {
  await commit(writes)
  // Her hours: a field update so nothing else on the student changes.
  const { patchDocuments } = await import('./lib/firestore-rest')
  await patchDocuments([{ path: `branches/${B}/${COL.students}/${AVA}`, set: { totalSessionHours: totalHours } }])
  console.log('done')
}
