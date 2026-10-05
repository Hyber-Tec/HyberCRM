import { LuClock } from 'react-icons/lu'
import { formatDuration, formatMinutes } from '@shared/time'
import { cn } from '@/lib/utils'
import type { TutorDay } from './useTutorDay'

type Tone = 'live' | 'warn' | 'muted'

/** Where the tutor stands with the time clock today (shifts come from the kiosk; nothing is clocked here). */
function clockState(t: TutorDay): { tone: Tone; title: string; detail: string } {
  const { clock, day, today } = t
  if (clock.open) {
    const since = clock.open.dateKey === today ? formatMinutes(clock.open.inMin) : `yesterday ${formatMinutes(clock.open.inMin)}`
    return { tone: 'live', title: `Clocked in since ${since}`, detail: `${formatDuration(clock.todayMinutes)} so far. Clock out at the kiosk when you leave.` }
  }
  const last = clock.closed[clock.closed.length - 1]
  const later = day.later[0]
  if (last) {
    return {
      tone: 'muted',
      title: `Clocked out at ${last.outMin != null ? formatMinutes(last.outMin) : '—'}`,
      detail: later ? `${formatDuration(clock.todayMinutes)} today. Clock in again before ${formatMinutes(later.startMin)}.` : `${formatDuration(clock.todayMinutes)} today.`,
    }
  }
  if (day.current.length) {
    return { tone: 'warn', title: 'Not clocked in', detail: `Your ${formatMinutes(day.current[0].startMin)} session has started. Clock in at the kiosk with your PIN.` }
  }
  if (later) return { tone: 'muted', title: 'Not clocked in yet', detail: `Your first session is at ${formatMinutes(later.startMin)}. Clock in at the kiosk when you arrive.` }
  return { tone: 'muted', title: 'Not clocked in today', detail: 'Nothing on your schedule today.' }
}

const DOT: Record<Tone, string> = {
  live: 'bg-emerald-500',
  warn: 'bg-amber-500',
  muted: 'bg-muted-foreground/40',
}

const ICON: Record<Tone, string> = {
  live: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
  warn: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
  muted: 'bg-muted text-muted-foreground',
}

/** Computers: the time clock card in the side column. */
export function ClockCard({ t }: { t: TutorDay }) {
  const s = clockState(t)
  return (
    <section className="rounded-xl border bg-card p-4" data-testid="tutor-clock">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Time clock</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{formatDuration(t.clock.weekMinutes)} this week</span>
      </div>
      <div className="mt-3 flex items-start gap-3">
        <span className={cn('relative flex size-9 shrink-0 items-center justify-center rounded-full', ICON[s.tone])}>
          <LuClock className="size-4" />
          {s.tone === 'live' ? <span className="absolute -right-0.5 -bottom-0.5 size-3 animate-pulse rounded-full border-2 border-card bg-emerald-500" /> : null}
        </span>
        <div className="min-w-0 leading-tight">
          <p className={cn('text-sm font-medium', s.tone === 'warn' && 'text-amber-700 dark:text-amber-400')}>{s.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{s.detail}</p>
        </div>
      </div>
    </section>
  )
}

/** Phones: the same, as one line under the greeting. */
export function ClockStrip({ t }: { t: TutorDay }) {
  const s = clockState(t)
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm',
        s.tone === 'warn' ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40' : 'bg-card',
      )}
      data-testid="tutor-clock"
    >
      <span className={cn('size-2 shrink-0 rounded-full', DOT[s.tone], s.tone === 'live' && 'animate-pulse')} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className={cn('font-medium', s.tone === 'warn' && 'text-amber-800 dark:text-amber-300')}>{s.title}</span>
        {s.tone === 'warn' ? <span className="mt-0.5 block text-xs text-amber-800/80 dark:text-amber-300/80">{s.detail}</span> : null}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {t.clock.open || t.clock.closed.length ? `${formatDuration(t.clock.todayMinutes)} today` : `${formatDuration(t.clock.weekMinutes)} this week`}
      </span>
    </div>
  )
}
