import { getDocs, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LuCalendarRange, LuRotateCcw, LuTriangleAlert, LuX } from 'react-icons/lu'
import { toast } from 'sonner'
import { dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import { isAhead, isCheckable } from '@shared/schedule/conflicts'
import type { DayHours } from '@shared/settings/defaults'
import {
  type DateKey,
  WEEKDAY_SHORT,
  type Weekday,
  dateRange,
  diffDays,
  formatDateKey,
  formatMinutesShort,
  formatTimeRange,
  nowMinutes,
  orderedWeekdays,
  todayKey,
  weekdayOf,
} from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { MonthScroller, type MonthScrollerHandle } from '@/components/app/MonthScroller'
import { TimeSelect } from '@/components/app/TimeSelect'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useDayConfigs } from '@/features/data/hooks'
import { useIsMobile } from '@/hooks/use-mobile'
import { branchCol } from '@/lib/firestore'
import { useLoadWindow } from '@/lib/useLoadWindow'
import { cn } from '@/lib/utils'
import { type DateHoursValue, describeHoursValue, setDateHours } from './dateHoursApi'

type Mode = 'open' | 'closed' | 'default'

/**
 * Opening hours for specific dates (Settings → Schedule): a vertically scrolling
 * calendar of every date's hours, with dates that differ from the weekly default
 * marked. Click or Shift-click dates to change them, or apply hours to a whole
 * range (optionally only some weekdays). The schedule and availability follow it.
 */
