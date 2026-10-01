import { describe, expect, it } from 'vitest'
import { clipToHours, dayHours, effectiveLockDays, isLockedForTutor, normalizeRanges, rangesContain, weeklyRepeats } from './availability'
import { DEFAULT_SETTINGS } from './settings/defaults'

const NY = 'America/New_York'

describe('availability', () => {
  it('merges and sorts ranges', () => {
    expect(
      normalizeRanges([
        { startMin: 900, endMin: 960 },
        { startMin: 840, endMin: 900 },
        { startMin: 1000, endMin: 990 },
        { startMin: 1080, endMin: 1200 },
      ]),
    ).toEqual([
      { startMin: 840, endMin: 960 },
      { startMin: 1080, endMin: 1200 },
    ])
  })

  it('resolves opening hours from day configs, then the default week', () => {
    expect(dayHours('2026-09-27', DEFAULT_SETTINGS).isOpen).toBe(false) // Sunday
    expect(dayHours('2026-09-30', DEFAULT_SETTINGS)).toEqual({ isOpen: true, openMin: 840, closeMin: 1260 })
    const configs = new Map([['2026-09-30', { isOpen: false, openMin: 840, closeMin: 1260 }]])
    expect(dayHours('2026-09-30', DEFAULT_SETTINGS, configs).isOpen).toBe(false)
  })

  it('clips to opening hours and reports it', () => {
    const r = clipToHours([{ startMin: 600, endMin: 1000 }], { isOpen: true, openMin: 840, closeMin: 1260 })
    expect(r).toEqual({ ranges: [{ startMin: 840, endMin: 1000 }], clipped: true })
  })

  it('checks containment', () => {
    expect(rangesContain([{ startMin: 840, endMin: 1260 }], 960, 1070)).toBe(true)
    expect(rangesContain([{ startMin: 840, endMin: 1000 }], 960, 1070)).toBe(false)
  })

  it('locks days within the window from now', () => {
    const now = new Date('2026-09-30T20:00:00Z') // Wed 4 PM in New York
    expect(isLockedForTutor('2026-10-07', NY, 7, now)).toBe(true) // midnight Oct 7 < Oct 7 4 PM
    expect(isLockedForTutor('2026-10-08', NY, 7, now)).toBe(false)
    expect(isLockedForTutor('2026-09-29', NY, 0, now)).toBe(true) // past days always locked
    expect(isLockedForTutor('2026-10-01', NY, 0, now)).toBe(false)
  })

  it('extends the lock when the lead time blocks', () => {
    expect(effectiveLockDays(DEFAULT_SETTINGS)).toBe(7)
    expect(effectiveLockDays({ availability: { ...DEFAULT_SETTINGS.availability, leadTimeEnforcement: 'block' } })).toBe(14)
  })

  it('repeats weekly', () => {
    expect(weeklyRepeats('2026-09-30', 2)).toEqual(['2026-10-07', '2026-10-14'])
  })
})
