import { type DateKey, WEEKDAY_SHORT, formatMinutesShort, weekdayOf } from '@shared/time'
import type { WithId } from '@shared/types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { EventDoc } from './useScheduleData'

export function WeekEventHeader({
  days,
  today,
  isClosed,
  eventsByDate,
  onDay,
  onEditEvent,
}: {
  days: DateKey[]
  today: DateKey
  isClosed: (d: DateKey) => boolean
  eventsByDate: Map<DateKey, WithId<EventDoc>[]>
  onDay: (d: DateKey) => void
  onEditEvent: (e: WithId<EventDoc>) => void
}) {
  return (
    <div className="grid grid-cols-7 overflow-hidden rounded-xl border bg-card shadow-xs">
      {days.map((d) => {
        const events = eventsByDate.get(d) ?? []
        const closed = isClosed(d)
        const row = (e: WithId<EventDoc>) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onEditEvent(e)}
            className="flex w-full items-center gap-1 truncate rounded px-1 text-left text-[11px] hover:bg-muted"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-blue-600" />
            <span className="shrink-0 text-muted-foreground">{formatMinutesShort(e.startMin).replace(':00', '').replace(' ', '').toLowerCase()}</span>
            <span className="truncate">{e.title}</span>
            {e.recurrence ? <span className="text-muted-foreground">↺</span> : null}
          </button>
        )
        return (
          <div key={d} className={cn('min-w-0 border-r p-1.5 last:border-r-0', closed && 'bg-muted/50')}>
            <button type="button" onClick={() => !closed && onDay(d)} className="mb-1 flex w-full flex-col items-center">
              <span className={cn('text-[10px] font-semibold uppercase', d === today ? 'text-foreground' : 'text-muted-foreground')}>{WEEKDAY_SHORT[weekdayOf(d)]}</span>
              <span className={cn('flex size-7 items-center justify-center rounded-full text-sm font-semibold', d === today && 'bg-foreground text-background', closed && 'text-muted-foreground')}>
                {Number(d.slice(8))}
              </span>
            </button>
            <div className="space-y-0.5">
              {events.slice(0, 3).map(row)}
              {events.length > 3 ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="w-full px-1 text-left text-[11px] text-muted-foreground hover:text-foreground">
                      +{events.length - 3} more
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 space-y-0.5 p-2">{events.map(row)}</PopoverContent>
                </Popover>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
