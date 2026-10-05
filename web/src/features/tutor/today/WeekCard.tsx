import { Link } from 'react-router'
import { WEEKDAY_SHORT, formatDateKey, formatDuration, weekdayOf } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { cn } from '@/lib/utils'
import type { TutorDay } from './useTutorDay'

/** The week at a glance: booked time per day (each day opens the schedule there), then the week's numbers. */
export function WeekCard({ t }: { t: TutorDay }) {
  const { branchId } = useBranch()
  const { week, today } = t
  const most = Math.max(240, ...week.days.map((d) => d.minutes))
  const first = week.days[0].dateKey
  const last = week.days[6].dateKey
  const range = first.slice(0, 7) === last.slice(0, 7) ? `${formatDateKey(first, 'monthDay')} – ${Number(last.slice(8))}` : `${formatDateKey(first, 'monthDay')} – ${formatDateKey(last, 'monthDay')}`

  return (
    <section className="@container rounded-xl border bg-card p-4" data-testid="tutor-week">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">This week</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{range}</span>
      </div>
      {/* Wide (the main column): the days, then the numbers beside them. Narrow: the numbers below. */}
      <div className="mt-4 grid gap-3 @xl:grid-cols-[minmax(0,1fr)_14rem] @xl:items-center @xl:gap-6">
        <ol className="grid grid-cols-7 gap-1">
          {week.days.map((d) => {
            const isToday = d.dateKey === today
            const past = d.dateKey < today
            const height = d.minutes ? Math.max(10, Math.round((d.minutes / most) * 56)) : 0
            return (
              <li key={d.dateKey}>
                <Link
                  to={`/${branchId}/tutor/schedule?date=${d.dateKey}`}
                  aria-label={`${formatDateKey(d.dateKey, 'weekdayLong')}: ${d.sessions ? `${d.sessions} sessions, ${formatDuration(d.minutes)}` : d.isOpen ? 'nothing booked' : 'closed'}`}
                  className="group flex flex-col items-center gap-1 rounded-lg py-1 hover:bg-muted/60"
                >
                  <span className={cn('text-[11px] font-medium', isToday ? 'text-foreground' : 'text-muted-foreground')}>{WEEKDAY_SHORT[weekdayOf(d.dateKey)].slice(0, 2)}</span>
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
                      isToday ? 'bg-foreground font-semibold text-background' : past ? 'text-muted-foreground' : 'font-medium',
                    )}
                  >
                    {Number(d.dateKey.slice(8))}
                  </span>
                  <span className="flex h-14 w-full items-end justify-center">
                    {height ? (
                      <span
                        className={cn('w-3.5 rounded-sm @xl:w-5', past ? 'bg-muted-foreground/25' : isToday ? 'bg-emerald-500' : 'bg-foreground/70')}
                        style={{ height }}
                      />
                    ) : (
                      <span className={cn('mb-0.5 h-0.5 w-3 rounded-full', d.isOpen ? 'bg-border' : 'bg-transparent')} />
                    )}
                  </span>
                  <span className={cn('text-[11px] tabular-nums', d.sessions ? 'text-foreground' : 'text-muted-foreground/60')}>{d.isOpen || d.sessions ? d.sessions : '–'}</span>
                </Link>
              </li>
            )
          })}
        </ol>
        <dl className="grid grid-cols-3 gap-2 border-t pt-3 text-center @xl:grid-cols-1 @xl:gap-3 @xl:border-t-0 @xl:border-l @xl:pt-0 @xl:pl-6 @xl:text-left">
          <Stat label="Sessions" value={String(week.sessions)} hint={week.sessions ? `${week.done} done` : null} />
          <Stat label="Booked" value={formatDuration(week.minutes)} />
          <Stat label="Logs" value={week.loggable ? `${week.logged}/${week.loggable}` : '—'} hint={week.loggable ? (week.logged === week.loggable ? 'all written' : `${week.loggable - week.logged} to write`) : null} />
        </dl>
      </div>
    </section>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="@xl:flex @xl:items-baseline @xl:gap-2">
      <dt className="text-[11px] font-medium text-muted-foreground @xl:w-16 @xl:text-xs">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums @xl:mt-0">{value}</dd>
      {hint ? <dd className="text-[11px] whitespace-nowrap text-muted-foreground @xl:text-xs">{hint}</dd> : null}
    </div>
  )
}
