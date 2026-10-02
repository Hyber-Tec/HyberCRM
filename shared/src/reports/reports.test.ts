import { describe, expect, it } from 'vitest'
import type { SessionLog } from '../sessions/logs'
import { DEFAULT_SETTINGS } from '../settings/defaults'
import { capWords, checkNarrative, cleanText, sanitizeNarrative } from './check'
import { composeReport } from './compose'
import { type FactsSession, buildReportFacts, homeworkKind, periodLabel, presetPeriod } from './facts'
import { buildReportInput } from './prompt'
import { progressStatus } from './status'
import { templateNarrative } from './template'

const dims = ['Effort', 'Motivation', 'Behavior', 'Focus', 'Confidence']
const rules = DEFAULT_SETTINGS.progressReports.risk

let n = 0
function log(p: Partial<SessionLog> & { dateKey: string }): SessionLog {
  n++
  return {
    sessionId: `s${n}`,
    status: 'submitted',
    submittedAt: null,
    tutorId: 't1',
    tutorName: 'Maya Thompson',
    studentId: 'ava',
    studentName: 'Ava Patel',
    subject: 'SAT Math',
    startMin: 960,
    endMin: 1050,
    startAt: null,
    endAt: null,
    usedHours: 1.5,
    sessionType: 'SAT',
    topics: ['Math > Algebra > Linear functions'],
    topicCovered: 'Math > Algebra > Linear functions',
    homeworkStatus: 'Completed',
    homeworkComments: '',
    materials: [{ label: 'Bluebook practice test 3', url: '', type: 'text' }],
    questionsAttempted: 20,
    questionsWrong: 5,
    accuracyPercent: 75,
    lessonActivity: 'Worked through linear functions.',
    learningInsight: 'Slope is clear now.',
    nextFocus: 'Systems of equations.',
    homeworkGiven: 'Practice set 3.',
    ratings: { effort: 5, motivation: 4, behavior: 5, focus: 4, confidence: 3 },
    studentFlag: 'on_track',
    ai: null,
    enteredByAdmin: null,
    ...p,
  }
}

function session(id: string, dateKey: string, status: FactsSession['status'], over: Partial<FactsSession> = {}): FactsSession {
  return { id, dateKey, startMin: 960, endMin: 1050, endAtMs: Date.parse(`${dateKey}T21:00:00Z`), status, logStatus: 'none', subject: 'SAT Math', tutorName: 'Maya Thompson', ...over }
}

const NOW = Date.parse('2026-10-01T18:00:00Z')
const baseInput = {
  period: { from: '2026-09-01', to: '2026-09-30' },
  nowMs: NOW,
  today: '2026-10-01',
  student: { totalSessionHours: 40, conferenceBaselineHours: 20 },
  upcoming: [{ dateKey: '2026-10-02', startMin: 960, subject: 'SAT Math', tutorName: 'Maya Thompson' }],
  dimensions: dims,
  loggableStatuses: ['pending', 'confirmed', 'present'] as const,
  conference: { enabled: true, everyHours: 25 },
  previous: null,
}

