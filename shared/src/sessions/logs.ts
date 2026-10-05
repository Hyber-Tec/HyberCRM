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
  /** `gemini` on logs written before the app stopped naming the AI provider. */
  provider: 'ai' | 'gemini' | 'local_fallback'
}

/** Who submitted a log first, and as which role. */
export interface LogAuthor {
  role: 'tutor' | 'admin'
  email: string
  name: string
  at: unknown
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
  /** The session's subject from the list, if it had one (to match earlier logs). */
  subjectId?: string | null
  /** The session's admin note when the log was submitted. */
  sessionNote?: string
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
  /** Set only when an admin (not the session's tutor) submitted the log first: "entered on behalf of". */
  enteredByAdmin: { email: string; name: string } | null
  /** The first submit. */
  enteredBy?: LogAuthor | null
  /** The latest re-submit (null until the log is edited after submitting). */
  lastEditedBy?: { email: string; name: string; at: unknown } | null
  /** Re-submits after the first. */
  editCount?: number
  updatedAt?: unknown
  updatedBy?: string
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

/** The message shown when submitting fails validation (True Education's wording). */
export function submitError(c: LogContent, dimensions: string[]): string | null {
  const missing = firstMissing(c, dimensions)
  if (!missing) return null
  if (missing === 'Questions Wrong' && c.questionsAttempted && c.questionsWrong != null && c.questionsWrong > c.questionsAttempted) {
    return '“Questions Wrong” can’t be more than Questions Attempted.'
  }
  return `“${missing}” is required before submitting.`
}

/** Which step (1 Session Info … 4 Evaluation) asks for a required field. */
export function stepOfField(label: string): 1 | 2 | 3 | 4 {
  if (['Session Type', 'Topic Covered', 'Homework Status'].includes(label)) return 1
  if (['Material Used', 'Questions Attempted', 'Questions Wrong'].includes(label)) return 2
  if (['Lesson Activity', 'Learning Insight', 'Next Focus', 'Homework Given'].includes(label)) return 3
  return 4
}

/** Every required field still missing, in True Education's order. */
export function allMissing(c: LogContent, dimensions: string[]): string[] {
  const out: string[] = []
  let rest: LogContent = c
  // firstMissing reports one at a time: fill each gap with a dummy value to find the next.
  for (let guard = 0; guard < 20; guard++) {
    const m = firstMissing(rest, dimensions)
    if (!m) break
    out.push(m)
    const fill: Partial<LogContent> = {
      'Session Type': { sessionType: 'Other' },
      'Topic Covered': { topics: ['x'], topicCovered: 'x' },
      'Homework Status': { homeworkStatus: 'x' },
      'Material Used': { materials: [{ label: 'x', url: '', type: 'text' as const }] },
      'Questions Attempted': { questionsAttempted: Math.max(1, rest.questionsWrong ?? 1) },
      'Questions Wrong': { questionsWrong: 0 },
      'Lesson Activity': { lessonActivity: 'x' },
      'Learning Insight': { learningInsight: 'x' },
      'Next Focus': { nextFocus: 'x' },
      'Homework Given': { homeworkGiven: 'x' },
      'Student Flag': { studentFlag: 'on_track' as const },
    }[m] ?? (m.endsWith(' rating') ? { ratings: { ...rest.ratings, [ratingKey(m.slice(0, -' rating'.length))]: 3 } } : {})
    rest = { ...rest, ...fill }
  }
  return out
}

/** The flag the ratings point to (True Education's thresholds); a suggestion only. */
export function suggestFlag(ratings: Record<string, number>): StudentFlag | null {
  const avg = averageRating(ratings)
  if (avg === null) return null
  return avg <= 2 ? 'at_risk' : avg < 3.5 ? 'needs_attention' : 'on_track'
}

export interface LogChange {
  field: string
  label: string
  from: string | number | null
  to: string | number | null
}

const NOTE_FIELDS: [keyof LogContent, string][] = [
  ['lessonActivity', 'Lesson activity'],
  ['learningInsight', 'Learning insight'],
  ['nextFocus', 'Next focus'],
  ['homeworkGiven', 'Homework given'],
]

/** What an edit changed, for the log's history: short values in full, long notes as "edited". */
export function diffLogContent(prev: Partial<LogContent> | null, next: LogContent, dimensions: string[]): LogChange[] {
  if (!prev) return []
  const out: LogChange[] = []
  const short = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v).slice(0, 120))
  const simple: [keyof LogContent, string][] = [
    ['sessionType', 'Session type'],
    ['topicCovered', 'Topic covered'],
    ['homeworkStatus', 'Homework status'],
    ['homeworkComments', 'Homework comments'],
    ['questionsAttempted', 'Questions attempted'],
    ['questionsWrong', 'Questions wrong'],
  ]
  for (const [k, label] of simple) {
    const a = short(prev[k])
    const b = short(next[k])
    if (a !== b) out.push({ field: k, label, from: a, to: b })
  }
  const mats = (m: unknown) => ((m as Material[] | undefined) ?? []).map((x) => x.label).join(', ')
  if (mats(prev.materials) !== mats(next.materials)) out.push({ field: 'materials', label: 'Materials', from: short(mats(prev.materials)), to: short(mats(next.materials)) })
  for (const [k, label] of NOTE_FIELDS) {
    if ((prev[k] ?? '') !== next[k]) out.push({ field: k, label, from: null, to: 'edited' })
  }
  for (const d of dimensions) {
    const a = prev.ratings?.[ratingKey(d)] ?? null
    const b = next.ratings[ratingKey(d)] ?? null
    if (a !== b) out.push({ field: `ratings.${ratingKey(d)}`, label: `${d} rating`, from: a, to: b })
  }
  if ((prev.studentFlag ?? '') !== next.studentFlag) {
    const lab = (f: unknown) => (f ? (FLAG_LABELS[f as StudentFlag] ?? String(f)) : null)
    out.push({ field: 'studentFlag', label: 'Student flag', from: lab(prev.studentFlag), to: lab(next.studentFlag) })
  }
  return out
}

