import { describe, expect, it } from 'vitest'
import { accuracy, allMissing, averageRating, diffLogContent, finishText, firstMissing, localLogAi, type LogContent, stepOfField, submitError, suggestFlag } from './logs'

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
  it('explains a wrong count above the attempted count', () => {
    expect(submitError(full, dims)).toBeNull()
    expect(submitError({ ...full, questionsWrong: 25 }, dims)).toBe('“Questions Wrong” can’t be more than Questions Attempted.')
    expect(submitError({ ...full, nextFocus: ' ' }, dims)).toBe('“Next Focus” is required before submitting.')
  })
  it('lists every missing field and the step it belongs to', () => {
    const empty: LogContent = { ...full, sessionType: '', topics: [], homeworkStatus: '', materials: [], questionsAttempted: null, questionsWrong: null, lessonActivity: '', learningInsight: '', nextFocus: '', homeworkGiven: '', ratings: {}, studentFlag: '' }
    const missing = allMissing(empty, dims)
    expect(missing).toHaveLength(16)
    expect(missing.slice(0, 3)).toEqual(['Session Type', 'Topic Covered', 'Homework Status'])
    expect(missing.at(-1)).toBe('Student Flag')
    expect(allMissing(full, dims)).toEqual([])
    expect(['Material Used', 'Lesson Activity', 'Effort rating'].map(stepOfField)).toEqual([2, 3, 4])
  })
  it('suggests a flag from the ratings', () => {
    expect(suggestFlag({})).toBeNull()
    expect(suggestFlag({ a: 2, b: 2 })).toBe('at_risk')
    expect(suggestFlag({ a: 3, b: 3 })).toBe('needs_attention')
    expect(suggestFlag(full.ratings)).toBe('on_track')
  })
  it('keeps line breaks when tidying text', () => {
    expect(finishText('First line  \r\n- point one\n\n\n\nLast   words')).toBe('First line\n- point one\n\nLast words.')
    expect(finishText('Done!')).toBe('Done!')
    expect(finishText('')).toBe('')
  })
  it('lists what an edit changed', () => {
    expect(diffLogContent(null, full, dims)).toEqual([])
    const changes = diffLogContent(full, { ...full, homeworkStatus: 'Not Done', lessonActivity: 'Rewritten', ratings: { ...full.ratings, focus: 5 }, studentFlag: 'needs_attention' }, dims)
    expect(changes).toEqual([
      { field: 'homeworkStatus', label: 'Homework status', from: 'Completed', to: 'Not Done' },
      { field: 'lessonActivity', label: 'Lesson activity', from: null, to: 'edited' },
      { field: 'ratings.focus', label: 'Focus rating', from: 4, to: 5 },
      { field: 'studentFlag', label: 'Student flag', from: 'On Track', to: 'Needs Attention' },
    ])
  })
})
