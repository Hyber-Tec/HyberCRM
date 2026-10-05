import { describe, expect, it } from 'vitest'
import type { SessionStatus } from '../settings/defaults'
import type { TimestampLike } from '../types'
import { totals } from './segment'
import { priceShifts } from './shifts'

const at = (hhmm: string): TimestampLike => {
  const [h, m] = hhmm.split(':').map(Number)
  const ms = Date.UTC(2026, 8, 30, h, m)
  return { seconds: ms / 1000, nanoseconds: 0, toDate: () => new Date(ms), toMillis: () => ms }
}
const shift = (inAt: string, outAt: string | null, extra: Partial<{ staffId: string; dateKey: string; inMin: number; forcedType: 'teaching' | 'admin' | null }> = {}) => ({
  staffId: 'maya',
  dateKey: '2026-09-30',
  inMin: 0,
  clockInAt: at(inAt),
  clockOutAt: outAt ? at(outAt) : null,
  forcedType: null,
  ...extra,
})
const session = (start: string, end: string, status: SessionStatus = 'present', extra: Partial<{ tutorId: string; isDeleted: boolean }> = {}) => ({
  tutorId: 'maya',
  isDeleted: false,
  status,
  startAt: at(start),
  endAt: at(end),
  ...extra,
})
const settings = { payroll: { teachingSessionStatuses: ['present'] as SessionStatus[], hoursDecimals: 2, payPeriod: { type: 'biweekly' as const, anchorDate: '2026-01-04' } } }
const ratesFor = () => ({ rates: { teaching: 30, admin: 15 }, role: 'tutor' as const })

describe('priceShifts', () => {
  it('splits a closed shift by the sessions that count as teaching', () => {
    const [p] = priceShifts({
      shifts: [shift('15:00', '18:00')],
      sessions: [session('16:00', '17:00'), session('17:00', '17:30', 'confirmed'), session('15:00', '16:00', 'present', { isDeleted: true }), session('15:00', '16:00', 'present', { tutorId: 'other' })],
      settings,
      rules: { payModels: [{ model: 'teaching_admin', from: '2000-01-01' }] },
      ratesFor,
    })
    expect(p.open).toBe(false)
    expect(p.segments.map((s) => [s.type, s.hours, s.pay])).toEqual([
      ['admin', 1, 15],
      ['teaching', 1, 30],
      ['admin', 1, 15],
    ])
    expect(totals(p.segments).total).toEqual({ hours: 3, pay: 60 })
  })

  it('leaves admin time unpaid under Teaching only, from the date the model applies', () => {
    const rules = { payModels: [{ model: 'teaching_admin' as const, from: '2000-01-01' }, { model: 'teaching_only' as const, from: '2026-09-30' }] }
    const [p] = priceShifts({ shifts: [shift('16:00', '18:00')], sessions: [session('16:00', '17:00')], settings, rules, ratesFor })
    expect(totals(p.segments).total).toEqual({ hours: 1, pay: 30 })
  })

  it('lists open shifts without pay, oldest first', () => {
    const out = priceShifts({
      shifts: [shift('16:00', null, { dateKey: '2026-10-01' }), shift('15:00', '16:00', { dateKey: '2026-09-29' })],
      sessions: [],
      settings,
      rules: { payModels: [{ model: 'teaching_admin', from: '2000-01-01' }] },
      ratesFor,
    })
    expect(out.map((p) => [p.shift.dateKey, p.open])).toEqual([
      ['2026-09-29', false],
      ['2026-10-01', true],
    ])
    expect(out[1].segments).toEqual([])
  })
})
