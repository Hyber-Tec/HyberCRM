import { describe, expect, it } from 'vitest'
import { type SessionSnapshot, sessionChangeNotices, sessionCreatedNotices } from './notify'

const NOW = Date.parse('2026-09-30T16:00:00Z') // noon in New York
const ctx = { now: NOW, today: '2026-09-30', windowHours: 24 }
const s = (extra: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  tutorId: 'maya',
  studentName: 'Ava Patel',
  subject: 'Algebra 2',
  status: 'confirmed',
  dateKey: '2026-09-30',
  startMin: 960,
  endMin: 1070,
  startMs: Date.parse('2026-09-30T20:00:00Z'),
  isDeleted: false,
  ...extra,
})
// 10:00 AM tomorrow is 22 hours away (inside the 24-hour window).
const tomorrow = { dateKey: '2026-10-01', startMin: 600, endMin: 710, startMs: Date.parse('2026-10-01T14:00:00Z') }
const nextWeek = { dateKey: '2026-10-07', startMs: Date.parse('2026-10-07T20:00:00Z') }

describe('session notifications', () => {
  it('confirms new sessions inside the window only', () => {
    expect(sessionCreatedNotices(s({ status: 'pending' }), ctx)[0]).toMatchObject({
      type: 'session_created',
      body: 'Ava Patel on today at 4:00 PM – 5:50 PM has been confirmed.',
    })
    expect(sessionCreatedNotices(s(tomorrow), ctx)[0].body).toBe('Ava Patel on Thu, 10/1 at 10:00 AM – 11:50 AM has been confirmed.')
    expect(sessionCreatedNotices(s(nextWeek), ctx)).toEqual([])
    expect(sessionCreatedNotices(s({ status: 'canceled' }), ctx)).toEqual([])
  })

  it('alerts cancellations of confirmed sessions and their corrections', () => {
    expect(sessionChangeNotices(s(), s({ status: 'canceled' }), ctx)[0]).toMatchObject({ type: 'session_canceled', body: 'Ava Patel’s 4:00 PM session today is canceled.' })
    expect(sessionChangeNotices(s({ status: 'pending' }), s({ status: 'canceled' }), ctx)).toEqual([])
    expect(sessionChangeNotices(s({ status: 'canceled', ...tomorrow }), s({ status: 'confirmed', ...tomorrow }), ctx)[0].body).toBe(
      'Correction: Ava Patel on Thu, 10/1 is NOT canceled. Status: Confirmed.',
    )
  })

  it('notifies both tutors on reassignment and nothing else', () => {
    const out = sessionChangeNotices(s(), s({ tutorId: 'daniel', startMin: 1000 }), ctx)
    expect(out.map((n) => [n.staffId, n.type])).toEqual([
      ['maya', 'session_reassigned_out'],
      ['daniel', 'session_reassigned_in'],
    ])
  })

  it('picks one change in TE order: no-show, date, time, subject', () => {
    expect(sessionChangeNotices(s(), s({ status: 'no_show', subject: 'Geometry' }), ctx)[0].type).toBe('session_no_show')
    expect(sessionChangeNotices(s(), s({ ...tomorrow, subject: 'Geometry' }), ctx)[0].body).toBe(
      "Ava Patel's session moved from Wed, 9/30 to Thu, 10/1 at 10:00 AM – 11:50 AM.",
    )
    expect(sessionChangeNotices(s(), s({ startMin: 990, endMin: 1100 }), ctx)[0].body).toBe(
      "Ava Patel's session on Wed, 9/30: 4:00 PM – 5:50 PM → 4:30 PM – 6:20 PM.",
    )
    expect(sessionChangeNotices(s(), s({ subject: 'Geometry' }), ctx)[0].type).toBe('session_subject_changed')
  })

  it('stays quiet for tentative, silent or far-away changes', () => {
    expect(sessionChangeNotices(s({ status: 'pending' }), s({ status: 'pending', startMin: 1000 }), ctx)).toEqual([])
    expect(sessionChangeNotices(s({ status: 'pending' }), s(), ctx)).toEqual([])
    expect(sessionChangeNotices(s(), s({ status: 'present' }), ctx)).toEqual([])
    expect(sessionChangeNotices(s(nextWeek), s({ ...nextWeek, startMin: 1000 }), ctx)).toEqual([])
  })

  it('tells the tutor when a confirmed session is trashed or restored', () => {
    expect(sessionChangeNotices(s(), s({ isDeleted: true }), ctx)[0].type).toBe('session_deleted')
    expect(sessionChangeNotices(s({ isDeleted: true }), s(), ctx)[0].type).toBe('session_restored')
    expect(sessionChangeNotices(s({ status: 'pending' }), s({ status: 'pending', isDeleted: true }), ctx)).toEqual([])
  })
})
