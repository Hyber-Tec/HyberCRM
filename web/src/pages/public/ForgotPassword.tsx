import { useEffect, useState } from 'react'
import { LuMail } from 'react-icons/lu'
import { Link, useSearchParams } from 'react-router'
import { authErrorMessage, looksLikeEmail } from '@shared/auth'
import { PRODUCT_NAME } from '@shared/brand'
import { useAuth } from '@/auth/AuthProvider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { AuthShell, useCooldown, useNext, withQuery } from './authParts'

/** "Forgot password?": emails a link to choose a new one. It never says whether the address has an account. */
export function ForgotPassword() {
  const { sendPasswordReset } = useAuth()
  const [params] = useSearchParams()
  const target = useNext()
  const [email, setEmail] = useState(params.get('email')?.trim().toLowerCase() ?? '')
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, startCooldown] = useCooldown()

  useEffect(() => {
    document.title = `Reset your password | ${PRODUCT_NAME}`
  }, [])

  const back = withQuery('/login', { next: target === '/app' ? null : target, email: email.trim() || null })

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    if (!looksLikeEmail(email)) return setError(authErrorMessage('invalid-email'))
    setBusy(true)
    try {
      await sendPasswordReset(email, target === '/app' ? null : target)
      setSentTo(email.trim().toLowerCase())
      startCooldown(60)
    } catch (err) {
      setError(authErrorMessage((err as { code?: string }).code, 'reset'))
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <AuthShell
        target={target}
        title="Check your email"
        description={
          <>
            If there’s a {PRODUCT_NAME} account for <span className="font-medium wrap-anywhere text-foreground">{sentTo}</span>, we sent it a link to
            choose a new password. The link works once, for an hour.
          </>
        }
        footer={<p>Not there after a minute? Check your spam folder. Signed up with Google? Then you don’t need a password: use “Continue with Google”.</p>}
      >
        <div className="mb-6 flex justify-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted">
            <LuMail className="size-7" />
          </div>
        </div>
        <div className="grid gap-2">
          <Button asChild>
            <Link to={back}>Back to sign in</Link>
          </Button>
          <Button variant="outline" onClick={() => void submit()} disabled={busy || cooldown > 0}>
            {busy ? <Spinner /> : null}
            {cooldown > 0 ? `Send again in ${cooldown}s` : 'Send it again'}
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      target={target}
      title="Reset your password"
      description="Enter the email you sign in with. We’ll email you a link to choose a new password."
      footer={
        <p>
          Remembered it?{' '}
          <Link to={back} className="font-medium text-foreground underline underline-offset-2">
            Back to sign in
          </Link>
          .
        </p>
      }
    >
      <form onSubmit={submit} noValidate>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="reset-email">Email</FieldLabel>
            <Input id="reset-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus placeholder="you@example.com" />
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Spinner /> : null}
            Send reset link
          </Button>
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