export function DateHoursCard() {
  const { branchId, actor, settings, timezone } = useBranch()
  const today = todayKey(timezone)
  const scroller = useRef<MonthScrollerHandle>(null)
  const [topMonth, setTopMonth] = useState(today)
  const { from, to, onVisibleRangeChange } = useLoadWindow(today)
  const { map: dayConfigs } = useDayConfigs(from, to, { keepPrevious: true })
  const week = settings.schedule.defaultWeek
  const [selection, setSelection] = useState<{ anchor: DateKey; focus: DateKey } | null>(null)
  const [editing, setEditing] = useState<DateKey[] | null>(null)
  const [rangeOpen, setRangeOpen] = useState(false)
  const isMobile = useIsMobile()

  const selected = useMemo(() => {
    if (!selection) return []
    const [lo, hi] = selection.anchor <= selection.focus ? [selection.anchor, selection.focus] : [selection.focus, selection.anchor]
    return dateRange(lo, hi)
  }, [selection])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const hoursOf = (d: DateKey) => dayHours(d, settings, dayConfigs)
  /** A date set apart from the weekly default (a matching per-date record isn't flagged). */
  const isCustom = (d: DateKey) => {
    const c = dayConfigs.get(d)
    if (!c) return false
    const w = week[weekdayOf(d)]
    return c.isOpen !== w.isOpen || (c.isOpen && (c.openMin !== w.openMin || c.closeMin !== w.closeMin))
  }

  const onDayClick = (d: DateKey, shift: boolean) => {
    if (d < today) return toast.info('Past dates can’t change.')
    // Phones: a tap opens the date; runs of dates go through “Apply to a range”.
    if (isMobile) return setEditing([d])
    if (shift && selection) {
      if (Math.abs(diffDays(selection.anchor, d)) > 366) return toast.info('Select up to a year at a time, or use “Apply to a range”.')
      setSelection({ anchor: selection.anchor, focus: d })
    } else setSelection(selection && selection.anchor === d && selection.focus === d ? null : { anchor: d, focus: d })
  }

  const editable = selected.filter((d) => d >= today)
  const anyCustom = editable.some((d) => dayConfigs.has(d))

  async function save(dates: DateKey[], value: DateHoursValue, summaryRange: string, trashSessionIds: string[] = []) {
    const d0 = week[weekdayOf(dates[0])]
    await setDateHours({ branchId, actor, dates, value, closedTimes: { openMin: d0.openMin, closeMin: d0.closeMin }, summaryRange, trashSessionIds })
    const what = dates.length === 1 ? `${formatDateKey(dates[0], 'weekdayMedium')}: ${describeHoursValue(value)}` : `${dates.length} dates set to ${describeHoursValue(value)}`
    toast.success(what, trashSessionIds.length ? { description: `${trashSessionIds.length} session${trashSessionIds.length > 1 ? 's' : ''} moved to Trash.` } : undefined)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Opening hours by date</CardTitle>
        <CardDescription>
          Holidays, closures and special hours. Marked dates differ from the weekly default; the schedule, closed days and tutor availability all follow these hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{formatDateKey(topMonth, 'monthYear')}</span>
          <Button variant="outline" size="sm" onClick={() => scroller.current?.scrollToDate(today, { block: 'month' })}>
            Today
          </Button>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setRangeOpen(true)}>
            <LuCalendarRange /> Apply to a range…
          </Button>
        </div>
        <div className="hidden min-h-10 flex-wrap items-center gap-1.5 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm md:flex" data-testid="date-hours-selection">
          {selection ? (
            <>
              <span className="mr-2 font-medium">
                {selected.length === 1
                  ? formatDateKey(selected[0], 'weekdayLong')
                  : `${formatDateKey(selected[0], 'monthDay')} – ${formatDateKey(selected[selected.length - 1], 'medium')} · ${selected.length} dates`}
              </span>
              <Button size="xs" onClick={() => setEditing(editable)} disabled={!editable.length}>
                Set hours…
              </Button>
              {anyCustom ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    void save(
                      editable.filter((d) => dayConfigs.has(d)),
                      'default',
                      `${formatDateKey(editable[0], 'monthDay')} – ${formatDateKey(editable[editable.length - 1], 'monthDay')}`,
                    )
                      .then(() => setSelection(null))
                      .catch((e) => toast.error('Could not save', { description: (e as Error).message }))
                  }
                >
                  <LuRotateCcw /> Use weekly default
                </Button>
              ) : null}
              <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label="Clear selection" onClick={() => setSelection(null)}>
                <LuX />
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Click a date to select it · Shift-click to select a run of dates · Double-click to edit</span>
          )}
        </div>
        <div className="@container overflow-hidden rounded-xl border">
          <MonthScroller
            ref={scroller}
            anchor={today}
            weekStartsOn={settings.general.weekStartsOn}
            onVisibleRangeChange={onVisibleRangeChange}
            onTopMonthChange={setTopMonth}
            className="h-[min(62svh,560px)] px-2"
            renderDay={(d) => {
              const h = hoursOf(d)
              const custom = isCustom(d)
              const past = d < today
              return (
                <div
                  role="button"
                  tabIndex={-1}
                  aria-label={`${formatDateKey(d, 'weekdayLong')}: ${h.isOpen ? formatTimeRange(h.openMin, h.closeMin) : 'closed'}${custom ? ' (custom)' : ''}`}
                  onClick={(e) => onDayClick(d, e.shiftKey)}
                  onDoubleClick={() => d >= today && setEditing([d])}
                  className={cn(
                    'flex h-20 flex-col gap-1 p-1 select-none sm:p-1.5',
                    past ? 'cursor-default opacity-45' : 'cursor-pointer hover:bg-muted/40',
                    !h.isOpen && 'bg-muted/70 text-muted-foreground',
                    custom && 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/40 dark:text-indigo-100',
                    selectedSet.has(d) && 'bg-sky-50 ring-2 ring-sky-500 ring-inset dark:bg-sky-950/30',
                  )}
                >
                  <div className="flex items-center justify-between">
                    {custom ? (
                      <>
                        <span className="hidden rounded bg-indigo-600 px-1 text-[9px] font-semibold tracking-wide text-white uppercase @2xl:inline">Custom</span>
                        <span className="size-2 rounded-full bg-indigo-600 @2xl:hidden" aria-hidden />
                      </>
                    ) : (
                      <span />
                    )}
                    <span className={cn('flex size-6 items-center justify-center rounded-full text-xs tabular-nums', d === today && 'bg-foreground font-semibold text-background')}>
                      {Number(d.slice(8))}
                    </span>
                  </div>
                  <div className={cn('mt-auto text-[10px] leading-tight tabular-nums sm:text-[11px]', custom ? 'font-semibold' : 'text-muted-foreground')}>
                    {h.isOpen ? (
                      <>
                        <span className="block @2xl:inline">{formatMinutesShort(h.openMin)}</span>
                        <span className="hidden @2xl:inline">–</span>
                        <span className="block @2xl:inline">{formatMinutesShort(h.closeMin)}</span>
                      </>
                    ) : (
                      'Closed'
                    )}
                  </div>
                </div>
              )
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground md:hidden">Tap a date to change it. Past dates can’t change.</p>
      </CardContent>

      {editing ? (
        <HoursDialog
          title={editing.length === 1 ? formatDateKey(editing[0], 'weekdayLong') : `${editing.length} dates`}
          description={editing.length === 1 ? 'Opening hours for this date.' : `${formatDateKey(editing[0], 'medium')} – ${formatDateKey(editing[editing.length - 1], 'medium')}`}
          dates={editing}
          initial={hoursOf(editing[0])}
          onClose={() => setEditing(null)}
          onSave={async (value, trash) => {
            await save(editing, value, `${formatDateKey(editing[0], 'monthDay')} – ${formatDateKey(editing[editing.length - 1], 'monthDay')}`, trash)
            setEditing(null)
            setSelection(null)
          }}
        />
      ) : null}
      {rangeOpen ? (
        <RangeDialog
          today={today}
          weekStartsOn={settings.general.weekStartsOn}
          onClose={() => setRangeOpen(false)}
          onSave={async (dates, value, label, trash) => {
            await save(dates, value, label, trash)
            setRangeOpen(false)
            scroller.current?.scrollToDate(dates[0], { block: 'month' })
          }}
        />
      ) : null}
    </Card>
  )
}

