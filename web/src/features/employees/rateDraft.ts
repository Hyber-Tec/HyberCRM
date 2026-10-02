import { type RateKind, rateName, requiredRates } from '@shared/pay/rates'
import type { Compensation, StaffRole } from '@shared/types'

/** What was typed into the rate fields. */
export type RateDraft = Record<RateKind, string>

export const EMPTY_RATES: RateDraft = { teaching: '', admin: '' }

/** The rates a new employee is asked for; owners get one optional hourly rate. */
export function askedRates(role: StaffRole, needAdminRate: boolean): RateKind[] {
  return role === 'owner' ? ['admin'] : requiredRates(role, needAdminRate)
}

/**
 * Turns the typed rates into the record to save. Tutors and admins must have
 * every rate their pay needs (above $0), so payroll never prices their time
 * at $0; an owner's rate may stay empty (no pay record then).
 */
export function readRates(role: StaffRole, draft: RateDraft, needAdminRate: boolean): { rates: Compensation['rates'] | null } | { error: string } {
  const rates = { teaching: 0, admin: 0 }
  for (const kind of askedRates(role, needAdminRate)) {
    const text = draft[kind].trim()
    if (role === 'owner' && text === '') return { rates: null }
    const n = Number(text)
    if (text === '' || !Number.isFinite(n) || n <= 0) return { error: `Enter the ${rateName(kind, role)} (dollars per hour).` }
    rates[kind] = Math.round(n * 100) / 100
  }
  return { rates }
}
