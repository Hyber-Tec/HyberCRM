import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  dateKeyOf,
  dayEndInstant,
  diffDays,
  formatDateKey,
  formatMinutes,
  isDateKey,
  minutesOf,
  monthGrid,
  parseHHMM,
  startOfWeek,
  toInstant,
  tzOffsetMinutes,
  weekdayOf,
} from './time'

const NY = 'America/New_York'

describe('time zones', () => {
  it('reads the wall clock of an instant in the branch zone', () => {
    const instant = new Date('2026-09-30T20:00:00Z') // 4:00 PM EDT
    expect(dateKeyOf(instant, NY)).toBe('2026-09-30')
    expect(minutesOf(instant, NY)).toBe(16 * 60)
    expect(dateKeyOf(new Date('2026-10-01T02:30:00Z'), NY)).toBe('2026-09-30')
    expect(dateKeyOf(new Date('2026-10-01T02:30:00Z'), 'Asia/Seoul')).toBe('2026-10-01')
  })

  it('converts wall clock to instants across DST', () => {
    expect(toInstant('2026-09-30', 960, NY).toISOString()).toBe('2026-09-30T20:00:00.000Z')
    expect(toInstant('2026-12-15', 960, NY).toISOString()).toBe('2026-12-15T21:00:00.000Z')
    // DST starts 2026-03-08 at 2:00 AM; 3:30 AM is EDT
    expect(toInstant('2026-03-08', 210, NY).toISOString()).toBe('2026-03-08T07:30:00.000Z')
    // DST ends 2026-11-01; noon is EST
    expect(toInstant('2026-11-01', 720, NY).toISOString()).toBe('2026-11-01T17:00:00.000Z')
    expect(tzOffsetMinutes(new Date('2026-07-01T12:00:00Z'), NY)).toBe(-240)
    expect(tzOffsetMinutes(new Date('2026-01-01T12:00:00Z'), NY)).toBe(-300)
  })

  it('round-trips every 15 minutes of a DST day', () => {
    for (let m = 0; m < 1440; m += 15) {
      const instant = toInstant('2026-11-01', m, NY)
      if (m >= 60 && m < 120) continue // 1:00–1:59 happens twice
      expect(minutesOf(instant, NY)).toBe(m)
    }
  })

  it('computes the end of a local day', () => {
    expect(dayEndInstant('2026-09-30', NY).toISOString()).toBe('2026-10-01T04:00:00.000Z')
  })
})

describe('calendar math', () => {
  it('adds days and months', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(diffDays('2026-09-01', '2026-09-30')).toBe(29)
  })

  it('starts weeks on the configured day', () => {
    expect(weekdayOf('2026-09-30')).toBe('wednesday')
    expect(startOfWeek('2026-09-30', 'sunday')).toBe('2026-09-27')
    expect(startOfWeek('2026-09-30', 'monday')).toBe('2026-09-28')
    expect(startOfWeek('2026-09-27', 'sunday')).toBe('2026-09-27')
    const grid = monthGrid('2026-09-15', 'sunday')
    expect(grid).toHaveLength(42)
    expect(grid[0]).toBe('2026-08-30')
  })

  it('validates and formats', () => {
    expect(isDateKey('2026-02-29')).toBe(false)
    expect(isDateKey('2028-02-29')).toBe(true)
    expect(formatMinutes(960)).toBe('4:00 PM')
    expect(formatMinutes(0)).toBe('12:00 AM')
    expect(formatMinutes(1070)).toBe('5:50 PM')
    expect(parseHHMM('16:30')).toBe(990)
    expect(Number.isNaN(parseHHMM('25:00'))).toBe(true)
    expect(formatDateKey('2026-09-30', 'weekdayLong')).toBe('Wednesday, September 30, 2026')
  })
})
