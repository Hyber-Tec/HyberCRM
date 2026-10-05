import { applyActionCode, checkActionCode, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth'
import { useEffect, useRef, useState } from 'react'
import { LuCircleAlert, LuCircleCheck } from 'react-icons/lu'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { authErrorMessage, passwordProblem } from '@shared/auth'
import { PRODUCT_NAME } from '@shared/brand'
import { useAuth } from '@/auth/AuthProvider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { auth } from '@/lib/firebase'
import { AuthShell, PasswordInput, StrengthMeter, withQuery } from './authParts'

type State =
  | { step: 'working' }
  | { step: 'verified' }
  | { step: 'reset'; email: string }
  | { step: 'resetDone'; email: string }
  | { step: 'recovered'; email: string }
  | { step: 'failed'; message: string }

/** Whether this page was opened on a phone, where the person most likely came from the app. */
const onPhone = () => /iPhone|iPad|Android/i.test(navigator.userAgent)

/**
 * Where the links in account emails land (`/auth/action?mode=…&oobCode=…`): confirming an email, choosing a new
 * password, or undoing an email change. The links come from Hyber's emails (functions/src/account.ts) and, as a
 * fallback, from Firebase's own.
 */
export function AuthAction() {
  const [params] = useSearchParams()
  const mode = params.get('mode')
  const code = params.get('oobCode') ?? ''
  const nextParam = params.get('next')
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/app'
  const { user, checkVerified } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<State>({ step: 'working' })
  const started = useRef(false)

  useEffect(() => {
    document.title = `${mode === 'resetPassword' ? 'Choose a new password' : 'Confirm your email'} | ${PRODUCT_NAME}`
  }, [mode])

  useEffect(() => {
    // One-time codes: run once, even in development's double effects.
    if (started.current) return
    started.current = true
    void (async () => {
      try {
        if (!code) throw Object.assign(new Error(), { code: 'auth/invalid-action-code' })
        if (mode === 'verifyEmail') {
          await applyActionCode(auth, code)
          setState({ step: 'verified' })
        } else if (mode === 'resetPassword') {
          setState({ step: 'reset', email: await verifyPasswordResetCode(auth, code) })
        } else if (mode === 'recoverEmail') {
          const info = await checkActionCode(auth, code)
          await applyActionCode(auth, code)
          setState({ step: 'recovered', email: info.data.email ?? '' })
        } else {
          setState({ step: 'failed', message: 'This link isn’t one we recognize.' })
        }
      } catch (e) {
        setState({ step: 'failed', message: authErrorMessage((e as { code?: string }).code, mode === 'resetPassword' ? 'reset' : 'verify') })
      }
    })()
  }, [code, mode])

  // Confirmed in the browser that's signed in: carry on into the app.
  useEffect(() => {
    if (state.step !== 'verified' || !user) return
    void checkVerified().catch(() => undefined)
  }, [state.step, user, checkVerified])

  if (state.step === 'working') {
    return (
      <AuthShell target={next} title="One moment…">
        <div className="flex justify-center py-6">
          <Spinner className="size-6" />
        </div>
      </AuthShell>
    )
  }

  if (state.step === 'failed') {
    return (
      <AuthShell target={next} title="This link didn’t work" description={state.message}>
        <Icon ok={false} />
        <div className="grid gap-2">
          <Button asChild>
            <Link to={mode === 'resetPassword' ? withQuery('/forgot-password', { next: next === '/app' ? null : next }) : withQuery('/login', { next: next === '/app' ? null : next })}>
              {mode === 'resetPassword' ? 'Ask for a new link' : 'Go to sign in'}
            </Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  if (state.step === 'verified') {
    return (
      <AuthShell
        target={next}
        title="Email confirmed"
        description={onPhone() ? 'Thanks! Go back to the Hyber CRM app: it moves on by itself. Or continue here.' : 'Thanks! You can sign in with it now.'}
      >
        <Icon ok />
        <Button className="w-full" onClick={() => navigate(user ? next : withQuery('/login', { next: next === '/app' ? null : next }), { replace: true })}>
          Continue
        </Button>
      </AuthShell>
    )
  }

  if (state.step === 'recovered') {
    return (
      <AuthShell
        target={next}
        title="Email restored"
        description={`Your sign-in email is ${state.email} again. If you didn’t ask for the change, reset your password too.`}
      >
        <Icon ok />
        <div className="grid gap-2">
          <Button asChild>
            <Link to={withQuery('/forgot-password', { email: state.email })}>Reset my password</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/login">Go to sign in</Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  if (state.step === 'resetDone') {
    return (
      <AuthShell
        target={next}
        title="Password changed"
        description={onPhone() ? 'Go back to the Hyber CRM app and sign in with your new password, or sign in here.' : 'Sign in with your new password.'}
      >
        <Icon ok />
        <Button className="w-full" asChild>
          <Link to={withQuery('/login', { next: next === '/app' ? null : next, email: state.email })}>Sign in</Link>
        </Button>
      </AuthShell>
    )
  }

  return <NewPassword email={state.email} code={code} next={next} onDone={() => setState({ step: 'resetDone', email: state.email })} />
}

function Icon({ ok }: { ok: boolean }) {
  return (
    <div className="mb-6 flex justify-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        {ok ? <LuCircleCheck className="size-7 text-emerald-600" /> : <LuCircleAlert className="size-7 text-destructive" />}
      </div>
    </div>
  )
}

function NewPassword({ email, code, next, onDone }: { email: string; code: string; next: string; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const problem = passwordProblem(password, email)
    if (problem) return setError(problem)
    if (password !== confirm) return setError('The two passwords don’t match.')
    setBusy(true)
    try {
      await confirmPasswordReset(auth, code, password)
      onDone()
    } catch (err) {
      setError(authErrorMessage((err as { code?: string }).code, 'reset'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      target={next}
      title="Choose a new password"
      description={
        <>
          For <span className="font-medium wrap-anywhere text-foreground">{email}</span>.
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <FieldGroup className="gap-4">
          <input type="email" autoComplete="username" value={email} readOnly hidden />
          <Field>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <PasswordInput id="new-password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="At least 8 characters" autoFocus />
            <StrengthMeter password={password} />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm-password">Type it again</FieldLabel>
            <PasswordInput id="confirm-password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Spinner /> : null}
            Save new password
          </Button>
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
