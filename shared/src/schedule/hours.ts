import type { HourRounding } from '../settings/defaults'

/**
 * Billed student hours for a session length (True Education's business table):
 * ≤30 → 0.5 · ≤70 → 1 · 71–74 → 1.5 · 75 → 2 · 76–85 → 1.5 · 86–120 → 2 ·
 * >120 → ceil((m − 10) / 30) × 0.5. Not monotonic at 75 minutes on purpose.
 */
export function businessRoundedHours(rawMinutes: number): number {
  const m = Math.ceil(rawMinutes)
  if (m <= 0) return 0
  if (m <= 30) return 0.5
  if (m <= 70) return 1
  if (m <= 74) return 1.5
  if (m === 75) return 2
  if (m <= 85) return 1.5
  if (m <= 120) return 2
  return Math.round(Math.ceil((m - 10) / 30) * 0.5 * 100) / 100
}

export function billedHours(minutes: number, rounding: HourRounding): number {
  switch (rounding) {
    case 'te_business':
      return businessRoundedHours(minutes)
    case 'exact_quarter':
      return Math.round((minutes / 60) * 4) / 4
    case 'exact':
      return Math.round((minutes / 60) * 100) / 100
  }
}
