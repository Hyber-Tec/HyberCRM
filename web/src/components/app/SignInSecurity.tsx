import { useState } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { LuKeyRound } from 'react-icons/lu'
import { toast } from 'sonner'
import { authErrorMessage, passwordProblem } from '@shared/auth'
import { useAuth } from '@/auth/AuthProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { PasswordInput, StrengthMeter } from '@/pages/public/authParts'

/** How the account signs in (Google, a password), with "Change password" or "Add a password". */
export function SignInMethodsList({ onPassword }: { onPassword: () => void }) {
  const { methods, email } = useAuth()
  return (
    <div className="divide-y rounded-lg border">
      <div className="flex items-center gap-3 px-4 py-3">
        <FcGoogle className="size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Google</div>
          <div className="truncate text-xs text-muted-foreground">{methods.google ? email : 'Not connected'}</div>
        </div>
        {methods.google ? <Badge variant="secondary">Connected</Badge> : null}
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <LuKeyRound className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Password</div>
          <div className="text-xs text-muted-foreground">{methods.password ? 'You can sign in with your email and password.' : 'Add one to sign in without Google.'}</div>
        </div>
        <Button variant="outline" size="sm" onClick={onPassword}>
          {methods.password ? 'Change' : 'Add'}
        </Button>
      </div>
    </div>
  )
}

/** Change the password (or add one to a Google account). Confirms the current password first. */
export function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { methods, email, changePassword, sendPasswordReset } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const adding = !methods.password

  const close = (o: boolean) => {
    if (!o) {
      setCurrent('')
      setNext('')
      setConfirm('')
      setError(null)
    }
    onOpenChange(o)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!adding && !current) return setError('Enter your current password.')
    const problem = passwordProblem(next, email)
    if (problem) return setError(problem)
    if (next !== confirm) return setError('The two new passwords don’t match.')
    setBusy(true)
    try {
      await changePassword(adding ? null : current, next)
      toast.success(adding ? 'Password added' : 'Password changed', { description: adding ? 'You can now sign in with your email and password too.' : undefined })
      close(false)
    } catch (err) {
      setError(authErrorMessage((err as { code?: string }).code, 'change-password'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{adding ? 'Add a password' : 'Change your password'}</DialogTitle>
            <DialogDescription>
              {adding ? `Then you can also sign in with ${email} and this password, for example in the phone app.` : `For ${email}.`}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="my-6 gap-4">
            <input type="email" autoComplete="username" value={email ?? ''} readOnly hidden />
            {!adding ? (
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="pw-current">Current password</FieldLabel>
                  <button
                    type="button"
                    className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                    onClick={async () => {
                      if (!email) return
                      await sendPasswordReset(email).catch(() => undefined)
                      toast.success('Reset link sent', { description: `Check ${email}.` })
                    }}
                  >
                    Forgot it?
                  </button>
                </div>
                <PasswordInput id="pw-current" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="pw-new">New password</FieldLabel>
              <PasswordInput id="pw-new" value={next} onChange={setNext} autoComplete="new-password" placeholder="At least 8 characters" autoFocus={adding} />
              <StrengthMeter password={next} />
            </Field>
            <Field>
              <FieldLabel htmlFor="pw-confirm">Type it again</FieldLabel>
              <PasswordInput id="pw-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            </Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner /> : null}
              {adding ? 'Add password' : 'Change password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** "Sign-in & security" from the account menu: how the account signs in, and its password. */
export function SignInSecurityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [password, setPassword] = useState(false)
  return (
    <>
      <Dialog open={open && !password} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign-in & security</DialogTitle>
            <DialogDescription>How you sign in to Hyber CRM. Your access to a center follows your email, whichever way you sign in.</DialogDescription>
          </DialogHeader>
          <SignInMethodsList onPassword={() => setPassword(true)} />
        </DialogContent>
      </Dialog>
      <PasswordDialog
        open={open && password}
        onOpenChange={(o) => {
          if (!o) {
            setPassword(false)
            onOpenChange(false)
          }
        }}
      />
    </>
  )
}
