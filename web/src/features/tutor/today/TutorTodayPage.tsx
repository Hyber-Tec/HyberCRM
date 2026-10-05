import { useEffect, useState } from 'react'
import { LuCalendarClock, LuCalendarDays } from 'react-icons/lu'
import { Link } from 'react-router'
import { addDays, formatDateKey, formatMinutes } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { plural } from '@/features/home/parts'
import { NOT_LINKED } from '../hooks'
import { ClockCard, ClockStrip } from './ClockCard'
import { NextUpCard } from './NextUpCard'
import { TodaySessionsCard } from './TodaySessionsCard'
import { ToDoCard } from './ToDoCard'
import { useTutorDay, type TutorDay } from './useTutorDay'
import { WeekCard } from './WeekCard'

function greeting(minutes: number) {
  if (minutes < 12 * 60) return 'Good morning'
  if (minutes < 17 * 60) return 'Good afternoon'
  return 'Good evening'
}

/** True on screens wide enough for two columns (Tailwind's `lg`). */
function useWide() {
  const query = '(min-width: 1024px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setWide(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return wide
}

/** "3 sessions today, the next at 4:00 PM." and the like. */
function summary(t: TutorDay): string {
  const { active, current, later } = t.day
  if (!active.length) {
    const next = t.day.next
    if (next.kind !== 'day') return 'No sessions today.'
    const when = next.dateKey === addDays(t.today, 1) ? 'tomorrow' : `on ${formatDateKey(next.dateKey, 'weekdayMedium')}`
    return `No sessions today. Your next is ${when} at ${formatMinutes(next.sessions[0].startMin)}.`
  }
  const count = `${plural(active.length, 'session')} today`
  if (current.length) return `${count}, ${current.length > 1 ? `${current.length} on now` : 'one on now'}.`
  if (later.length) return later.length === active.length ? `${count}, the first at ${formatMinutes(later[0].startMin)}.` : `${count}, the next at ${formatMinutes(later[0].startMin)}.`
  return `${count}, all done.`
}

/**
 * Tutor → Today (the portal's first page, as in the phone app): a greeting,
 * the session that's on now or next, today's sessions, what's left to do, the
 * time clock and the week. Two columns on computers, one on phones.
 */
export function TutorTodayPage() {
  const { branchId, staffId } = useBranch()
  const wide = useWide()
  const t = useTutorDay()
  if (!staffId) return <p className="text-sm text-muted-foreground">{NOT_LINKED}</p>

  const firstName = (t.me?.firstName || t.me?.name || '').trim().split(/\s+/)[0]
  const todo = t.todo.total
  const date = formatDateKey(t.today, 'weekdayLong').replace(/, \d{4}$/, '')

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{date}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {greeting(t.nowMin)}
          {firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground" data-testid="today-summary">
          {t.loading ? 'Loading your day…' : summary(t)}{' '}
          {!t.loading && todo ? (
            <span className="font-medium text-foreground">
              {plural(todo, 'thing')} to do.
            </span>
          ) : null}
        </p>
      </div>
      {wide ? (
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/${branchId}/tutor/availability`}>
              <LuCalendarClock /> Availability
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/${branchId}/tutor/schedule`}>
              <LuCalendarDays /> Open schedule
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  )

  if (wide) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {header}
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_22rem] items-start gap-6">
          <div className="space-y-6">
            <NextUpCard t={t} />
            <TodaySessionsCard t={t} />
            <WeekCard t={t} />
          </div>
          <div className="space-y-6">
            <ClockCard t={t} />
            <ToDoCard t={t} />
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="mx-auto w-full max-w-2xl">
      {header}
      <div className="mt-5 space-y-4">
        <ClockStrip t={t} />
        <NextUpCard t={t} />
        <ToDoCard t={t} />
        <TodaySessionsCard t={t} />
        <WeekCard t={t} />
      </div>
    </div>
  )
}
