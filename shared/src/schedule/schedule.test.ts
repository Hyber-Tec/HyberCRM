import { describe, expect, it } from 'vitest'
import { buildDayRows, orderTutors, slotAt } from './dayModel'
import { occursOn, layoutEventLanes, type ScheduleEvent } from './events'
import { businessRoundedHours } from './hours'
import { layoutLanes, peakConcurrency, visibleLaneCount } from './lanes'

const s = (id: string, startMin: number, endMin: number, extra: Partial<{ tutorId: string; status: 'pending' | 'canceled' }> = {}) => ({
  id,
  startMin,
  endMin,
  tutorId: extra.tutorId ?? 't1',
  status: extra.status ?? ('pending' as const),
})

describe('lanes', () => {
  it('stacks overlapping sessions into lanes', () => {
    const lanes = layoutLanes([s('a', 960, 1070), s('b', 960, 1070), s('c', 1080, 1190), s('d', 1000, 1100)], 3)
    expect(lanes.get('a')).toBe(0)
    expect(lanes.get('b')).toBe(1)
    expect(lanes.get('d')).toBe(2)
    expect(lanes.get('c')).toBe(0)
    expect(visibleLaneCount(lanes, 3, true)).toBe(3)
    expect(visibleLaneCount(new Map(), 3, true)).toBe(1)
  })

  it('counts peak concurrency; back-to-back does not overlap', () => {
    const items = [s('a', 960, 1070), s('b', 1070, 1180), s('c', 1000, 1100)]
    expect(peakConcurrency(items, 960, 1180)).toBe(2)
    expect(peakConcurrency(items, 960, 1180, 'c')).toBe(1)
  })
})

describe('slots', () => {
  const segs = [{ startMin: 840, endMin: 1260 }]
  it('defaults to the session length, capped at availability', () => {
    expect(slotAt(segs, [], 960, 110, 3)).toEqual({ ok: true, startMin: 960, endMin: 1070 })
    expect(slotAt(segs, [], 1200, 110, 3)).toEqual({ ok: true, startMin: 1200, endMin: 1260 })
    expect(slotAt(segs, [], 800, 110, 3)).toEqual({ ok: false, reason: 'unavailable' })
  })
  it('shrinks until a seat is free, or reports full', () => {
    const busy = [s('a', 1000, 1100), s('b', 1000, 1100), s('c', 1000, 1100)]
    expect(slotAt(segs, busy, 960, 110, 3)).toEqual({ ok: true, startMin: 960, endMin: 1000 })
    expect(slotAt(segs, busy, 1000, 110, 3)).toEqual({ ok: false, reason: 'full' })
  })
})

describe('day rows', () => {
  const base = {
    dateKey: '2026-10-07',
    today: '2026-10-01',
    hours: { isOpen: true, openMin: 840, closeMin: 1260 },
    maxLanes: 3,
    addEmptyLane: true,
  }
  const tutors = [
    { id: 't1', name: 'A' },
    { id: 't2', name: 'B' },
    { id: 't3', name: 'C' },
  ]
  it('shows tutors with availability or sessions; flags ghosts', () => {
    const rows = buildDayRows({
      ...base,
      tutors,
      availability: (id) => (id === 't1' ? { ranges: [{ startMin: 840, endMin: 1260 }], unavailable: false, hidden: false } : null),
      sessions: [s('x', 960, 1070, { tutorId: 't2' })],
    })
    expect(rows.map((r) => [r.tutor.id, r.isGhost])).toEqual([
      ['t1', false],
      ['t2', true],
    ])
  })
  it('on past days shows only tutors with real sessions', () => {
    const rows = buildDayRows({
      ...base,
      dateKey: '2026-09-28',
      tutors,
      availability: () => ({ ranges: [{ startMin: 840, endMin: 1260 }], unavailable: false, hidden: false }),
      sessions: [s('x', 960, 1070, { tutorId: 't2' }), s('y', 960, 1070, { tutorId: 't3', status: 'canceled' })],
    })
    expect(rows.map((r) => r.tutor.id)).toEqual(['t2'])
  })
  it('keeps sessions of unknown tutors visible', () => {
    const rows = buildDayRows({ ...base, tutors: [], availability: () => null, sessions: [s('x', 960, 1070, { tutorId: 'gone' })] })
    expect(rows[0].tutor.name).toBe('Former tutor')
  })
  it('orders tutors by display order then name', () => {
    expect(orderTutors(tutors, ['t3']).map((t) => t.id)).toEqual(['t3', 't1', 't2'])
  })
})

describe('hours', () => {
  it('follows the business table', () => {
    expect([25, 30, 50, 70, 72, 75, 80, 110, 120, 150, 180].map(businessRoundedHours)).toEqual([0.5, 0.5, 1, 1, 1.5, 2, 1.5, 2, 2, 2.5, 3])
  })
})

describe('events', () => {
  const ev = (recurrence: ScheduleEvent['recurrence']): ScheduleEvent => ({ title: 'X', dateKey: '2026-09-30', startMin: 840, endMin: 900, notes: '', recurrence })
  it('handles one-off and weekly events', () => {
    expect(occursOn(ev(null), '2026-09-30')).toBe(true)
    expect(occursOn(ev(null), '2026-10-01')).toBe(false)
    const weekly = ev({ frequency: 'weekly', interval: 1, weekdays: ['wednesday', 'friday'], monthDay: null, ends: { type: 'never', endDate: null, occurrences: null } })
    expect(occursOn(weekly, '2026-10-02')).toBe(true)
    expect(occursOn(weekly, '2026-10-01')).toBe(false)
    expect(occursOn(weekly, '2026-09-25')).toBe(false)
  })
  it('respects intervals and end limits', () => {
    const biweekly = ev({ frequency: 'weekly', interval: 2, weekdays: [], monthDay: null, ends: { type: 'after', endDate: null, occurrences: 2 } })
    expect(occursOn(biweekly, '2026-10-07')).toBe(false)
    expect(occursOn(biweekly, '2026-10-14')).toBe(true)
    expect(occursOn(biweekly, '2026-10-28')).toBe(false)
    const monthly = ev({ frequency: 'monthly', interval: 1, weekdays: [], monthDay: null, ends: { type: 'on', endDate: '2026-11-30', occurrences: null } })
    expect(occursOn(monthly, '2026-10-30')).toBe(true)
    expect(occursOn(monthly, '2026-12-30')).toBe(false)
  })
  it('lays out event lanes', () => {
    const lanes = layoutEventLanes([
      { id: 'a', startMin: 840, endMin: 900 },
      { id: 'b', startMin: 860, endMin: 920 },
      { id: 'c', startMin: 900, endMin: 960 },
    ])
    expect([lanes.get('a'), lanes.get('b'), lanes.get('c')]).toEqual([0, 1, 0])
  })
})
