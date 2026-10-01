import { type ReactNode, type Ref, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { type DateKey, type Weekday, WEEKDAYS, WEEKDAY_SHORT, addDays, addMonths, endOfMonth, formatDateKey, orderedWeekdays, startOfMonth, weekdayIndex } from '@shared/time'
import { cn } from '@/lib/utils'

/**
 * Months stacked vertically and scrolled like the iOS Calendar app (owner rule:
 * every month calendar scrolls vertically, never ‹ › arrows). Months load as you
 * approach either end; adding months above keeps the view still. Each month shows
 * only its own days, starting on the branch's week start.
 */

export interface MonthScrollerHandle {
  /** Brings a date into view (loading its months first if needed). */
  scrollToDate: (date: DateKey, opts?: { behavior?: ScrollBehavior; block?: 'start' | 'center' | 'nearest' | 'month' }) => void
}

export interface MonthScrollerProps {
  /** Month (any date in it) shown at the top when the calendar opens. */
  anchor: DateKey
  /** Kept in view: when it changes, the calendar scrolls to it. */
  focusDate?: DateKey | null
  weekStartsOn: Weekday
  /** Content of one day cell (the scroller owns the cell box and its borders). */
  renderDay: (date: DateKey) => ReactNode
  /** `compact`: small round days (mini calendars, date pickers). `full`: big bordered cells. */
  variant?: 'compact' | 'full'
  /** Extra classes per day cell (e.g. closed days, selection). */
  dayClassName?: (date: DateKey) => string | undefined
  /** First and last day of the months currently on screen, for loading data. */
  onVisibleRangeChange?: (from: DateKey, to: DateKey) => void
  /** The month at the top of the view, for a header label. */
  onTopMonthChange?: (month: DateKey) => void
  /** Month title; defaults to "October 2026". */
  monthTitle?: (month: DateKey) => ReactNode
  /** An extra column after each week, e.g. the week's total (the month's own days only). */
  weekSummary?: { label: string; width?: string; render: (days: DateKey[]) => ReactNode }
  className?: string
  ref?: Ref<MonthScrollerHandle>
}

const STEP = 3
const INITIAL_BEFORE = 2
const INITIAL_AFTER = 4
const MAX_MONTHS = 240

interface Window {
  /** First-of-month the offsets count from. */
  base: DateKey
  before: number
  after: number
}

const monthKey = (d: DateKey) => d.slice(0, 7)

export function MonthScroller({
  anchor,
  focusDate,
  weekStartsOn,
  renderDay,
  variant = 'full',
  dayClassName,
  onVisibleRangeChange,
  onTopMonthChange,
  monthTitle,
  weekSummary,
  className,
  ref,
}: MonthScrollerProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLDivElement>(null)
  const topSentinel = useRef<HTMLDivElement>(null)
  const bottomSentinel = useRef<HTMLDivElement>(null)
  const [win, setWin] = useState<Window>(() => ({ base: startOfMonth(anchor), before: INITIAL_BEFORE, after: INITIAL_AFTER }))
  // Where to land after the next render: a month to show at the top, or an anchor to hold still.
  const pending = useRef<{ kind: 'reveal'; date: DateKey; block: 'start' | 'center' | 'nearest' | 'month'; behavior: ScrollBehavior } | { kind: 'hold'; key: string; offset: number } | null>({
    kind: 'reveal',
    date: focusDate ?? anchor,
    block: 'month',
    behavior: 'instant',
  })
  const [ready, setReady] = useState(false)
  const months = Array.from({ length: win.before + 1 + win.after }, (_, i) => addMonths(win.base, i - win.before))
  const first = months[0]
  const last = months[months.length - 1]

  const headerHeight = () => header.current?.offsetHeight ?? 0

  /** Scrolls so `date` (or its month) sits where asked. Returns false when it isn't rendered. */
  const reveal = useCallback((date: DateKey, block: 'start' | 'center' | 'nearest' | 'month', behavior: ScrollBehavior) => {
    const el = scroller.current
    if (!el) return false
    const target =
      block === 'month'
        ? el.querySelector<HTMLElement>(`[data-month="${monthKey(date)}"]`)
        : (el.querySelector<HTMLElement>(`[data-date="${date}"]`) ?? el.querySelector<HTMLElement>(`[data-month="${monthKey(date)}"]`))
    if (!target) return false
    const box = el.getBoundingClientRect()
    const r = target.getBoundingClientRect()
    const top = r.top - box.top + el.scrollTop
    const viewTop = el.scrollTop + headerHeight()
    const viewBottom = el.scrollTop + el.clientHeight
    let next = el.scrollTop
    if (block === 'month' || block === 'start') next = top - headerHeight()
    else if (block === 'center') next = top - (el.clientHeight + headerHeight() - r.height) / 2
    else if (top < viewTop) next = top - headerHeight() - 4
    else if (top + r.height > viewBottom) next = top + r.height - el.clientHeight + 4
    if (Math.abs(next - el.scrollTop) > 1) el.scrollTo({ top: Math.max(0, next), behavior })
    return true
  }, [])

  const goTo = useCallback(
    (date: DateKey, block: 'start' | 'center' | 'nearest' | 'month' = 'nearest', behavior: ScrollBehavior = 'smooth') => {
      const key = monthKey(date)
      if (key >= monthKey(first) && key <= monthKey(last)) {
        reveal(date, block, behavior)
        return
      }
      // Far away: rebuild the window around it, then land there.
      pending.current = { kind: 'reveal', date, block: block === 'nearest' ? 'month' : block, behavior: 'instant' }
      setReady(false)
      setWin({ base: startOfMonth(date), before: INITIAL_BEFORE, after: INITIAL_AFTER })
    },
    [first, last, reveal],
  )

  useImperativeHandle(ref, () => ({ scrollToDate: (date, opts) => goTo(date, opts?.block ?? 'month', opts?.behavior ?? 'smooth') }), [goTo])

  // After the months change: land where asked (first open, a far jump) or keep the view still after adding months above.
  useLayoutEffect(() => {
    const el = scroller.current
    const p = pending.current
    if (!el || !p) return
    pending.current = null
    if (p.kind === 'reveal') {
      reveal(p.date, p.block, p.behavior)
      setReady(true)
    } else {
      const node = el.querySelector<HTMLElement>(`[data-month="${p.key}"]`)
      if (node) el.scrollTop += node.getBoundingClientRect().top - el.getBoundingClientRect().top - p.offset
    }
  }, [win, reveal])

  // Follow the focus date (arrow keys, Today, a pick elsewhere).
  const lastFocus = useRef(focusDate)
  useEffect(() => {
    if (!focusDate || focusDate === lastFocus.current) return
    lastFocus.current = focusDate
    goTo(focusDate, variant === 'compact' ? 'nearest' : 'center')
  }, [focusDate, goTo, variant])

  const loadPast = useCallback(() => {
    const el = scroller.current
    if (!el || win.before + win.after + 1 >= MAX_MONTHS) return
    const box = el.getBoundingClientRect()
    for (const node of el.querySelectorAll<HTMLElement>('[data-month]')) {
      const r = node.getBoundingClientRect()
      if (r.bottom > box.top) {
        pending.current = { kind: 'hold', key: node.dataset.month!, offset: r.top - box.top }
        break
      }
    }
    setWin((w) => ({ ...w, before: w.before + STEP }))
  }, [win.before, win.after])

  const loadFuture = useCallback(() => {
    if (win.before + win.after + 1 >= MAX_MONTHS) return
    setWin((w) => ({ ...w, after: w.after + STEP }))
  }, [win.before, win.after])

  // Load more months near either end.
  useEffect(() => {
    const el = scroller.current
    if (!ready || !el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          if (e.target === topSentinel.current) loadPast()
          if (e.target === bottomSentinel.current) loadFuture()
        }
      },
      { root: el, rootMargin: '320px 0px' },
    )
    if (topSentinel.current) io.observe(topSentinel.current)
    if (bottomSentinel.current) io.observe(bottomSentinel.current)
    return () => io.disconnect()
  }, [ready, loadPast, loadFuture])

  // Report the months on screen and the one at the top.
  const report = useRef({ range: '', top: '' })
  const measure = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const viewTop = box.top + headerHeight()
    let lo: string | null = null
    let hi: string | null = null
    let top: string | null = null
    for (const node of el.querySelectorAll<HTMLElement>('[data-month]')) {
      const r = node.getBoundingClientRect()
      if (r.bottom <= viewTop || r.top >= box.bottom) continue
      const k = node.dataset.month!
      lo ??= k
      hi = k
      if (!top && r.bottom > viewTop + 24) top = k
    }
    if (lo && hi) {
      const range = `${lo}|${hi}`
      if (range !== report.current.range) {
        report.current.range = range
        onVisibleRangeChange?.(`${lo}-01`, endOfMonth(`${hi}-01`))
      }
    }
    if (top && top !== report.current.top) {
      report.current.top = top
      onTopMonthChange?.(`${top}-01`)
    }
  }, [onVisibleRangeChange, onTopMonthChange])

  useEffect(() => {
    const el = scroller.current
    if (!el || !ready) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [ready, measure, win])

  const weekdays = orderedWeekdays(weekStartsOn)
  const compact = variant === 'compact'
  const columns = weekSummary ? `repeat(7, minmax(0, 1fr)) ${weekSummary.width ?? '84px'}` : 'repeat(7, minmax(0, 1fr))'

  return (
    <div ref={scroller} className={cn('relative overflow-y-auto overscroll-contain [overflow-anchor:none]', className)} data-month-scroller>
      <div
        ref={header}
        className={cn(
          'sticky top-0 z-10 grid border-b bg-background/95 text-center font-semibold text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80',
          compact ? 'py-1 text-[10px]' : 'py-1.5 text-xs',
        )}
        style={{ gridTemplateColumns: columns }}
      >
        {weekdays.map((d) => (
          <div key={d}>{compact ? WEEKDAY_SHORT[d].slice(0, 2) : WEEKDAY_SHORT[d]}</div>
        ))}
        {weekSummary ? <div>{weekSummary.label}</div> : null}
      </div>
      <div ref={topSentinel} className="h-px" aria-hidden />
      {months.map((m) => (
        <MonthBlock
          key={m}
          month={m}
          weekStartsOn={weekStartsOn}
          compact={compact}
          renderDay={renderDay}
          dayClassName={dayClassName}
          title={monthTitle ? monthTitle(m) : formatDateKey(m, 'monthYear')}
          columns={columns}
          weekSummary={weekSummary?.render}
        />
      ))}
      <div ref={bottomSentinel} className="h-px" aria-hidden />
    </div>
  )
}