/**
 * Tidies AI or tutor text without losing its shape: line breaks are kept (only
 * extra spaces and blank lines go) and it ends with a full stop.
 */
export function finishText(s: unknown): string {
  const t = String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return t && !/[.!?]$/.test(t) ? `${t}.` : t
}

/** Session statuses a log may be written for (owner: not canceled or no-show). */
export function canLog(status: SessionStatus, allowed: readonly SessionStatus[]): boolean {
  return allowed.includes(status)
}

type SubjectRef = { subjectId?: string | null; subject?: string | null }

/** Whether an earlier log was in the session's subject (by subject ID when both have one, else by name). */
export function sameSubject(log: SubjectRef, session: SubjectRef): boolean {
  if (session.subjectId && log.subjectId) return log.subjectId === session.subjectId
  const name = (session.subject || '').trim().toLowerCase()
  return !!name && (log.subject || '').trim().toLowerCase() === name
}

/** The earlier log to show by default (newest first in `logs`): same subject (by ID, then name), else the newest. */
export function matchingLog<L extends SubjectRef>(logs: readonly L[], session: SubjectRef): L | null {
  if (session.subjectId) {
    const byId = logs.find((l) => l.subjectId === session.subjectId)
    if (byId) return byId
  }
  const name = (session.subject || '').trim().toLowerCase()
  return (name && logs.find((l) => (l.subject || '').trim().toLowerCase() === name)) || logs[0] || null
}

/**
 * A log the tutor still owes (True Education's "Please write your session
 * log."): the session has ended, its status takes a log, and none was submitted.
 * Drafts still count.
 */
export function logIsDue(
  s: { dateKey: DateKey; endMin: number; status: SessionStatus; logStatus?: string | null; isDeleted?: boolean | null },
  today: DateKey,
  nowMin: number,
  allowed: readonly SessionStatus[],
): boolean {
  if (s.isDeleted || s.logStatus === 'submitted' || !canLog(s.status, allowed)) return false
  return s.dateKey < today || (s.dateKey === today && s.endMin <= nowMin)
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
