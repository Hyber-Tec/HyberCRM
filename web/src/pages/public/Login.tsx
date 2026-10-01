import { Navigate, useSearchParams } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/components/app/FullPage'
import { HyberMark } from '@/components/app/HyberMark'
import { GoogleSignInButton } from './GoogleButton'

export function Login() {
  const { status } = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next')
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/app'

  if (status === 'loading') return <FullPageSpinner />
  if (status === 'signedIn') return <Navigate to={target} replace />

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <HyberMark withName className="mb-8" />
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the Google account your center added for you.
        </p>
        <GoogleSignInButton className="mt-6 w-full" />
      </div>
    </div>
  )
}
