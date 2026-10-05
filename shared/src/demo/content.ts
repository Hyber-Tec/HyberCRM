import type { LogContent } from '../sessions/logs'
import { ACT_TOPICS, SAT_PSAT_TOPICS } from '../sessions/topics'

/** What sample tutors write in their session logs. */
const ACTIVITIES = [
  'Reviewed last week’s homework, then worked through a timed practice set',
  'Introduced the new unit with worked examples and guided practice',
  'Focused on error analysis from the practice test and redid missed questions',
  'Built fluency with mixed review problems and short quizzes',
]
const INSIGHTS = [
  'Understands the core concepts but rushes on multi-step problems',
  'Strong on fundamentals; needs more practice applying them to word problems',
  'Confidence is growing; still hesitant to show full work',
  'Made clear progress since last session and asked good questions',
]
const FOCUS_NEXT = ['Timed practice on the weakest topic', 'Review mistakes and start the next unit', 'Mixed review before the upcoming test', 'Word problems and showing full work']
const HOMEWORK_GIVEN = ['Practice set 3 (20 questions)', 'Finish the worksheet and review the notes', 'Two timed sections and an error log', 'Textbook problems 1–25 (odd)']

/**
 * A believable session log for a subject, drawn from `rand` (the sample data's
 * logs: session type from the subject, SAT/ACT topics, practice numbers,
 * ratings and the flag they point to). The draw order is fixed, so a seeded
 * `rand` always gives the same log.
 */
export function demoLogContent(subject: string, rand: () => number): LogContent {
  const lp = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]
  const sessionType = /PSAT/.test(subject) ? 'PSAT' : /SAT/.test(subject) ? 'SAT' : /ACT/.test(subject) ? 'ACT' : lp(['School Help', 'Skill Building', 'Homework Support'])
  let topics: string[] = []
  if (sessionType === 'SAT' || sessionType === 'PSAT') {
    const section = /R\/W|Reading|Writing/.test(subject) ? 'Reading & Writing' : 'Math'
    const domain = lp(Object.keys(SAT_PSAT_TOPICS[section]))
    topics = [`${section} > ${domain} > ${lp(SAT_PSAT_TOPICS[section][domain])}`]
  } else if (sessionType === 'ACT') {
    const sub = /English/.test(subject) ? 'English' : /Science/.test(subject) ? 'Science' : 'Math'
    topics = [`${sub} > ${lp(ACT_TOPICS[sub])}`]
  }
  const attempted = 10 + Math.floor(rand() * 21)
  const wrong = Math.floor(rand() * Math.min(10, attempted))
  const score = 3 + Math.floor(rand() * 3)
  const ratings = { effort: Math.min(5, score + (rand() < 0.3 ? 1 : 0)), motivation: score, behavior: Math.min(5, score + 1), focus: Math.max(2, score - (rand() < 0.3 ? 1 : 0)), confidence: score }
  const avg = Object.values(ratings).reduce((a, b) => a + b, 0) / 5
  return {
    sessionType,
    topics,
    topicCovered: topics.length ? topics.join('; ') : `${subject} review`,
    homeworkStatus: lp(['Completed', 'Completed', 'Completed', 'Partially Done', 'Not Done', 'Not Assigned']),
    homeworkComments: '',
    materials: [{ label: lp(['Official practice test', 'Workbook chapter review', 'Class notes', 'Khan Academy unit quiz']), url: '', type: 'text' }],
    questionsAttempted: attempted,
    questionsWrong: wrong,
    lessonActivity: lp(ACTIVITIES),
    learningInsight: lp(INSIGHTS),
    nextFocus: lp(FOCUS_NEXT),
    homeworkGiven: lp(HOMEWORK_GIVEN),
    ratings,
    studentFlag: avg >= 3.8 ? 'on_track' : avg >= 3 ? 'needs_attention' : 'at_risk',
  }
}
