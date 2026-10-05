import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { authErrorMessage, isGoogleMailbox, looksLikeEmail, passwordProblem } from '@shared/auth'
import { PRODUCT_NAME } from '@shared/brand'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/components/app/FullPage'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { AuthShell, OrDivider, PasswordInput, StrengthMeter, useAuthBranch, useNext, withQuery } from './authParts'
import { GoogleSignInButton } from './GoogleButton'

/**
 * A new account with an email and a password (or Google, the quicker way). Creating an account doesn't give access
 * by itself: a center gives access to an email (an invitation, or an approved sign-up request), and the account is
 * matched to it once the email is confirmed.
 */
export function SignUp() {
  const { status, needsVerification, signUp } = useAuth()
  const [params] = useSearchParams()
  const target = useNext()
  const hint = params.get('email')?.trim().toLowerCase() || null
  const { profile, loading } = useAuthBranch(target)
  const [name, setName] = useState('')
  const [email, setEmail] = useState(hint ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = `Create an account | ${PRODUCT_NAME}`
  }, [])

  if (status === 'loading' || loading) return <FullPageSpinner />
  if (status === 'signedIn') return <Navigate to={needsVerification ? withQuery('/verify-email', { next: target }) : target} replace />

  const query = { next: target === '/app' ? null : target, email: email.trim() || null }
  const gmail = isGoogleMailbox(email)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Enter your name.')
    if (!looksLikeEmail(email)) return setError(authErrorMessage('invalid-email'))
    const problem = passwordProblem(password, email)
    if (problem) return setError(problem)
    setBusy(true)
    try {
      await signUp({ name, email, password }, target)
    } catch (err) {
      setError(authErrorMessage((err as { code?: string }).code, 'sign-up'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      target={target}
      title="Create your account"
      description={profile ? `Use the email ${profile.shortName || profile.name} has for you.` : 'Use the email your center has for you.'}
      footer={
        <p>
          Already have an account?{' '}
          <Link to={withQuery('/login', query)} className="font-medium text-foreground underline underline-offset-2">
            Sign in
          </Link>
          .
        </p>
      }
    >
      <GoogleSignInButton className="w-full" label="Continue with Google" hint={hint} />
      <p className="mt-2 text-center text-xs text-muted-foreground">Quickest if your email is a Google account: no password to remember.</p>
      <OrDivider label="or create a password" />
      <form onSubmit={submit} noValidate>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="signup-name">Full name</FieldLabel>
            <Input id="signup-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="signup-email">Email</FieldLabel>
            <Input id="signup-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            {gmail ? <FieldDescription>This is a Gmail address: “Continue with Google” above works without a password.</FieldDescription> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="signup-password">Password</FieldLabel>
            <PasswordInput id="signup-password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="At least 8 characters" />
            <StrengthMeter password={password} />
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Spinner /> : null}
            Create account
          </Button>
          <p className="text-xs text-muted-foreground">We’ll email you a link to confirm the address before you can sign in to a center.</p>
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
