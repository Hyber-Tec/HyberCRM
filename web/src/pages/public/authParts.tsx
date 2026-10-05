import { useEffect, useState, type ReactNode } from 'react'
import { LuEye, LuEyeOff } from 'react-icons/lu'
import { useSearchParams } from 'react-router'
import { PASSWORD_STRENGTH_LABELS, passwordStrength } from '@shared/auth'
import { PRODUCT_NAME } from '@shared/brand'
import { BrandMark } from '@/components/app/BrandMark'
import { CompanyFooter } from '@/components/app/CompanyFooter'
import { HyberMark } from '@/components/app/HyberMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { branchIdOfPath, usePublicProfile } from '@/lib/publicProfile'
import { cn } from '@/lib/utils'

/** `?next=` when it's a path inside the app, else `/app`. */
export function useNext(): string {
  const [params] = useSearchParams()
  const next = params.get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/app'
}

/** The branch a sign-in page is for (from `?next=/demo-academy/…`), with its public name and logo. */
export function useAuthBranch(target: string) {
  const branchId = branchIdOfPath(target)
  const { data: profile, loading } = usePublicProfile(branchId)
  return { branchId, profile, loading: !!branchId && loading }
}

/** Keeps the query (next, email) when moving between the sign-in pages. */
export function withQuery(path: string, query: Record<string, string | null | undefined>): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, v)
  const s = params.toString()
  return s ? `${path}?${s}` : path
}

/**
 * The card every sign-in page shows: the branch's name and logo when the link came from a branch, else Hyber CRM's,
 * then the page's own content.
 */
export function AuthShell({
  target,
  title,
  description,
  children,
  footer,
}: {
  target: string
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const { profile } = useAuthBranch(target)
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
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : null}
        <div className="mt-6">{children}</div>
        {footer ? <div className="mt-6 space-y-2 border-t pt-4 text-xs text-muted-foreground">{footer}</div> : null}
      </div>
      <CompanyFooter />
    </div>
  )
}

/** "or" between Google and the email form. */
export function OrDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      {label}
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

/** A password field with a show/hide eye. */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
  autoFocus,
  invalid,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  placeholder?: string
  autoFocus?: boolean
  invalid?: boolean
}) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        className="pr-10"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-1/2 right-0.5 size-8 -translate-y-1/2 text-muted-foreground"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {shown ? <LuEyeOff /> : <LuEye />}
      </Button>
    </div>
  )
}

const STRENGTH_COLORS = ['bg-muted', 'bg-red-500', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-600']

/** Four bars and a word under a new password. */
export function StrengthMeter({ password }: { password: string }) {
  const s = passwordStrength(password)
  if (!password) return null
  return (
    <div className="mt-2 flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className={cn('h-1 flex-1 rounded-full', n <= s ? STRENGTH_COLORS[s] : 'bg-muted')} />
        ))}
      </div>
      <span className="w-16 text-right text-xs text-muted-foreground">{PASSWORD_STRENGTH_LABELS[s]}</span>
    </div>
  )
}

/** Seconds left before "Resend" works again, counting down. */
export function useCooldown(): [number, (seconds: number) => void] {
  const [until, setUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until <= now) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [until, now])
  return [Math.max(0, Math.ceil((until - now) / 1000)), (seconds) => {
    setNow(Date.now())
    setUntil(Date.now() + seconds * 1000)
  }]
}