function MonthBlock({
  month,
  weekStartsOn,
  compact,
  renderDay,
  dayClassName,
  title,
  columns,
  weekSummary,
}: {
  month: DateKey
  weekStartsOn: Weekday
  compact: boolean
  renderDay: (date: DateKey) => ReactNode
  dayClassName?: (date: DateKey) => string | undefined
  title: ReactNode
  columns: string
  weekSummary?: (days: DateKey[]) => ReactNode
}) {
  // Blank cells before the 1st, so it lands under its weekday.
  const lead = (weekdayIndex(month) - WEEKDAYS.indexOf(weekStartsOn) + 7) % 7
  const days = Number(endOfMonth(month).slice(8))
  const cells: (DateKey | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => addDays(month, i))]
  while (cells.length % 7) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7))

  return (
    <section data-month={monthKey(month)} className={compact ? 'px-1 pt-2 pb-1' : 'pt-4 pb-2'}>
      <h3 className={cn('font-semibold', compact ? 'px-1 pb-1 text-xs' : 'px-1 pb-2 text-base')}>{title}</h3>
      {weeks.map((week, w) => (
        <div key={w} className="grid" style={{ gridTemplateColumns: columns }}>
          {week.map((d, i) => {
            if (!d) return <div key={i} aria-hidden />
            if (compact) {
              return (
                <div key={d} data-date={d} className={cn('flex items-center justify-center p-px', dayClassName?.(d))}>
                  {renderDay(d)}
                </div>
              )
            }
            // Outline only the month's own days (TE's "staircase" border).
            const above = w > 0 && weeks[w - 1][i] !== null
            const left = i > 0 && week[i - 1] !== null
            return (
              <div
                key={d}
                data-date={d}
                className={cn('min-w-0 border-r border-b border-border', !above && 'border-t', !left && 'border-l', dayClassName?.(d))}
              >
                {renderDay(d)}
              </div>
            )
          })}
          {weekSummary ? (
            <div className="flex items-center justify-center border-b bg-muted/30 text-sm font-bold tabular-nums">
              {weekSummary(week.filter((d): d is DateKey => d !== null))}
            </div>
          ) : null}
        </div>
      ))}
    </section>
  )
}
