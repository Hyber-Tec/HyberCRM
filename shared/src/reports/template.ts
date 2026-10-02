import type { PreviousGoal, ProgressLevel, ReportFacts, ReportGoal, ReportNarrative } from './types'

const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)

/**
 * A skill or topic name inside a sentence: plain phrases go lower-case
 * ("Linear functions" → "linear functions"); names stay as written
 * ("Words in Context", "Algebra 1 review", "SAT Math").
 */
export function asPhrase(name: string): string {
  const words = name.trim().split(/\s+/)
  const plain = words.length > 0 && /^[A-Z][a-z]/.test(words[0]) && words.slice(1).every((w) => !/[A-Z0-9]/.test(w)) && !/\d/.test(words[0])
  return plain ? lower(name.trim()) : name.trim()
}

/** "a", "a and b", "a, b and c". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** The most-worked skills and topics, most sessions first. */
export function topSkills(facts: ReportFacts, n = 3): string[] {
  return facts.skills
    .flatMap((a) => a.skills.map((s) => ({ name: s.name, sessions: s.sessions })))
    .sort((a, b) => b.sessions - a.sessions)
    .map((s) => s.name)
    .filter((s, i, all) => all.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i)
    .slice(0, n)
}

/**
 * How last period's goals went, judged from this period's figures (used when
 * AI is off; staff can change any of it).
 */
export function judgePreviousGoals(goals: string[], facts: ReportFacts, first: string): PreviousGoal[] {
  return goals.map((goal) => {
    const g = goal.toLowerCase()
    const hw = facts.homework.percent
    const att = facts.attendance
    const pr = facts.practice
    if (/homework/.test(g)) {
      if (hw === null) return { goal, status: 'not_yet', note: 'No homework was assigned this period.' }
      return { goal, status: hw >= 90 ? 'met' : hw >= 70 || (facts.deltas.homework ?? 0) > 0 ? 'progress' : 'not_yet', note: `${first} completed ${facts.homework.completed} of ${facts.homework.assigned} assignments.` }
    }
    if (/attend/.test(g)) {
      if (att.percent === null) return { goal, status: 'not_yet', note: 'There were no sessions this period.' }
      return { goal, status: att.percent === 100 ? 'met' : att.percent >= 90 ? 'progress' : 'not_yet', note: att.missed ? `${first} attended ${att.attended} of ${att.scheduled} sessions.` : `${first} came to every session.` }
    }
    if (/practice|accuracy|missed .*question/.test(g)) {
      if (!pr || pr.percent === null) return { goal, status: 'progress', note: 'There was little timed practice this period.' }
      return { goal, status: pr.change === 'up' || pr.percent >= 85 ? 'met' : pr.percent >= 70 ? 'progress' : 'not_yet', note: pr.change === 'up' ? 'Practice accuracy rose over the period.' : `Practice accuracy was ${pr.percent}%.` }
    }
    const dim = facts.engagement.find((e) => g.includes(e.dimension.toLowerCase()))
    if (dim && dim.average !== null) {
      const name = dim.dimension.toLowerCase()
      return {
        goal,
        status: dim.average >= 4 ? 'met' : dim.change === 'up' ? 'progress' : 'not_yet',
        note: dim.change === 'up' ? `${dim.dimension} grew over the period.` : dim.average >= 4 ? `${dim.dimension} was a strength in sessions.` : `We’ll keep working on ${name}.`,
      }
    }
    return { goal, status: 'progress', note: 'We’ll keep building on this next period.' }
  })
}

interface Focus {
  code: 'dimension' | 'homework' | 'attendance' | 'practice' | 'skill'
  text: string
  goal: ReportGoal
}

/** What to work on next, from the facts (weakest first). */
function focusAreas(facts: ReportFacts, first: string): Focus[] {
  const out: Focus[] = []
  const dims = facts.engagement.filter((e) => e.average !== null).sort((a, b) => (a.average ?? 0) - (b.average ?? 0))
  if (facts.homework.percent !== null && facts.homework.percent < 70) {
    out.push({
      code: 'homework',
      text: 'Finishing homework before each session.',
      goal: { goal: 'Complete every homework assignment before the next session.', measure: 'Homework marked completed at each session.' },
    })
  }
  if (facts.attendance.percent !== null && facts.attendance.percent < 90) {
    out.push({
      code: 'attendance',
      text: 'Attending every scheduled session.',
      goal: { goal: 'Attend every scheduled session.', measure: 'Attendance on the next progress report.' },
    })
  }
  for (const d of dims.filter((e) => (e.average ?? 5) < 3.5).slice(0, 2)) {
    out.push({
      code: 'dimension',
      text: `Building ${lower(d.dimension)} during sessions.`,
      goal: { goal: `Build ${lower(d.dimension)} in every session.`, measure: `Your tutor’s notes on ${lower(d.dimension)} after each session.` },
    })
  }
  if (facts.practice?.percent !== null && facts.practice?.percent !== undefined && facts.practice.percent < 70) {
    out.push({
      code: 'practice',
      text: 'Raising accuracy on practice questions.',
      goal: { goal: 'Review every missed practice question before moving on.', measure: 'Practice accuracy on the next progress report.' },
    })
  }
  const skill = topSkills(facts, 1)[0]
  if (skill) {
    out.push({
      code: 'skill',
      text: `Taking ${asPhrase(skill)} further with more challenging problems.`,
      goal: { goal: `Strengthen ${asPhrase(skill)} with more challenging problems.`, measure: `Accuracy on ${asPhrase(skill)} questions during sessions.` },
    })
  }
  if (out.length === 0) {
    out.push({
      code: 'skill',
      text: `Building on this period’s progress with ${first}’s next topics.`,
      goal: { goal: 'Keep a steady routine of sessions and homework.', measure: 'Attendance and homework on the next progress report.' },
    })
  }
  return out
}

