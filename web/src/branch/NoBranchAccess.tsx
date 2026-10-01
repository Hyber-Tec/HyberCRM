import { useNavigate } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { signupOpen, usePublicProfile } from '@/lib/publicProfile'

/**
 * A branch link opened by someone without access: says which account is signed
 * in and offers the ways in (another account, the sign-up page).
 */
export function NoBranchAccess({ branchId }: { branchId: string }) {
  const { email, memberships, isSuperAdmin, signOut } = useAuth()
  const { data: profile, loading } = usePublicProfile(branchId)
  const navigate = useNavigate()
  if (loading) return <FullPageSpinner />
  if (!profile) {
    return <FullPageMessage title="Center not found" description={`There’s no center at “/${branchId}”. Check the link you were given.`} actions={[{ label: 'Go to my centers', to: '/app' }]} />
  }
  const others = memberships.some((m) => m.branchId !== branchId && m.member.status === 'active') || isSuperAdmin
  return (
    <FullPageMessage
      title={`No access to ${profile.name}`}
      description={
        <>
          You’re signed in as <span className="font-medium wrap-anywhere text-foreground">{email}</span>, which {profile.name} hasn’t given access. If the center
          invited you, sign in with the address the invitation was sent to.
        </>
      }
      actions={[
        {
          label: 'Use another account',
          variant: signupOpen(profile) || others ? 'outline' : 'default',
          onClick: () => void signOut().then(() => navigate(`/login?next=${encodeURIComponent(`/${branchId}`)}`)),
        },
        ...(signupOpen(profile) ? [{ label: 'Request access', to: `/${branchId}/signup` }] : []),
        ...(others ? [{ label: 'Go to my centers', to: '/app', variant: 'ghost' as const }] : []),
      ]}
    />
  )
}
