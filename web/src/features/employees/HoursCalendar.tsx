import { useEffect, useRef, useState } from 'react'
import { type DateKey, formatDateKey, todayKey } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { MonthScroller, type MonthScrollerHandle } from '@/components/app/MonthScroller'
import { Button } from '@/components/ui/button'
import { useLoadWindow } from '@/lib/useLoadWindow'
import { cn } from '@/lib/utils'

export function fmtHours(minutes: number): string {
  const h = Math.round((minutes / 60) * 100) / 100
  return `${String(h).replace(/\.0+$/, '')}h`
}

export interface DayCell {
  /** Total minutes shown as the day's bubble. */
  minutes: number
  /** Optional ranges listed under the bubble. */
  lines?: { label: string; tone: 'clock' | 'teaching' | 'admin' | 'scheduled' }[]
}

const TONES: Record<NonNullable<DayCell['lines']>[number]['tone'], string> = {
  scheduled: 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200',
  clock: 'border-zinc-200 bg-zinc-100 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100',
  teaching: 'border-green-300 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200',
  admin: 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200',
}

/**
 * Per-day hour totals on a vertically scrolling month calendar, with a week
 * Total column (Employee Calendar's hour modes). `cells` is keyed by dateKey;
 * `onRange` reports the dates to load (the months around the view).
 */
export function HoursCalendar({
  cells,
  tone,
  onRange,
  footnote,
}: {
  cells: Map<DateKey, DayCell>
  tone: NonNullable<DayCell['lines']>[number]['tone']
  onRange: (from: DateKey, to: DateKey) => void
  footnote: string
}) {
  const { settings, timezone } = useBranch()
  const today = todayKey(timezone)
  const scroller = useRef<MonthScrollerHandle>(null)
  const [topMonth, setTopMonth] = useState(today)
  const { from, to, onVisibleRangeChange } = useLoadWindow(today)
  useEffect(() => onRange(from, to), [from, to, onRange])

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <h2 className="mr-auto text-sm font-semibold">{formatDateKey(topMonth, 'monthYear')}</h2>
          <Button variant="ghost" size="xs" onClick={() => scroller.current?.scrollToDate(today, { block: 'month' })}>
            Today
          </Button>
        </div>
        <div className="overflow-x-auto">
          <MonthScroller
            ref={scroller}
            anchor={today}
            weekStartsOn={settings.general.weekStartsOn}
            onVisibleRangeChange={onVisibleRangeChange}
            onTopMonthChange={setTopMonth}
            className="h-[min(72svh,760px)] min-w-[760px] px-2"
            weekSummary={{
              label: 'Total',
              render: (days) => {
                const total = days.reduce((sum, d) => sum + (cells.get(d)?.minutes ?? 0), 0)
                return total > 0 ? fmtHours(total) : <span className="text-muted-foreground/50">—</span>
              },
            }}
            renderDay={(d) => {
              const c = cells.get(d)
              return (
                <div className="flex min-h-24 flex-col gap-1 p-1.5">
                  <div className="flex justify-end">
                    <span className={cn('flex size-6 items-center justify-center rounded-full text-xs tabular-nums', d === today && 'bg-foreground font-semibold text-background')}>
                      {Number(d.slice(8))}
                    </span>
                  </div>
                  {c && c.minutes > 0 ? (
                    <span className={cn('mx-auto rounded-md border px-2 py-0.5 text-sm font-bold tabular-nums', TONES[tone])}>{fmtHours(c.minutes)}</span>
                  ) : null}
                  {c?.lines?.slice(0, 3).map((l, k) => (
                    <span key={k} className={cn('truncate rounded border-l-[3px] px-1 text-[10px]', TONES[l.tone])}>
                      {l.label}
                    </span>
                  ))}
                  {(c?.lines?.length ?? 0) > 3 ? <span className="text-[10px] text-muted-foreground">+{c!.lines!.length - 3} more</span> : null}
                </div>
              )
            }}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{footnote}</p>
    </div>
  )
}
