import { businessRoundedHours } from '../schedule/hours'
import { type LogContent, localLogAi } from '../sessions/logs'
import { type DateKey, addDays, dayEndInstant, toInstant, weekdayOf } from '../time'

/** The weekly plan of the demo student whose progress reports are shown off (Ava Patel). */
const PLAN: { weekday: string; startMin: number; endMin: number; subject: string; tutor: { id: string; name: string }; type: string }[] = [
  { weekday: 'tuesday', startMin: 960, endMin: 1050, subject: 'SAT Math', tutor: { id: 'demo-maya-thompson', name: 'Maya Thompson' }, type: 'SAT' },
  { weekday: 'thursday', startMin: 960, endMin: 1050, subject: 'SAT Math', tutor: { id: 'demo-maya-thompson', name: 'Maya Thompson' }, type: 'SAT' },
  { weekday: 'wednesday', startMin: 1050, endMin: 1140, subject: 'SAT R/W', tutor: { id: 'demo-hannah-becker', name: 'Hannah Becker' }, type: 'SAT' },
  { weekday: 'monday', startMin: 960, endMin: 1020, subject: 'Algebra 2', tutor: { id: 'demo-maya-thompson', name: 'Maya Thompson' }, type: 'School Help' },
]

const MATH = [
  ['Math > Algebra > Linear equations in one variable', 'Linear equations in one variable', 'solving one-variable equations, including ones with fractions'],
  ['Math > Algebra > Linear functions', 'Linear functions', 'reading slope and intercept from tables and graphs'],
  ['Math > Algebra > Systems of two linear equations in two variables', 'Systems of linear equations', 'setting up and solving systems by substitution and elimination'],
  ['Math > Problem-Solving and Data Analysis > Percentages', 'Percentages', 'percent change and percent-of problems in context'],
  ['Math > Advanced Math > Equivalent expressions', 'Equivalent expressions', 'factoring and rewriting quadratic expressions'],
  ['Math > Advanced Math > Nonlinear equations in one variable and systems', 'Quadratic equations', 'solving quadratics by factoring and with the quadratic formula'],
  ['Math > Problem-Solving and Data Analysis > Ratios, rates, proportional relationships, and units', 'Ratios and rates', 'unit conversions and proportional reasoning in word problems'],
  ['Math > Advanced Math > Nonlinear functions', 'Nonlinear functions', 'exponential growth and reading function graphs'],
]
const READING = [
  ['Reading & Writing > Craft and Structure > Words in Context', 'Words in Context', 'using context clues to choose the most precise word'],
  ['Reading & Writing > Standard English Conventions > Boundaries', 'Boundaries', 'punctuation between clauses: commas, semicolons and colons'],
  ['Reading & Writing > Information and Ideas > Central Ideas and Details', 'Central ideas', 'finding the main idea of short passages'],
  ['Reading & Writing > Expression of Ideas > Transitions', 'Transitions', 'choosing transitions that match the logic of the passage'],
]
const ALGEBRA = ['Functions and their graphs', 'Exponent rules', 'Quadratic equations', 'Rational expressions']

/** A small deterministic random generator (the seed must be stable). */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

export interface HistoryDoc {
  path: string
  data: Record<string, unknown>
}

/**
 * About eleven weeks of sessions and submitted logs for Ava, ending three days
 * ago: steady attendance with one missed and one canceled session, homework
 * that improves, accuracy that climbs from the low 60s to the mid 80s, and notes
 * that move through the SAT topics, so her progress reports show every section.
 */
