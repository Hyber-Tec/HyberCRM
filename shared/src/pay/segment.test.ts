import { describe, expect, it } from 'vitest'
import { recentPeriods, periodContaining } from './periods'
import { payModelFor, priceShift, segmentShift, totals } from './segment'

const T = (hhmm: string) => {
  const [h, m, s = '0'] = hhmm.split(':')
  return Date.UTC(2026, 8, 30, Number(h), Number(m), Number(s))
}
const iv = (a: string, b: string) => ({ startMs: T(a), endMs: T(b) })
const rates = { teaching: 35, admin: 20 }
const price = (shift: ReturnType<typeof iv>, windows: ReturnType<typeof iv>[]) => priceShift(shift, windows, rates, 'teaching_admin')

describe('pay segmentation (True Education worked examples)', () => {
  it('Ex1 typical day', () => {
    const segs = price(iv('15:30', '22:15'), [iv('16:00', '17:50'), iv('18:00', '19:55')])
    expect(segs.map((s) => [s.type, s.hours, s.pay])).toEqual([
      ['admin', 0.5, 10],
      ['teaching', 1.83, 64.05],
      ['admin', 0.17, 3.4],
      ['teaching', 1.92, 67.2],
      ['admin', 2.33, 46.6],
    ])
    expect(totals(segs).total).toEqual({ hours: 6.75, pay: 191.25 })
  })

  it('Ex2 simultaneous students count once', () => {
    const segs = price(iv('17:30', '20:30'), [iv('18:00', '19:55'), iv('18:00', '19:50'), iv('19:40', '20:10')])
    expect(segs.map((s) => [s.type, s.hours, s.pay])).toEqual([
      ['admin', 0.5, 10],
      ['teaching', 2.17, 75.95],
      ['admin', 0.33, 6.6],
    ])
    expect(totals(segs).total.pay).toBe(92.55)
  })

  it('Ex3 touching windows merge, late clock-in clips', () => {
    const segs = price(iv('16:10', '18:00'), [iv('16:00', '17:00'), iv('17:00', '18:00')])
    expect(segs.map((s) => [s.type, s.hours, s.pay])).toEqual([['teaching', 1.83, 64.05]])
  })

  it('Ex4 no sessions is all admin', () => {
    expect(price(iv('14:00', '16:00'), []).map((s) => [s.type, s.hours, s.pay])).toEqual([['admin', 2, 40]])
  })

  it('Ex6 seconds', () => {
    expect(price(iv('15:59:40', '17:00'), [iv('16:00', '17:00')]).map((s) => [s.type, s.hours, s.pay])).toEqual([
      ['admin', 0.01, 0.2],
      ['teaching', 1, 35],
    ])
  })

  it('single rate and forced types', () => {
    expect(priceShift(iv('14:00', '16:00'), [iv('14:00', '15:00')], rates, 'single_rate').map((s) => [s.type, s.pay])).toEqual([['admin', 40]])
    expect(priceShift(iv('14:00', '16:00'), [], rates, 'teaching_admin', 'teaching').map((s) => [s.type, s.pay])).toEqual([['teaching', 70]])
  })

  it('teaching only pays the teaching time and leaves the rest unpaid', () => {
    const segs = priceShift(iv('15:30', '22:15'), [iv('16:00', '17:50'), iv('18:00', '19:55')], rates, 'teaching_only')
    expect(segs.map((s) => [s.type, s.hours, s.pay, s.unpaid ?? false])).toEqual([
      ['admin', 0.5, 0, true],
      ['teaching', 1.83, 64.05, false],
      ['admin', 0.17, 0, true],
      ['teaching', 1.92, 67.2, false],
      ['admin', 2.33, 0, true],
    ])
    expect(totals(segs).total).toEqual({ hours: 3.75, pay: 131.25 })
    expect(priceShift(iv('14:00', '16:00'), [], rates, 'teaching_only', 'admin')[0].pay).toBe(0)
  })

  it('owners and admins are paid one rate whatever the branch model', () => {
    expect(payModelFor({ role: 'admin', branchModel: 'teaching_only' })).toBe('single_rate')
    expect(payModelFor({ role: 'owner', branchModel: 'teaching_admin' })).toBe('single_rate')
    expect(payModelFor({ role: 'tutor', branchModel: 'teaching_only' })).toBe('teaching_only')
  })

  it('handles empty shifts', () => {
    expect(segmentShift(iv('16:00', '16:00'), [])).toEqual([])
  })
})

describe('pay periods', () => {
  it('computes weekly and biweekly periods from an anchor', () => {
    expect(periodContaining('2026-10-01', 'weekly', '2026-01-04')).toEqual({ start: '2026-09-27', end: '2026-10-03' })
    expect(periodContaining('2026-10-01', 'biweekly', '2026-01-04')).toEqual({ start: '2026-09-27', end: '2026-10-10' })
  })
  it('computes semi-monthly and monthly periods', () => {
    expect(periodContaining('2026-10-01', 'semimonthly', '2026-01-04')).toEqual({ start: '2026-10-01', end: '2026-10-15' })
    expect(periodContaining('2026-10-20', 'semimonthly', '2026-01-04')).toEqual({ start: '2026-10-16', end: '2026-10-31' })
    expect(periodContaining('2026-02-10', 'monthly', '2026-01-04')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })
  it('lists recent periods newest first', () => {
    expect(recentPeriods('2026-10-01', 'semimonthly', '2026-01-04', 3).map((p) => p.start)).toEqual(['2026-10-01', '2026-09-16', '2026-09-01'])
  })
})
