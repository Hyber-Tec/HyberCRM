import type { ReportMetrics, ReportNarrative } from '@shared/sessions/reports'
import { formatDateKey } from '@shared/time'
import type { TimestampLike } from '@shared/types'

/** `branches/{b}/progressReports/{id}`: an immutable report snapshot. */
export interface ProgressReport {
  studentId: string
  studentName: string
  startDate: string
  endDate: string
  generatedAt: TimestampLike | null
  generatedBy: string
  generatedByName: string
  sessionCount: number
  sessionIds: string[]
  lastSessionDateKey: string | null
  metrics: ReportMetrics
  narrative: ReportNarrative
  customName: string | null
  sharedWithParents: boolean
}

export function reportTitle(r: Pick<ProgressReport, 'customName' | 'studentName' | 'startDate' | 'endDate'>) {
  return r.customName || `${r.studentName} — Progress Report — ${formatDateKey(r.startDate, 'medium')} – ${formatDateKey(r.endDate, 'medium')}`
}

export const RISK_STYLE: Record<string, string> = {
  'On Track': 'border-green-200 bg-green-50 text-green-700',
  'Needs Attention': 'border-amber-200 bg-amber-50 text-amber-800',
  'At Risk': 'border-red-200 bg-red-50 text-red-700',
}
