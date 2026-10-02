import { query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuCalendarDays, LuChevronDown, LuGraduationCap, LuNotebookPen, LuPencil } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import type { Conflict } from '@shared/schedule/conflicts'
import { occursOn } from '@shared/schedule/events'
import { canLog } from '@shared/sessions/logs'
import { type DateKey, formatMinutes } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ContextMenuFor, menu } from '@/components/app/ItemMenu'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDayConfigs } from '@/features/data/hooks'
import type { EventDoc } from '@/features/schedule/useScheduleData'
import { branchCol, useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { PersonDot, StatePill, type Tone, plural } from './parts'

/** Sessions shown before "Show N more". */
const FIRST_ROWS = 12

type Filter = 'all' | 'now' | 'later'

type Row =
  | { kind: 'session'; key: string; startMin: number; endMin: number; session: WithId<Session> }
  | { kind: 'event'; key: string; startMin: number; endMin: number; event: WithId<EventDoc> }

const ms = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? 0

/** Today's sessions in order, with a red "now" line (Home option 1). */
export function TodayCard({
  sessions,
  loading,
  today,
  now,
  nowMin,
  conflictsOf,
  colorOf,
  onEdit,
}: {
  sessions: WithId<Session>[]
  loading: boolean
  today: DateKey
  now: number
  nowMin: number
  conflictsOf: (id: string) => Conflict[] | undefined
  colorOf: (staffId: string) => string | null
  onEdit: (s: WithId<Session>) => void
}) {
  const { branchId, settings } = useBranch()
  const { map: dayConfigs } = useDayConfigs(today, today)
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [showEarlier, setShowEarlier] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [showCanceled, setShowCanceled] = useState(false)

  const oneOffQ = useMemo(() => query(branchCol(branchId, COL.events), where('isRecurring', '==', false), where('dateKey', '==', today)), [branchId, today])
  const recurringQ = useMemo(() => query(branchCol(branchId, COL.events), where('isRecurring', '==', true)), [branchId])
  const oneOff = useQuery<EventDoc>(oneOffQ, `home-events-${branchId}-${today}`)
  const recurring = useQuery<EventDoc>(recurringQ, `sched-revents-${branchId}`)

  const day = useMemo(() => {
    const live = sessions.filter((s) => !s.isDeleted).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.studentName.localeCompare(b.studentName))
    const canceled = live.filter((s) => s.status === 'canceled')
    const active = live.filter((s) => s.status !== 'canceled')
    const earlier = active.filter((s) => ms(s.endAt) <= now)
    const current = active.filter((s) => ms(s.startAt) <= now && ms(s.endAt) > now && s.status !== 'no_show')
    const later = active.filter((s) => ms(s.startAt) > now)
    const events = [...oneOff.data, ...recurring.data]
      .filter((e) => occursOn(e, today))
      .map((event): Row => ({ kind: 'event', key: `event-${event.id}`, startMin: event.startMin, endMin: event.endMin, event }))
    const tutors = new Set(active.map((s) => s.tutorId))
    return { active, canceled, earlier, current, later, events, tutors: tutors.size }
  }, [sessions, oneOff.data, recurring.data, today, now])

  const toRow = (s: WithId<Session>): Row => ({ kind: 'session', key: s.id, startMin: s.startMin, endMin: s.endMin, session: s })
  const byTime = (a: Row, b: Row) => a.startMin - b.startMin || a.endMin - b.endMin
  // All: what's on now, the red line, then what's later (events ride along; ended ones drop off).
  const currentRows =
    filter === 'later' ? [] : [...day.current.map(toRow), ...(filter === 'all' ? day.events.filter((e) => e.startMin <= nowMin && e.endMin > nowMin) : [])].sort(byTime)
  const laterRows = filter === 'now' ? [] : [...day.later.map(toRow), ...(filter === 'all' ? day.events.filter((e) => e.startMin > nowMin) : [])].sort(byTime)
  const list = [...currentRows, ...laterRows]
  const visible = showAll ? list : list.slice(0, FIRST_ROWS)
  const hidden = list.length - visible.length
  const lineIndex = filter === 'all' && day.active.length > 0 ? currentRows.length : -1
  const hours = dayHours(today, settings, dayConfigs)
  const loggable = settings.sessionLogs.allowForStatuses
  const missingEarlier = day.earlier.filter((s) => s.logStatus !== 'submitted' && canLog(s.status, loggable)).length

  const stateOf = (s: WithId<Session>): { label: string; tone: Tone; pulse?: boolean; title?: string } => {
    if (s.status === 'canceled') return { label: 'Canceled', tone: 'muted' }
    if (s.status === 'no_show') return { label: 'No show', tone: 'danger' }
    const ended = ms(s.endAt) <= now
    if (ended) {
      if (s.logStatus === 'submitted') return { label: 'Logged', tone: 'done' }
      return canLog(s.status, loggable) ? { label: 'Log missing', tone: 'warn' } : { label: 'Done', tone: 'muted' }
    }
    const conflicts = conflictsOf(s.id)
    if (conflicts?.length) return { label: 'In conflict', tone: 'danger', title: conflicts[0].message }
    if (ms(s.startAt) <= now) return { label: 'In progress', tone: 'live', pulse: true }
    if (s.status === 'pending') return { label: 'Unconfirmed', tone: 'warn' }
    if (s.status === 'present') return { label: 'Present', tone: 'muted' }
    return { label: 'Confirmed', tone: 'muted' }
  }

  const sessionRow = (s: WithId<Session>, muted = false) => {
    const st = stateOf(s)
    const logged = s.logStatus === 'submitted'
    const logOk = logged || canLog(s.status, loggable)
    return (
      <ContextMenuFor
        key={s.id}
        entries={menu(
          { kind: 'label', label: `${s.studentName} · ${formatMinutes(s.startMin)}` },
          { label: 'Edit session…', icon: LuPencil, onSelect: () => onEdit(s) },
          logOk && {
            label: logged ? 'View session log' : 'Write session log',
            icon: LuNotebookPen,
            onSelect: () => window.open(`/${branchId}/session-log/${s.id}${logged ? '/view' : ''}`, '_blank', 'noopener'),
          },
          { label: 'Open in schedule', icon: LuCalendarDays, separatorBefore: true, onSelect: () => navigate(`/${branchId}/admin/schedule/day/${today}`) },
          { label: 'Open student profile', icon: LuGraduationCap, onSelect: () => navigate(`/${branchId}/admin/students/${s.studentId}`) },
        )}
      >
        <li>
          <button
            type="button"
            onClick={() => onEdit(s)}
            data-testid="home-session"
            className={cn('grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50', muted && 'opacity-70')}
          >
            <div className="text-sm leading-tight tabular-nums">
              <div className="font-medium">{formatMinutes(s.startMin)}</div>
              <div className="text-xs text-muted-foreground">{formatMinutes(s.endMin)}</div>
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium">
                {s.studentName}
                {s.studentGrade ? <span className="font-normal text-muted-foreground"> · Grade {s.studentGrade}</span> : null}
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="truncate">{s.subject || 'No subject'}</span>
                <span className="text-muted-foreground/50">·</span>
                <PersonDot name={s.tutorName} color={colorOf(s.tutorId)} size="xs" />
                <span className="truncate">{s.tutorName}</span>
              </div>
            </div>
            <StatePill tone={st.tone} pulse={st.pulse} title={st.title}>
              {st.label}
            </StatePill>
          </button>
        </li>
      </ContextMenuFor>
    )
  }

  const eventRow = (e: WithId<EventDoc>, key: string) => (
    <li key={key} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 bg-sky-50/40 px-4 py-2.5 dark:bg-sky-950/15">
      <div className="text-sm leading-tight tabular-nums">
        <div className="font-medium">{formatMinutes(e.startMin)}</div>
        <div className="text-xs text-muted-foreground">{formatMinutes(e.endMin)}</div>
      </div>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-medium">{e.title}</div>
        {e.notes ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{e.notes}</div> : null}
      </div>
      <StatePill tone="done">Event</StatePill>
    </li>
  )

  const nowLine = (
    <li key="now-line" className="flex items-center gap-2 px-4 py-1" aria-label={`Now, ${formatMinutes(nowMin)}`} data-testid="home-now-line">
      <span className="text-[11px] font-semibold text-red-600 tabular-nums">{formatMinutes(nowMin)}</span>
      <span className="h-px flex-1 bg-red-400/70" />
    </li>
  )

  const segments: [Filter, string][] = [
    ['all', 'All'],
    ['now', `Now · ${day.current.length}`],
    ['later', `Later · ${day.later.length}`],
  ]

  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-testid="home-today">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">
          Today’s sessions <span className="ml-1 font-normal text-muted-foreground">{loading ? '' : day.active.length}</span>
        </h2>
        <div role="tablist" aria-label="Show" className="flex rounded-lg bg-muted p-0.5 text-xs font-medium">
          {segments.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              disabled={key === 'now' ? !day.current.length : key === 'later' ? !day.later.length : false}
              onClick={() => {
                setFilter(key)
                setShowAll(false)
              }}
              className={cn('rounded-md px-2.5 py-1 transition-colors disabled:opacity-50', filter === key ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 p-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-14" />
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      ) : day.active.length === 0 && day.canceled.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <LuCalendarDays className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{hours.isOpen ? 'No sessions today.' : 'The center is closed today.'}</p>
          <Button variant="outline" size="sm" onClick={() => navigate(`/${branchId}/admin/schedule/day/${today}`)}>
            Open schedule
          </Button>
        </div>
      ) : (
        <ul className="divide-y">
          {filter === 'all' && day.earlier.length ? (
            <li>
              <button
                type="button"
                onClick={() => setShowEarlier(!showEarlier)}
                aria-expanded={showEarlier}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted/50"
              >
                <LuChevronDown className={cn('size-4 transition-transform', !showEarlier && '-rotate-90')} />
                {plural(day.earlier.length, 'earlier session')}
                {missingEarlier ? <span className="text-amber-700 dark:text-amber-400">· {plural(missingEarlier, 'log')} missing</span> : null}
              </button>
            </li>
          ) : null}
          {filter === 'all' && showEarlier ? day.earlier.map((s) => sessionRow(s, true)) : null}
          {visible.map((r, i) => [
            i === lineIndex ? nowLine : null,
            r.kind === 'session' ? sessionRow(r.session) : eventRow(r.event, r.key),
          ])}
          {lineIndex >= 0 && lineIndex >= visible.length ? nowLine : null}
          {list.length === 0 && filter === 'all' ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing else on the schedule today.</li>
          ) : null}
          {showCanceled ? day.canceled.map((s) => sessionRow(s, true)) : null}
        </ul>
      )}

      {!loading && (hidden > 0 || day.canceled.length > 0) ? (
        <div className="flex flex-wrap items-center gap-1 border-t p-2">
          {hidden > 0 ? (
            <Button variant="ghost" className="flex-1 text-muted-foreground" onClick={() => setShowAll(true)}>
              Show {plural(hidden, 'more session')}
            </Button>
          ) : null}
          {day.canceled.length > 0 && filter === 'all' ? (
            <Button variant="ghost" size="sm" className={cn('text-muted-foreground', hidden === 0 && 'flex-1')} onClick={() => setShowCanceled(!showCanceled)}>
              {showCanceled ? 'Hide canceled' : `${day.canceled.length} canceled`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
