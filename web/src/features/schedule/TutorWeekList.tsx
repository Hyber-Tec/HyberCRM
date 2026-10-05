import { useEffect, useMemo, useState } from 'react'
import { FaCheckCircle } from 'react-icons/fa'
import { FaTriangleExclamation } from 'react-icons/fa6'
import { LuChevronDown, LuChevronLeft, LuChevronRight, LuStickyNote, LuTriangleAlert } from 'react-icons/lu'
import { type Conflict, tutorConflictText } from '@shared/schedule/conflicts'
import { canLog } from '@shared/sessions/logs'
import type { DayHours } from '@shared/settings/defaults'
import { type DateKey, WEEKDAY_SHORT, formatDateKey, formatMinutes, weekdayOf } from '@shared/time'
import type { Session, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { StatePill, plural } from '@/features/home/parts'
import { sessionState, weekRange } from '@/features/tutor/sessionUi'
import { cn } from '@/lib/utils'
import { SESSION_CARD_STYLE } from './cardStyle'
import { TutorSessionSheet } from './TutorSessionSheet'

/**
 * Phones: the tutor's week as a list (True Education's phone schedule, as in
 * the phone app): week arrows and Today, a day strip, past days of this week
 * folded away, and a card per session with its status, note, log mark and
 * conflict. A tap opens the session as a sheet.
 */
export function TutorWeekList({
  days,
  today,
  nowMin,
  sessions,
  hoursOf,
  conflictsOf,
  studentOf,
  focus,
  onWeek,
  waitingNote,
}: {
  days: DateKey[]
  today: DateKey
  nowMin: number
  /** This week's sessions (deleted ones left out). */
  sessions: WithId<Session>[]
  hoursOf: (d: DateKey) => DayHours
  conflictsOf: (s: WithId<Session>) => Conflict[]
  studentOf: (id: string) => WithId<Student> | undefined
  /** A date to show (from a notification or Today); its day opens and scrolls into view. */
  focus: DateKey | null
  /** -1 / +1 for the previous or next week, 0 for this week. */
  onWeek: (step: -1 | 0 | 1) => void
  waitingNote: React.ReactNode
}) {
  const { settings } = useBranch()
  const allowed = settings.sessionLogs.allowForStatuses
  const isThisWeek = days.includes(today)
  const [showEarlier, setShowEarlier] = useState(false)
  const [open, setOpen] = useState<WithId<Session> | null>(null)
  const weekKey = days[0]
  // A new week starts folded again.
  useEffect(() => setShowEarlier(false), [weekKey])

  const byDay = useMemo(() => {
    const map = new Map<DateKey, WithId<Session>[]>()
    for (const s of [...sessions].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.studentName.localeCompare(b.studentName))) {
      map.set(s.dateKey, [...(map.get(s.dateKey) ?? []), s])
    }
    return map
  }, [sessions])
  const withSessions = days.filter((d) => byDay.has(d))
  const earlier = isThisWeek ? withSessions.filter((d) => d < today) : []
  const shown = withSessions.filter((d) => showEarlier || !earlier.includes(d))
  const earlierCount = earlier.reduce((n, d) => n + (byDay.get(d)?.length ?? 0), 0)

  const scrollTo = (d: DateKey) => {
    if (earlier.includes(d)) setShowEarlier(true)
    requestAnimationFrame(() => document.getElementById(`tday-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  // Notifications and Today link here with a date: open that day.
  useEffect(() => {
    if (!focus || !days.includes(focus) || !byDay.has(focus)) return
    if (focus < today) setShowEarlier(true)
    const t = window.setTimeout(() => document.getElementById(`tday-${focus}`)?.scrollIntoView({ block: 'start' }), 60)
    return () => window.clearTimeout(t)
    // Only when the date or the loaded week changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, weekKey, byDay.size])

  return (
    <div>
      <div className="sticky top-12 z-10 -mx-4 border-b bg-background/95 px-4 pt-1 pb-2 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl leading-tight font-semibold tracking-tight">Schedule</h1>
            <p className="text-sm text-muted-foreground tabular-nums" data-testid="week-range">
              {weekRange(days[0], days[days.length - 1])}
            </p>
          </div>
          {!isThisWeek ? (
            <Button variant="outline" size="sm" onClick={() => onWeek(0)}>
              Today
            </Button>
          ) : null}
          <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => onWeek(-1)}>
            <LuChevronLeft />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next week" onClick={() => onWeek(1)}>
            <LuChevronRight />
          </Button>
        </div>
        <ol className="mt-2 grid grid-cols-7" aria-label="Days of the week">
          {days.map((d) => {
            const list = (byDay.get(d) ?? []).filter((s) => s.status !== 'canceled')
            const isToday = d === today
            const closed = !hoursOf(d).isOpen && !list.length
            return (
              <li key={d}>
                <button
                  type="button"
                  disabled={!byDay.has(d)}
                  onClick={() => scrollTo(d)}
                  aria-label={`${formatDateKey(d, 'weekdayLong')}: ${list.length ? plural(list.length, 'session') : closed ? 'closed' : 'nothing booked'}`}
                  className="flex w-full flex-col items-center gap-0.5 rounded-lg py-1 disabled:cursor-default enabled:active:bg-muted"
                >
                  <span className={cn('text-[11px] font-medium', isToday ? 'text-foreground' : 'text-muted-foreground')}>{WEEKDAY_SHORT[weekdayOf(d)].slice(0, 2)}</span>
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full text-sm tabular-nums',
                      isToday ? 'bg-foreground font-semibold text-background' : d < today ? 'text-muted-foreground' : closed ? 'text-muted-foreground/60' : 'font-medium',
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                  <span className="flex h-1.5 items-center gap-0.5">
                    {list.slice(0, 3).map((s) => (
                      <span key={s.id} className="size-1 rounded-full" style={{ backgroundColor: SESSION_CARD_STYLE[s.status]?.bar }} />
                    ))}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="mt-4">{waitingNote}</div>

      {earlier.length && !showEarlier ? (
        <button
          type="button"
          onClick={() => setShowEarlier(true)}
          className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-2.5 text-sm font-medium text-muted-foreground active:bg-muted"
          data-testid="show-earlier"
        >
          <LuChevronDown className="size-4" />
          Show earlier this week · {plural(earlierCount, 'session')}
        </button>
      ) : null}

      {withSessions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">No sessions this week.</p>
          {!isThisWeek ? (
            <Button variant="outline" size="sm" onClick={() => onWeek(0)}>
              Go to this week
            </Button>
          ) : null}
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">No more sessions this week.</p>
      ) : null}

      <div className="space-y-6">
        {shown.map((d) => {
          const list = byDay.get(d) ?? []
          const live = list.filter((s) => s.status !== 'canceled')
          const isToday = d === today
          return (
            <section key={d} id={`tday-${d}`} className="scroll-mt-48" aria-label={formatDateKey(d, 'weekdayLong')}>
              <h2 className="mb-2 flex items-baseline gap-2 px-0.5">
                {isToday ? <span className="text-xs font-bold tracking-wide text-red-600">TODAY</span> : null}
                <span className={cn('text-sm font-semibold', d < today && 'text-muted-foreground')}>{formatDateKey(d, 'weekdayLong').replace(/, \d{4}$/, '')}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {live.length ? `${plural(live.length, 'session')}` : 'Canceled'}
                </span>
              </h2>
              <ul className="space-y-2">
                {list.map((s) => (
                  <li key={s.id}>
                    <SessionRow s={s} today={today} nowMin={nowMin} allowed={allowed} conflicts={conflictsOf(s)} onOpen={() => setOpen(s)} />
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <TutorSessionSheet
        session={open ? (sessions.find((x) => x.id === open.id) ?? open) : null}
        onClose={() => setOpen(null)}
        today={today}
        nowMin={nowMin}
        conflicts={open ? conflictsOf(open) : []}
        student={open ? studentOf(open.studentId) : undefined}
      />
    </div>
  )
}

function SessionRow({
  s,
  today,
  nowMin,
  allowed,
  conflicts,
  onOpen,
}: {
  s: WithId<Session>
  today: DateKey
  nowMin: number
  allowed: readonly Session['status'][]
  conflicts: Conflict[]
  onOpen: () => void
}) {
  const why = tutorConflictText(conflicts)
  const st = sessionState(s, { today, nowMin, allowed, waiting: why })
  const ended = s.dateKey < today || (s.dateKey === today && s.endMin <= nowMin)
  // True Education's marks: a blue check once the log is in, a red triangle while it's owed.
  const logState = s.logStatus === 'submitted' ? 'submitted' : ended && canLog(s.status, allowed) ? 'missing' : null
  const bar = SESSION_CARD_STYLE[s.status]?.bar ?? '#a1a1aa'
  const live = s.dateKey === today && s.startMin <= nowMin && !ended
  const upcoming = !ended && !live
  // Upcoming sessions that are just booked or confirmed need no pill: the name gets the room.
  const quiet = upcoming && !why && (s.status === 'pending' || s.status === 'confirmed')
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="week-session"
      className={cn(
        'flex w-full items-stretch gap-3 rounded-xl border bg-card p-3 text-left shadow-xs active:bg-muted/60',
        why && 'border-dashed border-red-400 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20',
        s.status === 'canceled' && 'opacity-60',
      )}
    >
      <span className="w-1 shrink-0 rounded-full" style={{ backgroundColor: bar }} aria-hidden />
      <span className="w-[4.1rem] shrink-0 text-sm leading-tight tabular-nums">
        <span className="block font-medium">{formatMinutes(s.startMin)}</span>
        <span className="block text-xs text-muted-foreground">{formatMinutes(s.endMin)}</span>
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-baseline gap-1.5">
          <span className={cn('truncate font-semibold', s.status === 'canceled' && 'line-through decoration-muted-foreground/60')}>{s.studentName}</span>
          {s.studentGrade ? <span className="shrink-0 text-xs text-muted-foreground">Gr {s.studentGrade}</span> : null}
        </span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
          {s.subject || 'No subject'}
          {/* Booked but not confirmed yet: said quietly (the bar is yellow too), it's the usual state further ahead. */}
          {upcoming && s.status === 'pending' && !why ? <span className="text-amber-700 dark:text-amber-400"> · Pending</span> : null}
        </span>
        {s.note ? (
          <span className="mt-1.5 flex items-start gap-1.5 text-xs text-blue-700 dark:text-blue-300">
            <LuStickyNote className="mt-px size-3 shrink-0" />
            <span className="line-clamp-2">{s.note}</span>
          </span>
        ) : null}
        {why ? (
          <span className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
            <LuTriangleAlert className="mt-px size-3 shrink-0" />
            <span className="line-clamp-3">{why}</span>
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-col items-end">
        {logState === 'submitted' ? (
          <span title="Session log submitted." data-testid="log-indicator" className="flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400">
            <FaCheckCircle className="size-3.5" aria-hidden /> Logged
          </span>
        ) : logState === 'missing' ? (
          <span title="Please write your session log." data-testid="log-indicator" className="flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400">
            <FaTriangleExclamation className="size-3.5" aria-hidden /> Write log
          </span>
        ) : quiet ? null : (
          <StatePill tone={st.tone} pulse={st.pulse}>
            {st.label}
          </StatePill>
        )}
      </span>
    </button>
  )
}