/**
 * The report's written sections without AI: plain, warm sentences built from
 * the facts (used when AI is off or unavailable, and as a safety net).
 */
export function templateNarrative(facts: ReportFacts, firstName: string, level: ProgressLevel | null): ReportNarrative {
  const first = firstName || 'Your child'
  const a = facts.attendance
  const subjects = facts.hours.bySubject.filter((s) => s.subject !== 'Other').map((s) => s.subject)
  const skills = topSkills(facts, 3)
  const focus = focusAreas(facts, first)

  // Overview
  const sessionsPart =
    a.attended === 0
      ? `${first} had no tutoring sessions logged this period.`
      : a.missed === 0
        ? `${first} attended all ${a.attended} session${a.attended === 1 ? '' : 's'} this period${subjects.length ? `, focusing on ${joinList(subjects.slice(0, 3))}` : ''}.`
        : `${first} attended ${a.attended} of ${a.scheduled} sessions this period${subjects.length ? `, focusing on ${joinList(subjects.slice(0, 3))}` : ''}.`
  const levelPart =
    level === 'on_track'
      ? `${first} is making steady progress, and we will keep building on it next period.`
      : level === 'needs_attention'
        ? `Our main focus for the coming weeks is ${lower(focus[0].text).replace(/\.$/, '')}.`
        : level === 'at_risk'
          ? `${first} will benefit from extra support with ${lower(focus[0].text).replace(/\.$/, '')}, and the goals below set out our plan.`
          : 'We will have a fuller picture after a few more sessions.'
  const overview = `${sessionsPart} ${a.attended ? levelPart : ''}`.trim()

  // What we worked on
  const academicProgress = skills.length
    ? `This period we worked on ${joinList(skills.map(asPhrase))}.${subjects.length > 1 ? ` Most sessions focused on ${subjects[0]}.` : ''}`
    : subjects.length
      ? `This period’s sessions covered ${joinList(subjects)}.`
      : ''

  // Practice
  const p = facts.practice
  const practice =
    p && p.percent !== null
      ? `${first} answered ${p.percent}% of ${p.attempted} practice questions correctly${
          p.change === 'up' && p.earlyPercent !== null ? `, up from ${p.earlyPercent}% in the first sessions` : p.change === 'down' && p.earlyPercent !== null ? `, compared with ${p.earlyPercent}% in the first sessions` : ''
        }.`
      : ''

  // Learning habits
  const rated = facts.engagement.filter((e) => e.average !== null).sort((x, y) => (y.average ?? 0) - (x.average ?? 0))
  const grew = facts.engagement.filter((e) => e.change === 'up').map((e) => lower(e.dimension))
  const engagement = rated.length
    ? [
        `${first}’s strongest habit this period was ${lower(rated[0].dimension)}.`,
        grew.length ? `${joinList(grew).replace(/^./, (c) => c.toUpperCase())} grew over the period.` : '',
        (rated[rated.length - 1].average ?? 5) < 3.5 && rated.length > 1 ? `Next, we will work on ${lower(rated[rated.length - 1].dimension)}.` : '',
      ]
        .filter(Boolean)
        .join(' ')
    : ''

  // Homework
  const h = facts.homework
  const homework =
    h.assigned > 0
      ? `${first} completed ${h.completed} of ${h.assigned} homework assignments.${h.change === 'up' ? ' Homework follow-through improved over the period.' : h.change === 'down' ? ' Homework slipped later in the period, so we will keep a closer eye on it.' : ''}`
      : h.notAssigned > 0
        ? 'No homework was assigned this period.'
        : ''

  // Strengths
  const strengths: string[] = []
  if (a.attended >= 3 && a.missed === 0) strengths.push('Came to every scheduled session.')
  else if (a.percent !== null && a.percent >= 95) strengths.push('Attendance was excellent.')
  if (h.percent !== null && h.percent >= 80) strengths.push('Completed homework reliably.')
  for (const d of rated.filter((e) => (e.average ?? 0) >= 4).slice(0, 2)) strengths.push(`${d.dimension} was a clear strength in sessions.`)
  if (p?.change === 'up') strengths.push('Practice accuracy improved over the period.')
  if (strengths.length < 2 && skills[0]) strengths.push(`Worked steadily on ${asPhrase(skills[0])}.`)
  if (strengths.length < 2 && a.attended) strengths.push('Kept a regular tutoring routine.')

  // Goals and home support
  const goals = focus.slice(0, 3).map((f) => f.goal)
  for (const extra of [
    { goal: 'Review missed practice questions at the end of each session.', measure: 'Practice accuracy on the next progress report.' },
    { goal: 'Keep the steady routine of sessions and homework.', measure: 'Attendance and homework on the next progress report.' },
  ]) {
    if (goals.length < 3 && !goals.some((g) => g.goal === extra.goal)) goals.push(extra)
  }
  const homeSupport = [`Ask ${first} to show you one problem from each session.`, `Set a regular time for homework before each session.`]
  if (a.percent !== null && a.percent < 90) homeSupport.push(`Keep tutoring days clear so ${first} can attend every session.`)

  return {
    overview,
    academicProgress,
    practice,
    engagement,
    homework,
    strengths: strengths.slice(0, 4),
    focusAreas: focus.slice(0, 3).map((f) => f.text),
    goals: goals.slice(0, 3),
    previousGoals: judgePreviousGoals(facts.previous?.goals ?? [], facts, first),
    homeSupport: homeSupport.slice(0, 3),
    tutorNote: '',
  }
}
