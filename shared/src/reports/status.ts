import type { SessionLog } from '../sessions/logs'
import type { ProgressDriver, ReportFacts, ReportProgress } from './types'

export interface StatusRules {
  atRiskHomeworkBelow: number
  atRiskFocusBelow: number
  needsAttentionHomeworkBelow: number
  needsAttentionMotivationBelow: number
  /** `share`: flagged sessions count when they are a share of the period or the last two; `any`: one flagged session is enough (TE). */
  flagRule: 'share' | 'any'
  /** Percent of attended sessions for the `share` rule. */
  flagShare: number
  /** Attendance thresholds (percent); 0 turns the condition off. */
  atRiskAttendanceBelow: number
  needsAttentionAttendanceBelow: number
  focusKey: string
  motivationKey: string
}

/** Parent-facing wording of each level (staff keep True Education's labels). */
export const FAMILY_LEVEL_LABELS = { on_track: 'On track', needs_attention: 'Needs attention', at_risk: 'Needs extra support' } as const
export const STAFF_LEVEL_LABELS = { on_track: 'On Track', needs_attention: 'Needs Attention', at_risk: 'At Risk' } as const

/** A progress level in words: families get the softer wording. */
export function levelLabel(level: keyof typeof FAMILY_LEVEL_LABELS, audience: 'family' | 'staff'): string {
  return (audience === 'family' ? FAMILY_LEVEL_LABELS : STAFF_LEVEL_LABELS)[level]
}

/**
 * The report's progress status: True Education's thresholds on homework and two
 * ratings, plus session flags, decided here and never by AI. Fewer than two
 * attended sessions give no status.
 */
export function progressStatus(facts: ReportFacts, logs: readonly SessionLog[], rules: StatusRules): ReportProgress {
  const attended = logs.filter((l) => l.status === 'submitted').sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin)
  if (facts.attendance.attended < 2) return { level: null, drivers: [], rule: rules.flagRule }
  const at: ProgressDriver[] = []
  const na: ProgressDriver[] = []
  const hw = facts.homework.percent
  const focus = facts.engagement.find((e) => e.key === rules.focusKey)?.average ?? null
  const motivation = facts.engagement.find((e) => e.key === rules.motivationKey)?.average ?? null
  const att = facts.attendance.percent

  if (hw !== null && hw < rules.atRiskHomeworkBelow) at.push({ code: 'homework', label: 'Homework completion', value: hw, threshold: rules.atRiskHomeworkBelow })
  else if (hw !== null && hw < rules.needsAttentionHomeworkBelow) na.push({ code: 'homework', label: 'Homework completion', value: hw, threshold: rules.needsAttentionHomeworkBelow })
  if (focus !== null && focus < rules.atRiskFocusBelow) at.push({ code: 'focus', label: 'Average focus', value: focus, threshold: rules.atRiskFocusBelow })
  if (motivation !== null && motivation < rules.needsAttentionMotivationBelow)
    na.push({ code: 'motivation', label: 'Average motivation', value: motivation, threshold: rules.needsAttentionMotivationBelow })
  if (att !== null && rules.atRiskAttendanceBelow > 0 && att < rules.atRiskAttendanceBelow)
    at.push({ code: 'attendance', label: 'Attendance', value: att, threshold: rules.atRiskAttendanceBelow })
  else if (att !== null && rules.needsAttentionAttendanceBelow > 0 && att < rules.needsAttentionAttendanceBelow)
    na.push({ code: 'attendance', label: 'Attendance', value: att, threshold: rules.needsAttentionAttendanceBelow })

  const flagged = (levels: string[]) => attended.filter((l) => levels.includes(l.studentFlag)).length
  const lastTwo = (levels: string[]) => attended.length >= 2 && attended.slice(-2).every((l) => levels.includes(l.studentFlag))
  const flagHit = (levels: string[]) => {
    const n = flagged(levels)
    if (rules.flagRule === 'any') return n > 0
    return n > 0 && ((n / attended.length) * 100 >= rules.flagShare || lastTwo(levels))
  }
  if (flagHit(['at_risk'])) at.push({ code: 'flags', label: 'Sessions flagged At Risk', value: flagged(['at_risk']), threshold: rules.flagRule === 'any' ? 1 : rules.flagShare })
  else if (flagHit(['at_risk', 'needs_attention']))
    na.push({ code: 'flags', label: 'Sessions flagged for attention', value: flagged(['at_risk', 'needs_attention']), threshold: rules.flagRule === 'any' ? 1 : rules.flagShare })

  if (at.length) return { level: 'at_risk', drivers: at, rule: rules.flagRule }
  if (na.length) return { level: 'needs_attention', drivers: na, rule: rules.flagRule }
  return { level: 'on_track', drivers: [], rule: rules.flagRule }
}
