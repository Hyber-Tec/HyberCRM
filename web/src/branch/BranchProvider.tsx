import { doc } from 'firebase/firestore'
import { createContext, use, useEffect, useMemo, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { COL, ROOT } from '@shared/paths'
import { type RestrictablePage, type Role, sortRoles } from '@shared/roles'
import type { BranchSettings } from '@shared/settings/defaults'
import { resolveSettings } from '@shared/settings/resolve'
import type { Branch, Member, WithId } from '@shared/types'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import type { Actor } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { useDoc } from '@/lib/firestore'

export interface BranchContextValue {
  branchId: string
  branch: WithId<Branch>
  settings: BranchSettings
  timezone: string
  /** The signed-in person's member doc (super admins may have none). */
  member: WithId<Member> | null
  /** Effective roles. Super admins always hold `admin`. */
  roles: Role[]
  /** Super admin visiting a branch they're not an admin member of. */
  asSuperAdmin: boolean
  isSuperAdmin: boolean
  isAdmin: boolean
  isOwner: boolean
  staffId: string | null
  can: (page: RestrictablePage) => boolean
  actor: Actor
}

const BranchContext = createContext<BranchContextValue | null>(null)

export function BranchProvider({ children }: { children: ReactNode }) {
  const { branchId = '' } = useParams()
  const { user, email, isSuperAdmin } = useAuth()

  const branchState = useDoc<Branch>(branchId ? doc(db, ROOT.branches, branchId) : null)
  const memberState = useDoc<Member>(branchId && email ? doc(db, ROOT.branches, branchId, COL.members, email) : null)

  const value = useMemo<BranchContextValue | null>(() => {
    const branch = branchState.data
    if (!branch || !user || !email) return null
    const member = memberState.data && memberState.data.status === 'active' ? memberState.data : null
    const memberRoles = member ? sortRoles(member.roles ?? []) : []
    const roles = isSuperAdmin && !memberRoles.includes('admin') ? sortRoles(['admin', ...memberRoles]) : memberRoles
    const asSuperAdmin = isSuperAdmin && !memberRoles.includes('admin')
    const isAdmin = roles.includes('admin')
    const restrictions = member?.restrictions ?? []
    const actorRole: Actor['role'] = asSuperAdmin ? 'super_admin' : (roles[0] ?? 'student')
    return {
      branchId,
      branch,
      settings: resolveSettings(branch.settings),
      timezone: branch.timezone || 'America/New_York',
      member,
      roles,
      asSuperAdmin,
      isSuperAdmin,
      isAdmin,
      isOwner: isSuperAdmin || (isAdmin && member?.isOwner === true),
      staffId: member?.staffId ?? null,
      can: (page) => isSuperAdmin || !restrictions.includes(page),
      actor: {
        uid: user.uid,
        email,
        name: member?.displayName || user.displayName || email,
        role: actorRole,
      },
    }
  }, [branchState.data, memberState.data, user, email, isSuperAdmin, branchId])

  // Branch accent color as a CSS variable for brand marks.
  const accent = value?.branch.branding?.accentColor ?? null
  useEffect(() => {
    const root = document.documentElement
    if (accent) root.style.setProperty('--brand', accent)
    else root.style.removeProperty('--brand')
    return () => {
      root.style.removeProperty('--brand')
    }
  }, [accent])

  if (branchState.loading || memberState.loading) return <FullPageSpinner />
  if (!value) {
    return (
      <FullPageMessage
        title="No access to this branch"
        description={
          branchState.error?.code === 'permission-denied' || !branchState.data
            ? `The account ${email ?? ''} is not a member of “${branchId}”, or the branch doesn’t exist.`
            : 'This branch could not be loaded.'
        }
        actions={[{ label: 'Go to my branches', to: '/app' }]}
      />
    )
  }
  if (value.roles.length === 0) {
    return (
      <FullPageMessage
        title="Your access is paused"
        description={`The account ${email ?? ''} is not active in ${value.branch.name}. Ask an admin to restore your access.`}
        actions={[{ label: 'Go to my branches', to: '/app' }]}
      />
    )
  }
  return <BranchContext value={value}>{children}</BranchContext>
}

export function useBranch(): BranchContextValue {
  const ctx = use(BranchContext)
  if (!ctx) throw new Error('useBranch must be used inside <BranchProvider>')
  return ctx
}

/** Branch context when inside a branch route, otherwise null. */
export function useOptionalBranch(): BranchContextValue | null {
  return use(BranchContext)
}
