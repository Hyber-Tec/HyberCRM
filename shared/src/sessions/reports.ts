import { averageRating, ratingKey } from './logs'
import type { SessionLog } from './logs'

export type RiskLevel = 'On Track' | 'Needs Attention' | 'At Risk'

export interface ReportMetrics {
  totalSessions: number
  totalHours: number
  homeworkCompleted: number
  homeworkPartial: number
  homeworkNotDone: number
  homeworkNotAssigned: number
  homeworkCompletionRate: number | null
  /** Average per rating dimension (lower-cased key). */
  averages: Record<string, number | null>
  subjectHours: { subject: string; hours: number; percent: number }[]
  subjects: string[]
  tutors: string[]
  topicsCovered: string[]
  atRiskCount: number
  needsAttentionCount: number
  riskLevel: RiskLevel
}

export interface RiskThresholds {
  atRiskHomeworkBelow: number
  atRiskFocusBelow: number
  needsAttentionHomeworkBelow: number
  needsAttentionMotivationBelow: number
}

const r2 = (x: number) => Math.round(x * 100) / 100

/** Progress-report metrics over submitted logs (True Education's buildMetrics). */
export function buildMetrics(logs: readonly SessionLog[], dimensions: string[], risk: RiskThresholds, maxTopics = 30): ReportMetrics {
  let completed = 0
  let partial = 0
  let notDone = 0
  let notAssigned = 0
  const subjectHours = new Map<string, number>()
  const topics: string[] = []
  for (const l of logs) {
    const hw = (l.homeworkStatus ?? '').toLowerCase()
    if (hw === 'completed') completed++
    else if (hw.includes('partial')) partial++
    else if (hw === 'not done') notDone++
    else if (hw === 'not assigned') notAssigned++
    const subj = l.subject || l.sessionType || 'General'
    subjectHours.set(subj, (subjectHours.get(subj) ?? 0) + (l.usedHours ?? 0))
    for (const t of l.topics?.length ? l.topics : l.topicCovered ? [l.topicCovered] : []) if (!topics.includes(t)) topics.push(t)
  }
  const assigned = completed + partial + notDone
  const rate = assigned ? Math.round((completed / assigned) * 100) : null
  const averages: Record<string, number | null> = {}
  for (const d of dimensions) {
    const k = ratingKey(d)
    const vals = logs.map((l) => l.ratings?.[k]).filter((v): v is number => Number.isFinite(v) && v > 0)
    averages[k] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
  }
  const atRiskCount = logs.filter((l) => l.studentFlag === 'at_risk').length
  const needsAttentionCount = logs.filter((l) => l.studentFlag === 'needs_attention').length
  const focus = averages.focus ?? null
  const motivation = averages.motivation ?? null
  let riskLevel: RiskLevel = 'On Track'
  if (atRiskCount > 0 || (rate !== null && rate < risk.atRiskHomeworkBelow) || (focus !== null && focus < risk.atRiskFocusBelow)) riskLevel = 'At Risk'
  else if (needsAttentionCount > 0 || (rate !== null && rate < risk.needsAttentionHomeworkBelow) || (motivation !== null && motivation < risk.needsAttentionMotivationBelow))
    riskLevel = 'Needs Attention'
  const totalHours = r2(logs.reduce((s, l) => s + (l.usedHours ?? 0), 0))
  return {
    totalSessions: logs.length,
    totalHours,
    homeworkCompleted: completed,
    homeworkPartial: partial,
    homeworkNotDone: notDone,
    homeworkNotAssigned: notAssigned,
    homeworkCompletionRate: rate,
    averages,
    subjectHours: [...subjectHours.entries()]
      .map(([subject, hours]) => ({ subject, hours: r2(hours), percent: totalHours ? Math.round((hours / totalHours) * 100) : 0 }))
      .sort((a, b) => b.hours - a.hours),
    subjects: [...new Set(logs.map((l) => l.subject).filter(Boolean))],
    tutors: [...new Set(logs.map((l) => l.tutorName).filter(Boolean))],
    topicsCovered: topics.slice(0, maxTopics),
    atRiskCount,
    needsAttentionCount,
    riskLevel,
  }
}

export interface ReportNarrative {
  riskLevel: RiskLevel
  overallProgress: string
  academicProgress: string
  classPerformance: string
  homeworkAnalysis: string
  learningHabitsNarrative: string
  instructorComments: string
  keyStrengths: string[]
  areasForImprovement: string[]
  goalsAndActionPlan: string[]
  /** `gemini` on reports written before the app stopped naming the AI provider. */
  provider: 'ai' | 'gemini' | 'local_fallback'
}

/** Deterministic narrative used when AI is off or unavailable. */
export function localNarrative(m: ReportMetrics, studentName: string): ReportNarrative {
  const first = studentName.split(' ')[0] || 'The student'
  const hw = m.homeworkCompletionRate
  const strong = Object.entries(m.averages).filter(([, v]) => v !== null && v >= 4).map(([k]) => k)
  const weak = Object.entries(m.averages).filter(([, v]) => v !== null && v < 3.5).map(([k]) => k)
  return {
    riskLevel: m.riskLevel,
    overallProgress: `${first} attended ${m.totalSessions} session${m.totalSessions === 1 ? '' : 's'} (${m.totalHours} hours) in this period${m.subjects.length ? `, focusing on ${m.subjects.join(', ')}` : ''}. Overall status: ${m.riskLevel}.`,
    academicProgress: m.topicsCovered.length ? `Topics covered include ${m.topicsCovered.slice(0, 6).join(', ')}.` : 'Topics covered will appear here as session logs are recorded.',
    classPerformance: strong.length ? `${first} showed consistent ${strong.join(', ')} during sessions.` : `${first} is building consistency across sessions.`,
    homeworkAnalysis: hw === null ? 'No homework was assigned in this period.' : `Homework completion was ${hw}% (${m.homeworkCompleted} completed, ${m.homeworkPartial} partial, ${m.homeworkNotDone} not done).`,
    learningHabitsNarrative: weak.length ? `Areas to strengthen: ${weak.join(', ')}.` : 'Learning habits are steady across the tracked areas.',
    instructorComments: `We are glad to work with ${first} and will keep supporting their progress.`,
    keyStrengths: strong.length ? strong.map((s) => `Strong ${s}`) : ['Regular attendance'],
    areasForImprovement: weak.length ? weak.map((s) => `Improve ${s}`) : ['Keep practicing consistently'],
    goalsAndActionPlan: ['Continue regular sessions', 'Complete assigned homework on time', 'Review missed questions before each session'],
    provider: 'local_fallback',
  }
}

export { averageRating }
