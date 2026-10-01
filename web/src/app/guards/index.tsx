import type { ReactNode } from 'react'
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router'
import type { Portal } from '@shared/roles'
import { useAuth } from '@/auth/AuthProvider'
import { useBranch } from '@/branch/BranchProvider'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'

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

/** One role per person, so one portal: anyone else is sent to their own. */
export function RequirePortal({ role, children }: { role: Portal; children: ReactNode }) {
  const { portal, branchId } = useBranch()
  if (portal !== role) return <Navigate to={`/${branchId}`} replace />
  return children
}

/** `/{branchId}` → the person's portal (or the one a Super Admin is previewing). */
export function BranchHomeRedirect() {
  const { portal, branchId } = useBranch()
  return <Navigate to={`/${branchId}/${portal}`} replace />
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

/** An old admin address → its new place, keeping the rest of the path and the query. */
export function Moved({ to }: { to: string }) {
  const { branchId, '*': rest } = useParams()
  const { search, hash } = useLocation()
  return <Navigate to={`/${branchId}/admin/${to}${rest ? `/${rest}` : ''}${search}${hash}`} replace />
}

/** Students → Calendar is gone: each student's calendar is a tab of their profile. */
export function MovedStudentCalendar() {
  const { branchId } = useParams()
  const [params] = useSearchParams()
  const id = params.get('student')
  return <Navigate to={`/${branchId}/admin/students${id ? `/${encodeURIComponent(id)}/calendar` : ''}`} replace />
}
