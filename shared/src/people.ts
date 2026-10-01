import type { DateKey } from './time'
import { diffDays } from './time'
import type { StaffStatus, StudentStatus } from './types'

// ------------------------------------------------------------------ students

export const STUDENT_STATUSES: readonly StudentStatus[] = [
  'signed_up',
  'enrolled',
  'paused',
  'no_answer',
  'not_interested',
  'finished',
]

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  signed_up: 'Signed Up',
  enrolled: 'Enrolled',
  paused: 'Paused',
  no_answer: 'No Answer',
  not_interested: 'Not Interested',
  finished: 'Finished',
}

/** Badge colors (bg / text / border), from True Education's directory palette. */
export const STUDENT_STATUS_COLORS: Record<StudentStatus, { bg: string; text: string; border: string }> = {
  signed_up: { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' },
  enrolled: { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
  paused: { bg: '#fff7ed', text: '#9a3412', border: '#fed7aa' },
  no_answer: { bg: '#f8fafc', text: '#334155', border: '#e2e8f0' },
  not_interested: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  finished: { bg: '#fff1f2', text: '#9f1239', border: '#fecdd3' },
}

/** Statuses excluded from conference logic and grade advancement. */
export const INACTIVE_STUDENT_STATUSES: readonly StudentStatus[] = ['finished', 'no_answer', 'not_interested']

export function isInactiveStudent(status: StudentStatus): boolean {
  return INACTIVE_STUDENT_STATUSES.includes(status)
}

// --------------------------------------------------------------------- staff

export const STAFF_STATUSES: readonly StaffStatus[] = ['active', 'on_hold', 'finished']

export const STAFF_STATUS_LABELS: Record<StaffStatus, string> = {
  active: 'Active',
  on_hold: 'On Hold',
  finished: 'Finished',
}

export const STAFF_STATUS_COLORS: Record<StaffStatus, { bg: string; text: string; border: string }> = {
  active: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  on_hold: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  finished: { bg: '#f8fafc', text: '#475569', border: '#cbd5e1' },
}

// ---------------------------------------------------------------- conference

export interface ConferenceInput {
  totalSessionHours: number
  /** Hours on the student's total when the last conference was completed (or the cycle was reset). */
  baselineHours: number
}

export interface ConferenceState {
  hoursSince: number
  cycleHours: number
  needed: boolean
}

/**
 * The parent-conference cycle (TE: every 25 hours). Saving a conference note or
 * "Skip & restart" sets the baseline to the student's hours at that moment.
 */
export function conferenceState(input: ConferenceInput, cycleHours: number): ConferenceState {
  const total = Math.max(0, input.totalSessionHours || 0)
  const baseline = Math.max(0, Math.min(total, input.baselineHours || 0))
  const hoursSince = Math.round((total - baseline) * 100) / 100
  return { hoursSince, cycleHours, needed: hoursSince >= cycleHours }
}

// ------------------------------------------------------------------- helpers

/** "Today" / "Yesterday" / "3 days ago" / "Tomorrow" / "in 5 days". */
export function relativeDayLabel(target: DateKey, today: DateKey): string {
  const d = diffDays(today, target)
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d === -1) return 'Yesterday'
  return d > 0 ? `in ${d} days` : `${-d} days ago`
}

/** Formats 10-digit US numbers as (555) 010-1234; anything else is returned as typed. */
export function formatPhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits.startsWith('1')) return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return raw ?? ''
}

export function fullName(first: string, last: string): string {
  return `${(first ?? '').trim()} ${(last ?? '').trim()}`.trim()
}

/** Student label used on schedule cards: "Ava Patel (11)". */
export function studentLabel(name: string, grade: string | null | undefined): string {
  return grade ? `${name} (${grade})` : name
}

/** Next grade for grade advancement; null when the grade isn't numeric. */
export function nextGrade(grade: string): string | null {
  if (!/^\d+$/.test(grade.trim())) return null
  return String(Number(grade) + 1)
}
