import { describe, expect, it } from 'vitest'
import { type FirstSessionCandidate, type FirstSessionStudent, isFirstSession } from './firstSession'

const NEW: FirstSessionStudent = { status: 'signed_up', firstSessionDate: null, lastSessionDate: null, totalSessionHours: 0 }

function s(id: string, dateKey: string, over: Partial<FirstSessionCandidate> = {}): FirstSessionCandidate {
  return { id, studentId: 'ava', dateKey, startMin: 16 * 60, status: 'confirmed', ...over }
}

describe('isFirstSession', () => {
  it('marks the earliest live session of a student without history', () => {
    const known = [s('a', '2026-10-05'), s('b', '2026-10-07')]
    expect(isFirstSession(known[0], NEW, known)).toBe(true)
    expect(isFirstSession(known[1], NEW, known)).toBe(false)
  })

  it('skips canceled and deleted sessions when finding the first', () => {
    const known = [s('a', '2026-10-05', { status: 'canceled' }), s('b', '2026-10-06', { isDeleted: true }), s('c', '2026-10-07')]
    expect(isFirstSession(known[2], NEW, known)).toBe(true)
    expect(isFirstSession(known[0], NEW, known)).toBe(false)
  })

  it('orders by start time on the same day, and works when the list leaves the session out', () => {
    const early = s('a', '2026-10-05', { startMin: 15 * 60 })
    const late = s('b', '2026-10-05', { startMin: 17 * 60 })
    expect(isFirstSession(late, NEW, [early])).toBe(false)
    expect(isFirstSession(early, NEW, [late])).toBe(true)
  })

  it('never marks a student who already has history or has stopped coming', () => {
    const one = s('a', '2026-10-05')
    expect(isFirstSession(one, { ...NEW, lastSessionDate: '2026-09-30' }, [one])).toBe(false)
    expect(isFirstSession(one, { ...NEW, totalSessionHours: 1.5 }, [one])).toBe(false)
    expect(isFirstSession(one, { ...NEW, status: 'finished' }, [one])).toBe(false)
  })

  it('uses the recorded first-session date when there is one', () => {
    const student = { ...NEW, firstSessionDate: '2026-10-07' }
    expect(isFirstSession(s('a', '2026-10-05'), student, [])).toBe(false)
    expect(isFirstSession(s('b', '2026-10-07'), student, [])).toBe(true)
  })
})
