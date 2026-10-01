import type { SessionStatus } from '../settings/defaults'
import type { DateKey } from '../time'

export type LogStatus = 'draft' | 'submitted'
export type StudentFlag = 'on_track' | 'needs_attention' | 'at_risk'

export interface Material {
  label: string
  url: string
  type: 'text' | 'link'
}

export interface LogAi {
  sessionSummary: string
  homeworkAssigned: string
  nextSessionPlan: string
  riskAlert: string
  provider: 'gemini' | 'local_fallback'
}

/** `branches/{b}/sessionLogs/{sessionId}` (one log per session). */
export interface SessionLog {
  sessionId: string
  status: LogStatus
  submittedAt: unknown
  tutorId: string
  tutorName: string
  studentId: string
  studentName: string
  subject: string
  dateKey: DateKey
  startMin: number
  endMin: number
  startAt: unknown
  endAt: unknown
  usedHours: number
  sessionType: string
  topics: string[]
  topicCovered: string
  homeworkStatus: string
  homeworkComments: string
  materials: Material[]
  questionsAttempted: number | null
  questionsWrong: number | null
  accuracyPercent: number | null
  lessonActivity: string
  learningInsight: string
  nextFocus: string
  homeworkGiven: string
  /** Rating dimension (lower-cased label) → 1–5. */
  ratings: Record<string, number>
  studentFlag: StudentFlag | ''
  ai: LogAi | null
  enteredByAdmin: { email: string; name: string } | null
}

export type LogContent = Pick<
  SessionLog,
  | 'sessionType'
  | 'topics'
  | 'topicCovered'
  | 'homeworkStatus'
  | 'homeworkComments'
  | 'materials'
  | 'questionsAttempted'
  | 'questionsWrong'
  | 'lessonActivity'
  | 'learningInsight'
  | 'nextFocus'
  | 'homeworkGiven'
  | 'ratings'
  | 'studentFlag'
>

export const FLAG_LABELS: Record<StudentFlag, string> = {
  on_track: 'On Track',
  needs_attention: 'Needs Attention',
  at_risk: 'At Risk',
}

export function ratingKey(label: string): string {
  return label.trim().toLowerCase()
}

/** Percent correct, or null when nothing was attempted. */
export function accuracy(attempted: number | null, wrong: number | null): number | null {
  if (!attempted || attempted <= 0) return null
  const w = Math.max(0, wrong ?? 0)
  return Math.min(100, Math.max(0, Math.round(((attempted - w) / attempted) * 100)))
}

/** Mean of valid 1–5 ratings to 1 decimal, or null. */
export function averageRating(ratings: Record<string, number> | null | undefined): number | null {
  const v = Object.values(ratings ?? {}).filter((x) => Number.isFinite(x) && x > 0)
  if (!v.length) return null
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10
}

export function topicString(sessionType: string, topics: string[], free: string): string {
  return ['SAT', 'PSAT', 'ACT'].includes(sessionType) ? topics.join('; ') : free.trim()
}

/**
 * First missing required field, in True Education's order, or null when the log
 * can be submitted. `dimensions` are the branch's rating labels.
 */
export function firstMissing(c: LogContent, dimensions: string[]): string | null {
  if (!c.sessionType) return 'Session Type'
  if (['SAT', 'PSAT', 'ACT'].includes(c.sessionType) ? c.topics.length === 0 : !c.topicCovered.trim()) return 'Topic Covered'
  if (!c.homeworkStatus) return 'Homework Status'
  if (c.materials.length === 0) return 'Material Used'
  if (!c.questionsAttempted || c.questionsAttempted < 1) return 'Questions Attempted'
  if (c.questionsWrong == null || c.questionsWrong < 0 || c.questionsWrong > c.questionsAttempted) return 'Questions Wrong'
  if (!c.lessonActivity.trim()) return 'Lesson Activity'
  if (!c.learningInsight.trim()) return 'Learning Insight'
  if (!c.nextFocus.trim()) return 'Next Focus'
  if (!c.homeworkGiven.trim()) return 'Homework Given'
  for (const d of dimensions) {
    const v = c.ratings[ratingKey(d)]
    if (!(v >= 1 && v <= 5)) return `${d} rating`
  }
  if (!c.studentFlag) return 'Student Flag'
  return null
}

/** Session statuses a log may be written for (owner: not canceled or no-show). */
export function canLog(status: SessionStatus, allowed: readonly SessionStatus[]): boolean {
  return allowed.includes(status)
}

/** Deterministic AI fallback (no key or the model failed). Never blocks submitting. */
export function localLogAi(c: LogContent, subject: string): LogAi {
  const avg = averageRating(c.ratings) ?? 3
  const flag = c.studentFlag
  const sentence = (s: string) => {
    const t = s.trim()
    return t && !/[.!?]$/.test(t) ? `${t}.` : t
  }
  const riskAlert =
    flag === 'at_risk' || avg <= 2.2
      ? 'Student may be at risk. Prioritize close follow-up, homework completion, and confidence-building next session.'
      : flag === 'needs_attention' || avg < 3.5
        ? 'Monitor progress closely. Reinforce weak areas and check for completion consistency next session.'
        : 'No urgent risk signal detected. Continue current plan with regular progress checks.'
  return {
    sessionSummary: [sentence(c.lessonActivity), sentence(c.learningInsight)].filter(Boolean).join(' '),
    homeworkAssigned: sentence(c.homeworkGiven) || `Complete focused ${subject || 'subject'} practice on ${c.topicCovered || 'this session’s topics'} and review missed questions.`,
    nextSessionPlan: sentence(c.nextFocus),
    riskAlert,
    provider: 'local_fallback',
  }
}
