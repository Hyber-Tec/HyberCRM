import {
  LuChevronLeft,
  LuChevronRight,
  LuClock,
  LuCopyPlus,
  LuEllipsisVertical,
  LuListOrdered,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuTrash2,
  LuTriangleAlert,
  LuX,
  LuZoomIn,
  LuZoomOut,
} from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { SESSION_STATUSES, SESSION_STATUS_LABELS } from '@shared/schedule/status'
import type { ScheduleView } from '@shared/settings/defaults'
import { type DateKey, type Weekday, formatDateKey, isSameMonth, weekDays } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { MonthScroller } from '@/components/app/MonthScroller'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { SESSION_CARD_STYLE } from './cardStyle'

export interface RailTutor {
  id: string
  name: string
  color?: string
  /** Live sessions in the range shown (Day or Week). */
  sessions: number
  /** Booked time, overlaps counted once. */
  minutes: number
  conflicts: number
  clockedIn: boolean
  /** Has availability in the range shown. */
  available: boolean
}

export interface RailNumbers {
  label: string
  sessions: number
  conflicts: number
  pending: number
  missingLogs: number
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 1.5
const zoomStep = (z: number, d: 1 | -1) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + d * 0.1) * 10) / 10))

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

const hrs = (min: number) => `${String(Math.round((min / 60) * 10) / 10).replace(/\.0$/, '')}h`

