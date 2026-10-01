import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './defaults'
import { deepMerge, getPath, resolveSettings, setPath, unsetPath } from './resolve'

describe('settings resolver', () => {
  it('returns the defaults without overrides', () => {
    expect(resolveSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('merges nested overrides and replaces arrays', () => {
    const s = resolveSettings({
      schedule: { snapMinutes: 10, autoConfirm: { hoursBefore: 48 } },
      signup: { roles: ['tutor'] },
    })
    expect(s.schedule.snapMinutes).toBe(10)
    expect(s.schedule.autoConfirm).toEqual({ enabled: true, hoursBefore: 48 })
    expect(s.schedule.defaultSessionMinutes).toBe(110)
    expect(s.signup.roles).toEqual(['tutor'])
  })

  it('treats null on an object as "use the default" and null on a value as a value', () => {
    expect(deepMerge({ a: { b: 1 } }, { a: null })).toEqual({ a: { b: 1 } })
    expect(deepMerge({ a: 'x' as string | null }, { a: null })).toEqual({ a: null })
  })

  it('reads and writes dotted paths without mutating', () => {
    const base = { a: { b: 1 } }
    const next = setPath(base, 'a.c.d', 2)
    expect(base).toEqual({ a: { b: 1 } })
    expect(getPath(next, 'a.c.d')).toBe(2)
    expect(unsetPath(next, 'a.c.d')).toEqual({ a: { b: 1 } })
  })
})