type FormValue = { mode: Mode; openMin: number; closeMin: number }

/**
 * The sessions booked on the dates (null while loading). Closing moves them to
 * Trash, as closing a day on the schedule does; shorter hours leave the ones
 * outside them as conflicts.
 */
function useBookedSessions(dates: DateKey[]): WithId<Session>[] | null {
  const { branchId } = useBranch()
  const [found, setFound] = useState<{ key: string; sessions: WithId<Session>[] } | null>(null)
  const key = dates.length ? `${dates[0]}|${dates[dates.length - 1]}|${dates.length}` : ''
  useEffect(() => {
    if (!key) return
    let live = true
    const wanted = new Set(dates)
    getDocs(query(branchCol(branchId, COL.sessions), where('dateKey', '>=', dates[0]), where('dateKey', '<=', dates[dates.length - 1])))
      .then((snap) => {
        if (!live) return
        const sessions = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Session) })).filter((s) => wanted.has(s.dateKey) && !s.isDeleted)
        setFound({ key, sessions })
      })
      .catch(() => live && setFound({ key, sessions: [] }))
    return () => {
      live = false
    }
    // `key` stands for the dates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, branchId])
  if (!key) return []
  return found?.key === key ? found.sessions : null
}

/** Booked sessions still ahead that the new hours would leave outside opening hours. */
function useOutsideHours(booked: WithId<Session>[] | null, value: FormValue): number {
  const { settings, timezone } = useBranch()
  return useMemo(() => {
    if (!booked || value.mode === 'closed') return 0
    const today = todayKey(timezone)
    const nowMin = nowMinutes(timezone)
    return booked.filter((s) => {
      if (!isCheckable(s) || !isAhead(s, today, nowMin)) return false
      const h = value.mode === 'open' ? { isOpen: true, openMin: value.openMin, closeMin: value.closeMin } : dayHours(s.dateKey, settings, null)
      return !h.isOpen || s.startMin < h.openMin || s.endMin > h.closeMin
    }).length
  }, [booked, value, settings, timezone])
}