/** Day / Week / Month. */
export function ViewSwitch({ view, onView, full }: { view: ScheduleView; onView: (v: ScheduleView) => void; full?: boolean }) {
  return (
    <div className={cn('grid grid-cols-3 rounded-xl bg-muted p-1', full && 'w-full')} role="group" aria-label="View">
      {(['day', 'week', 'month'] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onView(v)}
          className={cn(
            'h-8 rounded-lg px-3 text-sm font-medium capitalize transition',
            view === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

/** The schedule's tools: duplicate a week, Trash, tutor order, opening hours and zoom. */
export function ScheduleMenu({
  zoom,
  onZoom,
  onDuplicate,
  onTrash,
  onTutorOrder,
}: {
  zoom: number
  onZoom: (z: number) => void
  onDuplicate: () => void
  onTrash: () => void
  onTutorOrder: () => void
}) {
  const { branchId } = useBranch()
  const navigate = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Schedule settings">
          <LuEllipsisVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={onDuplicate}>
          <LuCopyPlus /> Duplicate week
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onTrash}>
          <LuTrash2 /> Trash
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onTutorOrder}>
          <LuListOrdered /> Tutor display order
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(`/${branchId}/admin/settings`)}>
          <LuClock /> Default opening hours
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center justify-between font-normal">
          <span>Zoom: {Math.round(zoom * 100)}%</span>
          <span className="flex gap-1">
            <Button variant="outline" size="icon-xs" aria-label="Zoom out" onClick={() => onZoom(zoomStep(zoom, -1))}>
              <LuZoomOut />
            </Button>
            <Button variant="outline" size="icon-xs" aria-label="Zoom in" onClick={() => onZoom(zoomStep(zoom, 1))}>
              <LuZoomIn />
            </Button>
          </span>
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export interface ScheduleRailProps {
  view: ScheduleView
  date: DateKey
  today: DateKey
  weekStartsOn: Weekday
  isClosed: (d: DateKey) => boolean
  title: string
  subtitle: string
  onView: (v: ScheduleView) => void
  onDate: (d: DateKey) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  tutors: RailTutor[]
  /** Month view shows no session numbers. */
  showNumbers: boolean
  tutorFilter: string | null
  onTutorFilter: (id: string | null) => void
  numbers: RailNumbers | null
  zoom: number
  onZoom: (z: number) => void
  onDuplicate: () => void
  onTrash: () => void
  onTutorOrder: () => void
  /** Month view: the month at the top of the scrolling calendar. */
  topMonth?: DateKey | null
  /** Desktop: folds the rail away. */
  onHide?: () => void
  /** Phone sheet: closes it. */
  onClose?: () => void
}

/**
 * The schedule's side rail: the date and view, a scrolling month calendar, the
 * tutors (click one to see only them), the shown day's numbers, the legend and
 * the tools.
 */
export function ScheduleRail(p: ScheduleRailProps) {
  const weekSet = new Set(weekDays(p.date, p.weekStartsOn))
  const month = p.view === 'month' && p.topMonth ? p.topMonth : p.date
  const isActive = (d: DateKey) => {
    if (p.view === 'day') return d === p.date
    if (p.view === 'week') return weekSet.has(d) && !p.isClosed(d)
    return isSameMonth(d, month) && !p.isClosed(d)
  }
  const n = p.numbers
  const num = (value: number, label: string, tone?: string) => (
    <div className="rounded-lg bg-card px-2.5 py-2 ring-1 ring-border">
      <div className={cn('text-lg font-semibold tabular-nums', value > 0 && tone)}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
  return (
    <aside className="flex h-full w-full flex-col gap-4 overflow-y-auto p-3 [&>*]:shrink-0" aria-label="Schedule panel" data-testid="schedule-rail">
      <div className="flex items-start gap-2 px-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-2xl font-semibold tracking-tight">{p.title}</div>
          <div className="text-sm text-muted-foreground">{p.subtitle}</div>
        </div>
        {p.onClose ? (
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={p.onClose}>
            <LuX />
          </Button>
        ) : p.onHide ? (
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Hide the side rail (Esc)" title="Hide the side rail (Esc)" onClick={p.onHide}>
            <LuPanelLeftClose />
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 px-1">
        <Button variant="outline" size="icon-sm" className="rounded-full" aria-label="Previous" title="Previous (←)" onClick={p.onPrev}>
          <LuChevronLeft />
        </Button>
        <Button variant="outline" size="icon-sm" className="rounded-full" aria-label="Next" title="Next (→)" onClick={p.onNext}>
          <LuChevronRight />
        </Button>
        <Button variant="outline" size="sm" className="ml-auto rounded-full" onClick={p.onToday}>
          Today
        </Button>
      </div>
      <ViewSwitch view={p.view} onView={p.onView} full />
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border" data-testid="mini-calendar">
        <MonthScroller
          variant="compact"
          anchor={p.date}
          focusDate={p.view === 'month' ? (p.topMonth ?? p.date) : p.date}
          weekStartsOn={p.weekStartsOn}
          className="h-60"
          renderDay={(d) => {
            const active = isActive(d)
            return (
              <button
                type="button"
                onClick={() => p.onDate(d)}
                aria-label={formatDateKey(d, 'weekdayLong')}
                aria-pressed={active}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-xs tabular-nums transition-colors',
                  p.isClosed(d) && 'text-muted-foreground/50',
                  active && 'bg-foreground font-semibold text-background',
                  !active && d === p.today && 'font-bold text-red-600 ring-1 ring-red-500 ring-inset',
                  !active && 'hover:bg-muted',
                )}
              >
                {Number(d.slice(8))}
              </button>
            )
          }}
        />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tutors</span>
          {p.tutorFilter ? (
            <button type="button" className="text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => p.onTutorFilter(null)}>
              Show all
            </button>
          ) : p.showNumbers ? (
            <span className="text-[11px] text-muted-foreground/70">Sessions · hours</span>
          ) : null}
        </div>
        <div className="space-y-0.5" data-testid="rail-tutors">
          {p.tutors.map((t) => {
            const on = p.tutorFilter === t.id
            const dim = !!p.tutorFilter && !on
            const color = t.color ?? '#71717a'
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => p.onTutorFilter(on ? null : t.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition',
                  on ? 'bg-card font-medium shadow-sm ring-1 ring-border' : 'hover:bg-muted/70',
                  dim && 'opacity-50',
                )}
              >
                <span className="relative flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold" style={{ backgroundColor: `${color}1f`, color }}>
                  {initialsOf(t.name)}
                  {t.clockedIn ? <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-muted bg-emerald-500" aria-label="Clocked in" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                {t.conflicts ? <LuTriangleAlert className="size-3.5 shrink-0 text-red-500" aria-label={`${t.conflicts} in conflict`} /> : null}
                {p.showNumbers ? (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t.sessions ? `${t.sessions} · ${hrs(t.minutes)}` : t.available ? 'free' : 'off'}</span>
                ) : null}
              </button>
            )
          })}
          {p.tutors.length === 0 ? <p className="px-2 text-sm text-muted-foreground">No tutors yet.</p> : null}
        </div>
      </div>
      {n ? (
        <div>
          <div className="mb-1.5 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{n.label}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {num(n.sessions, n.sessions === 1 ? 'session' : 'sessions')}
            {num(n.conflicts, 'in conflict', 'text-red-600')}
            {num(n.pending, 'pending', 'text-amber-600')}
            {num(n.missingLogs, n.missingLogs === 1 ? 'log missing' : 'logs missing')}
          </div>
        </div>
      ) : null}
      <div className="space-y-1.5 px-2 text-xs text-muted-foreground">
        <div className="text-xs font-semibold tracking-wide uppercase">Legend</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {SESSION_STATUSES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: SESSION_CARD_STYLE[s].bar }} />
              {SESSION_STATUS_LABELS[s]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-3 rounded-sm border-x-2 border-[#88D5A4] bg-[#F8FFF9]" />
            Clocked in
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-3 rounded-sm bg-[repeating-linear-gradient(135deg,rgba(113,113,122,0.35)_0,rgba(113,113,122,0.35)_1px,transparent_1px,transparent_3px)] ring-1 ring-border" />
            Closed
          </span>
        </div>
      </div>
      <div className="mt-auto grid grid-cols-2 gap-1.5 border-t pt-3">
        <Button variant="outline" size="sm" className="rounded-lg" onClick={p.onDuplicate}>
          <LuCopyPlus /> Duplicate
        </Button>
        <Button variant="outline" size="sm" className="rounded-lg" onClick={p.onTrash}>
          <LuTrash2 /> Trash
        </Button>
        <Button variant="outline" size="sm" className="rounded-lg" onClick={p.onTutorOrder}>
          <LuListOrdered /> Order
        </Button>
        <div className="flex h-8 items-center justify-between rounded-lg border bg-card px-1">
          <Button variant="ghost" size="icon-xs" aria-label="Zoom out" onClick={() => p.onZoom(zoomStep(p.zoom, -1))}>
            <LuZoomOut />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">{Math.round(p.zoom * 100)}%</span>
          <Button variant="ghost" size="icon-xs" aria-label="Zoom in" onClick={() => p.onZoom(zoomStep(p.zoom, 1))}>
            <LuZoomIn />
          </Button>
        </div>
      </div>
    </aside>
  )
}

/** The folded rail: show it again, step through dates, or pick a tutor by initials. */
export function SlimRail({
  tutors,
  tutorFilter,
  onTutorFilter,
  onShow,
  onPrev,
  onNext,
}: {
  tutors: RailTutor[]
  tutorFilter: string | null
  onTutorFilter: (id: string | null) => void
  onShow: () => void
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="flex h-full flex-col items-center gap-2 overflow-y-auto py-3">
      <Button variant="ghost" size="icon-sm" aria-label="Show the side rail (Esc)" title="Show the side rail (Esc)" onClick={onShow}>
        <LuPanelLeftOpen />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Previous" onClick={onPrev}>
        <LuChevronLeft />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Next" onClick={onNext}>
        <LuChevronRight />
      </Button>
      <span className="my-1 h-px w-6 bg-border" />
      {tutors.map((t) => {
        const on = tutorFilter === t.id
        const color = t.color ?? '#71717a'
        return (
          <button
            key={t.id}
            type="button"
            title={t.name}
            aria-label={on ? 'Show all tutors' : `Show only ${t.name}`}
            onClick={() => onTutorFilter(on ? null : t.id)}
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
              tutorFilter && !on && 'opacity-40',
              on && 'ring-2 ring-foreground ring-offset-2 ring-offset-muted',
            )}
            style={{ backgroundColor: `${color}1f`, color }}
          >
            {initialsOf(t.name)}
          </button>
        )
      })}
    </div>
  )
}
