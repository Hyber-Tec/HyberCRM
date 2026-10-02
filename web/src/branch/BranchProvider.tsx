import { doc } from 'firebase/firestore'
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { COL, ROOT } from '@shared/paths'
import { type Portal, type RestrictablePage, type Role, isAdminRole, portalOf } from '@shared/roles'
import { type BusinessRules, resolveBusinessRules } from '@shared/settings/businessRules'
import type { BranchSettings } from '@shared/settings/defaults'
import { resolveSettings } from '@shared/settings/resolve'
import type { Branch, Member, WithId } from '@shared/types'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { NoBranchAccess } from './NoBranchAccess'
import type { Actor } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { useDoc } from '@/lib/firestore'
import { useBranchTabIcon } from '@/lib/tabIcon'

/**
 * What a Super Admin is previewing ("View the app as"). It only changes what is
 * shown: their access, and the actor recorded in the audit log, stay their own.
 */
export type ViewAs =
  | { role: 'admin' }
  | { role: 'tutor'; staffId: string; name: string }
  | { role: 'parent'; studentIds: string[]; name: string }
  | { role: 'student'; studentId: string; name: string }

export interface BranchContextValue {
  branchId: string
  branch: WithId<Branch>
  settings: BranchSettings
  /** Core rules the Super Admin sets (pay model, students per tutor, conferences). */
  rules: BusinessRules
  timezone: string
  /** The signed-in person's member doc (super admins may have none). */
  member: WithId<Member> | null
  /** The role shown: the member's own, `admin` for a visiting super admin, or the previewed one. */
  role: Role
  portal: Portal
  /** Super admin visiting a branch they're not an owner or admin of. */
  asSuperAdmin: boolean
  isSuperAdmin: boolean
  isAdmin: boolean
  isOwner: boolean
  staffId: string | null
  /** Student: their own record. */
  studentId: string | null
  /** Parent: their children. */
  studentIds: string[]
  can: (page: RestrictablePage) => boolean
  actor: Actor
  viewAs: ViewAs | null
  setViewAs: (next: ViewAs | null) => void
}

const BranchContext = createContext<BranchContextValue | null>(null)

const viewAsKey = (branchId: string) => `hyber:view-as:${branchId}`

function loadViewAs(branchId: string): ViewAs | null {
  try {
    const raw = window.sessionStorage.getItem(viewAsKey(branchId))
    return raw ? (JSON.parse(raw) as ViewAs) : null
  } catch {
    return null
  }
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const { branchId = '' } = useParams()
  const { user, email, isSuperAdmin, ready } = useAuth()

  const branchState = useDoc<Branch>(branchId ? doc(db, ROOT.branches, branchId) : null)
  const memberState = useDoc<Member>(branchId && email ? doc(db, ROOT.branches, branchId, COL.members, email) : null)

  // Preview state lives in this browser tab only.
  const [preview, setPreview] = useState<{ branchId: string; value: ViewAs | null }>(() => ({ branchId, value: loadViewAs(branchId) }))
  const viewAs = isSuperAdmin ? (preview.branchId === branchId ? preview.value : loadViewAs(branchId)) : null
  const setViewAs = useCallback(
    (next: ViewAs | null) => {
      setPreview({ branchId, value: next })
      try {
        if (next) window.sessionStorage.setItem(viewAsKey(branchId), JSON.stringify(next))
        else window.sessionStorage.removeItem(viewAsKey(branchId))
      } catch {
        // Storage can be unavailable; the preview still applies until the page reloads.
      }
    },
    [branchId],
  )

  // `blocked`: no role to show here. `paused`: the member's access was turned off; `none`: not a member.
  const { value, blocked } = useMemo<{ value: BranchContextValue | null; blocked: 'paused' | 'none' | null }>(() => {
    const branch = branchState.data
    if (!branch || !user || !email) return { value: null, blocked: null }
    const member = memberState.data && memberState.data.status === 'active' ? memberState.data : null
    const ownRole = member?.role ?? null
    // A super admin always has admin powers; the bar shows when they aren't an owner or admin here.
    const asSuperAdmin = isSuperAdmin && !isAdminRole(ownRole)
    const selfRole: Role | null = asSuperAdmin ? 'admin' : ownRole
    const role: Role | null = viewAs ? viewAs.role : selfRole
    const restrictions = member?.restrictions ?? []
    const actor: Actor = {
      uid: user.uid,
      email,
      name: member?.displayName || user.displayName || email,
      role: asSuperAdmin ? 'super_admin' : (ownRole ?? 'student'),
    }
    const ctx: BranchContextValue = {
      branchId,
      branch,
      settings: resolveSettings(branch.settings),
      rules: resolveBusinessRules(branch.businessRules),
      timezone: branch.timezone || 'America/New_York',
      member,
      role: role ?? 'student',
      portal: role ? portalOf(role) : 'student',
      asSuperAdmin,
      isSuperAdmin,
      isAdmin: isAdminRole(role),
      isOwner: viewAs ? false : isSuperAdmin || ownRole === 'owner',
      staffId: viewAs ? (viewAs.role === 'tutor' ? viewAs.staffId : null) : (member?.staffId ?? null),
      studentId: viewAs ? (viewAs.role === 'student' ? viewAs.studentId : null) : (member?.studentId ?? null),
      studentIds: viewAs ? (viewAs.role === 'parent' ? viewAs.studentIds : []) : (member?.studentIds ?? []),
      can: (page) => (isSuperAdmin && !viewAs) || ownRole === 'owner' || !restrictions.includes(page),
      actor,
      viewAs,
      setViewAs,
    }
    return { value: ctx, blocked: role !== null ? null : memberState.data ? 'paused' : 'none' }
  }, [branchState.data, memberState.data, user, email, isSuperAdmin, branchId, viewAs, setViewAs])

  const branchDoc = branchState.data
  useBranchTabIcon(
    branchDoc
      ? { id: branchId, name: branchDoc.name, shortName: branchDoc.shortName, logoUrl: branchDoc.branding?.logoUrl, accentColor: branchDoc.branding?.accentColor }
      : null,
  )

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

  // Until the account check (Super Admin, memberships) is done, nothing here is known: never guess.
  if (!ready || branchState.loading || memberState.loading) return <FullPageSpinner />
  if (!value) {
    if (branchState.error?.code === 'permission-denied' || !branchState.data) return <NoBranchAccess branchId={branchId} />
    return <FullPageMessage title="This center couldn’t be loaded" description="Check your connection and try again." actions={[{ label: 'Go to my centers', to: '/app' }]} />
  }
  if (blocked === 'none') return <NoBranchAccess branchId={branchId} />
  if (blocked === 'paused') {
    return (
      <FullPageMessage
        title="Your access is paused"
        description={`The account ${email ?? ''} is paused in ${value.branch.name}. Ask an admin of the center to restore your access.`}
        actions={[{ label: 'Go to my centers', to: '/app' }]}
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
