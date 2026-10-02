import type { SessionLog } from '../sessions/logs'
import { homeworkKind } from './facts'
import type { NarrativeKey, ProgressLevel, ReportFacts, ReportNarrative } from './types'

/**
 * The system prompt for a report's written sections. The AI writes prose only:
 * every number and the status come from the facts.
 */
export const REPORT_SYSTEM_PROMPT = `You write the narrative sections of a student progress report for a tutoring center. The report is for the student's parents or guardians. A staff member at the center reviews and edits your draft before it is shared, but write every sentence as if it will be printed exactly as you wrote it.

INPUT
You receive one JSON object with these parts:
- report: the center's name, the reporting period and the sections to write.
- student: the student's first name and grade.
- facts: figures the center has already calculated for this period: attendance, tutoring hours, homework, engagement, practice accuracy, skills covered, what comes next and the overall status. These figures are correct and final.
- sessions: the tutors' notes from every session in the period, oldest first. lessonActivity is what was covered, learningInsight is what the student understood or found difficult, nextFocus is what the tutor planned next, homeworkGiven is the homework that was set, and homeworkReviewed is how the previous homework went. Older sessions may carry only a short summary.
- previousReport (optional): the previous period's key figures and the goals that were set then.

ACCURACY
1. Use only information in the input. Never invent or guess scores, grades, test results, school marks, dates, events, quotes, diagnoses or comparisons with other students.
2. Do not calculate anything. When you mention a number, copy it exactly as it appears in facts or previousReport, with its unit (for example "11 of 12 sessions" or "80%"). Use at most two numbers in any section; the report already shows the figures in charts.
3. Support every statement about the student with the facts or the session notes. Prefer the specific topics and skills named in the notes (for example "linear functions" or "comma rules") over general praise.
4. Describe change across the period only when the notes or the comparisons in facts show it (firstHalf and secondHalf, earlyPercent and latePercent, previousReport). If notes disagree, trust the most recent ones.
5. If a section has little to go on, write one or two careful sentences. Never fill space with generic phrases such as "continues to grow" or "is a pleasure to work with".
6. facts.status is the center's overall assessment. Keep your tone consistent with it and never contradict it. For "on_track", be warm and confident. For "needs_attention", be encouraging and name the one or two things to work on. For "needs_support", be candid, kind and focused on the plan. Never write the status words themselves.

VOICE
7. Write for parents in clear, warm, professional US English: short sentences, plain words, no jargon. If a test term is needed, explain it in a few words (for example "Words in Context, the SAT questions about what a word means in a passage").
8. Write as the center ("we", "our tutors") and call the student by first name. Do not use gendered pronouns unless student.pronouns is given; repeat the name or rephrase. Address the parents as "you" only in homeSupport and tutorNote.
9. Present difficulties as next steps, never as faults. Do not blame the student, the family or the tutor.
10. Do not mention how this report was prepared or the tools behind it. Never use the words AI, artificial intelligence, log, flag, risk or rating (except inside a topic name copied from the input), and never quote a score out of 5 or a star count. Turn figures into observations: write "Focus was steady in almost every session", not "Focus averaged 4.2".
11. Protect privacy. Do not repeat sensitive details that may appear in the notes (health, diagnoses, family circumstances, discipline incidents, other people's names). Paraphrase the notes; never quote them.
12. Refer to time naturally ("in early September", "over the last two weeks") instead of listing dates.
13. Plain text only: no Markdown, bullet characters, emojis, headings or exclamation marks. Each list item is one complete sentence of at most 25 words.

SECTIONS
- overview: 3 to 4 sentences, at most 90 words: what the period focused on, the most important progress and the main next step.
- academicProgress: 3 to 5 sentences, at most 130 words: what was covered and what the student can now do better, naming 2 to 4 specific topics or skills from the notes, with growth across the period when the notes show it.
- practice: 1 or 2 sentences on practice accuracy and how it changed, only when facts.practice is present; otherwise "".
- engagement: 2 or 3 sentences on effort, focus, motivation, behavior and confidence, based on facts.engagement and the notes. Name the clearest strength and one habit to build.
- homework: 2 or 3 sentences on homework follow-through, based on facts.homework and homeworkReviewed. If no homework was assigned, say so in one sentence.
- strengths: 2 to 4 items, each a specific strength supported by the notes or the facts.
- focusAreas: 1 to 3 items, each a specific skill or habit to improve, phrased as what we will work on together.
- goals: 3 or 4 goals for the next period. Each goal is specific, achievable within 4 to 8 weeks and tied to a focus area. measure says how progress will be checked in sessions, for example "80% accuracy on timed sets of linear-equation questions". Never promise a test score or a school grade.
- previousGoals: only when previousReport.goals is present, one item per previous goal, copying its text into goal, with status "met", "progress" or "not_yet" and a one-sentence note based on this period's notes. Otherwise an empty list.
- homeSupport: 2 or 3 practical, low-effort things the parents can do at home in the coming weeks, such as a short weekly look at the homework planner. No purchases and no outside services.
- tutorNote: 2 or 3 warm sentences in the tutor's own voice ("I"), addressed to the family, about a specific moment or improvement from the notes. Do not sign it.
If report.sections leaves out a section, return "" or an empty list for it.

EXAMPLE OF THE SPECIFICITY WE WANT
Too vague: "Ava worked hard and continues to improve in math."
Good: "In early September, word problems with linear equations still needed step-by-step help; by the last week, Ava was setting them up without help."

Return only a JSON object that matches the response schema.`

