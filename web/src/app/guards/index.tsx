import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { type Role, primaryPortal } from '@shared/roles'
import { useAuth } from '@/auth/AuthProvider'
import { useBranch } from '@/branch/BranchProvider'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { rememberedPortal } from '@/components/app/UserMenu'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'signedOut') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return children
}

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { ready, isSuperAdmin, email } = useAuth()
  if (!ready) return <FullPageSpinner />
  if (!isSuperAdmin) {
    return (
      <FullPageMessage
        title="Platform access only"
        description={`${email ?? 'This account'} is not a Hyber platform admin.`}
        actions={[{ label: 'Go to my branches', to: '/app' }]}
      />
    )
  }
  return children
}

export function RequirePortal({ role, children }: { role: Role; children: ReactNode }) {
  const { roles, branchId } = useBranch()
  if (!roles.includes(role)) return <Navigate to={`/${branchId}`} replace />
  return children
}

/** `/{branchId}` → the remembered portal if still allowed, else the person's main portal. */
export function BranchHomeRedirect() {
  const { roles, branchId } = useBranch()
  const remembered = rememberedPortal(branchId)
  const portal = remembered && roles.includes(remembered) ? remembered : primaryPortal(roles)
  return <Navigate to={`/${branchId}/${portal ?? 'admin'}`} replace />
}

/** Hides a page from admins an owner restricted (Access Control). */
export function RequirePage({ page, children }: { page: import('@shared/roles').RestrictablePage; children: ReactNode }) {
  const { can } = useBranch()
  if (!can(page)) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        You don’t have access to this page. Ask a branch owner if you need it.
      </div>
    )
  }
  return children
}
