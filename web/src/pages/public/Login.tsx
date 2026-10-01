import { useEffect } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { PRODUCT_NAME } from '@shared/brand'
import { useAuth } from '@/auth/AuthProvider'
import { BrandMark } from '@/components/app/BrandMark'
import { CompanyFooter } from '@/components/app/CompanyFooter'
import { FullPageSpinner } from '@/components/app/FullPage'
import { HyberMark } from '@/components/app/HyberMark'
import { branchIdOfPath, signupOpen, usePublicProfile } from '@/lib/publicProfile'
import { GoogleSignInButton } from './GoogleButton'

/**
 * Sign-in. Opened from a branch link (`?next=/demo-academy`) it shows that
 * branch's name and logo; invite emails add `?email=` to pre-select the
 * invited Google account.
 */
export function Login() {
  const { status } = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next')
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/app'
  const hint = params.get('email')?.trim().toLowerCase() || null
  const branchId = branchIdOfPath(target)
  const { data: profile, loading } = usePublicProfile(branchId)

  useEffect(() => {
    document.title = profile ? `Sign in to ${profile.name} | ${PRODUCT_NAME}` : `Sign in | ${PRODUCT_NAME}`
  }, [profile])

  if (status === 'loading' || (branchId && loading)) return <FullPageSpinner />
  if (status === 'signedIn') return <Navigate to={target} replace />

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        {profile ? (
          <div className="mb-8 flex items-center gap-3">
            <BrandMark name={profile.name} logoUrl={profile.logoUrl} accentColor={profile.accentColor} className="size-10" />
            <div className="min-w-0">
              <div className="truncate font-semibold leading-tight">{profile.name}</div>
              <div className="text-xs text-muted-foreground">on {PRODUCT_NAME}</div>
            </div>
          </div>
        ) : (
          <HyberMark withName className="mb-8" />
        )}
        <h1 className="text-xl font-semibold tracking-tight">{profile ? `Sign in to ${profile.shortName || profile.name}` : 'Sign in'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {hint ? (
            <>
              Use the Google account for <span className="font-medium wrap-anywhere text-foreground">{hint}</span>.
            </>
          ) : (
            'Use the Google account your center added for you.'
          )}
        </p>
        <GoogleSignInButton className="mt-6 w-full" hint={hint} />
        <div className="mt-6 space-y-2 border-t pt-4 text-xs text-muted-foreground">
          {profile && branchId && signupOpen(profile) ? (
            <p>
              New to {profile.shortName || profile.name}?{' '}
              <Link to={`/${branchId}/signup`} className="font-medium text-foreground underline underline-offset-2">
                Request access
              </Link>
            </p>
          ) : !profile ? (
            <p>New here? Your center emails you an invitation, or gives you its sign-up link to request access.</p>
          ) : null}
          <p>
            No Google account for your email?{' '}
            <a href="https://accounts.google.com/signup" target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-2">
              Create one with your existing email
            </a>
            .
          </p>
        </div>
      </div>
      <CompanyFooter />
    </div>
  )
}
