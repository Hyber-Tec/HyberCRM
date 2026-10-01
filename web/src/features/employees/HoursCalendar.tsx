import { useEffect, useState } from 'react'
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { type DateKey, WEEKDAY_SHORT, addMonths, formatDateKey, isSameMonth, monthGrid, orderedWeekdays, startOfMonth, todayKey } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
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
 * Month grid of per-day hour totals with a week TOTAL column (Employee Calendar's
 * hour modes). `cells` is keyed by dateKey; `onRange` reports the visible range.
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
  const [month, setMonth] = useState(() => startOfMonth(today))
  const weekStartsOn = settings.general.weekStartsOn
  const grid = monthGrid(month, weekStartsOn)
  const weeks = Array.from({ length: 6 }, (_, w) => grid.slice(w * 7, w * 7 + 7)).filter((wk) => wk.some((d) => isSameMonth(d, month)))
  const first = grid[0]
  const last = grid[grid.length - 1]
  useEffect(() => onRange(first, last), [first, last, onRange])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">{formatDateKey(month, 'monthYear')}</h2>
        <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(today))}>
          Today
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
          <LuChevronLeft />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
          <LuChevronRight />
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_84px] border-b bg-muted/40 text-center text-[11px] font-semibold text-muted-foreground uppercase">
            {orderedWeekdays(weekStartsOn).map((d) => (
              <div key={d} className="py-1.5">
                {WEEKDAY_SHORT[d]}
              </div>
            ))}
            <div className="border-l py-1.5">Total</div>
          </div>
          {weeks.map((wk, i) => {
            const total = wk.filter((d) => isSameMonth(d, month)).reduce((sum, d) => sum + (cells.get(d)?.minutes ?? 0), 0)
            return (
              <div key={i} className="grid grid-cols-[repeat(7,minmax(0,1fr))_84px] border-b last:border-b-0">
                {wk.map((d) => {
                  if (!isSameMonth(d, month)) return <div key={d} className="border-r" />
                  const c = cells.get(d)
                  return (
                    <div key={d} className="flex min-h-24 flex-col gap-1 border-r p-1.5">
                      <div className="flex justify-end">
                        <span className={cn('flex size-6 items-center justify-center rounded-full text-xs', d === today && 'bg-foreground font-semibold text-background')}>
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
                })}
                <div className="flex items-center justify-center border-l bg-muted/30 text-sm font-bold tabular-nums">
                  {total > 0 ? fmtHours(total) : <span className="text-muted-foreground/50">—</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{footnote}</p>
    </div>
  )
}
