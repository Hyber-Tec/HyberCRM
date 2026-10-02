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
  return useCompensationState(staffIds).map
}

/**
 * Live compensation docs for several employees, and whether every one has
 * loaded (an employee without a doc then really has no rates).
 */
export function useCompensationState(staffIds: string[]) {
  const { branchId } = useBranch()
  const key = [...staffIds].sort().join(',')
  const [state, setState] = useState<{ key: string; map: Map<string, Compensation>; loaded: Set<string> }>({ key: '', map: new Map(), loaded: new Set() })
  useEffect(() => {
    const ids = key ? key.split(',') : []
    const unsubs = ids.map((id) =>
      onSnapshot(
        doc(db, branchCol(branchId, COL.staff).path, id, 'private', DOC.compensation),
        (snap) =>
          setState((s) => {
            const map = new Map(s.map)
            if (snap.exists()) map.set(id, snap.data() as Compensation)
            else map.delete(id)
            return { key: s.key, map, loaded: new Set(s.loaded).add(id) }
          }),
        () => setState((s) => ({ ...s, loaded: new Set(s.loaded).add(id) })),
      ),
    )
    setState((s) => ({ key, map: s.map, loaded: new Set([...s.loaded].filter((id) => ids.includes(id))) }))
    return () => unsubs.forEach((u) => u())
  }, [branchId, key])
  const ids = key ? key.split(',') : []
  return { map: state.map, ready: state.key === key && ids.every((id) => state.loaded.has(id)) }
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