const S = { type: 'STRING' }
const A = { type: 'ARRAY', items: { type: 'STRING' } }

/** The response schema (Gemini's OpenAPI dialect); re-validated by `sanitizeNarrative`. */
export const REPORT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overview: S,
    academicProgress: S,
    practice: S,
    engagement: S,
    homework: S,
    strengths: A,
    focusAreas: A,
    goals: { type: 'ARRAY', items: { type: 'OBJECT', properties: { goal: S, measure: S }, required: ['goal', 'measure'] } },
    previousGoals: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { goal: S, status: { type: 'STRING', enum: ['met', 'progress', 'not_yet'] }, note: S }, required: ['goal', 'status', 'note'] },
    },
    homeSupport: A,
    tutorNote: S,
  },
  required: ['overview', 'academicProgress', 'practice', 'engagement', 'homework', 'strengths', 'focusAreas', 'goals', 'previousGoals', 'homeSupport', 'tutorNote'],
}

/** The schema for regenerating one section. */
export function sectionSchema(key: NarrativeKey) {
  const p = (REPORT_RESPONSE_SCHEMA.properties as Record<string, unknown>)[key]
  return { type: 'OBJECT', properties: { [key]: p }, required: [key] }
}

/** Cuts a note at a sentence boundary near `max` characters. */
function cap(s: string | undefined | null, max: number): string {
  const t = (s ?? '').trim().replace(/\s+/g, ' ')
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '))
  return `${end > max * 0.5 ? cut.slice(0, end + 1) : cut.trimEnd()}…`
}

export interface ReportInputArgs {
  centerName: string
  period: { from: string; to: string; label: string }
  firstName: string
  grade: string
  facts: ReportFacts
  level: ProgressLevel | null
  /** Submitted logs of the period, any order. */
  logs: SessionLog[]
  sections?: NarrativeKey[]
}

