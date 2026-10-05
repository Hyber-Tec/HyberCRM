import { useMemo } from 'react'
import { COL } from '@shared/paths'
import type { Staff } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { branchDocRef, useDoc } from '@/lib/firestore'

/** The signed-in tutor's own employee record (or the previewed tutor's, for a Super Admin). */
export function useMyStaff() {
  const { branchId, staffId } = useBranch()
  const ref = useMemo(() => (staffId ? branchDocRef(branchId, COL.staff, staffId) : null), [branchId, staffId])
  return useDoc<Staff>(ref)
}

/** Shown wherever a tutor page needs an employee record that isn't linked to the account yet. */
export const NOT_LINKED = 'Your employee record isn’t linked yet. Ask an admin.'