/** Open with times, closed, or the weekly default; says when closing moves sessions to Trash, or shorter hours leave some outside. */
function HoursForm({
  value,
  onChange,
  trash,
  outside,
  many,
}: {
  value: FormValue
  onChange: (v: FormValue) => void
  trash: string[] | null
  outside: number
  many: boolean
}) {
  const { settings } = useBranch()
  const range = settings.schedule.editorRange
  return (
    <FieldGroup>
      <RadioGroup value={value.mode} onValueChange={(m) => onChange({ ...value, mode: m as Mode })} className="gap-3">
        <label className="flex items-start gap-3">
          <RadioGroupItem value="open" className="mt-0.5" />
          <div className="grid gap-2">
            <span className="text-sm font-medium">Open</span>
            <div className="flex items-center gap-2">
              <TimeSelect
                value={value.openMin}
                step={30}
                min={range.startMin}
                max={range.endMin - 30}
                disabled={value.mode !== 'open'}
                onChange={(m) => onChange({ ...value, openMin: m, closeMin: Math.max(value.closeMin, m + 30) })}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <TimeSelect value={value.closeMin} step={30} min={value.openMin + 30} max={range.endMin} disabled={value.mode !== 'open'} onChange={(m) => onChange({ ...value, closeMin: m })} />
            </div>
          </div>
        </label>
        <label className="flex items-center gap-3">
          <RadioGroupItem value="closed" />
          <span className="text-sm font-medium">Closed</span>
        </label>
        <label className="flex items-center gap-3">
          <RadioGroupItem value="default" />
          <span className="text-sm font-medium">Weekly default</span>
          <span className="text-xs text-muted-foreground">(each weekday’s usual hours)</span>
        </label>
      </RadioGroup>
      {value.mode === 'closed' && trash?.length ? (
        <Alert>
          <LuTriangleAlert />
          <AlertDescription>
            {trash.length} session{trash.length > 1 ? 's are' : ' is'} booked on {many ? 'these dates' : 'this date'}. Closing moves {trash.length > 1 ? 'them' : 'it'} to Trash; you can
            restore sessions from Trash on the schedule.
          </AlertDescription>
        </Alert>
      ) : null}
      {outside > 0 ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="hours-outside">
          <LuTriangleAlert />
          <AlertDescription className="text-amber-800 dark:text-amber-300">
            {outside} booked session{outside > 1 ? 's fall' : ' falls'} outside these hours. {outside > 1 ? 'They stay' : 'It stays'} booked and{' '}
            {outside > 1 ? 'show' : 'shows'} as {outside > 1 ? 'conflicts' : 'a conflict'} on the schedule until moved, reassigned or canceled.
          </AlertDescription>
        </Alert>
      ) : null}
    </FieldGroup>
  )
}

function saveLabel(v: FormValue, trash: string[] | null, verb: string) {
  if (v.mode === 'closed' && trash?.length) return `Close and move ${trash.length} session${trash.length > 1 ? 's' : ''} to Trash`
  return verb
}

function toValue(v: FormValue): DateHoursValue {
  return v.mode === 'default' ? 'default' : v.mode === 'closed' ? { isOpen: false } : { isOpen: true, openMin: v.openMin, closeMin: v.closeMin }
}

