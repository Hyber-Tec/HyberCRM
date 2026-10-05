import { collectionGroup, getDocs, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { LuChevronRight, LuClock, LuLink, LuMail, LuShieldCheck, LuUserRound } from 'react-icons/lu'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { COL } from '@shared/paths'
import { ROLE_LABELS } from '@shared/roles'
import type { SignupRequest } from '@shared/types'
import { type Membership, useAuth } from '@/auth/AuthProvider'
import { BrandMark } from '@/components/app/BrandMark'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { HyberMark } from '@/components/app/HyberMark'
import { UserMenu } from '@/components/app/UserMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { db } from '@/lib/firebase'
import { usePublicProfile } from '@/lib/publicProfile'

type PendingRequest = SignupRequest & { branchId: string }

function usePendingRequests(email: string | null) {
  const [requests, setRequests] = useState<PendingRequest[] | null>(null)
  useEffect(() => {
    if (!email) return
    getDocs(query(collectionGroup(db, COL.signupRequests), where('email', '==', email)))
      .then((snap) =>
        setRequests(
          snap.docs.map((d) => ({ ...(d.data() as SignupRequest), branchId: d.ref.parent.parent?.id ?? '' })),
        ),
      )
      .catch(() => setRequests([]))
  }, [email])
  return requests
}

export function AppResolver() {
  const { ready, isSuperAdmin, memberships, email, signOut } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const active = memberships.filter((m) => m.member.status === 'active')
  const choose = params.get('choose') === '1'
  const pending = usePendingRequests(ready && active.length === 0 && !isSuperAdmin ? email : null)

  if (!ready) return <FullPageSpinner label="Checking your access…" />

  if (!choose) {
    // Super admins always start on the platform dashboard; any branch is one click away.
    if (isSuperAdmin) return <Navigate to="/platform" replace />
    if (active.length === 1) return <Navigate to={`/${active[0].branchId}`} replace />
  }

  if (active.length === 0 && !isSuperAdmin) {
    if (pending === null) return <FullPageSpinner label="Checking your access…" />
    const open = pending.filter((r) => r.status === 'pending')
    const switchAccount = async () => {
      await signOut()
      navigate('/login')
    }
    return (
      <FullPageMessage
        title={open.length > 0 ? 'Your request is waiting for approval' : 'No access yet'}
        description={
          <>
            You’re signed in as <span className="font-medium wrap-anywhere text-foreground">{email}</span>.{' '}
            {open.length > 0
              ? 'The center will review your request. You’ll get an email and can sign in as soon as it’s approved.'
              : 'No center has given this address access yet.'}
          </>
        }
        actions={[{ label: 'Use another account', variant: 'outline', onClick: () => void switchAccount() }]}
      >
        {open.length > 0 ? (
          <ul className="mt-5 space-y-2 text-left">
            {open.map((r) => (
              <PendingRow key={r.branchId} request={r} />
            ))}
          </ul>
        ) : (
          <ul className="mt-5 space-y-3 text-left text-sm">
            <li className="flex gap-3">
              <LuMail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-medium">Got an invitation email?</span> Sign in with the address it was sent to, with Google or a password.
              </span>
            </li>
            <li className="flex gap-3">
              <LuLink className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-medium">Have your center’s sign-up link?</span> Open it to request access with this account.
              </span>
            </li>
            <li className="flex gap-3">
              <LuUserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-medium">Neither?</span> Ask your center’s admin to add {email}.
              </span>
            </li>
          </ul>
        )}
      </FullPageMessage>
    )
  }

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <HyberMark withName />
        <UserMenu />
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        <h1 className="text-2xl font-semibold tracking-tight">Choose where to go</h1>
        <p className="mt-1 text-sm text-muted-foreground">Signed in as {email}</p>
        <div className="mt-6 space-y-2">
          {isSuperAdmin ? (
            <ChooserRow
              to="/platform"
              icon={
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <LuShieldCheck className="size-5" />
                </div>
              }
              title="Platform"
              subtitle="All branches, as Super Admin"
            />
          ) : null}
          {memberships.map((m) => (
            <MembershipRow key={m.branchId} membership={m} />
          ))}
        </div>
      </main>
    </div>
  )
}

function MembershipRow({ membership }: { membership: Membership }) {
  const { branchId, member, profile } = membership
  const name = profile?.name ?? branchId
  const disabled = member.status !== 'active'
  return (
    <ChooserRow
      to={`/${branchId}`}
      disabled={disabled}
      icon={<BrandMark name={name} logoUrl={profile?.logoUrl} accentColor={profile?.accentColor} className="size-10" />}
      title={name}
      subtitle={
        disabled ? 'Access paused' : (ROLE_LABELS[member.role] ?? '')
      }
    />
  )
}

function ChooserRow({
  to,
  icon,
  title,
  subtitle,
  disabled,
}: {
  to: string
  icon: React.ReactNode
  title: string
  subtitle: string
  disabled?: boolean
}) {
  const content = (
    <>
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        <div className="truncate text-sm text-muted-foreground">{subtitle}</div>
      </div>
      <LuChevronRight className="size-4 text-muted-foreground" />
    </>
  )
  if (disabled) {
    return <div className="flex items-center gap-3 rounded-xl border bg-card p-3 opacity-60">{content}</div>
  }
  return (
    <Button variant="outline" asChild className="h-auto w-full justify-start gap-3 rounded-xl bg-card p-3 text-left">
      <Link to={to}>{content}</Link>
    </Button>
  )
}

/** A pending sign-up request, with the center's name and logo. */
function PendingRow({ request }: { request: PendingRequest }) {
  const { data: profile } = usePublicProfile(request.branchId)
  const name = profile?.name ?? request.branchId
  return (
    <li className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
      <BrandMark name={name} logoUrl={profile?.logoUrl} accentColor={profile?.accentColor} className="size-8" />
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      <Badge variant="secondary" className="gap-1">
        <LuClock /> {ROLE_LABELS[request.requestedRole]}
      </Badge>
    </li>
  )
}
