import { describe, expect, it } from 'vitest'
import { availabilityGaps, clipToHours, dayHours, effectiveLockDays, effectiveRanges, isLockedForTutor, normalizeRanges, rangesContain, weeklyRepeats, fitRangesToDay } from './availability'
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

describe('availability that counts on a date', () => {
  it('clips saved ranges to the date’s hours', () => {
    expect(effectiveRanges([{ startMin: 840, endMin: 1080 }], { isOpen: true, openMin: 960, closeMin: 1260 })).toEqual([{ startMin: 960, endMin: 1080 }])
  })
  it('drops ranges entirely outside the hours', () => {
    expect(effectiveRanges([{ startMin: 600, endMin: 720 }], { isOpen: true, openMin: 840, closeMin: 1260 })).toEqual([])
  })
  it('counts nothing on a closed day', () => {
    expect(effectiveRanges([{ startMin: 840, endMin: 1260 }], { isOpen: false, openMin: 840, closeMin: 1260 })).toEqual([])
  })
})

describe('fitting availability to opening hours', () => {
  const open = { isOpen: true, openMin: 840, closeMin: 1260 }
  const opts = { minBlockMinutes: 30, maxRangesPerDay: 2 }
  it('keeps ranges inside the hours and merges touching ones', () => {
    expect(fitRangesToDay([{ startMin: 900, endMin: 1000 }, { startMin: 1000, endMin: 1100 }], open, opts)).toEqual({
      ok: true,
      ranges: [{ startMin: 900, endMin: 1100 }],
      trimmed: false,
    })
  })
  it('trims to the hours and drops slivers', () => {
    expect(fitRangesToDay([{ startMin: 600, endMin: 900 }], open, opts)).toEqual({ ok: true, ranges: [{ startMin: 840, endMin: 900 }], trimmed: true })
    expect(fitRangesToDay([{ startMin: 600, endMin: 860 }], open, opts)).toEqual({ ok: false, reason: 'outside' })
  })
  it('refuses closed days and too many ranges, but always allows clearing', () => {
    expect(fitRangesToDay([{ startMin: 900, endMin: 1000 }], { ...open, isOpen: false }, opts)).toEqual({ ok: false, reason: 'closed' })
    expect(fitRangesToDay([], { ...open, isOpen: false }, opts)).toEqual({ ok: true, ranges: [], trimmed: false })
    const three = [{ startMin: 850, endMin: 900 }, { startMin: 950, endMin: 1000 }, { startMin: 1050, endMin: 1100 }]
    expect(fitRangesToDay(three, open, opts)).toEqual({ ok: false, reason: 'too_many' })
  })
})

describe('days that still need availability', () => {
  // Wed Sep 30, 4 PM in New York: Oct 8 is the first unlocked day, Oct 14 the last inside the 14-day lead.
  const now = new Date('2026-09-30T20:00:00Z')
  const base = { today: '2026-09-30', timeZone: NY, settings: DEFAULT_SETTINGS, now }
  it('lists open, unlocked days inside the lead window that have no times', () => {
    const set = new Map([['2026-10-08', [{ startMin: 900, endMin: 1200 }]]])
    // Sunday Oct 11 is closed in the default week.
    expect(availabilityGaps({ ...base, rangesOn: (d) => set.get(d) })).toEqual(['2026-10-09', '2026-10-10', '2026-10-12', '2026-10-13', '2026-10-14'])
  })
  it('ignores times outside the date’s hours and follows per-date hours', () => {
    const set = new Map([['2026-10-09', [{ startMin: 600, endMin: 700 }]]])
    const configs = new Map([['2026-10-12', { isOpen: false, openMin: 840, closeMin: 1260 }]])
    expect(availabilityGaps({ ...base, dayConfigs: configs, rangesOn: (d) => set.get(d) })).toEqual(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-13', '2026-10-14'])
  })
  it('has nothing to ask when the lead time blocks changes', () => {
    const settings = { ...DEFAULT_SETTINGS, availability: { ...DEFAULT_SETTINGS.availability, leadTimeEnforcement: 'block' as const } }
    expect(availabilityGaps({ ...base, settings, rangesOn: () => [] })).toEqual([])
  })
  it('has nothing to ask when the center doesn’t ask for notice', () => {
    const settings = { ...DEFAULT_SETTINGS, availability: { ...DEFAULT_SETTINGS.availability, leadTimeEnforcement: 'off' as const } }
    expect(availabilityGaps({ ...base, settings, rangesOn: () => [] })).toEqual([])
  })
  it('takes the date’s hours from the caller', () => {
    const closed = { isOpen: false, openMin: 0, closeMin: 0 }
    const open = { isOpen: true, openMin: 840, closeMin: 1260 }
    const hoursOf = (d: string) => (d === '2026-10-09' ? open : closed)
    expect(availabilityGaps({ ...base, hoursOf, rangesOn: () => [] })).toEqual(['2026-10-09'])
  })
})
