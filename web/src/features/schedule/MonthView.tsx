import { useBranch } from '@/branch/BranchProvider'
import { type DateKey, WEEKDAY_SHORT, formatDateKey, formatMinutesShort, isSameMonth, monthGrid, orderedWeekdays } from '@shared/time'
import type { WithId } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { EventDoc } from './useScheduleData'

/** Events-only month calendar (True Education's Month view). */
export function MonthView({
  month,
  eventsByDate,
  isClosed,
  today,
  onDay,
  onCreateEvent,
  onEditEvent,
}: {
  month: DateKey
  eventsByDate: Map<DateKey, WithId<EventDoc>[]>
  isClosed: (d: DateKey) => boolean
  today: DateKey
  onDay: (d: DateKey) => void
  onCreateEvent: (d: DateKey) => void
  onEditEvent: (e: WithId<EventDoc>) => void
}) {
  const { settings } = useBranch()
  const weekStartsOn = settings.general.weekStartsOn
  const grid = monthGrid(month, weekStartsOn)
  const weeks = Array.from({ length: 6 }, (_, w) => grid.slice(w * 7, w * 7 + 7)).filter((wk) => wk.some((d) => isSameMonth(d, month)))

  const row = (e: WithId<EventDoc>) => (
    <button
      key={e.id}
      type="button"
      onClick={(ev) => {
        ev.stopPropagation()
        onEditEvent(e)
      }}
      className="flex w-full items-center gap-1 truncate rounded px-1 text-left text-xs hover:bg-muted"
    >
      <span className="size-2 shrink-0 rounded-full bg-[#009EEB]" />
      <span className="shrink-0 text-muted-foreground">{formatMinutesShort(e.startMin)}</span>
      <span className="truncate">{e.title}</span>
    </button>
  )

  return (
    <div className="p-3 sm:p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-2xl font-bold tracking-tight">{formatDateKey(month, 'monthYear').split(' ')[0]}</h2>
        <span className="text-sm text-muted-foreground">{month.slice(0, 4)}</span>
        {isSameMonth(month, today) ? <Badge variant="outline">THIS MONTH</Badge> : null}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-[11px] font-semibold text-muted-foreground uppercase">
          {orderedWeekdays(weekStartsOn).map((d) => (
            <div key={d} className="py-2">
              {WEEKDAY_SHORT[d]}
            </div>
          ))}
        </div>
        {weeks.map((wk, i) => (
          <div key={i} className="grid grid-cols-7 border-b last:border-b-0">
            {wk.map((d) => {
              if (!isSameMonth(d, month)) return <div key={d} className="min-h-32 border-r last:border-r-0" />
              const closed = isClosed(d)
              const events = eventsByDate.get(d) ?? []
              return (
                <div
                  key={d}
                  onClick={() => !closed && onDay(d)}
                  onDoubleClick={() => !closed && onCreateEvent(d)}
                  className={cn('flex min-h-32 cursor-pointer flex-col gap-0.5 border-r p-1.5 last:border-r-0', closed ? 'cursor-default bg-muted/60' : 'hover:bg-muted/30')}
                >
                  <div className="flex justify-end">
                    <span className={cn('flex size-6 items-center justify-center rounded-full text-xs', d === today && 'bg-foreground font-semibold text-background', closed && 'text-muted-foreground')}>
                      {Number(d.slice(8))}
                    </span>
                  </div>
                  {events.slice(0, 3).map(row)}
                  {events.length > 3 ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button" onClick={(e) => e.stopPropagation()} className="px-1 text-left text-xs text-muted-foreground hover:text-foreground">
                          {events.length - 3} more
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 space-y-0.5 p-2" onClick={(e) => e.stopPropagation()}>
                        <div className="px-1 pb-1 text-sm font-semibold">{formatDateKey(d, 'weekdayMedium')}</div>
                        {events.map(row)}
                      </PopoverContent>
                    </Popover>
                  ) : null}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Click a day to open it · Double-click a day to add an event.</p>
    </div>
  )
}
