import { describe, expect, it } from 'vitest'
import { matchingLog, sameSubject } from './logs'

describe('earlier logs in the same subject', () => {
  const logs = [
    { id: 'c', subjectId: 'sat-r-w', subject: 'SAT R/W' },
    { id: 'b', subjectId: null, subject: 'Algebra 2' },
    { id: 'a', subjectId: 'sat-math', subject: 'SAT Math' },
  ]
  it('matches by subject ID when both have one, else by name', () => {
    expect(sameSubject({ subjectId: 'sat-math', subject: 'Old name' }, { subjectId: 'sat-math', subject: 'SAT Math' })).toBe(true)
    expect(sameSubject({ subjectId: 'sat-r-w', subject: 'SAT Math' }, { subjectId: 'sat-math', subject: 'SAT Math' })).toBe(false)
    expect(sameSubject({ subjectId: null, subject: ' algebra 2 ' }, { subjectId: 'algebra-2', subject: 'Algebra 2' })).toBe(true)
    expect(sameSubject({ subjectId: null, subject: '' }, { subjectId: null, subject: '' })).toBe(false)
  })
  it('shows the newest same-subject log, else the newest log', () => {
    expect(matchingLog(logs, { subjectId: 'sat-math', subject: 'SAT Math' })?.id).toBe('a')
    expect(matchingLog(logs, { subjectId: 'algebra-2', subject: 'Algebra 2' })?.id).toBe('b')
    expect(matchingLog(logs, { subjectId: 'chemistry', subject: 'Chemistry' })?.id).toBe('c')
    expect(matchingLog([], { subjectId: null, subject: 'SAT Math' })).toBeNull()
  })
})
