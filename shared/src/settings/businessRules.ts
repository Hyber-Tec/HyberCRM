import { type DateKey, addDays } from '../time'

/**
 * Core business rules of a branch (owner decision, round 2). The Super Admin
 * chooses them when creating the branch, after visiting the center, and only the
 * Super Admin changes them later (Platform page). They live in
 * `branches/{b}.businessRules`, which branch admins cannot write. Nothing here is
 * hard-coded to True Education: TE's values are just one possible setup.
 */

/** Teaching only: tutors are paid for teaching time only. Teaching + Admin: TE's split. */
export type PayModel = 'teaching_only' | 'teaching_admin'

export const PAY_MODELS: readonly PayModel[] = ['teaching_only', 'teaching_admin']

export const PAY_MODEL_LABELS: Record<PayModel, string> = {
  teaching_only: 'Teaching only',
  teaching_admin: 'Teaching + Admin',
}

export const PAY_MODEL_HELP: Record<PayModel, string> = {
  teaching_only: 'Tutors are paid only for time spent teaching. Gaps and idle clocked-in time are unpaid.',
  teaching_admin: 'Teaching rate for time in sessions, admin rate for the rest of the clocked shift.',
}

export interface PayModelPeriod {
  model: PayModel
  /** First day (branch zone) this model applies. */
  from: DateKey
}

export interface BusinessRules {
  /**
   * Pay model over time, oldest first; each entry applies from its date until the
   * next one. A change only ever applies from a chosen date forward, so pay before
   * that date keeps the model it was earned under.
   */
  payModels: PayModelPeriod[]
  /** Students a tutor can teach at the same time (1 = strictly one-to-one). */
  maxStudentsPerTutor: number
  /** Parent conferences every N tutoring hours. Off: nothing is tracked or shown. */
  conferences: { enabled: boolean; everyHours: number }
}

/** From the beginning: the first pay model covers every earlier date. */
export const PAY_MODEL_SINCE_START: DateKey = '2000-01-01'

export const MAX_STUDENTS_PER_TUTOR_LIMIT = 6

/** A new branch's starting point; the Super Admin picks the real values at creation. */
export const DEFAULT_BUSINESS_RULES: BusinessRules = {
  payModels: [{ model: 'teaching_only', from: PAY_MODEL_SINCE_START }],
  maxStudentsPerTutor: 1,
  conferences: { enabled: false, everyHours: 25 },
}

/** Stored rules with every gap filled from the defaults. */
export function resolveBusinessRules(stored: Partial<BusinessRules> | null | undefined): BusinessRules {
  const payModels = (stored?.payModels ?? [])
    .filter((p) => p && (PAY_MODELS as readonly string[]).includes(p.model) && typeof p.from === 'string')
    .sort((a, b) => a.from.localeCompare(b.from))
  const max = Number(stored?.maxStudentsPerTutor)
  return {
    payModels: payModels.length ? payModels : DEFAULT_BUSINESS_RULES.payModels,
    maxStudentsPerTutor: Number.isInteger(max) && max >= 1 ? Math.min(max, MAX_STUDENTS_PER_TUTOR_LIMIT) : DEFAULT_BUSINESS_RULES.maxStudentsPerTutor,
    conferences: {
      enabled: stored?.conferences?.enabled === true,
      everyHours: Number(stored?.conferences?.everyHours) > 0 ? Number(stored?.conferences?.everyHours) : DEFAULT_BUSINESS_RULES.conferences.everyHours,
    },
  }
}

/** The pay model in force on a date. */
export function payModelOn(rules: Pick<BusinessRules, 'payModels'>, dateKey: DateKey): PayModel {
  let model = rules.payModels[0]?.model ?? DEFAULT_BUSINESS_RULES.payModels[0].model
  for (const p of rules.payModels) if (p.from <= dateKey) model = p.model
  return model
}

/** Changes after the first entry, i.e. actual switches (for display). */
export function payModelChanges(rules: Pick<BusinessRules, 'payModels'>): PayModelPeriod[] {
  return rules.payModels.slice(1)
}

/**
 * Earliest date a pay-model change may start: after the last locked pay period
 * (locked pay never changes). The Super Admin picks any date from here on.
 */
export function earliestPayModelChange(lockedThrough: DateKey | null): DateKey | null {
  return lockedThrough ? addDays(lockedThrough, 1) : null
}

/**
 * The rules with a pay-model switch starting on `from`. Later scheduled switches
 * are replaced, so the history stays a simple timeline.
 */
export function withPayModelChange(rules: BusinessRules, model: PayModel, from: DateKey): BusinessRules {
  const kept = rules.payModels.filter((p) => p.from < from)
  const before = kept.length ? kept[kept.length - 1].model : null
  const payModels = before === model ? kept : [...kept, { model, from }]
  return { ...rules, payModels: payModels.length ? payModels : [{ model, from: PAY_MODEL_SINCE_START }] }
}
