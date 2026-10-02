import { httpsCallable } from 'firebase/functions'
import { FAMILY_LEVEL_LABELS, STAFF_LEVEL_LABELS } from '@shared/reports/status'
import type { NarrativeKey, ProgressLevel, ProgressReportDoc, ReportPreset } from '@shared/reports/types'
import { formatDateKey } from '@shared/time'
import { functions } from '@/lib/firebase'

export type { ProgressReportDoc } from '@shared/reports/types'

export const generateReport = httpsCallable<
  { branchId: string; studentId: string; from: string; to: string; preset: ReportPreset },
  { reportId: string; reused: boolean; source: 'ai' | 'template' }
>(functions, 'generateProgressReport')

export const regenerateReport = httpsCallable<{ branchId: string; reportId: string; section?: NarrativeKey | 'all'; hint?: string; refresh?: boolean }, { ok: boolean }>(
  functions,
  'regenerateReportSection',
)

export const shareReport = httpsCallable<
  { branchId: string; reportId: string; share: boolean; notify: boolean },
  { ok: boolean; notify: { status: 'sent' | 'not_configured' | 'failed' | 'skipped'; recipients: number } | null }
>(functions, 'shareProgressReport')

/** A report doc, old or new; only v2 reports render the full document. */
export type AnyReport = Partial<ProgressReportDoc> & { studentId: string; studentName: string; startDate: string; endDate: string; customName?: string | null }

export function isV2(r: AnyReport): r is ProgressReportDoc {
  return r.schemaVersion === 2
}

/** "September 2026 progress report", or the custom name. */
export function reportName(r: AnyReport): string {
  if (r.customName) return r.customName
  const label = r.period?.label ?? `${formatDateKey(r.startDate, 'medium')} – ${formatDateKey(r.endDate, 'medium')}`
  return `${label} progress report`
}

export const LEVEL_STYLE: Record<ProgressLevel, { chip: string; dot: string }> = {
  on_track: { chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900', dot: '#0ca30c' },
  needs_attention: { chip: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900', dot: '#fab219' },
  at_risk: { chip: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900', dot: '#d03b3b' },
}

export const levelLabel = (level: ProgressLevel, audience: 'family' | 'staff') => (audience === 'family' ? FAMILY_LEVEL_LABELS : STAFF_LEVEL_LABELS)[level]

export const PRESET_LABELS: Record<ReportPreset, string> = {
  since_last: 'Since the last report',
  last_month: 'Last month',
  this_month: 'This month so far',
  last_30: 'Last 30 days',
  last_90: 'Last 90 days',
  since_conference: 'Since the last conference',
  custom: 'Custom dates',
}

/** The message of a callable error without its code prefix. */
export function callableMessage(e: unknown, fallback: string): string {
  const m = (e as { message?: string })?.message
  return m ? m.replace(/^.*?: /, '') : fallback
}
