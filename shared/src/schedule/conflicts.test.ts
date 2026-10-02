import { describe, expect, it } from 'vitest'
import { type ConflictContext, type ConflictSession, isAhead, sessionConflicts, staffTutorState, tutorConflictText } from './conflicts'

const OPEN = { isOpen: true, openMin: 14 * 60, closeMin: 21 * 60 }

function session(over: Partial<ConflictSession> = {}): ConflictSession {
  return {
    id: 's1',
    tutorId: 'priya',
    tutorName: 'Priya Raman',
    studentId: 'chloe',
    studentName: 'Chloe Chen',
    dateKey: '2026-10-02',
    startMin: 15 * 60,
    endMin: 16 * 60,
    status: 'confirmed',
    logStatus: 'none',
    isDeleted: false,
    ...over,
  }
}

function ctx(over: Partial<ConflictContext> = {}): ConflictContext {
  return {
    hours: OPEN,
    availability: { ranges: [{ startMin: 14 * 60, endMin: 18 * 60 }], unavailable: false },
    tutorState: 'active',
    studentStatus: 'enrolled',
    tutorSessions: [],
    studentSessions: [],
    maxPerTutor: 2,
    ...over,
  }
}

const kinds = (s: ConflictSession, c: ConflictContext) => sessionConflicts(s, c).map((x) => x.kind)

describe('session conflicts', () => {
  it('has none when the tutor is available and nothing else clashes', () => {
    expect(kinds(session(), ctx())).toEqual([])
  })

  it('flags a tutor with no availability that day', () => {
    expect(kinds(session(), ctx({ availability: null }))).toEqual(['tutor_unavailable'])
    expect(kinds(session(), ctx({ availability: { ranges: [{ startMin: 840, endMin: 1080 }], unavailable: true } }))).toEqual(['tutor_unavailable'])
    expect(sessionConflicts(session(), ctx({ availability: null }))[0].message).toBe('Priya Raman isn’t available that day.')
  })

  it('flags availability that covers only part of the session', () => {
    const c = ctx({ availability: { ranges: [{ startMin: 14 * 60, endMin: 15 * 60 + 30 }], unavailable: false } })
    expect(sessionConflicts(session(), c)).toEqual([{ kind: 'tutor_unavailable', message: 'Priya Raman is only available 2:00 PM to 3:30 PM.' }])
  })

  it('reads availability through that date’s opening hours', () => {
    // Saved 2–6 PM, but the center opens at 3:30 PM that day: 3–4 PM is no longer covered.
    const hours = { isOpen: true, openMin: 15 * 60 + 30, closeMin: 21 * 60 }
    expect(kinds(session(), ctx({ hours }))).toEqual(['outside_hours', 'tutor_unavailable'])
  })

  it('flags closed days and sessions outside opening hours', () => {
    expect(kinds(session(), ctx({ hours: { isOpen: false, openMin: 0, closeMin: 0 } }))).toEqual(['center_closed'])
    expect(kinds(session({ startMin: 20 * 60, endMin: 21 * 60 + 30 }), ctx({ availability: { ranges: [{ startMin: 840, endMin: 1320 }], unavailable: false } }))).toEqual([
      'outside_hours',
      'tutor_unavailable',
    ])
  })

  it('flags tutors who are on hold, left, paused or removed', () => {
    for (const state of ['on_hold', 'left', 'paused', 'removed'] as const) {
      expect(kinds(session(), ctx({ tutorState: state }))).toEqual(['tutor_inactive'])
    }
    expect(staffTutorState('active', true)).toBe('active')
    expect(staffTutorState('active', false)).toBe('paused')
    expect(staffTutorState('on_hold', true)).toBe('on_hold')
    expect(staffTutorState('finished', true)).toBe('left')
    expect(staffTutorState(null, null)).toBe('removed')
  })

  it('flags more students at once than the branch allows', () => {
    const others = [session({ id: 's2', studentId: 'a' }), session({ id: 's3', studentId: 'b' })]
    expect(kinds(session(), ctx({ tutorSessions: others }))).toEqual(['over_capacity'])
    expect(kinds(session(), ctx({ tutorSessions: others.slice(0, 1) }))).toEqual([])
    // Canceled sessions don't take a seat.
    expect(kinds(session(), ctx({ tutorSessions: [...others.slice(0, 1), session({ id: 's3', studentId: 'b', status: 'canceled' })] }))).toEqual([])
  })

  it('flags a student booked twice at the same time', () => {
    const other = session({ id: 's9', tutorId: 'lucas', tutorName: 'Lucas Ortega', startMin: 15 * 60 + 30, endMin: 17 * 60 })
    expect(sessionConflicts(session(), ctx({ studentSessions: [other] }))).toEqual([
      { kind: 'student_double_booked', message: 'Chloe Chen also has a session with Lucas Ortega at 3:30 PM.' },
    ])
    expect(kinds(session(), ctx({ studentSessions: [{ ...other, startMin: 16 * 60, endMin: 17 * 60 }] }))).toEqual([])
  })

  it('flags students who are paused or no longer coming', () => {
    expect(kinds(session(), ctx({ studentStatus: 'paused' }))).toEqual(['student_inactive'])
    expect(kinds(session(), ctx({ studentStatus: 'signed_up' }))).toEqual([])
  })

  it('ignores sessions that are canceled, no-shows, attended, logged or deleted', () => {
    const c = ctx({ availability: null })
    for (const over of [{ status: 'canceled' }, { status: 'no_show' }, { status: 'present' }, { logStatus: 'submitted' }, { isDeleted: true }] as const) {
      expect(kinds(session(over), c)).toEqual([])
    }
    expect(kinds(session({ status: 'pending' }), c)).toEqual(['tutor_unavailable'])
  })

  it('knows which sessions are still ahead', () => {
    expect(isAhead(session({ dateKey: '2026-10-02', endMin: 900 }), '2026-10-02', 899)).toBe(true)
    expect(isAhead(session({ dateKey: '2026-10-02', endMin: 900 }), '2026-10-02', 900)).toBe(false)
    expect(isAhead(session({ dateKey: '2026-10-03' }), '2026-10-02', 1400)).toBe(true)
  })

  it('tells the tutor the session is waiting for the admin', () => {
    expect(tutorConflictText([])).toBeNull()
    expect(tutorConflictText(sessionConflicts(session(), ctx({ availability: null })))).toBe(
      'You’re not available at this time. Waiting for the admin to move, reassign or cancel it.',
    )
  })
})
