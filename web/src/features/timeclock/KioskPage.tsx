import { httpsCallable } from 'firebase/functions'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LuCircleCheck, LuDelete, LuLogOut } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { formatDuration, formatInstant, formatInstantTime } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { BrandMark } from '@/components/app/BrandMark'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { functions } from '@/lib/firebase'
import { cn } from '@/lib/utils'

type Screen = 'welcome' | 'pin' | 'action' | 'success'

interface Identity {
  staffId: string
  name: string
  openSince: number | null
}

const identify = httpsCallable<{ branchId: string; pin: string }, Identity>(functions, 'kioskIdentify')
const punch = httpsCallable<{ branchId: string; pin: string }, { action: 'in' | 'out'; name: string; clockInAt: number | null; clockOutAt: number | null }>(
  functions,
  'kioskPunch',
)

const IDLE_MS = 30_000

/**
 * Demo kiosk (owner decision Q8): opened by an admin on the center's computer.
 * Staff clock in and out with their PIN; the server records the time. A future
 * Android tablet app calls the same functions.
 */
export function KioskPage() {
  const { branchId, branch, settings, timezone } = useBranch()
  const navigate = useNavigate()
  const pinLength = settings.timeClock.kiosk.pinLength
  const [screen, setScreen] = useState<Screen>('welcome')
  const [pin, setPin] = useState('')
  const [who, setWho] = useState<Identity | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const idle = useRef<number | undefined>(undefined)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    document.title = `Kiosk | ${branch.name}`
    return () => clearInterval(t)
  }, [branch.name])

  const reset = useCallback(() => {
    setScreen('welcome')
    setPin('')
    setWho(null)
    setError(null)
    setMessage(null)
  }, [])

  // Return to the welcome screen after inactivity (nobody is left "logged in").
  const bump = useCallback(() => {
    window.clearTimeout(idle.current)
    idle.current = window.setTimeout(reset, IDLE_MS)
  }, [reset])
  useEffect(() => {
    if (screen === 'pin' || screen === 'action') bump()
    return () => window.clearTimeout(idle.current)
  }, [screen, bump])

  const submitPin = useCallback(
    async (value: string) => {
      setBusy(true)
      setError(null)
      try {
        const res = await identify({ branchId, pin: value })
        setWho(res.data)
        setScreen('action')
      } catch (e) {
        setError((e as { message?: string }).message?.replace(/^.*?: /, '') || 'PIN not found. Try again.')
        setPin('')
      } finally {
        setBusy(false)
      }
    },
    [branchId],
  )

  const press = useCallback(
    (key: string) => {
      bump()
      if (busy) return
      if (key === 'clear') return setPin('')
      if (key === 'back') return setPin((p) => p.slice(0, -1))
      setPin((p) => {
        if (p.length >= pinLength) return p
        const next = p + key
        if (next.length === pinLength) void submitPin(next)
        return next
      })
    },
    [busy, pinLength, submitPin, bump],
  )

  useEffect(() => {
    if (screen !== 'pin') return
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') press('back')
      else if (e.key === 'Escape') reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen, press, reset])

  async function doPunch() {
    setBusy(true)
    setError(null)
    try {
      const res = await punch({ branchId, pin })
      const d = res.data
      if (d.action === 'in') setMessage(`${d.name} clocked in at ${formatInstantTime(d.clockInAt!, timezone)}.`)
      else {
        const mins = d.clockInAt && d.clockOutAt ? (d.clockOutAt - d.clockInAt) / 60000 : 0
        setMessage(`${d.name} clocked out at ${formatInstantTime(d.clockOutAt!, timezone)}. Worked ${formatDuration(mins)}.`)
      }
      setScreen('success')
      setTimeout(reset, settings.timeClock.kiosk.successReturnSeconds * 1000)
    } catch (e) {
      setError((e as { message?: string }).message?.replace(/^.*?: /, '') || 'Clock action failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-svh flex-col bg-gradient-to-b from-neutral-50 to-neutral-200 select-none dark:from-neutral-900 dark:to-neutral-950" onPointerDown={bump}>
      <header className="flex items-center gap-3 bg-neutral-900 px-5 py-3 text-white">
        <BrandMark name={branch.name} logoUrl={branch.branding?.logoUrl} accentColor={branch.branding?.accentColor} className="size-10" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold">{branch.name}</div>
          <div className="text-xs text-neutral-300">Time clock</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium">{formatInstant(now, timezone, { weekday: 'long', month: 'numeric', day: 'numeric', year: 'numeric' })}</div>
          <div className="text-lg font-semibold tabular-nums">{formatInstant(now, timezone, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="ml-2 text-neutral-300 hover:bg-white/10 hover:text-white"
          aria-label="Exit kiosk"
          onClick={() => window.confirm('Exit kiosk mode?') && navigate(`/${branchId}/admin/home`)}
        >
          <LuLogOut />
        </Button>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        {screen === 'welcome' ? (
          <button type="button" className="flex flex-col items-center gap-6" onClick={() => setScreen('pin')}>
            <BrandMark name={branch.name} logoUrl={branch.branding?.logoUrl} accentColor={branch.branding?.accentColor} className="size-40 rounded-3xl text-5xl" />
            <div className="text-4xl font-bold tracking-tight">{branch.name}</div>
            <div className="animate-pulse text-lg text-muted-foreground">Tap anywhere to begin</div>
          </button>
        ) : null}

        {screen === 'pin' ? (
          <div className="grid w-full max-w-4xl items-center gap-8 md:grid-cols-2">
            <div className="text-center">
              <div className="text-2xl font-semibold">Enter your {pinLength}-digit PIN</div>
              <div className="mt-6 flex justify-center gap-3">
                {Array.from({ length: pinLength }, (_, i) => (
                  <div key={i} className={cn('flex size-16 items-center justify-center rounded-2xl border-2 bg-white text-3xl font-bold dark:bg-neutral-900', pin.length > i ? 'border-neutral-900 dark:border-white' : 'border-neutral-300')}>
                    {pin.length > i ? '•' : ''}
                  </div>
                ))}
              </div>
              <div className="mt-4 h-6 text-sm font-medium text-red-700">{busy ? <Spinner className="mx-auto" /> : error}</div>
              <Button variant="ghost" className="mt-6" onClick={reset}>
                Back
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'].map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={busy}
                  onClick={() => press(k)}
                  className={cn(
                    'flex h-20 items-center justify-center rounded-2xl text-3xl font-semibold shadow-sm transition active:scale-95',
                    /\d/.test(k) ? 'bg-white text-neutral-900 dark:bg-neutral-800 dark:text-white' : 'bg-neutral-200 text-base text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
                  )}
                >
                  {k === 'back' ? <LuDelete className="size-7" /> : k === 'clear' ? 'Clear' : k}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {screen === 'action' && who ? (
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="text-4xl font-bold">Welcome, {who.name.split(' ')[0]}</div>
            <div className="text-lg text-muted-foreground">
              {who.openSince ? `Clocked in at ${formatInstantTime(who.openSince, timezone)}` : 'Currently clocked out'}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void doPunch()}
              className={cn(
                'flex h-44 w-[min(420px,85vw)] items-center justify-center rounded-3xl text-5xl font-extrabold text-white shadow-lg transition active:scale-95 disabled:opacity-60',
                who.openSince ? 'bg-red-700' : 'bg-emerald-700',
              )}
            >
              {busy ? <Spinner className="size-10" /> : who.openSince ? 'CLOCK OUT' : 'CLOCK IN'}
            </button>
            {error ? <div className="text-sm font-medium text-red-700">{error}</div> : null}
            <Button variant="ghost" onClick={reset}>
              Back
            </Button>
          </div>
        ) : null}

        {screen === 'success' ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <LuCircleCheck className="size-28 text-emerald-700" />
            <div className="text-3xl font-bold">{message}</div>
            <div className="text-muted-foreground">Returning to the welcome screen…</div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