describe('report periods', () => {
  it('labels whole months and ranges', () => {
    expect(periodLabel('2026-09-01', '2026-09-30')).toBe('September 2026')
    expect(periodLabel('2026-09-02', '2026-09-29')).toBe('Sep 2 – 29, 2026')
    expect(periodLabel('2026-09-02', '2026-10-15')).toBe('Sep 2 – Oct 15, 2026')
    expect(periodLabel('2025-12-15', '2026-01-10')).toBe('Dec 15, 2025 – Jan 10, 2026')
  })
  it('turns presets into dates', () => {
    expect(presetPeriod('last_month', '2026-10-01')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(presetPeriod('since_last', '2026-10-15', { lastReportTo: '2026-09-30' })).toEqual({ from: '2026-10-01', to: '2026-10-15' })
    expect(presetPeriod('since_last', '2026-10-15', { firstSession: '2026-09-10' })).toEqual({ from: '2026-09-10', to: '2026-10-15' })
    expect(presetPeriod('last_30', '2026-10-30')).toEqual({ from: '2026-10-01', to: '2026-10-30' })
  })
  it('reads homework statuses by meaning, whatever they are called', () => {
    expect(['Completed', 'Partially Done', 'Not Done', 'Not Assigned', 'Incomplete', 'Done', ''].map(homeworkKind)).toEqual([
      'completed',
      'partial',
      'not_done',
      'not_assigned',
      'not_done',
      'completed',
      null,
    ])
  })
})

describe('report facts', () => {
  const logs = [
    log({ dateKey: '2026-09-02', homeworkStatus: 'Not Done', questionsAttempted: 20, questionsWrong: 8, ratings: { effort: 4, motivation: 3, behavior: 5, focus: 3, confidence: 2 } }),
    log({ dateKey: '2026-09-09', homeworkStatus: 'Partially Done', questionsAttempted: 20, questionsWrong: 6 }),
    log({ dateKey: '2026-09-16', subject: 'Algebra 2', sessionType: 'School Help', topics: [], topicCovered: 'Quadratic equations, Factoring', usedHours: 1 }),
    log({ dateKey: '2026-09-23', questionsAttempted: 20, questionsWrong: 3, ratings: { effort: 5, motivation: 5, behavior: 5, focus: 5, confidence: 4 } }),
    log({ dateKey: '2026-09-30', questionsAttempted: 20, questionsWrong: 2, ratings: { effort: 5, motivation: 5, behavior: 5, focus: 5, confidence: 5 } }),
  ]
  const sessions = [
    ...logs.map((l) => session(l.sessionId, l.dateKey, 'present', { logStatus: 'submitted' })),
    session('missed', '2026-09-12', 'no_show'),
    session('cx', '2026-09-19', 'canceled'),
    session('nolog', '2026-09-26', 'confirmed'),
  ]
  const { facts, series } = buildReportFacts({ ...baseInput, sessions, logs })

  it('counts attendance from logs and session statuses', () => {
    expect(facts.attendance).toEqual({ attended: 5, missed: 1, canceled: 1, unlogged: 1, scheduled: 6, percent: 83 })
    expect(series.map((p) => p.status)).toEqual(['attended', 'attended', 'missed', 'attended', 'canceled', 'attended', 'unlogged', 'attended'])
  })
  it('sums billed hours, by subject with colors', () => {
    expect(facts.hours.total).toBe(7)
    expect(facts.hours.bySubject.map((s) => [s.subject, s.hours])).toEqual([
      ['SAT Math', 6],
      ['Algebra 2', 1],
    ])
    expect(facts.hours.bySubject[0].color).toBe('#2a78d6')
    expect(facts.consistency.weeksInPeriod).toBe(5)
  })
  it('compares the first and second half of the period', () => {
    expect(facts.homework).toMatchObject({ assigned: 5, completed: 3, partial: 1, notDone: 1, percent: 60, firstHalfPercent: 33, secondHalfPercent: 100, change: 'up' })
    const focus = facts.engagement.find((e) => e.key === 'focus')!
    expect(focus.change).toBe('up')
    expect(focus.secondHalf).toBeGreaterThan(focus.firstHalf!)
  })
  it('weights practice accuracy by questions', () => {
    expect(facts.practice).toMatchObject({ attempted: 100, correct: 76, percent: 76, earlyPercent: 68, latePercent: 88, change: 'up', sessions: 5 })
  })
  it('groups SAT paths into areas and splits free-text topics', () => {
    expect(facts.skills[0]).toEqual({ area: 'SAT Math › Algebra', subject: 'SAT Math', skills: [{ name: 'Linear functions', sessions: 4 }] })
    expect(facts.skills[1].skills.map((s) => s.name)).toEqual(['Factoring', 'Quadratic equations'])
    expect(facts.resources[0]).toEqual({ label: 'Bluebook practice test 3', url: '', sessions: 5 })
  })
  it('says what comes next', () => {
    expect(facts.next.session?.dateKey).toBe('2026-10-02')
    expect(facts.conference.hoursUntil).toBe(5)
  })
  it('compares with the previous report', () => {
    const prev = buildReportFacts({ ...baseInput, sessions, logs: logs.slice(0, 2) }).facts
    const now = buildReportFacts({ ...baseInput, sessions, logs, previous: { reportId: 'r1', periodLabel: 'August 2026', facts: prev, goals: ['Finish homework.'] } }).facts
    expect(now.deltas.hours).toBe(4)
    expect(now.previous?.goals).toEqual(['Finish homework.'])
  })
})

describe('progress status', () => {
  const facts = (logs: SessionLog[]) => buildReportFacts({ ...baseInput, sessions: [], logs }).facts
  it('needs two attended sessions', () => {
    const one = [log({ dateKey: '2026-09-02' })]
    expect(progressStatus(facts(one), one, rules).level).toBeNull()
  })
  it('follows the homework and rating thresholds', () => {
    const good = [log({ dateKey: '2026-09-02' }), log({ dateKey: '2026-09-09' })]
    expect(progressStatus(facts(good), good, rules)).toMatchObject({ level: 'on_track', drivers: [] })
    const bad = [log({ dateKey: '2026-09-02', homeworkStatus: 'Not Done' }), log({ dateKey: '2026-09-09', homeworkStatus: 'Not Done' }), log({ dateKey: '2026-09-16' })]
    const s = progressStatus(facts(bad), bad, rules)
    expect(s.level).toBe('at_risk')
    expect(s.drivers[0]).toMatchObject({ code: 'homework', value: 33, threshold: 50 })
  })
  it('counts flagged sessions as a share, or any one (TE)', () => {
    const logs = [1, 2, 3, 4, 5, 6].map((d) => log({ dateKey: `2026-09-0${d}`, studentFlag: d === 2 ? 'at_risk' : 'on_track' }))
    expect(progressStatus(facts(logs), logs, rules).level).toBe('on_track')
    expect(progressStatus(facts(logs), logs, { ...rules, flagRule: 'any' }).level).toBe('at_risk')
    const lastTwo = logs.map((l, i) => ({ ...l, studentFlag: i >= 4 ? ('needs_attention' as const) : ('on_track' as const) }))
    expect(progressStatus(facts(lastTwo), lastTwo, rules).level).toBe('needs_attention')
  })
})

describe('report text', () => {
  const logs = [log({ dateKey: '2026-09-02' }), log({ dateKey: '2026-09-09' }), log({ dateKey: '2026-09-16', homeworkStatus: 'Not Done' })]
  const { facts } = buildReportFacts({ ...baseInput, sessions: [], logs })
  it('writes template text that passes its own checks', () => {
    const t = templateNarrative(facts, 'Ava', 'needs_attention')
    expect(t.overview).toMatch(/^Ava attended all 3 sessions this period, focusing on SAT Math\./)
    expect(t.goals).toHaveLength(3)
    expect(t.strengths.length).toBeGreaterThanOrEqual(2)
    expect(checkNarrative(t, facts, 'needs_attention', 'Ava')).toEqual({})
  })
  it('flags numbers that are not in the facts and words families shouldn’t see', () => {
    const t = { ...templateNarrative(facts, 'Ava', 'on_track'), overview: 'Ava attended 3 sessions and scored 97% thanks to our AI.' }
    const r = checkNarrative(t, facts, 'on_track', 'Ava')
    expect(r.overview?.join(' ')).toMatch(/97/)
    expect(r.overview?.join(' ')).toMatch(/ai/)
    expect(checkNarrative({ ...t, overview: 'We studied Evaluation of Models.' }, { ...facts, skills: [{ area: 'ACT Science', subject: 'ACT', skills: [{ name: 'Evaluation of Models', sessions: 1 }] }] }, 'on_track', 'Ava').overview).toBeUndefined()
  })
  it('cleans AI output', () => {
    expect(cleanText('**Great work!** 🎉')).toBe('Great work.')
    expect(cleanText('- first point')).toBe('First point.'.replace('F', 'f'))
    expect(capWords('One two three. Four five six. Seven.', 4)).toBe('One two three.')
    const s = sanitizeNarrative({ strengths: ['A', 'a', 'B', 'C', 'D', 'E'], goals: [{ goal: 'X', measure: 'Y' }], previousGoals: [{ goal: 'G', status: 'odd', note: 'N' }] })
    expect(s.strengths).toEqual(['A.', 'B.', 'C.', 'D.'])
    expect(s.previousGoals[0].status).toBe('not_yet')
  })
  it('sends the AI first names, facts and notes only', () => {
    const input = buildReportInput({ centerName: 'Demo Academy', period: { from: '2026-09-01', to: '2026-09-30', label: 'September 2026' }, firstName: 'Ava', grade: '10', facts, level: 'at_risk', logs })
    const json = JSON.stringify(input)
    expect(json).not.toMatch(/Patel|Maya|Thompson|tutorName|studentFlag|at_risk/)
    expect(input.facts.status).toBe('needs_support')
    expect(input.sessions).toHaveLength(3)
  })
})

describe('compose', () => {
  it('builds a draft with template text and the branch snapshot', () => {
    const logs = [log({ dateKey: '2026-09-02' }), log({ dateKey: '2026-09-09' })]
    const doc = composeReport({
      branch: { name: 'Demo Academy', logoUrl: null, accentColor: '#1e3a8a', contact: { phone: '', email: '', website: '', address: '' } },
      settings: DEFAULT_SETTINGS,
      conference: { enabled: false, everyHours: 25 },
      student: { id: 'ava', name: 'Ava Patel', firstName: 'Ava', lastName: 'Patel', grade: '10', school: 'Northfield High', totalSessionHours: 30, conferenceBaselineHours: 0 },
      period: { from: '2026-09-01', to: '2026-09-30', preset: 'last_month' },
      sessions: [],
      logs,
      upcoming: [],
      previous: null,
      today: '2026-10-01',
      nowMs: NOW,
      generatedBy: { email: 'admin@x.test', name: 'Grace Liu', role: 'admin', staffId: null },
    })
    expect(doc).toMatchObject({ schemaVersion: 2, status: 'draft', sharedWithParents: false, sessionCount: 2, period: { label: 'September 2026' }, progress: { level: 'on_track' } })
    expect(doc.options.showConference).toBe(false)
    expect(doc.narrativeMeta.sections.overview?.source).toBe('template')
    expect(doc.source.fingerprint).toMatch(/^2-/)
  })
})
