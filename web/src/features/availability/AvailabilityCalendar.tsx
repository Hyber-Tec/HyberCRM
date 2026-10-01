import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LuClipboardPaste, LuCopy, LuCopyPlus, LuLock, LuPencil, LuRepeat, LuTrash2, LuX } from 'react-icons/lu'
import { toast } from 'sonner'
import { dayHours, effectiveLockDays, effectiveRanges, fitRangesToDay, isInsideLeadTime, isLockedForTutor, normalizeRanges, weeklyRepeats } from '@shared/availability'
import { type DateKey, addDays, dateRange, diffDays, formatDateKey, formatMinutesShort, startOfWeek, todayKey } from '@shared/time'
import type { AvailabilityRange } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { MonthScroller, type MonthScrollerHandle } from '@/components/app/MonthScroller'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useAvailability, useDayConfigs } from '@/features/data/hooks'
import { useIsMobile } from '@/hooks/use-mobile'
import { useLoadWindow } from '@/lib/useLoadWindow'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { type DayWrite, describeRanges, writeAvailability } from './api'
import { DayEditorDialog, type DayEditorState } from './DayEditorDialog'

/** What is selected: one time range, or a run of days (Shift-click extends it). */
type Selection = { kind: 'item'; date: DateKey; index: number } | { kind: 'days'; anchor: DateKey; focus: DateKey } | null

/** What was copied: one range (pasted into days) or whole days (pasted day by day). */
type Clipboard = { kind: 'item'; range: AvailabilityRange } | { kind: 'days'; days: AvailabilityRange[][] } | null

const CHIPS_SHOWN = 3
/** Pointer travel (px) before a press on a time becomes a drag. */
const DRAG_THRESHOLD = 5
/** Touch: hold this long before dragging, so a swipe still scrolls. */
const LONG_PRESS_MS = 350

const SKIP_REASON = { closed: 'closed', outside: 'outside opening hours', too_many: 'too many ranges', locked: 'locked' } as const

/**
 * One employee's availability on a vertically scrolling month calendar.
 * Click a time range or a day to select it; Shift-click another day to select
 * the days between. ⌘/Ctrl+C copies, ⌘/Ctrl+V pastes, Delete clears, and a
 * range can be dragged onto another day (hold Alt/Option to copy instead).
 * Times always follow each date's opening hours.
 */
