import { doc } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL, DOC, ROOT } from '@shared/paths'
import { RESERVED_BRANCH_IDS } from '@shared/slug'
import type { BranchPublicProfile } from '@shared/types'
import { db } from './firebase'
import { useDoc } from './firestore'

/** A branch's world-readable profile (name, logo, sign-up settings); null id → nothing. */
export function usePublicProfile(branchId: string | null) {
  const ref = useMemo(() => (branchId ? doc(db, ROOT.branches, branchId, COL.public, DOC.publicProfile) : null), [branchId])
  return useDoc<BranchPublicProfile>(ref)
}

/** The branch a path belongs to (`/demo-academy/admin/…` → `demo-academy`), if any. */
export function branchIdOfPath(path: string | null | undefined): string | null {
  const first = path?.match(/^\/([a-z][a-z0-9-]*[a-z0-9])(?:[/?#]|$)/)?.[1]
  return first && !RESERVED_BRANCH_IDS.has(first) ? first : null
}

/** Whether people can request access on the branch's sign-up page. */
export function signupOpen(profile: BranchPublicProfile | null | undefined): boolean {
  return !!profile && profile.status === 'active' && profile.signupEnabled && profile.signupRoles.length > 0
}
