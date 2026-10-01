import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LuChevronDown,
  LuChevronUp,
  LuClipboardPaste,
  LuCopy,
  LuCopyPlus,
  LuLock,
  LuPencil,
  LuRepeat,
  LuTrash2,
} from 'react-icons/lu'
import { toast } from 'sonner'
import { dayHours, effectiveLockDays, isInsideLeadTime, isLockedForTutor, normalizeRanges, weeklyRepeats } from '@shared/availability'
import {
  type DateKey,
  WEEKDAY_SHORT,
  addDays,
  addMonths,
  endOfMonth,
  formatDateKey,
  formatMinutesShort,
  isSameMonth,
  monthGrid,
  orderedWeekdays,
  startOfMonth,
  startOfWeek,
  todayKey,
} from '@shared/time'
import type { AvailabilityRange } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useAvailability, useDayConfigs } from '@/features/data/hooks'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { type DayWrite, writeAvailability } from './api'
import { DayEditorDialog, type DayEditorState } from './DayEditorDialog'

const MONTHS_SHOWN = 3

export function AvailabilityCalendar({ staffId, staffName, mode }: { staffId: string; staffName: string; mode: 'tutor' | 'admin' }) {
  const { branchId, actor, settings, timezone } = useBranch()
  const isMobile = useIsMobile()
  const today = todayKey(timezone)
  const weekStartsOn = settings.general.weekStartsOn
  const lockDays = mode === 'tutor' ? effectiveLockDays(settings) : -1
  const leadDays = settings.availability.leadTimeDays

  const [firstMonth, setFirstMonth] = useState(() => startOfMonth(today))
  const months = useMemo(() => Array.from({ length: MONTHS_SHOWN }, (_, i) => addMonths(firstMonth, i)), [firstMonth])
  const from = monthGrid(months[0], weekStartsOn)[0]
  const to = addDays(endOfMonth(months[months.length - 1]), 7)
  const { map: availability, loading } = useAvailability(staffId, from, to)
  const { map: dayConfigs } = useDayConfigs(from, to)

  const [selected, setSelected] = useState<DateKey | null>(null)
  const [clipboard, setClipboard] = useState<AvailabilityRange[] | null>(null)
  const [editor, setEditor] = useState<DayEditorState | null>(null)
  const [repeatOpen, setRepeatOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const now = new Date()
  const locked = useCallback((d: DateKey) => lockDays >= 0 && isLockedForTutor(d, timezone, lockDays, now), [lockDays, timezone, now])
  const hoursOf = useCallback((d: DateKey) => dayHours(d, settings, dayConfigs), [settings, dayConfigs])
  const rangesOf = useCallback((d: DateKey) => availability.get(d)?.ranges ?? [], [availability])

  const write = useCallback(
    async (days: DayWrite[], summary?: string) => {
      await writeAvailability({ branchId, actor, timezone, staffId, staffName, via: mode, days, summary })
    },
    [branchId, actor, timezone, staffId, staffName, mode],
  )

  const openEditor = useCallback(
    (d: DateKey) => {
      const hours = hoursOf(d)
      if (!hours.isOpen && rangesOf(d).length === 0) {
        toast.info('This day is closed.')
        return
      }
      setEditor({
        dateKey: d,
        ranges: rangesOf(d),
        exists: rangesOf(d).length > 0,
        locked: locked(d),
        leadWarning: mode === 'tutor' && settings.availability.leadTimeEnforcement === 'warn' && isInsideLeadTime(d, timezone, leadDays) && !locked(d),
        hours,
      })
    },
    [hoursOf, rangesOf, locked, mode, settings, timezone, leadDays],
  )

  /** Applies ranges to several days, skipping closed and locked days. */
  const applyToDays = useCallback(
    async (days: DateKey[], ranges: AvailabilityRange[] | ((d: DateKey) => AvailabilityRange[]), summary: string) => {
      const skipped: DateKey[] = []
      const writes: DayWrite[] = []
      for (const d of days) {
        const r = typeof ranges === 'function' ? ranges(d) : ranges
        if (locked(d) || (!hoursOf(d).isOpen && r.length > 0)) {
          skipped.push(d)
          continue
        }
        writes.push({ dateKey: d, ranges: r })
      }
      if (writes.length) await write(writes, summary)
      if (skipped.length) toast.info(`${skipped.length} closed or locked day${skipped.length > 1 ? 's were' : ' was'} skipped.`)
      else if (writes.length) toast.success('Availability updated')
    },
    [locked, hoursOf, write],
  )

  const copy = useCallback(() => {
    if (!selected) return
    const r = rangesOf(selected)
    if (!r.length) return toast.info('Nothing to copy on this day.')
    setClipboard(r)
    toast.success('Copied — select a day and paste')
  }, [selected, rangesOf])

  const paste = useCallback(() => {
    if (!selected || !clipboard) return
    void applyToDays([selected], clipboard, `Pasted availability for ${staffName}`).catch((e) => toast.error((e as Error).message))
  }, [selected, clipboard, applyToDays, staffName])

  const clear = useCallback(() => {
    if (!selected || !rangesOf(selected).length) return
    if (locked(selected)) return toast.error('This day is locked. Please contact an admin.')
    if (!window.confirm(`Remove availability on ${formatDateKey(selected, 'weekdayMedium')}?`)) return
    void applyToDays([selected], [], `Removed ${staffName}’s availability`).catch((e) => toast.error((e as Error).message))
  }, [selected, rangesOf, locked, applyToDays, staffName])

  const copyLastWeek = useCallback(() => {
    const anchor = selected ?? today
    const weekStart = startOfWeek(anchor, weekStartsOn)
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    if (!window.confirm(`Copy the previous week’s availability into the week of ${formatDateKey(weekStart, 'monthDay')}? Existing availability that week is replaced.`)) return
    void applyToDays(days, (d) => rangesOf(addDays(d, -7)), `Copied last week’s availability for ${staffName}`).catch((e) =>
      toast.error((e as Error).message),
    )
  }, [selected, today, weekStartsOn, applyToDays, rangesOf, staffName])

  // Keyboard shortcuts on desktop: ⌘C copy, ⌘V paste, Delete clear, Enter edit.
  useEffect(() => {
    if (isMobile) return
    const onKey = (e: KeyboardEvent) => {
      if (editor || repeatOpen || !selected) return
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        copy()
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        paste()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        clear()
      } else if (e.key === 'Enter') {
        openEditor(selected)
      } else if (e.key === 'Escape') {
        setSelected(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMobile, editor, repeatOpen, selected, copy, paste, clear, openEditor])

  const weekdays = orderedWeekdays(weekStartsOn)

  return (
    <div ref={containerRef} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setFirstMonth(startOfMonth(today))}>
          Today
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Earlier months" onClick={() => setFirstMonth((m) => addMonths(m, -1))}>
          <LuChevronUp />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Later months" onClick={() => setFirstMonth((m) => addMonths(m, 1))}>
          <LuChevronDown />
        </Button>
        {loading ? <Spinner className="size-4" /> : null}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {clipboard ? <Badge variant="secondary">{clipboard.length} range{clipboard.length > 1 ? 's' : ''} copied</Badge> : null}
          <Button variant="outline" size="sm" onClick={copyLastWeek}>
            <LuCopyPlus /> Copy last week
          </Button>
          <Button variant="outline" size="sm" disabled={!selected || !rangesOf(selected).length} onClick={() => setRepeatOpen(true)}>
            <LuRepeat /> Repeat weekly
          </Button>
        </div>
      </div>

      {selected && !isMobile ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="mr-2 font-medium">{formatDateKey(selected, 'weekdayLong')}</span>
          <Button size="xs" variant="ghost" onClick={() => openEditor(selected)}>
            <LuPencil /> Edit
          </Button>
          <Button size="xs" variant="ghost" onClick={copy}>
            <LuCopy /> Copy
          </Button>
          <Button size="xs" variant="ghost" disabled={!clipboard} onClick={paste}>
            <LuClipboardPaste /> Paste
          </Button>
          <Button size="xs" variant="ghost" onClick={clear}>
            <LuTrash2 /> Clear
          </Button>
          <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">⌘C copy · ⌘V paste · Del clear · Enter edit</span>
        </div>
      ) : null}

      {months.map((m) => {
        const grid = monthGrid(m, weekStartsOn)
        const weeks = Array.from({ length: 6 }, (_, w) => grid.slice(w * 7, w * 7 + 7)).filter((wk) => wk.some((d) => isSameMonth(d, m)))
        return (
          <section key={m}>
            <h2 className="mb-2 flex items-baseline gap-2">
              <span className="text-lg font-semibold">{formatDateKey(m, 'monthYear').split(' ')[0]}</span>
              <span className="text-sm text-muted-foreground">{m.slice(0, 4)}</span>
              {isSameMonth(m, today) ? (
                <Badge variant="outline" className="h-5 text-[10px]">
                  THIS MONTH
                </Badge>
              ) : null}
            </h2>
            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {weekdays.map((d) => (
                  <div key={d} className="py-1.5">
                    {WEEKDAY_SHORT[d]}
                  </div>
                ))}
              </div>
              {weeks.map((wk, wi) => (
                <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
                  {wk.map((d) => {
                    if (!isSameMonth(d, m)) return <div key={d} className="border-r bg-background last:border-r-0" />
                    const ranges = normalizeRanges(rangesOf(d))
                    const hours = hoursOf(d)
                    const isLocked = locked(d)
                    const needs =
                      mode === 'tutor' && hours.isOpen && !isLocked && ranges.length === 0 && d >= today && isInsideLeadTime(d, timezone, leadDays)
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => (isMobile ? openEditor(d) : setSelected(d === selected ? null : d))}
                        onDoubleClick={() => !isMobile && openEditor(d)}
                        className={cn(
                          'relative flex h-20 flex-col items-stretch gap-0.5 border-r p-1 text-left transition-colors last:border-r-0 sm:h-24 sm:p-1.5',
                          !hours.isOpen ? 'bg-muted/60 text-muted-foreground' : 'hover:bg-muted/40',
                          selected === d && 'bg-accent ring-2 ring-foreground ring-inset',
                          needs && 'bg-amber-50/60 dark:bg-amber-950/20',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          {isLocked && ranges.length ? <LuLock className="size-3 text-muted-foreground" aria-label="Locked" /> : <span />}
                          <span
                            className={cn(
                              'flex size-6 items-center justify-center rounded-full text-xs',
                              d === today && 'bg-foreground font-semibold text-background',
                            )}
                          >
                            {Number(d.slice(8))}
                          </span>
                        </div>
                        {ranges.slice(0, isMobile ? 1 : 2).map((r, i) => (
                          <div
                            key={i}
                            className="truncate rounded-md border border-emerald-200 bg-emerald-50 px-1 py-0.5 text-[10px] font-medium text-emerald-800 sm:text-[11px] dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                          >
                            {formatMinutesShort(r.startMin)}–{formatMinutesShort(r.endMin)}
                          </div>
                        ))}
                        {ranges.length > (isMobile ? 1 : 2) ? (
                          <div className="text-[10px] text-muted-foreground">+{ranges.length - (isMobile ? 1 : 2)} more</div>
                        ) : null}
                        {!hours.isOpen && ranges.length === 0 ? <div className="mt-auto text-[10px]">Closed</div> : null}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </section>
        )
      })}

      <p className="text-xs text-muted-foreground">
        {isMobile ? 'Tap a day to set availability.' : 'Click a day to select it, double-click to edit.'}
        {mode === 'tutor'
          ? ` Days within ${settings.availability.lockWindowDays} days are locked; amber days are inside the ${leadDays}-day notice window and still need availability.`
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
        dateKey={selected}
        onRepeat={(weeks) => {
          if (!selected) return
          const ranges = rangesOf(selected)
          void applyToDays(weeklyRepeats(selected, weeks), ranges, `Repeated ${staffName}’s availability weekly`).catch((e) =>
            toast.error((e as Error).message),
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
            skipped.
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
