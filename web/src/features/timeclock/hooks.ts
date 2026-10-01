import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { COL, DOC } from '@shared/paths'
import { type PayPeriod, periodContaining, recentPeriods } from '@shared/pay/periods'
import { todayKey } from '@shared/time'
import type { Compensation } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef, useDoc } from '@/lib/firestore'

/** Live compensation docs for several employees. */
export function useCompensationMap(staffIds: string[]) {
  const { branchId } = useBranch()
  const key = [...staffIds].sort().join(',')
  const [map, setMap] = useState<Map<string, Compensation>>(new Map())
  useEffect(() => {
    const ids = key ? key.split(',') : []
    const unsubs = ids.map((id) =>
      onSnapshot(
        doc(db, branchCol(branchId, COL.staff).path, id, 'private', DOC.compensation),
        (snap) =>
          setMap((m) => {
            const next = new Map(m)
            if (snap.exists()) next.set(id, snap.data() as Compensation)
            else next.delete(id)
            return next
          }),
        () => undefined,
      ),
    )
    return () => unsubs.forEach((u) => u())
  }, [branchId, key])
  return map
}

export interface PayrollState {
  lockedThrough: string | null
}

export function usePayrollState() {
  const { branchId } = useBranch()
  const ref = useMemo(() => branchDocRef(branchId, COL.payroll, DOC.payrollState), [branchId])
  const { data } = useDoc<PayrollState>(ref)
  return { lockedThrough: data?.lockedThrough ?? null }
}

/** Pay periods for the branch's setting, newest first, plus the current one. */
export function usePayPeriods(count = 12): { current: PayPeriod; recent: PayPeriod[] } {
  const { settings, timezone } = useBranch()
  const today = todayKey(timezone)
  const { type, anchorDate } = settings.payroll.payPeriod
  return useMemo(
    () => ({ current: periodContaining(today, type, anchorDate), recent: recentPeriods(today, type, anchorDate, count) }),
    [today, type, anchorDate, count],
  )
}
