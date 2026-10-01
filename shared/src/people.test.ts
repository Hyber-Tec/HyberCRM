import { describe, expect, it } from 'vitest'
import { autoStudentStatus } from './people'

const on = { enabled: true, inactivityPauseDays: 20, respectManual: true }
const today = '2026-10-01'

describe('student lifecycle', () => {
  it('enrolls signed-up students once they have a session', () => {
    expect(autoStudentStatus({ status: 'signed_up', statusSource: 'auto', lastSessionDate: null, hasUpcoming: true }, today, on)).toBe('enrolled')
    expect(autoStudentStatus({ status: 'signed_up', statusSource: 'auto', lastSessionDate: null, hasUpcoming: false }, today, on)).toBeNull()
  })

  it('pauses after 20 idle days with nothing upcoming, and re-enrolls', () => {
    expect(autoStudentStatus({ status: 'enrolled', statusSource: 'auto', lastSessionDate: '2026-09-11', hasUpcoming: false }, today, on)).toBe('paused')
    expect(autoStudentStatus({ status: 'enrolled', statusSource: 'auto', lastSessionDate: '2026-09-12', hasUpcoming: false }, today, on)).toBeNull()
    expect(autoStudentStatus({ status: 'enrolled', statusSource: 'auto', lastSessionDate: '2026-08-01', hasUpcoming: true }, today, on)).toBeNull()
    expect(autoStudentStatus({ status: 'paused', statusSource: 'auto', lastSessionDate: '2026-08-01', hasUpcoming: true }, today, on)).toBe('enrolled')
    expect(autoStudentStatus({ status: 'paused', statusSource: 'auto', lastSessionDate: '2026-08-01', hasUpcoming: false }, today, on)).toBeNull()
  })

  it('leaves manual and inactive statuses alone', () => {
    expect(autoStudentStatus({ status: 'paused', statusSource: 'manual', lastSessionDate: null, hasUpcoming: true }, today, on)).toBeNull()
    expect(autoStudentStatus({ status: 'paused', statusSource: 'manual', lastSessionDate: null, hasUpcoming: true }, today, { ...on, respectManual: false })).toBe('enrolled')
    expect(autoStudentStatus({ status: 'finished', statusSource: 'auto', lastSessionDate: null, hasUpcoming: true }, today, on)).toBeNull()
    expect(autoStudentStatus({ status: 'signed_up', statusSource: 'auto', lastSessionDate: null, hasUpcoming: true }, today, { ...on, enabled: false })).toBeNull()
  })
})
