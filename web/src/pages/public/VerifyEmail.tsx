import { useCallback, useEffect, useRef, useState } from 'react'
import { LuMailCheck } from 'react-icons/lu'
import { Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { authErrorMessage } from '@shared/auth'
import { PRODUCT_NAME, SENDER_EMAIL } from '@shared/brand'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/components/app/FullPage'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { AuthShell, useCooldown, useNext } from './authParts'

/**
 * "Check your email": a new password account waits here until its address is confirmed. It checks by itself every
 * few seconds and when the tab comes back to the front, so opening the link (here, on the phone, anywhere) is enough.
 */
export function VerifyEmail() {
  const { status, user, needsVerification, sendVerification, checkVerified, signOut } = useAuth()
  const target = useNext()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(false)
  const [sending, setSending] = useState(false)
  const [cooldown, startCooldown] = useCooldown()
  const busy = useRef(false)

  useEffect(() => {
    document.title = `Confirm your email | ${PRODUCT_NAME}`
  }, [])

  const check = useCallback(
    async (quiet: boolean) => {
      if (busy.current) return
      busy.current = true
      if (!quiet) setChecking(true)
      try {
        const ok = await checkVerified()
        if (ok) navigate(target, { replace: true })
        else if (!quiet) toast.info('Not confirmed yet', { description: 'Open the link in the email, then try again.' })
      } catch (e) {
        if (!quiet) toast.error(authErrorMessage((e as { code?: string }).code, 'verify'))
      } finally {
        busy.current = false
        if (!quiet) setChecking(false)
      }
    },
    [checkVerified, navigate, target],
  )

  useEffect(() => {
    if (!needsVerification) return
    const t = setInterval(() => void check(true), 5000)
    const onFocus = () => void check(true)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [needsVerification, check])

  if (status === 'loading') return <FullPageSpinner />
  if (status === 'signedOut') return <Navigate to="/login" replace />
  if (!needsVerification) return <Navigate to={target} replace />

  async function resend() {
    setSending(true)
    try {
      const r = await sendVerification(target)
      if (r === 'verified') return void check(false)
      if (r === 'throttled') toast.info('Already sent', { description: 'Give it a minute, and check your spam folder too.' })
      else toast.success('Email sent', { description: `Check ${user?.email}.` })
      startCooldown(60)
    } catch (e) {
      toast.error(authErrorMessage((e as { code?: string }).code, 'verify'))
    } finally {
      setSending(false)
    }
  }

  return (
    <AuthShell
      target={target}
      title="Confirm your email"
      description={
        <>
          We sent a link to <span className="font-medium wrap-anywhere text-foreground">{user?.email}</span>. Open it to confirm the address. This page
          moves on by itself once you have.
        </>
      }
      footer={
        <>
          <p>
            The email comes from {PRODUCT_NAME} ({SENDER_EMAIL}). Not there after a minute? Check your spam folder, or send it again.
          </p>
          <p>
            Wrong email?{' '}
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-2"
              onClick={async () => {
                await signOut()
                navigate('/signup', { replace: true })
              }}
            >
              Start over with another one
            </button>
            .
          </p>
        </>
      }
    >
      <div className="mb-6 flex justify-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted">
          <LuMailCheck className="size-7" />
        </div>
      </div>
      <div className="grid gap-2">
        <Button onClick={() => void check(false)} disabled={checking}>
          {checking ? <Spinner /> : null}
          I’ve confirmed it
        </Button>
        <Button variant="outline" onClick={() => void resend()} disabled={sending || cooldown > 0}>
          {sending ? <Spinner /> : null}
          {cooldown > 0 ? `Send again in ${cooldown}s` : 'Send the email again'}
        </Button>
      </div>
    </AuthShell>
  )
}
