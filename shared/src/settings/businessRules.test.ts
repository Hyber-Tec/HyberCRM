import { describe, expect, it } from 'vitest'
import { DEFAULT_BUSINESS_RULES, earliestPayModelChange, payModelOn, resolveBusinessRules, withPayModelChange } from './businessRules'

describe('business rules', () => {
  it('fills gaps with the defaults and clamps nonsense', () => {
    expect(resolveBusinessRules(undefined)).toEqual(DEFAULT_BUSINESS_RULES)
    const r = resolveBusinessRules({ maxStudentsPerTutor: 0, conferences: { enabled: true, everyHours: -3 } })
    expect(r.maxStudentsPerTutor).toBe(1)
    expect(r.conferences).toEqual({ enabled: true, everyHours: 25 })
    expect(resolveBusinessRules({ maxStudentsPerTutor: 99 }).maxStudentsPerTutor).toBe(6)
  })

  it('finds the pay model in force on a date', () => {
    const r = resolveBusinessRules({
      payModels: [
        { model: 'teaching_only', from: '2026-10-15' },
        { model: 'teaching_admin', from: '2000-01-01' },
      ],
    })
    expect(payModelOn(r, '2026-10-14')).toBe('teaching_admin')
    expect(payModelOn(r, '2026-10-15')).toBe('teaching_only')
    expect(payModelOn(r, '1999-01-01')).toBe('teaching_admin')
  })

  it('switches from a date without touching earlier pay', () => {
    const start = resolveBusinessRules({ payModels: [{ model: 'teaching_admin', from: '2000-01-01' }] })
    const next = withPayModelChange(start, 'teaching_only', '2026-11-01')
    expect(next.payModels).toEqual([
      { model: 'teaching_admin', from: '2000-01-01' },
      { model: 'teaching_only', from: '2026-11-01' },
    ])
    // A later decision replaces a switch scheduled after it.
    const again = withPayModelChange(next, 'teaching_admin', '2026-10-20')
    expect(again.payModels).toEqual([{ model: 'teaching_admin', from: '2000-01-01' }])
    expect(payModelOn(again, '2026-12-01')).toBe('teaching_admin')
  })

  it('starts changes after the last locked pay period', () => {
    expect(earliestPayModelChange('2026-09-30')).toBe('2026-10-01')
    expect(earliestPayModelChange(null)).toBeNull()
  })
})
