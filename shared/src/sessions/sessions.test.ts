import { describe, expect, it } from 'vitest'
import { accuracy, averageRating, firstMissing, localLogAi, type LogContent, type SessionLog } from './logs'
import { buildMetrics } from './reports'

const dims = ['Effort', 'Motivation', 'Behavior', 'Focus', 'Confidence']
const full: LogContent = {
  sessionType: 'SAT',
  topics: ['Math > Algebra > Linear functions'],
  topicCovered: '',
  homeworkStatus: 'Completed',
  homeworkComments: '',
  materials: [{ label: 'Practice test 4', url: '', type: 'text' }],
  questionsAttempted: 20,
  questionsWrong: 4,
  lessonActivity: 'Worked on linear functions',
  learningInsight: 'Understands slope well',
  nextFocus: 'Systems of equations',
  homeworkGiven: 'Problems 1-20',
  ratings: { effort: 5, motivation: 4, behavior: 5, focus: 4, confidence: 3 },
  studentFlag: 'on_track',
}

describe('session logs', () => {
  it('validates required fields in order', () => {
    expect(firstMissing(full, dims)).toBeNull()
    expect(firstMissing({ ...full, topics: [] }, dims)).toBe('Topic Covered')
    expect(firstMissing({ ...full, questionsWrong: 25 }, dims)).toBe('Questions Wrong')
    expect(firstMissing({ ...full, ratings: { ...full.ratings, focus: 0 } }, dims)).toBe('Focus rating')
  })
  it('computes accuracy and averages', () => {
    expect(accuracy(20, 4)).toBe(80)
    expect(accuracy(0, 0)).toBeNull()
    expect(averageRating(full.ratings)).toBe(4.2)
  })
  it('falls back to deterministic AI text', () => {
    expect(localLogAi({ ...full, studentFlag: 'at_risk' }, 'SAT Math').riskAlert).toMatch(/at risk/)
  })
})

describe('progress report metrics', () => {
  const log = (p: Partial<SessionLog>): SessionLog => ({ ...(full as unknown as SessionLog), subject: 'SAT Math', tutorName: 'Maya', usedHours: 2, ...p })
  it('computes homework rate and risk', () => {
    const risk = { atRiskHomeworkBelow: 50, atRiskFocusBelow: 3, needsAttentionHomeworkBelow: 70, needsAttentionMotivationBelow: 3.5 }
    const m = buildMetrics([log({}), log({ homeworkStatus: 'Not Done' }), log({ homeworkStatus: 'Partially Done' })], dims, risk)
    expect(m.homeworkCompletionRate).toBe(33)
    expect(m.riskLevel).toBe('At Risk')
    expect(m.totalHours).toBe(6)
    const ok = buildMetrics([log({}), log({})], dims, risk)
    expect(ok.riskLevel).toBe('On Track')
  })
})