function HoursDialog({
  title,
  description,
  dates,
  initial,
  onClose,
  onSave,
}: {
  title: string
  description: string
  dates: DateKey[]
  initial: DayHours
  onClose: () => void
  onSave: (value: DateHoursValue, trash: string[]) => Promise<void>
}) {
  const [value, setValue] = useState<FormValue>({ mode: initial.isOpen ? 'open' : 'closed', openMin: initial.openMin, closeMin: initial.closeMin })
  const [busy, setBusy] = useState(false)
  const booked = useBookedSessions(dates)
  const trash = value.mode === 'closed' ? (booked?.map((s) => s.id) ?? null) : []
  const outside = useOutsideHours(booked, value)
  const invalid = (value.mode === 'open' && value.closeMin <= value.openMin) || trash === null
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <HoursForm value={value} onChange={setValue} trash={trash} outside={outside} many={dates.length > 1} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || invalid}
            onClick={async () => {
              setBusy(true)
              try {
                await onSave(toValue(value), trash ?? [])
              } catch (e) {
                toast.error('Could not save', { description: (e as Error).message })
                setBusy(false)
              }
            }}
          >
            {busy ? <Spinner /> : null} {saveLabel(value, trash, 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The range tool: from–to dates, optionally only some weekdays, set to closed, times or the default. */
function RangeDialog({
  today,
  weekStartsOn,
  onClose,
  onSave,
}: {
  today: DateKey
  weekStartsOn: Weekday
  onClose: () => void
  onSave: (dates: DateKey[], value: DateHoursValue, label: string, trash: string[]) => Promise<void>
}) {
  const { settings } = useBranch()
  const [from, setFrom] = useState<DateKey>(today)
  const [to, setTo] = useState<DateKey | null>(null)
  const [days, setDays] = useState<Weekday[]>(orderedWeekdays(weekStartsOn))
  const firstOpen = orderedWeekdays(weekStartsOn).map((d) => settings.schedule.defaultWeek[d]).find((d) => d.isOpen)
  const [value, setValue] = useState<FormValue>({ mode: 'closed', openMin: firstOpen?.openMin ?? 840, closeMin: firstOpen?.closeMin ?? 1260 })
  const [busy, setBusy] = useState(false)

  const dates = useMemo(() => {
    if (!to || to < from || diffDays(from, to) > 730) return []
    const wanted = new Set(days)
    return dateRange(from < today ? today : from, to).filter((d) => wanted.has(weekdayOf(d)))
  }, [from, to, days, today])
  const tooLong = !!to && diffDays(from, to) > 730
  const booked = useBookedSessions(dates)
  const trash = value.mode === 'closed' ? (booked?.map((s) => s.id) ?? null) : []
  const outside = useOutsideHours(booked, value)
  const invalid = !dates.length || (value.mode === 'open' && value.closeMin <= value.openMin) || trash === null
  const allDays = days.length === 7
  const label = to
    ? `${formatDateKey(from, 'monthDay')} – ${formatDateKey(to, 'medium')}${allDays ? '' : `, ${orderedWeekdays(weekStartsOn).filter((d) => days.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(' ')}`}`
    : ''

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply hours to a range</DialogTitle>
          <DialogDescription>For example June 1 to December 31, only Saturdays, closed. Past dates are skipped.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="rng-from">From</FieldLabel>
              <DatePicker id="rng-from" value={from} min={today} onChange={setFrom} />
            </Field>
            <Field>
              <FieldLabel htmlFor="rng-to">To</FieldLabel>
              <DatePicker id="rng-to" value={to} min={from} onChange={setTo} placeholder="Pick the last date" />
            </Field>
          </div>
          <Field>
            <FieldLabel>Weekdays</FieldLabel>
            <ToggleGroup type="multiple" variant="outline" value={days} onValueChange={(v) => setDays(v as Weekday[])} className="w-full">
              {orderedWeekdays(weekStartsOn).map((d) => (
                <ToggleGroupItem key={d} value={d} className="flex-1 text-xs data-[state=on]:bg-foreground data-[state=on]:text-background">
                  {WEEKDAY_SHORT[d]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>Only these weekdays in the range change.</FieldDescription>
          </Field>
          <HoursForm value={value} onChange={setValue} trash={trash} outside={outside} many />
          {tooLong ? (
            <p className="text-sm text-destructive">Pick a range of at most two years.</p>
          ) : (
            <p className="text-sm font-medium" data-testid="range-count">
              {to ? `${dates.length} date${dates.length === 1 ? '' : 's'} will change.` : 'Pick the last date of the range.'}
            </p>
          )}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || invalid}
            onClick={async () => {
              setBusy(true)
              try {
                await onSave(dates, toValue(value), label, trash ?? [])
              } catch (e) {
                toast.error('Could not save', { description: (e as Error).message })
                setBusy(false)
              }
            }}
          >
            {busy ? <Spinner /> : null} {saveLabel(value, trash, 'Apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