export function avaHistory(o: { base: string; today: DateKey; timezone: string; now: Date; createdBy: string; subjectId: (name: string) => string | null }) {
  const rand = rng(2026)
  const sessions: HistoryDoc[] = []
  const logs: HistoryDoc[] = []
  const days: { dateKey: DateKey; plan: (typeof PLAN)[number] }[] = []
  for (let offset = -78; offset <= -3; offset++) {
    const dateKey = addDays(o.today, offset)
    const wd = weekdayOf(dateKey)
    for (const p of PLAN) {
      // Algebra 2 every other Monday.
      if (p.weekday === wd && !(p.subject === 'Algebra 2' && Math.floor(-offset / 7) % 2 === 1)) days.push({ dateKey, plan: p })
    }
  }
  const total = days.length
  let mathI = 0
  let readI = 0
  let algI = 0
  days.forEach(({ dateKey, plan }, i) => {
    const t = total > 1 ? i / (total - 1) : 1
    const id = `demo-ava-h-${dateKey}-${plan.startMin}`
    // One missed session early on and one canceled one later.
    const status = i === Math.floor(total * 0.3) ? 'no_show' : i === Math.floor(total * 0.72) ? 'canceled' : 'present'
    const logged = status === 'present'
    const len = plan.endMin - plan.startMin
    sessions.push({
      path: `${o.base}/sessions/${id}`,
      data: {
        tutorId: plan.tutor.id,
        tutorName: plan.tutor.name,
        studentId: 'demo-student-ava-patel',
        studentName: 'Ava Patel',
        studentGrade: '10',
        subjectId: o.subjectId(plan.subject),
        subject: plan.subject,
        note: '',
        status,
        dateKey,
        weekday: weekdayOf(dateKey),
        startMin: plan.startMin,
        endMin: plan.endMin,
        startAt: toInstant(dateKey, plan.startMin, o.timezone),
        endAt: toInstant(dateKey, plan.endMin, o.timezone),
        dayEndAt: dayEndInstant(dateKey, o.timezone),
        visualOrder: 0,
        logStatus: logged ? 'submitted' : 'none',
        logSubmittedAt: logged ? toInstant(dateKey, plan.endMin + 20, o.timezone) : null,
        noShowAppliedHours: status === 'no_show' ? businessRoundedHours(len) : null,
        confirmedAt: null,
        confirmedBy: null,
        source: 'seed',
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        createdAt: o.now,
        createdBy: o.createdBy,
        updatedAt: o.now,
        updatedBy: o.createdBy,
      },
    })
    if (!logged) return

    // Progress over the period: accuracy, focus and confidence rise; homework settles.
    const accuracy = Math.round(62 + 23 * t + (rand() - 0.5) * 6)
    const attempted = 20 + Math.floor(rand() * 11)
    const wrong = Math.max(0, Math.round(attempted * (1 - accuracy / 100)))
    const early = t < 0.35
    const homeworkStatus = early ? (['Completed', 'Partially Done', 'Not Done', 'Completed'][i % 4] as string) : rand() < 0.88 ? 'Completed' : 'Partially Done'
    const focus = Math.min(5, Math.max(2, Math.round(3 + 2 * t + (rand() - 0.5))))
    const confidence = Math.min(5, Math.max(2, Math.round(2.6 + 2 * t + (rand() - 0.5))))
    const ratings = { effort: rand() < 0.8 ? 5 : 4, motivation: Math.min(5, 4 + (t > 0.5 && rand() < 0.5 ? 1 : 0)), behavior: 5, focus, confidence }

    let topics: string[] = []
    let topicCovered = ''
    let lessonActivity = ''
    let learningInsight = ''
    let nextFocus = ''
    let homeworkGiven = ''
    let material = ''
    if (plan.subject === 'SAT Math') {
      const [path, name, what] = MATH[Math.min(MATH.length - 1, Math.floor(mathI / 2))]
      const [, nextName] = MATH[Math.min(MATH.length - 1, Math.floor(mathI / 2) + 1)]
      mathI++
      topics = [path]
      topicCovered = path
      lessonActivity = `We focused on ${what}. Ava worked through a ${attempted}-question timed set, then we reviewed every missed question together and redid the hardest two without notes.`
      learningInsight = early
        ? `Ava understands the main steps of ${name.toLowerCase()} but rushes on multi-step problems and skips writing out her work, which leads to small errors.`
        : `Ava now sets up ${name.toLowerCase()} problems on her own and checks her answers. The remaining mistakes come from misreading what the question asks.`
      nextFocus = `${nextName}, plus a short review of ${name.toLowerCase()} to keep it fresh.`
      homeworkGiven = `Practice set on ${name.toLowerCase()} (15 questions) and the error log for today's missed questions.`
      material = ['Bluebook practice test 3', 'SAT Math workbook, chapter 4', 'SAT Math workbook, chapter 5', 'Official SAT question bank'][Math.floor(mathI / 3) % 4]
    } else if (plan.subject === 'SAT R/W') {
      const [path, , what] = READING[readI % READING.length]
      readI++
      topics = [path]
      topicCovered = path
      lessonActivity = `Reading and Writing practice on ${what}. We timed two short modules and talked through why each wrong answer choice fails.`
      learningInsight = early
        ? `Ava reads carefully but runs short on time in the last third of a module; she second-guesses answers she had right.`
        : `Ava's pacing is steadier: she finished the module with a few minutes to spare and trusts her first read more often.`
      nextFocus = `Keep timing every module and add ${READING[readI % READING.length][1].toLowerCase()} questions.`
      homeworkGiven = 'One timed Reading and Writing module in Bluebook, with notes on any question that took more than 90 seconds.'
      material = ['Official SAT question bank', 'Bluebook practice test 3'][readI % 2]
    } else {
      const topic = ALGEBRA[algI % ALGEBRA.length]
      algI++
      topicCovered = topic
      lessonActivity = `Algebra 2 support for her school unit: ${topic.toLowerCase()}. We went over the class notes and worked through textbook problems step by step.`
      learningInsight = `Ava follows the method well once the first example is set up; she is building the habit of checking units and signs.`
      nextFocus = 'Review before the next unit quiz.'
      homeworkGiven = 'Textbook problems from the current section (odd numbers).'
      material = 'Algebra 2 class textbook'
    }

    const content: LogContent = {
      sessionType: plan.type,
      topics,
      topicCovered,
      homeworkStatus,
      homeworkComments: homeworkStatus === 'Completed' ? '' : homeworkStatus === 'Not Done' ? 'Busy week with a school test.' : 'Finished most of the set.',
      materials: [{ label: material, url: '', type: 'text' }],
      questionsAttempted: plan.subject === 'Algebra 2' ? null : attempted,
      questionsWrong: plan.subject === 'Algebra 2' ? null : wrong,
      lessonActivity,
      learningInsight,
      nextFocus,
      homeworkGiven,
      ratings,
      studentFlag: early && homeworkStatus === 'Not Done' ? 'needs_attention' : 'on_track',
    }
    logs.push({
      path: `${o.base}/sessionLogs/${id}`,
      data: {
        sessionId: id,
        ...content,
        accuracyPercent: content.questionsAttempted ? Math.round(((content.questionsAttempted - (content.questionsWrong ?? 0)) / content.questionsAttempted) * 100) : null,
        status: 'submitted',
        submittedAt: toInstant(dateKey, plan.endMin + 20, o.timezone),
        tutorId: plan.tutor.id,
        tutorName: plan.tutor.name,
        studentId: 'demo-student-ava-patel',
        studentName: 'Ava Patel',
        subject: plan.subject,
        subjectId: o.subjectId(plan.subject),
        dateKey,
        startMin: plan.startMin,
        endMin: plan.endMin,
        startAt: toInstant(dateKey, plan.startMin, o.timezone),
        endAt: toInstant(dateKey, plan.endMin, o.timezone),
        usedHours: businessRoundedHours(len),
        ai: localLogAi(content, plan.subject),
        enteredByAdmin: null,
        enteredBy: { role: 'tutor', email: `${plan.tutor.id}@example.com`, name: plan.tutor.name, at: toInstant(dateKey, plan.endMin + 20, o.timezone) },
        createdAt: o.now,
        createdBy: 'seed',
        updatedAt: o.now,
        updatedBy: 'seed',
      },
    })
  })
  return { sessions, logs }
}
