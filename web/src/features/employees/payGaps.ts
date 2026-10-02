import { useMemo } from 'react'
import { type RateKind, missingRates, rateName, requiredRates, tutorsNeedAdminRate } from '@shared/pay/rates'
import { todayKey } from '@shared/time'
import type { Staff, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useStaffList } from '@/features/data/hooks'
import { useCompensationState } from '@/features/timeclock/hooks'

export interface PayGap {
  staff: WithId<Staff>
  missing: RateKind[]
}

/** "No teaching rate", "No teaching or admin rate", "No hourly rate". */
export function gapLabel(g: PayGap): string {
  const names = g.missing.map((k) => rateName(k, g.staff.role).replace(/ rate$/, ''))
  return `No ${names.join(' or ')} rate`
}

/**
 * Active employees whose worked time would be priced at $0 because a rate
 * their pay needs is unset (only for people who can see pay rates).
 */
export function usePayGaps(enabled = true): { gaps: PayGap[]; ready: boolean } {
  const { rules, timezone, can } = useBranch()
  const on = enabled && can('payRates')
  const needAdmin = tutorsNeedAdminRate(rules, todayKey(timezone))
  const { data: staff, loading } = useStaffList(on)
  const paid = useMemo(() => (on ? staff.filter((s) => s.status === 'active' && requiredRates(s.role, needAdmin).length > 0) : []), [on, staff, needAdmin])
  const { map, failed, ready } = useCompensationState(paid.map((s) => s.id))
  // A pay record that couldn't be read is unknown, not missing.
  const gaps = useMemo(
    () =>
      ready
        ? paid
            .filter((s) => !failed.has(s.id))
            .map((s) => ({ staff: s, missing: missingRates(s.role, map.get(s.id)?.rates, needAdmin) }))
            .filter((g) => g.missing.length > 0)
        : [],
    [ready, paid, map, failed, needAdmin],
  )
  return { gaps, ready: on && !loading && ready }
}
