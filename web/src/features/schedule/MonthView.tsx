import { useBranch } from '@/branch/BranchProvider'
import { type DateKey, formatDateKey, formatMinutesShort } from '@shared/time'
import type { WithId } from '@shared/types'
import { MonthScroller, type MonthScrollerHandle } from '@/components/app/MonthScroller'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { EventDoc } from './useScheduleData'

/**
 * Events-only month calendar (True Education's Month view), scrolling
 * vertically through months. It keeps `focusDate` in view and reports the
 * months on screen so the page can load their events.
 */
export function MonthView({
  anchor,
  focusDate,
  eventsByDate,
  isClosed,
  today,
  onDay,
  onCreateEvent,
  onEditEvent,
  onVisibleRangeChange,
  onTopMonthChange,
  scrollerRef,
  className,
}: {
  anchor: DateKey
  focusDate: DateKey
  eventsByDate: Map<DateKey, WithId<EventDoc>[]>
  isClosed: (d: DateKey) => boolean
  today: DateKey
  onDay: (d: DateKey) => void
  onCreateEvent: (d: DateKey) => void
  onEditEvent: (e: WithId<EventDoc>) => void
  onVisibleRangeChange: (from: DateKey, to: DateKey) => void
  onTopMonthChange?: (month: DateKey) => void
  scrollerRef?: React.Ref<MonthScrollerHandle>
  className?: string
}) {
  const { settings } = useBranch()

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
    <div className={cn('flex min-h-0 flex-col', className)}>
      <MonthScroller
        ref={scrollerRef}
        anchor={anchor}
        focusDate={focusDate}
        weekStartsOn={settings.general.weekStartsOn}
        onVisibleRangeChange={onVisibleRangeChange}
        onTopMonthChange={onTopMonthChange}
        className="min-h-0 flex-1 bg-card px-3 sm:px-4"
        monthTitle={(m) => (
          <span className="flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight">{formatDateKey(m, 'monthYear').split(' ')[0]}</span>
            <span className="text-sm font-normal text-muted-foreground">{m.slice(0, 4)}</span>
          </span>
        )}
        renderDay={(d) => {
          const closed = isClosed(d)
          const events = eventsByDate.get(d) ?? []
          return (
            <div
              onClick={() => !closed && onDay(d)}
              onDoubleClick={() => !closed && onCreateEvent(d)}
              className={cn(
                'flex min-h-28 cursor-pointer flex-col gap-0.5 p-1.5',
                closed ? 'cursor-default bg-muted/60' : 'hover:bg-muted/30',
                d === focusDate && !closed && 'bg-accent/60 ring-2 ring-foreground/70 ring-inset',
              )}
            >
              <div className="flex justify-end">
                <span className={cn('flex size-6 items-center justify-center rounded-full text-xs tabular-nums', d === today && 'bg-foreground font-semibold text-background', closed && d !== today && 'text-muted-foreground')}>
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
        }}
      />
      <p className="shrink-0 border-t bg-card px-4 py-2 text-xs text-muted-foreground">Click a day to open it · Double-click a day to add an event · Scroll for other months.</p>
    </div>
  )
}