/** What the AI gets: names reduced to the first name, no IDs, flags or admin notes (§5.7). */
export function buildReportInput(a: ReportInputArgs) {
  const logs = [...a.logs].sort((x, y) => x.dateKey.localeCompare(y.dateKey) || x.startMin - y.startMin)
  const full = (l: SessionLog) => ({
    date: l.dateKey,
    subject: l.subject || l.sessionType,
    type: l.sessionType,
    topics: l.topics?.length ? l.topics : l.topicCovered ? [l.topicCovered] : [],
    homeworkReviewed: l.homeworkStatus || '',
    homeworkReviewedMeaning: homeworkKind(l.homeworkStatus) ?? '',
    homeworkComments: cap(l.homeworkComments, 200),
    practice: l.questionsAttempted ? { attempted: l.questionsAttempted, accuracyPercent: l.accuracyPercent ?? null } : null,
    lessonActivity: cap(l.lessonActivity, 700),
    learningInsight: cap(l.learningInsight, 700),
    nextFocus: cap(l.nextFocus, 300),
    homeworkGiven: cap(l.homeworkGiven, 200),
  })
  const short = (l: SessionLog) => ({ date: l.dateKey, subject: l.subject || l.sessionType, topics: l.topics?.length ? l.topics : l.topicCovered ? [l.topicCovered] : [], summary: cap(l.ai?.sessionSummary || l.lessonActivity, 300) })
  let sessions: unknown[] = logs.map(full)
  // About 60,000 characters at most: older sessions shrink to a summary (the first 3 and last 15 stay whole).
  if (JSON.stringify(sessions).length > 60_000 && logs.length > 18) {
    sessions = logs.map((l, i) => (i < 3 || i >= logs.length - 15 ? full(l) : short(l)))
  }
  const f = a.facts
  return {
    report: {
      centerName: a.centerName,
      period: a.period,
      language: 'en-US',
      sections: a.sections ?? ['overview', 'academicProgress', 'practice', 'engagement', 'homework', 'strengths', 'focusAreas', 'goals', 'previousGoals', 'homeSupport', 'tutorNote'],
    },
    student: { firstName: a.firstName, grade: a.grade },
    facts: {
      status: a.level === 'at_risk' ? 'needs_support' : (a.level ?? 'not_enough_sessions'),
      attendance: { attended: f.attendance.attended, missed: f.attendance.missed, canceled: f.attendance.canceled, attendedOutOf: f.attendance.scheduled, attendancePercent: f.attendance.percent },
      hours: { total: f.hours.total, bySubject: f.hours.bySubject.map((s) => ({ subject: s.subject, hours: s.hours })), toDate: f.hours.toDate, averageSessionMinutes: f.hours.averageSessionMinutes },
      consistency: f.consistency,
      homework: {
        assigned: f.homework.assigned,
        completed: f.homework.completed,
        partlyDone: f.homework.partial,
        notDone: f.homework.notDone,
        notAssigned: f.homework.notAssigned,
        completionPercent: f.homework.percent,
        firstHalfPercent: f.homework.firstHalfPercent,
        secondHalfPercent: f.homework.secondHalfPercent,
        change: f.homework.change,
      },
      engagement: f.engagement.map((e) => ({ dimension: e.dimension, average: e.average, firstHalf: e.firstHalf, secondHalf: e.secondHalf, change: e.change })),
      practice: f.practice
        ? { questionsAttempted: f.practice.attempted, accuracyPercent: f.practice.percent, earlyPercent: f.practice.earlyPercent, latePercent: f.practice.latePercent, change: f.practice.change }
        : null,
      skillsCovered: f.skills.map((s) => ({ area: s.area, skills: s.skills.map((k) => k.name), sessions: s.skills.reduce((n, k) => Math.max(n, k.sessions), 0) })),
      next: { nextSession: f.next.session?.dateKey ?? null, sessionsBookedNext4Weeks: f.next.bookedNext4Weeks },
    },
    previousReport: f.previous
      ? { period: f.previous.periodLabel, attendancePercent: f.previous.attendancePercent, homeworkPercent: f.previous.homeworkPercent, accuracyPercent: f.previous.accuracyPercent, goals: f.previous.goals }
      : null,
    sessions,
  }
}

/** Instruction for regenerating one section, keeping it consistent with the others. */
export function sectionInstruction(key: NarrativeKey, current: ReportNarrative, hint?: string): string {
  const others = Object.fromEntries(Object.entries(current).filter(([k]) => k !== key))
  return `Rewrite only ${key}. Keep it consistent with these current sections: ${JSON.stringify(others)}.${hint?.trim() ? ` Staff note: ${hint.trim().slice(0, 300)}` : ''}`
}