export function AvailabilityCalendar({ staffId, staffName, mode }: { staffId: string; staffName: string; mode: 'tutor' | 'admin' }) {
  const { branchId, actor, settings, timezone } = useBranch()
  const a = settings.availability
  const isMobile = useIsMobile()
  const now = useNow()
  const today = todayKey(timezone, now)
  const lockDays = mode === 'tutor' ? effectiveLockDays(settings) : -1
  const leadDays = a.leadTimeDays

  const scroller = useRef<MonthScrollerHandle>(null)
  const [topMonth, setTopMonth] = useState(today)
  const { from, to, onVisibleRangeChange } = useLoadWindow(today)
  const { map: availability, loading } = useAvailability(staffId, from, to, { keepPrevious: true })
  const { map: dayConfigs } = useDayConfigs(from, to, { keepPrevious: true })

  const [selection, setSelection] = useState<Selection>(null)
  const [clipboard, setClipboard] = useState<Clipboard>(null)
  const [editor, setEditor] = useState<DayEditorState | null>(null)
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [drag, setDrag] = useState<{ label: string; x: number; y: number; over: DateKey | null; copy: boolean } | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const suppressClick = useRef(false)

  const locked = useCallback((d: DateKey) => lockDays >= 0 && isLockedForTutor(d, timezone, lockDays, new Date(now)), [lockDays, timezone, now])
  const hoursOf = useCallback((d: DateKey) => dayHours(d, settings, dayConfigs), [settings, dayConfigs])
  // What counts is the part inside that date's opening hours (none on closed days).
  const rangesOf = useCallback((d: DateKey) => effectiveRanges(normalizeRanges(availability.get(d)?.ranges ?? []), hoursOf(d)), [availability, hoursOf])

  const selectedDays = useMemo(() => {
    if (selection?.kind !== 'days') return []
    const [lo, hi] = selection.anchor <= selection.focus ? [selection.anchor, selection.focus] : [selection.focus, selection.anchor]
    return dateRange(lo, hi)
  }, [selection])
  const selectedSet = useMemo(() => new Set(selectedDays), [selectedDays])

  const write = useCallback(
    (days: DayWrite[], summary?: string) => writeAvailability({ branchId, actor, timezone, staffId, staffName, via: mode, days, summary }),
    [branchId, actor, timezone, staffId, staffName, mode],
  )

  /**
   * Writes a plan of day → ranges, skipping closed and locked days and fitting
   * each day to its opening hours; reports what was skipped.
   */
  const applyPlan = useCallback(
    async (plan: { date: DateKey; ranges: AvailabilityRange[] }[], summary: string, done: string) => {
      const writes: DayWrite[] = []
      const skipped: Record<string, number> = {}
      for (const { date, ranges } of plan) {
        const skip = (why: keyof typeof SKIP_REASON) => (skipped[why] = (skipped[why] ?? 0) + 1)
        if (locked(date)) {
          skip('locked')
          continue
        }
        const fit = fitRangesToDay(ranges, hoursOf(date), a)
        if (!fit.ok) {
          // Clearing a closed day is fine; anything else that doesn't fit is skipped.
          skip(fit.reason)
          continue
        }
        const before = rangesOf(date)
        if (JSON.stringify(before) !== JSON.stringify(fit.ranges)) writes.push({ dateKey: date, ranges: fit.ranges })
      }
      try {
        if (writes.length) await write(writes, summary)
      } catch (e) {
        toast.error((e as Error).message.includes('permission') ? 'Some of those days are locked. Please contact an admin.' : (e as Error).message)
        return
      }
      const notes = Object.entries(skipped).map(([why, n]) => `${n} ${SKIP_REASON[why as keyof typeof SKIP_REASON]}`)
      if (writes.length) toast.success(done, notes.length ? { description: `Skipped: ${notes.join(', ')}.` } : undefined)
      else if (notes.length) toast.info('Nothing changed', { description: `Skipped: ${notes.join(', ')}.` })
    },
    [locked, hoursOf, rangesOf, a, write],
  )

  const openEditor = useCallback(
    (d: DateKey) => {
      const hours = hoursOf(d)
      if (!hours.isOpen && rangesOf(d).length === 0) {
        toast.info('The center is closed on this day.')
        return
      }
      setEditor({
        dateKey: d,
        ranges: rangesOf(d),
        exists: rangesOf(d).length > 0,
        locked: locked(d),
        leadWarning: mode === 'tutor' && a.leadTimeEnforcement === 'warn' && isInsideLeadTime(d, timezone, leadDays) && !locked(d),
        hours,
      })
    },
    [hoursOf, rangesOf, locked, mode, a.leadTimeEnforcement, timezone, leadDays],
  )

  const copy = useCallback(() => {
    if (!selection) return
    if (selection.kind === 'item') {
      const range = rangesOf(selection.date)[selection.index]
      if (!range) return
      setClipboard({ kind: 'item', range })
      toast.success(`Copied ${formatMinutesShort(range.startMin)}–${formatMinutesShort(range.endMin)}`, { description: 'Select a day and press ⌘/Ctrl+V.' })
    } else {
      const days = selectedDays.map((d) => rangesOf(d))
      if (days.every((r) => r.length === 0)) return toast.info('Nothing to copy on those days.')
      setClipboard({ kind: 'days', days })
      toast.success(`Copied ${days.length === 1 ? 'the day' : `${days.length} days`}`, {
        description: days.length > 1 ? 'Select the first day to paste onto and press ⌘/Ctrl+V.' : 'Select a day and press ⌘/Ctrl+V.',
      })
    }
  }, [selection, selectedDays, rangesOf])

  const paste = useCallback(() => {
    if (!clipboard || !selection) return
    const start = selection.kind === 'item' ? selection.date : selectedDays[0]
    if (clipboard.kind === 'item') {
      // A copied range is added to every selected day.
      const targets = selection.kind === 'item' ? [selection.date] : selectedDays
      void applyPlan(
        targets.map((d) => ({ date: d, ranges: [...rangesOf(d), clipboard.range] })),
        `Pasted availability for ${staffName}`,
        targets.length === 1 ? `Pasted on ${formatDateKey(targets[0], 'weekdayMedium')}` : `Pasted on ${targets.length} days`,
      )
    } else {
      // Copied days replace the days from the selected one on.
      const plan = clipboard.days.map((ranges, i) => ({ date: addDays(start, i), ranges }))
      void applyPlan(plan, `Pasted ${plan.length} days of ${staffName}’s availability`, plan.length === 1 ? 'Day pasted' : `${plan.length} days pasted`)
      setSelection({ kind: 'days', anchor: start, focus: addDays(start, plan.length - 1) })
    }
  }, [clipboard, selection, selectedDays, rangesOf, applyPlan, staffName])

  const clear = useCallback(() => {
    if (!selection) return
    if (selection.kind === 'item') {
      const ranges = rangesOf(selection.date)
      if (!ranges[selection.index]) return
      void applyPlan(
        [{ date: selection.date, ranges: ranges.filter((_, i) => i !== selection.index) }],
        `Removed a time range from ${staffName}’s availability`,
        'Time range removed',
      )
      setSelection({ kind: 'days', anchor: selection.date, focus: selection.date })
      return
    }
    const withRanges = selectedDays.filter((d) => rangesOf(d).length > 0)
    if (!withRanges.length) return
    if (withRanges.length > 1 && !window.confirm(`Remove availability on ${withRanges.length} days?`)) return
    void applyPlan(
      withRanges.map((d) => ({ date: d, ranges: [] })),
      `Removed ${staffName}’s availability on ${withRanges.length} day${withRanges.length > 1 ? 's' : ''}`,
      'Availability removed',
    )
  }, [selection, selectedDays, rangesOf, applyPlan, staffName])

  /** Drag a range onto another day: move it (or copy it with Alt/Option). */
  const dropRange = useCallback(
    (source: { date: DateKey; index: number }, target: DateKey, asCopy: boolean) => {
      const range = rangesOf(source.date)[source.index]
      if (!range || (target === source.date && !asCopy)) return
      if (!asCopy && locked(source.date)) return toast.error(`${formatDateKey(source.date, 'weekdayMedium')} is locked, so its time can’t be moved. Please contact an admin.`)
      if (locked(target)) return toast.error(`${formatDateKey(target, 'weekdayMedium')} is locked. Please contact an admin.`)
      const fit = fitRangesToDay([...rangesOf(target), range], hoursOf(target), a)
      if (!fit.ok) {
        return toast.error(
          fit.reason === 'closed'
            ? `The center is closed on ${formatDateKey(target, 'weekdayMedium')}.`
            : fit.reason === 'too_many'
              ? `${formatDateKey(target, 'weekdayMedium')} already has ${a.maxRangesPerDay} time ranges.`
              : `That time is outside ${formatDateKey(target, 'weekdayMedium')}’s opening hours.`,
        )
      }
      const days: DayWrite[] = [{ dateKey: target, ranges: fit.ranges }]
      if (!asCopy) days.push({ dateKey: source.date, ranges: rangesOf(source.date).filter((_, i) => i !== source.index) })
      const label = `${formatMinutesShort(range.startMin)}–${formatMinutesShort(range.endMin)}`
      void write(
        days,
        `${asCopy ? 'Copied' : 'Moved'} ${staffName}’s ${label} availability from ${formatDateKey(source.date, 'weekdayMedium')} to ${formatDateKey(target, 'weekdayMedium')}`,
      )
        .then(() => {
          toast.success(`${asCopy ? 'Copied' : 'Moved'} to ${formatDateKey(target, 'weekdayMedium')}`, fit.trimmed ? { description: 'Trimmed to that day’s opening hours.' } : undefined)
          setSelection({ kind: 'item', date: target, index: fit.ranges.findIndex((r) => r.startMin <= range.startMin && r.endMin >= Math.min(range.endMin, r.endMin)) })
        })
        .catch((e) => toast.error((e as Error).message.includes('permission') ? 'That day is locked. Please contact an admin.' : (e as Error).message))
    },
    [rangesOf, locked, hoursOf, a, write, staffName],
  )

  /** The day cell under a point, if it belongs to this calendar. */
  const dayAt = useCallback((x: number, y: number): DateKey | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-date]')
    return el && container.current?.contains(el) ? (el.dataset.date ?? null) : null
  }, [])

  /**
   * Press on a time and drag it onto another day (pointer events: mouse, pen, and
   * touch after a short hold). Alt/Option copies instead of moving; Escape cancels.
   */
  const startDrag = (e: React.PointerEvent, source: { date: DateKey; index: number }, label: string) => {
    if (e.button !== 0 || locked(source.date)) return
    const x0 = e.clientX
    const y0 = e.clientY
    const touch = e.pointerType === 'touch'
    let armed = !touch
    let dragging = false
    let edge = 0
    let frame = 0
    const scrollEl = container.current?.querySelector<HTMLElement>('[data-month-scroller]') ?? null
    const timer = touch ? window.setTimeout(() => (armed = true), LONG_PRESS_MS) : 0
    const autoScroll = () => {
      if (!edge || !scrollEl) return
      scrollEl.scrollBy(0, edge)
      frame = requestAnimationFrame(autoScroll)
    }
    const move = (ev: PointerEvent) => {
      if (!dragging) {
        const dist = Math.hypot(ev.clientX - x0, ev.clientY - y0)
        if (touch && !armed && dist > 8) return stop()
        if (!armed || dist < DRAG_THRESHOLD) return
        dragging = true
        setSelection({ kind: 'item', date: source.date, index: source.index })
      }
      ev.preventDefault()
      setDrag({ label, x: ev.clientX, y: ev.clientY, over: dayAt(ev.clientX, ev.clientY), copy: ev.altKey })
      // Scroll the calendar while dragging near its top or bottom edge.
      const box = scrollEl?.getBoundingClientRect()
      const next = !box ? 0 : ev.clientY < box.top + 56 ? -14 : ev.clientY > box.bottom - 40 ? 14 : 0
      if (next !== edge) {
        edge = next
        cancelAnimationFrame(frame)
        if (edge) frame = requestAnimationFrame(autoScroll)
      }
    }
    const up = (ev: PointerEvent) => {
      stop()
      if (!dragging) return
      suppressClick.current = true
      window.setTimeout(() => (suppressClick.current = false), 0)
      setDrag(null)
      const target = dayAt(ev.clientX, ev.clientY)
      if (target) dropRange(source, target, ev.altKey)
    }
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      stop()
      setDrag(null)
    }
    const cancel = () => {
      stop()
      setDrag(null)
    }
    function stop() {
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
  }

  const copyLastWeek = useCallback(() => {
    const anchor = selection?.kind === 'item' ? selection.date : (selectedDays[0] ?? today)
    const weekStart = startOfWeek(anchor, settings.general.weekStartsOn)
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    if (!window.confirm(`Copy the previous week’s availability into the week of ${formatDateKey(weekStart, 'monthDay')}? That week’s availability is replaced.`)) return
    void applyPlan(
      days.map((d) => ({ date: d, ranges: rangesOf(addDays(d, -7)) })),
      `Copied last week’s availability for ${staffName}`,
      'Last week copied',
    )
  }, [selection, selectedDays, today, settings.general.weekStartsOn, applyPlan, rangesOf, staffName])

  // Desktop keyboard: ⌘/Ctrl+C copy, ⌘/Ctrl+V paste, Delete clear, Enter edit, Escape deselect.
  useEffect(() => {
    if (isMobile) return
    const onKey = (e: KeyboardEvent) => {
      if (editor || repeatOpen || !selection) return
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable || target.closest('[role=dialog],[role=menu],[role=listbox]')) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (mod && key === 'c') {
        e.preventDefault()
        copy()
      } else if (mod && key === 'v') {
        e.preventDefault()
        paste()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        clear()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        openEditor(selection.kind === 'item' ? selection.date : selection.focus)
      } else if (e.key === 'Escape') {
        setSelection(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMobile, editor, repeatOpen, selection, copy, paste, clear, openEditor])

  const onDayClick = (d: DateKey, shift: boolean) => {
    if (suppressClick.current) return
    if (isMobile) return openEditor(d)
    if (shift && selection) {
      const anchor = selection.kind === 'item' ? selection.date : selection.anchor
      if (Math.abs(diffDays(anchor, d)) > 92) return toast.info('Select up to three months at a time.')
      setSelection({ kind: 'days', anchor, focus: d })
    } else setSelection(selection?.kind === 'days' && selection.anchor === d && selection.focus === d ? null : { kind: 'days', anchor: d, focus: d })
  }

  const singleDay = selection?.kind === 'days' && selectedDays.length === 1 ? selectedDays[0] : null
  const selectionLabel =
    selection?.kind === 'item'
      ? (() => {
          const r = rangesOf(selection.date)[selection.index]
          return r ? `${formatDateKey(selection.date, 'weekdayMedium')} · ${formatMinutesShort(r.startMin)}–${formatMinutesShort(r.endMin)}` : ''
        })()
      : selectedDays.length > 1
        ? `${formatDateKey(selectedDays[0], 'monthDay')} – ${formatDateKey(selectedDays[selectedDays.length - 1], 'monthDay')} · ${selectedDays.length} days`
        : singleDay
          ? formatDateKey(singleDay, 'weekdayLong')
          : ''

  return (
    <div ref={container} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{formatDateKey(topMonth, 'monthYear')}</h2>
        <Button variant="outline" size="sm" onClick={() => scroller.current?.scrollToDate(today, { block: 'month' })}>
          Today
        </Button>
        {loading ? <Spinner className="size-4" /> : null}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {clipboard ? (
            <Badge variant="secondary" className="gap-1">
              {clipboard.kind === 'item'
                ? `Copied ${formatMinutesShort(clipboard.range.startMin)}–${formatMinutesShort(clipboard.range.endMin)}`
                : `Copied ${clipboard.days.length} day${clipboard.days.length > 1 ? 's' : ''}`}
              <button type="button" aria-label="Clear the copied items" onClick={() => setClipboard(null)}>
                <LuX className="size-3" />
              </button>
            </Badge>
          ) : null}
          <Button variant="outline" size="sm" onClick={copyLastWeek}>
            <LuCopyPlus /> Copy last week
          </Button>
          <Button variant="outline" size="sm" disabled={!singleDay || !rangesOf(singleDay).length} onClick={() => setRepeatOpen(true)}>
            <LuRepeat /> Repeat weekly
          </Button>
        </div>
      </div>

      {/* Always shown on desktop, so selecting doesn't push the calendar down mid double-click. */}
      {!isMobile ? (
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm" data-testid="availability-selection">
          {selection ? (
            <>
              <span className="mr-2 font-medium">{selectionLabel}</span>
              {singleDay || selection.kind === 'item' ? (
                <Button size="xs" variant="ghost" onClick={() => openEditor(selection.kind === 'item' ? selection.date : singleDay!)}>
                  <LuPencil /> Edit
                </Button>
              ) : null}
              <Button size="xs" variant="ghost" onClick={copy}>
                <LuCopy /> Copy
              </Button>
              <Button size="xs" variant="ghost" disabled={!clipboard} onClick={paste}>
                <LuClipboardPaste /> Paste
              </Button>
              <Button size="xs" variant="ghost" onClick={clear}>
                <LuTrash2 /> {selection.kind === 'item' ? 'Remove' : 'Clear'}
              </Button>
              <span className="ml-auto hidden items-center gap-1 text-xs text-muted-foreground xl:flex">
                <Kbd>⌘C</Kbd> copy <Kbd>⌘V</Kbd> paste <Kbd>Del</Kbd> clear <Kbd>Esc</Kbd> deselect
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              Click a day or a time to select it · Shift-click to select several days · Double-click to edit · Drag a time onto another day to move it
            </span>
          )}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card">
        <MonthScroller
          ref={scroller}
          anchor={today}
          weekStartsOn={settings.general.weekStartsOn}
          onVisibleRangeChange={onVisibleRangeChange}
          onTopMonthChange={setTopMonth}
          className="h-[min(70svh,760px)] px-2"
          renderDay={(d) => {
            const ranges = rangesOf(d)
            const hours = hoursOf(d)
            const isLocked = locked(d)
            const inSelection = selectedSet.has(d)
            const needs = mode === 'tutor' && hours.isOpen && !isLocked && ranges.length === 0 && d >= today && isInsideLeadTime(d, timezone, leadDays)
            const extra = ranges.length - CHIPS_SHOWN
            return (
              <div
                role="button"
                tabIndex={-1}
                aria-label={`${formatDateKey(d, 'weekdayLong')}: ${hours.isOpen ? describeRanges(ranges) : 'closed'}`}
                onClick={(e) => onDayClick(d, e.shiftKey)}
                onDoubleClick={() => !isMobile && openEditor(d)}
                className={cn(
                  'relative flex h-24 cursor-default flex-col gap-0.5 p-1 text-left outline-none select-none sm:p-1.5',
                  !hours.isOpen ? 'bg-muted/60 text-muted-foreground' : 'hover:bg-muted/30',
                  needs && 'bg-amber-50/70 dark:bg-amber-950/20',
                  inSelection && 'bg-sky-50 ring-2 ring-sky-500 ring-inset dark:bg-sky-950/30',
                  drag?.over === d &&
                    (hours.isOpen && !isLocked
                      ? 'bg-emerald-50 ring-2 ring-emerald-500 ring-inset dark:bg-emerald-950/30'
                      : 'cursor-not-allowed ring-2 ring-destructive/60 ring-inset'),
                )}
              >
                <div className="flex items-center justify-between">
                  {isLocked && hours.isOpen ? <LuLock className="size-3 text-muted-foreground" aria-label="Locked" /> : <span />}
                  <span className={cn('flex size-6 items-center justify-center rounded-full text-xs tabular-nums', d === today && 'bg-foreground font-semibold text-background')}>
                    {Number(d.slice(8))}
                  </span>
                </div>
                {ranges.slice(0, CHIPS_SHOWN).map((r, i) => {
                  const picked = selection?.kind === 'item' && selection.date === d && selection.index === i
                  return (
                    <div
                      key={`${r.startMin}-${r.endMin}`}
                      onPointerDown={(e) => !isMobile && startDrag(e, { date: d, index: i }, `${formatMinutesShort(r.startMin)}–${formatMinutesShort(r.endMin)}`)}
                      onClick={(e) => {
                        if (isMobile) return
                        e.stopPropagation()
                        if (suppressClick.current) return
                        if (e.shiftKey) return onDayClick(d, true)
                        setSelection(picked ? null : { kind: 'item', date: d, index: i })
                      }}
                      data-testid="availability-range"
                      className={cn(
                        'truncate rounded-md border border-emerald-200 bg-emerald-50 px-1 py-0.5 text-[10px] font-medium text-emerald-800 tabular-nums sm:text-[11px] dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
                        !isMobile && !isLocked && 'cursor-grab touch-none active:cursor-grabbing',
                        picked && 'border-sky-600 ring-2 ring-sky-500',
                      )}
                    >
                      {formatMinutesShort(r.startMin)}–{formatMinutesShort(r.endMin)}
                    </div>
                  )
                })}
                {extra > 0 ? <div className="text-[10px] text-muted-foreground">+{extra} more</div> : null}
                {!hours.isOpen ? <div className="mt-auto text-[10px]">Closed</div> : null}
              </div>
            )
          }}
        />
      </div>

      {drag ? (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 shadow-lg tabular-nums dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          style={{ left: drag.x + 12, top: drag.y + 10 }}
          data-testid="availability-drag"
        >
          {drag.copy ? 'Copy ' : ''}
          {drag.label}
          {drag.over ? <span className="ml-1 font-normal opacity-70">→ {formatDateKey(drag.over, 'weekdayMedium')}</span> : null}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {isMobile ? 'Tap a day to set availability. ' : 'Hold Alt/Option while dragging to copy instead of move. '}
        Times follow each day’s opening hours; closed days take no availability.
        {mode === 'tutor'
          ? ` Days within ${a.lockWindowDays} days are locked; amber days are inside the ${leadDays}-day notice window and still need availability.`
          : ''}
      </p>

      <DayEditorDialog
        state={editor}
        onClose={() => setEditor(null)}
        onSave={async (ranges) => {
          if (!editor) return
          await write([{ dateKey: editor.dateKey, ranges }])
          toast.success('Availability saved')
        }}
      />
      <RepeatDialog
        open={repeatOpen}
        onOpenChange={setRepeatOpen}
        dateKey={singleDay}
        onRepeat={(weeks) => {
          if (!singleDay) return
          const ranges = rangesOf(singleDay)
          void applyPlan(
            weeklyRepeats(singleDay, weeks).map((d) => ({ date: d, ranges })),
            `Repeated ${staffName}’s availability weekly`,
            `Repeated for ${weeks} week${weeks > 1 ? 's' : ''}`,
          )
        }}
      />
    </div>
  )
}

function RepeatDialog({
  open,
  onOpenChange,
  dateKey,
  onRepeat,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  dateKey: string | null
  onRepeat: (weeks: number) => void
}) {
  const [weeks, setWeeks] = useState('4')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Repeat weekly</DialogTitle>
          <DialogDescription>
            Copy {dateKey ? formatDateKey(dateKey, 'weekdayMedium') : ''}’s availability to the same weekday in the following weeks. Closed and locked days are
            skipped, and times follow each day’s opening hours.
          </DialogDescription>
        </DialogHeader>
        <Select value={weeks} onValueChange={setWeeks}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 6, 8, 12].map((n) => (
              <SelectItem key={n} value={String(n)}>
                For {n} week{n > 1 ? 's' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onRepeat(Number(weeks))
              onOpenChange(false)
            }}
          >
            Repeat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
