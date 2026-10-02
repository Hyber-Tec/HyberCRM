import { type BusinessRules, payModelOn } from '../settings/businessRules'
import type { DateKey } from '../time'
import type { StaffRole } from '../types'

/**
 * Which hourly rates an employee must have so their worked time is never
 * priced at $0 (round 3: the rate is asked when the employee is created, and
 * anyone still without one is flagged on Home, Pay Rates and Payroll).
 */
export type RateKind = 'teaching' | 'admin'

/** Tutors need an admin rate too while the branch pays admin time, today or from a later date. */
export function tutorsNeedAdminRate(rules: Pick<BusinessRules, 'payModels'>, today: DateKey): boolean {
  return payModelOn(rules, today) === 'teaching_admin' || rules.payModels.some((p) => p.from > today && p.model === 'teaching_admin')
}

/**
 * Tutors: the teaching rate (and the admin rate under Teaching + Admin).
 * Admins: their one hourly rate, kept as the admin rate. Owners: none, since
 * an owner may not be paid by the hour.
 */
export function requiredRates(role: StaffRole | null | undefined, needAdminRate: boolean): RateKind[] {
  if (role === 'tutor') return needAdminRate ? ['teaching', 'admin'] : ['teaching']
  if (role === 'admin') return ['admin']
  return []
}

/** The required rates that are unset or $0. */
export function missingRates(
  role: StaffRole | null | undefined,
  rates: Partial<Record<RateKind, number>> | null | undefined,
  needAdminRate: boolean,
): RateKind[] {
  return requiredRates(role, needAdminRate).filter((k) => !(Number(rates?.[k]) > 0))
}

/** "teaching rate", "admin rate", "hourly rate" (admins and owners have one rate). */
export function rateName(kind: RateKind, role: StaffRole | null | undefined): string {
  if (role !== 'tutor') return 'hourly rate'
  return kind === 'teaching' ? 'teaching rate' : 'admin rate'
}
