/**
 * Round 3: progress reports move to schema version 2 (computed facts, drafts
 * and sharing, the new document). Each older report is rebuilt in place, same
 * ID and the same student and dates, from the branch's current sessions and
 * logs, with the standard (template) text; it keeps its shared state, so
 * family links keep working. Safe to run more than once (v2 reports are
 * left alone). Dry run unless `--apply`.
 *
 *   npx tsx scripts/migrate-round3-reports.ts [--apply]
 *
 * Talks to production with the gcloud login (FIRESTORE_EMULATOR_HOST → emulator).
 */
import { parseArgs } from 'node:util'
import { COL } from '../shared/src/paths'
import { composeReport } from '../shared/src/reports/compose'
import type { FactsSession } from '../shared/src/reports/facts'
import type { SessionLog } from '../shared/src/sessions/logs'
import { resolveBusinessRules } from '../shared/src/settings/businessRules'
import { resolveSettings } from '../shared/src/settings/resolve'
import { addDays, todayKey } from '../shared/src/time'
import type { Branch, Student } from '../shared/src/types'
import { type Write, commit, getDocument, listDocuments } from './lib/firestore-rest'

const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } })
const now = new Date()

const ms = (v: unknown) => (v instanceof Date ? v.getTime() : 0)

const branches = await listDocuments('branches')
const writes: Write[] = []
for (const b of branches) {
  const reports = (await listDocuments(`branches/${b.id}/${COL.progressReports}`)).filter((r) => r.data.schemaVersion !== 2)
  if (!reports.length) continue
  const branch = b.data as unknown as Branch
  const settings = resolveSettings(branch.settings)
  const rules = resolveBusinessRules(branch.businessRules)
  const today = todayKey(branch.timezone || 'America/New_York')
  const [sessions, logs] = await Promise.all([listDocuments(`branches/${b.id}/${COL.sessions}`), listDocuments(`branches/${b.id}/${COL.sessionLogs}`)])
  for (const r of reports) {
    const studentId = String(r.data.studentId)
    const student = (await getDocument(`branches/${b.id}/${COL.students}/${studentId}`)) as unknown as Student | null
    if (!student) {
      console.log(`  ${b.id}/${r.id}: student ${studentId} is gone, skipped`)
      continue
    }
    const from = String(r.data.startDate)
    const to = String(r.data.endDate)
    const own = sessions.filter((s) => s.data.studentId === studentId && s.data.isDeleted !== true)
    const factsSessions: FactsSession[] = own
      .filter((s) => String(s.data.dateKey) >= from && String(s.data.dateKey) <= to)
      .map((s) => ({
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
    const studentLogs = logs.map((l) => l.data as unknown as SessionLog).filter((l) => l.studentId === studentId && l.status === 'submitted')
    const shared = r.data.sharedWithParents === true
    const doc = composeReport({
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
        firstName: student.firstName || student.name.split(' ')[0],
        lastName: student.lastName || student.name.split(' ').slice(1).join(' '),
        grade: student.grade ?? '',
        school: student.school ?? '',
        totalSessionHours: student.totalSessionHours ?? 0,
        conferenceBaselineHours: student.conference?.baselineHours ?? 0,
      },
      period: { from, to, preset: 'custom' },
      sessions: factsSessions,
      logs: studentLogs,
      upcoming: own
        .filter((s) => String(s.data.dateKey) >= today && String(s.data.dateKey) <= addDays(today, 27) && s.data.status !== 'canceled' && s.data.status !== 'no_show')
        .map((s) => ({ dateKey: String(s.data.dateKey), startMin: Number(s.data.startMin), subject: String(s.data.subject ?? ''), tutorName: String(s.data.tutorName ?? '') })),
      previous: null,
      today,
      nowMs: now.getTime(),
      generatedBy: { email: String(r.data.generatedBy ?? 'migration'), name: String(r.data.generatedByName ?? 'Hyber CRM'), role: 'admin', staffId: null },
    })
    const generatedAt = r.data.generatedAt instanceof Date ? r.data.generatedAt : now
    writes.push({
      path: `branches/${b.id}/${COL.progressReports}/${r.id}`,
      data: {
        ...doc,
        status: shared ? 'shared' : 'draft',
        sharedWithParents: shared,
        sharedAt: shared ? generatedAt : null,
        sharedBy: shared ? { email: String(r.data.generatedBy ?? ''), name: String(r.data.generatedByName ?? '') } : null,
        customName: (r.data.customName as string | null) ?? null,
        narrativeMeta: { ...doc.narrativeMeta, generatedAt: now },
        generatedAt,
        updatedAt: now,
        updatedBy: 'migration',
      } as unknown as Record<string, unknown>,
    })
    console.log(`  ${b.id}/${r.id}: ${student.name}, ${doc.period.label}, ${doc.facts.attendance.attended} sessions, ${shared ? 'shared' : 'draft'}`)
  }
}

console.log(`${writes.length} report(s) to rebuild${values.apply ? '' : ' (dry run; pass --apply to write)'}`)
if (values.apply && writes.length) {
  await commit(writes)
  console.log('done')
}
