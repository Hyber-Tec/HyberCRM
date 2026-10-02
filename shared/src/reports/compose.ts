import type { SessionLog } from '../sessions/logs'
import type { BranchSettings } from '../settings/defaults'
import type { DateKey } from '../time'
import { type FactsSession, buildReportFacts, periodLabel } from './facts'
import { progressStatus } from './status'
import { templateNarrative } from './template'
import type { NarrativeKey, ProgressReportDoc, ReportPerson, ReportPreset, SectionMeta } from './types'

export interface ComposeInput {
  branch: { name: string; logoUrl: string | null; accentColor: string | null; contact: { phone: string; email: string; website: string; address: string } }
  settings: BranchSettings
  conference: { enabled: boolean; everyHours: number }
  student: {
    id: string
    name: string
    firstName: string
    lastName: string
    grade: string
    school: string
    totalSessionHours: number
    conferenceBaselineHours: number
  }
  period: { from: DateKey; to: DateKey; preset: ReportPreset }
  sessions: FactsSession[]
  logs: SessionLog[]
  upcoming: { dateKey: DateKey; startMin: number; subject: string; tutorName: string }[]
  previous: { id: string; doc: Pick<ProgressReportDoc, 'facts' | 'narrative' | 'period'> } | null
  today: DateKey
  nowMs: number
  generatedBy: ReportPerson
}

/** A fingerprint of the logs a report was built from (staleness and duplicate checks). */
export function logFingerprint(logs: { sessionId: string; editCount?: number; dateKey: string }[]): string {
  const key = logs
    .map((l) => `${l.sessionId}:${l.editCount ?? 0}`)
    .sort()
    .join('|')
  let h = 5381
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0
  return `${logs.length}-${(h >>> 0).toString(36)}`
}

/**
 * Everything a new report draft holds except timestamps, with template text in
 * the written sections (the server swaps in AI text when it can).
 */
export function composeReport(i: ComposeInput): Omit<ProgressReportDoc, 'generatedAt' | 'updatedAt' | 'sharedAt'> {
  const s = i.settings.progressReports
  const logs = i.logs.filter((l) => l.status === 'submitted' && l.dateKey >= i.period.from && l.dateKey <= i.period.to)
  const { facts, series } = buildReportFacts({
    period: i.period,
    nowMs: i.nowMs,
    today: i.today,
    student: { totalSessionHours: i.student.totalSessionHours, conferenceBaselineHours: i.student.conferenceBaselineHours },
    sessions: i.sessions,
    logs,
    upcoming: i.upcoming,
    dimensions: i.settings.sessionLogs.ratingDimensions,
    loggableStatuses: i.settings.sessionLogs.allowForStatuses,
    conference: i.conference,
    previous: i.previous
      ? { reportId: i.previous.id, periodLabel: i.previous.doc.period.label, facts: i.previous.doc.facts, goals: i.previous.doc.narrative.goals.map((g) => g.goal) }
      : null,
  })
  const progress = progressStatus(facts, logs, s.risk)
  const narrative = templateNarrative(facts, i.student.firstName, progress.level)
  const label = periodLabel(i.period.from, i.period.to)
  const sections = Object.fromEntries(Object.keys(narrative).map((k) => [k, { source: 'template' } satisfies SectionMeta])) as Record<NarrativeKey, SectionMeta>
  return {
    schemaVersion: 2,
    status: 'draft',
    sharedWithParents: false,
    studentId: i.student.id,
    studentName: i.student.name,
    student: { name: i.student.name, firstName: i.student.firstName, lastName: i.student.lastName, grade: i.student.grade, school: i.student.school },
    period: { from: i.period.from, to: i.period.to, preset: i.period.preset, label },
    startDate: i.period.from,
    endDate: i.period.to,
    sessionCount: facts.attendance.attended,
    generatedBy: i.generatedBy,
    updatedBy: i.generatedBy.email,
    sharedBy: null,
    firstViewedAt: null,
    notify: null,
    source: { sessionIds: logs.map((l) => l.sessionId), logCount: logs.length, fingerprint: logFingerprint(logs) },
    snapshot: {
      ratingDimensions: i.settings.sessionLogs.ratingDimensions,
      accentColor: i.branch.accentColor,
      branchName: i.branch.name,
      logoUrl: i.branch.logoUrl,
      contact: i.branch.contact,
      aiDisclosure: s.aiDisclosure,
    },
    facts,
    series: { sessions: series },
    progress,
    narrative,
    narrativeOriginal: narrative,
    narrativeMeta: { source: 'template', generatedAt: null, sections },
    options: { showStatus: s.sections.status, showPractice: s.sections.practice, showResources: s.sections.resources, showConference: s.sections.conference && i.conference.enabled },
    customName: null,
  }
}
