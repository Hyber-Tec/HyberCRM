import { useState } from 'react'
import { IoDuplicate } from 'react-icons/io5'
import { LuChevronLeft, LuChevronRight, LuClock, LuListOrdered, LuMinus, LuPlus, LuSettings, LuTrash2 } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import type { ScheduleView } from '@shared/settings/defaults'
import {
  type DateKey,
  type Weekday,
  WEEKDAY_SHORT,
  addMonths,
  formatDateKey,
  isSameMonth,
  monthGrid,
  orderedWeekdays,
  startOfMonth,
  startOfWeek,
  weekDays,
} from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export interface WeekBarProps {
  view: ScheduleView
  date: DateKey
  today: DateKey
  master: boolean
  weekStartsOn: Weekday
  isClosed: (d: DateKey) => boolean
  onView: (v: ScheduleView) => void
  onDate: (d: DateKey) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  tutors: { id: string; name: string }[]
  tutorFilter: string | null
  onTutorFilter: (id: string | null) => void
  zoom: number
  onZoom: (z: number) => void
  onToggleMaster: () => void
  onDuplicate: () => void
  onTrash: () => void
  onTutorOrder: () => void
}

export function WeekBar(p: WeekBarProps) {
  const { branchId } = useBranch()
  const navigate = useNavigate()
  const [cursor, setCursor] = useState<DateKey | null>(null)
  const monthCursor = cursor ?? startOfMonth(p.date)
  const grid = monthGrid(monthCursor, p.weekStartsOn)
  const weeks = Array.from({ length: 6 }, (_, w) => grid.slice(w * 7, w * 7 + 7)).filter((wk) => wk.some((d) => isSameMonth(d, monthCursor)))
  const weekSet = new Set(weekDays(p.date, p.weekStartsOn))

  let title = ''
  let subtitle = ''
  if (p.master) {
    title = 'Master Schedule'
    subtitle = 'Weekly template'
  } else if (p.view === 'day') {
    title = formatDateKey(p.date, 'weekdayLong').split(',')[0]
    subtitle = formatDateKey(p.date, 'long')
  } else if (p.view === 'week') {
    const days = weekDays(p.date, p.weekStartsOn)
    title = `Week of ${formatDateKey(days[0], 'monthDay')}`
    subtitle = `${formatDateKey(days[0], 'short')} – ${formatDateKey(days[6], 'short')}`
  } else {
    title = formatDateKey(p.date, 'monthYear').split(' ')[0]
    subtitle = p.date.slice(0, 4)
  }

  const isActive = (d: DateKey) => {
    if (p.master) return false
    if (p.view === 'day') return d === p.date
    if (p.view === 'week') return weekSet.has(d) && !p.isClosed(d)
    return isSameMonth(d, p.date) && !p.isClosed(d)
  }

  return (
    <aside className="flex w-full flex-col gap-4 p-4">
      <div>
        <div className="text-xl font-bold tracking-tight">{title}</div>
        <div className="text-sm text-muted-foreground">{subtitle}</div>
      </div>
      {!p.master ? (
        <>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="rounded-full" aria-label="Previous" onClick={p.onPrev}>
              <LuChevronLeft />
            </Button>
            <Button variant="outline" size="icon" className="rounded-full" aria-label="Next" onClick={p.onNext}>
              <LuChevronRight />
            </Button>
            <Button variant="outline" className="ml-auto rounded-full" onClick={p.onToday}>
              Today
            </Button>
          </div>
          <ToggleGroup type="single" variant="outline" value={p.view} onValueChange={(v) => v && p.onView(v as ScheduleView)} className="w-full">
            {(['day', 'week', 'month'] as const).map((v) => (
              <ToggleGroupItem key={v} value={v} className="flex-1 capitalize data-[state=on]:bg-foreground data-[state=on]:text-background">
                {v}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="rounded-xl border p-2">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-sm font-semibold">{formatDateKey(monthCursor, 'monthYear')}</span>
              <div className="flex">
                <Button variant="ghost" size="icon-xs" aria-label="Previous month" onClick={() => setCursor(addMonths(monthCursor, -1))}>
                  <LuChevronLeft />
                </Button>
                <Button variant="ghost" size="icon-xs" aria-label="Next month" onClick={() => setCursor(addMonths(monthCursor, 1))}>
                  <LuChevronRight />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-muted-foreground">
              {orderedWeekdays(p.weekStartsOn).map((d) => (
                <div key={d} className="py-1">
                  {WEEKDAY_SHORT[d].slice(0, 2)}
                </div>
              ))}
            </div>
            {weeks.map((wk, i) => (
              <div key={i} className="grid grid-cols-7">
                {wk.map((d) => {
                  const inMonth = isSameMonth(d, monthCursor)
                  const active = inMonth && isActive(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setCursor(null)
                        p.onDate(d)
                      }}
                      className={cn(
                        'm-0.5 flex aspect-square items-center justify-center rounded-full text-xs',
                        !inMonth && 'text-muted-foreground/40',
                        inMonth && p.isClosed(d) && 'text-muted-foreground/50',
                        active && 'bg-foreground font-semibold text-background',
                        !active && d === p.today && 'font-bold text-red-600 ring-1 ring-red-500',
                        !active && 'hover:bg-muted',
                      )}
                    >
                      {Number(d.slice(8))}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </>
      ) : null}
      <div className="flex items-center gap-2">
        <Select value={p.tutorFilter ?? 'all'} onValueChange={(v) => p.onTutorFilter(v === 'all' ? null : v)}>
          <SelectTrigger className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teachers</SelectItem>
            {p.tutors.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="rounded-full" aria-label="Schedule settings">
              <LuSettings />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={p.onToggleMaster} className={cn(p.master && 'font-semibold text-emerald-600')}>
              {p.master ? 'Exit Master Schedule' : 'Master Schedule'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={p.onDuplicate}>
              <IoDuplicate /> Duplicate week
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={p.onTrash} className="text-amber-700">
              <LuTrash2 className="text-amber-700" /> Trash
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={p.onTutorOrder}>
              <LuListOrdered /> Tutor display order
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate(`/${branchId}/admin/settings`)}>
              <LuClock /> Default opening hours
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center justify-between font-normal">
              <span>Zoom: {Math.round(p.zoom * 100)}%</span>
              <span className="flex gap-1">
                <Button variant="outline" size="icon-xs" aria-label="Zoom out" onClick={() => p.onZoom(Math.max(0.5, Math.round((p.zoom - 0.1) * 10) / 10))}>
                  <LuMinus />
                </Button>
                <Button variant="outline" size="icon-xs" aria-label="Zoom in" onClick={() => p.onZoom(Math.min(1.5, Math.round((p.zoom + 0.1) * 10) / 10))}>
                  <LuPlus />
                </Button>
              </span>
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}

/** Week containing `d`, in the branch's week start. */
export function weekOf(d: DateKey, weekStartsOn: Weekday) {
  return startOfWeek(d, weekStartsOn)
}
