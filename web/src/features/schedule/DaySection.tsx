import { useEffect, useRef, useState } from 'react'
import { LuBan, LuCalendarCog, LuClipboardPaste, LuPencil, LuPlus, LuTrash2, LuTriangleAlert, LuUserRound } from 'react-icons/lu'
import type { TutorRow } from '@shared/schedule/dayModel'
import { layoutEventLanes } from '@shared/schedule/events'
import { slotAt } from '@shared/schedule/dayModel'
import type { DayHours } from '@shared/settings/defaults'
import { type DateKey, formatDateKey, formatMinutes, formatMinutesShort, formatTimeRange } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { ContextMenuFor, menu } from '@/components/app/ItemMenu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useScheduleUi } from './context'
import {
  AXIS_H,
  CANCELED_BAND,
  CARD_H,
  EVENT_GAP,
  EVENT_H,
  LANE_GAP,
  NAME_COL,
  ROW_PAD_TOP,
  eventsRowHeight,
  dragStartMinute,
  minuteAt,
  rowHeight,
  timelineWidth,
} from './geometry'
import { sessionDrag } from './dragState'
import { SESSION_DRAG_TYPE, SessionCard } from './SessionCard'
import type { EventDoc } from './useScheduleData'

export const EVENT_DRAG_TYPE = 'application/x-hyber-event'

/** Unavailable time on a tutor's row: a faint hatch under the white availability bands. */
const OFF_HATCH = 'bg-[repeating-linear-gradient(135deg,rgba(161,161,170,0.10)_0,rgba(161,161,170,0.10)_1px,transparent_1px,transparent_6px)]'
const CLOSED_HATCH =
  'bg-[repeating-linear-gradient(135deg,rgba(113,113,122,0.18)_0,rgba(113,113,122,0.18)_2px,transparent_2px,transparent_8px)] dark:bg-[repeating-linear-gradient(135deg,rgba(161,161,170,0.18)_0,rgba(161,161,170,0.18)_2px,transparent_2px,transparent_8px)]'

interface Props {
  dateKey: DateKey
  hours: DayHours
  rows: TutorRow<WithId<Session>>[]
  events: WithId<EventDoc>[]
  /** Week view: each day has its own heading; Day view titles the page instead. */
  showHeader?: boolean
  /** Day view: the time axis stays in view while scrolling. */
  stickyAxis?: boolean
  sectionId?: string
}

export function DaySection({ dateKey, hours, rows, events, showHeader = false, stickyAxis = false, sectionId }: Props) {
  const ui = useScheduleUi()
  const locked = ui.isLocked(dateKey)
  const isToday = dateKey === ui.today
  // Sessions outside the opening hours (the day was closed or shortened after booking) stay on screen.
  let lo = hours.isOpen ? hours.openMin : Infinity
  let hi = hours.isOpen ? hours.closeMin : -Infinity
  for (const r of rows) {
    for (const s of r.active) {
      lo = Math.min(lo, s.startMin)
      hi = Math.max(hi, s.endMin)
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = hours.openMin
    hi = hours.closeMin
  }
  const openMin = hours.isOpen && lo >= hours.openMin ? Math.floor(lo / 5) * 5 : Math.floor(lo / 60) * 60
  const closeMin = Math.max(openMin + 60, hours.isOpen && hi <= hours.closeMin ? Math.ceil(hi / 5) * 5 : Math.ceil(hi / 60) * 60)
  const width = timelineWidth(openMin, closeMin)
  const x = (m: number) => ((m - openMin) / (closeMin - openMin)) * width
  const hoverRef = useRef<HTMLDivElement>(null)
  const hoverLabelRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLDivElement>(null)
  const startLabelRef = useRef<HTMLDivElement>(null)

  const hourMarks: number[] = []
  for (let m = Math.ceil(openMin / 60) * 60; m <= closeMin; m += 60) hourMarks.push(m)
  const nowX = isToday && ui.nowMin >= openMin && ui.nowMin <= closeMin ? x(ui.nowMin) : null

  const showEvents = ui.mode === 'admin'
  const eventLanes = layoutEventLanes(events.map((e) => ({ id: e.id, startMin: e.startMin, endMin: e.endMin })))
  const usedEventLanes = events.length ? Math.max(...eventLanes.values()) + 1 : 0
  const eventLaneCount = showEvents ? (locked ? usedEventLanes : usedEventLanes + 1) : 0

  const place = (line: HTMLDivElement | null, label: HTMLDivElement | null, m: number | null, text?: string) => {
    for (const el of [line, label]) {
      if (!el) continue
      el.style.display = m === null ? 'none' : 'block'
      if (m !== null) el.style.left = `${NAME_COL + x(m)}px`
    }
    if (label && m !== null) label.textContent = text ?? formatMinutes(m)
  }
  function onHover(e: { target: EventTarget; clientX: number }) {
    const track = (e.target as HTMLElement).closest('[data-track]') as HTMLElement | null
    if (!track) return
    place(hoverRef.current, hoverLabelRef.current, minuteAt(e.clientX, track.getBoundingClientRect(), openMin, closeMin, ui.snap))
  }
  function onLeave() {
    place(hoverRef.current, hoverLabelRef.current, null)
  }
  /** While a session card is dragged: the cursor line plus a guide at the card's start, snapped. */
  function onDragGuide(e: React.DragEvent<HTMLDivElement>) {
    const drag = sessionDrag.current
    const track = (e.target as HTMLElement).closest('[data-track]') as HTMLElement | null
    if (!drag || !track) return place(startRef.current, startLabelRef.current, null)
    onHover(e)
    const start = dragStartMinute(e.clientX, track.getBoundingClientRect(), openMin, closeMin, ui.snap, drag.grabOffsetMin)
    place(startRef.current, startLabelRef.current, start, `Start ${formatMinutes(start)}`)
  }
  function hideGuides() {
    onLeave()
    place(startRef.current, startLabelRef.current, null)
  }
  // A drag that ends anywhere (drop, Escape, outside the page) clears the guides.
  useEffect(() => {
    const end = () => hideGuides()
    document.addEventListener('dragend', end)
    document.addEventListener('drop', end)
    return () => {
      document.removeEventListener('dragend', end)
      document.removeEventListener('drop', end)
    }
  })

  const heading = showHeader ? (
    <ContextMenuFor
      disabled={ui.mode !== 'admin'}
      entries={menu(
        {
          label: 'Edit day…',
          icon: LuCalendarCog,
          onSelect: () => ui.editDay(dateKey),
        },
        !locked &&
          hours.isOpen && {
            label: 'New event…',
            icon: LuPlus,
            onSelect: () => ui.createEvent(dateKey, hours.openMin),
          },
      )}
    >
      <header className="sticky left-0 flex w-fit items-center gap-2 px-1 pb-2">
        <h2 className="text-base font-semibold tracking-tight">{formatDateKey(dateKey, 'weekdayLong').replace(/, \d{4}$/, '')}</h2>
        {isToday ? <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background">TODAY</span> : null}
        {!hours.isOpen ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">CLOSED</span> : null}
        {locked ? <span className="text-xs text-muted-foreground">Past · view only</span> : null}
        {ui.mode === 'admin' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Edit day"
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => ui.editDay(dateKey)}
              >
                <LuCalendarCog className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Edit day</TooltipContent>
          </Tooltip>
        ) : null}
      </header>
    </ContextMenuFor>
  ) : null

  return (
    <section id={sectionId} data-date={dateKey}>
      {heading}
      <div
        className={cn('relative w-max min-w-full overflow-clip bg-card', showHeader && 'rounded-xl border shadow-xs')}
        onPointerMove={onHover}
        onPointerLeave={onLeave}
        onDragOver={onDragGuide}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) hideGuides()
        }}
        style={{ width: NAME_COL + width }}
      >
        {/* Time axis */}
        <div className={cn('z-20 flex border-b bg-card', stickyAxis && 'sticky top-0')} style={{ height: AXIS_H }}>
          <div className="sticky left-0 z-10 shrink-0 border-r bg-card" style={{ width: NAME_COL }} />
          <div className="relative" style={{ width }}>
            {hourMarks
              .filter((m) => nowX === null || Math.abs(x(m) - nowX) > 34)
              .map((m) => (
                <span
                  key={m}
                  className="absolute top-2 -translate-x-1/2 text-[11px] font-medium whitespace-nowrap text-muted-foreground"
                  style={{ left: Math.max(18, Math.min(width - 22, x(m))) }}
                >
                  {formatMinutesShort(m)}
                </span>
              ))}
            {nowX !== null ? (
              <span
                className="absolute top-1.5 z-10 -translate-x-1/2 rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums"
                style={{ left: nowX }}
              >
                {formatMinutes(ui.nowMin)}
              </span>
            ) : null}
          </div>
          <div
            ref={hoverLabelRef}
            className="pointer-events-none absolute top-1.5 z-20 hidden -translate-x-1/2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950"
          />
          <div
            ref={startLabelRef}
            data-testid="drag-start-label"
            className="pointer-events-none absolute top-1.5 z-30 hidden -translate-x-1/2 rounded-full bg-foreground px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-background shadow-sm tabular-nums"
          />
        </div>

        {/* Events strip */}
        {eventLaneCount > 0 ? (
          <EventsRow dateKey={dateKey} events={events} lanes={eventLanes} laneCount={eventLaneCount} openMin={openMin} closeMin={closeMin} width={width} locked={locked} />
        ) : null}

        {/* Tutor rows */}
        {rows.map((row) => (
          <TutorRowView
            key={row.tutor.id}
            row={row}
            dateKey={dateKey}
            hours={hours}
            openMin={openMin}
            closeMin={closeMin}
            width={width}
            hourMarks={hourMarks}
            locked={locked}
            isToday={isToday}
          />
        ))}
        {rows.length === 0 ? <div className="px-4 py-8 text-sm text-muted-foreground">{locked ? 'No sessions on this day.' : 'No tutors available.'}</div> : null}

        {/* Global hover line */}
        <div ref={hoverRef} className="pointer-events-none absolute top-0 bottom-0 z-10 hidden border-l-2 border-dashed border-blue-600/60" />
        {/* Dragged card's start edge */}
        <div ref={startRef} data-testid="drag-start-line" className="pointer-events-none absolute top-0 bottom-0 z-20 hidden border-l-2 border-dotted border-foreground/80" />
      </div>
    </section>
  )
}

function EventsRow({
  dateKey,
  events,
  lanes,
  laneCount,
  openMin,
  closeMin,
  width,
  locked,
}: {
  dateKey: DateKey
  events: WithId<EventDoc>[]
  lanes: Map<string, number>
  laneCount: number
  openMin: number
  closeMin: number
  width: number
  locked: boolean
}) {
  const ui = useScheduleUi()
  const x = (m: number) => ((Math.min(Math.max(m, openMin), closeMin) - openMin) / (closeMin - openMin)) * width
  const height = eventsRowHeight(laneCount)
  return (
    <div className="flex border-b" style={{ height }}>
      <div className="sticky left-0 z-10 shrink-0 border-r bg-card px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase" style={{ width: NAME_COL }}>
        Events
      </div>
      <div
        data-track
        className="relative bg-sky-50/60 dark:bg-sky-950/20"
        style={{ width }}
        onDoubleClick={(e) => {
          if (locked || e.target !== e.currentTarget) return
          ui.createEvent(dateKey, minuteAt(e.clientX, e.currentTarget.getBoundingClientRect(), openMin, closeMin, ui.snap))
        }}
        onDragOver={(e) => {
          if (!locked && e.dataTransfer.types.includes(EVENT_DRAG_TYPE)) e.preventDefault()
        }}
        onDrop={(e) => {
          const raw = e.dataTransfer.getData(EVENT_DRAG_TYPE)
          if (!raw || locked) return
          const data = JSON.parse(raw) as {
            id: string
            grabOffsetMin: number
            dateKey: string
          }
          if (data.dateKey !== dateKey) return
          const ev = events.find((x) => x.id === data.id)
          if (!ev) return
          const m = minuteAt(e.clientX, e.currentTarget.getBoundingClientRect(), openMin, closeMin, ui.snap) - data.grabOffsetMin
          ui.moveEvent(ev, Math.max(0, m))
        }}
      >
        {events.map((ev) => {
          const lane = lanes.get(ev.id) ?? 0
          const selected = ui.selection?.kind === 'event' && ui.selection.id === ev.id
          const w = Math.max(48, x(ev.endMin) - x(ev.startMin) - 3)
          return (
            <Tooltip key={ev.id}>
              <TooltipTrigger asChild>
                <ContextMenuFor
                  entries={menu(
                    {
                      label: locked ? 'View event' : 'Edit event…',
                      icon: LuPencil,
                      onSelect: () => ui.editEvent(ev, dateKey),
                    },
                    !locked && {
                      label: ev.recurrence ? 'Delete event series' : 'Delete event',
                      icon: LuTrash2,
                      destructive: true,
                      separatorBefore: true,
                      onSelect: () => ui.deleteEvent(ev),
                    },
                  )}
                >
                  <div
                    role="button"
                    tabIndex={-1}
                    draggable={!locked}
                    onDragStart={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      const off = Math.round((((e.clientX - rect.left) / rect.width) * (ev.endMin - ev.startMin)) / ui.snap) * ui.snap
                      e.dataTransfer.setData(
                        EVENT_DRAG_TYPE,
                        JSON.stringify({
                          id: ev.id,
                          grabOffsetMin: off,
                          dateKey,
                        }),
                      )
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      ui.select({ kind: 'event', id: ev.id })
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      ui.editEvent(ev, dateKey)
                    }}
                    className={cn(
                      'absolute flex cursor-pointer items-center gap-1.5 overflow-hidden rounded-lg bg-sky-100 px-2 text-sky-900 ring-1 ring-sky-200 hover:bg-sky-200/70 dark:bg-sky-900/60 dark:text-sky-100 dark:ring-sky-800',
                      selected && 'ring-2 ring-sky-600',
                    )}
                    style={{
                      left: x(ev.startMin),
                      width: w,
                      top: 5 + lane * (EVENT_H + EVENT_GAP),
                      height: EVENT_H,
                    }}
                  >
                    <span className="h-4 w-1 shrink-0 rounded-full bg-sky-500" />
                    <span className="truncate text-xs font-semibold">
                      {ev.title}
                      {ev.recurrence ? ' ↺' : ''}
                    </span>
                    {w > 170 ? <span className="shrink-0 text-[11px] text-sky-700 dark:text-sky-300">{formatTimeRange(ev.startMin, ev.endMin).replace(' - ', ' – ')}</span> : null}
                  </div>
                </ContextMenuFor>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                <div className="font-semibold">{ev.title}</div>
                <div className="opacity-90">{formatTimeRange(ev.startMin, ev.endMin).replace(' - ', ' – ')}</div>
                {ev.notes ? <div className="mt-0.5 whitespace-pre-wrap opacity-90">{ev.notes}</div> : null}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}

function TutorRowView({
  row,
  dateKey,
  hours,
  openMin,
  closeMin,
  width,
  hourMarks,
  locked,
  isToday,
}: {
  row: TutorRow<WithId<Session>>
  dateKey: DateKey
  hours: DayHours
  openMin: number
  closeMin: number
  width: number
  hourMarks: number[]
  locked: boolean
  isToday: boolean
}) {
  const ui = useScheduleUi()
  const [canceledOpen, setCanceledOpen] = useState<string | null>(null)
  // Where the track was right-clicked, for "New session at …" and "Paste here".
  const [menuSlot, setMenuSlot] = useState<{
    startMin: number
    endMin: number
  } | null>(null)
  const hasCanceled = row.canceled.length > 0 && ui.mode === 'admin'
  // Every row shows as many lanes as the branch allows students at once (more only when over the limit).
  const lanes = Math.max(ui.maxLanes, 1, ...row.active.map((s) => (row.lanes.get(s.id) ?? 0) + 1))
  const height = rowHeight(lanes, hasCanceled)
  const band = hasCanceled ? CANCELED_BAND : 0
  const x = (m: number) => ((m - openMin) / (closeMin - openMin)) * width
  const clampX = (m: number) => x(Math.min(Math.max(m, openMin), closeMin))
  const editable = ui.mode === 'admin' && !locked && !row.isGhost
  const inConflict = row.active.filter((s) => ui.conflictsOf(s).length > 0).length
  // Time the center isn't open (the whole day when closed): hatched.
  const closedSpans = hours.isOpen
    ? [
        [openMin, Math.min(hours.openMin, closeMin)],
        [Math.max(hours.closeMin, openMin), closeMin],
      ].filter(([a, b]) => b > a)
    : [[openMin, closeMin]]
  const selectedSlot = ui.selection?.kind === 'slot' && ui.selection.staffId === row.tutor.id && ui.selection.dateKey === dateKey ? ui.selection : null

  // Group canceled sessions by identical time range for the "N canceled" pills.
  const canceledGroups = new Map<string, WithId<Session>[]>()
  for (const s of row.canceled) canceledGroups.set(`${s.startMin}-${s.endMin}`, [...(canceledGroups.get(`${s.startMin}-${s.endMin}`) ?? []), s])

  function slotFromEvent(e: React.MouseEvent<HTMLDivElement>) {
    const m = minuteAt(e.clientX, e.currentTarget.getBoundingClientRect(), openMin, closeMin, ui.snap)
    return slotAt(row.segments, row.active, m, ui.defaultDuration, ui.maxLanes, ui.snap)
  }

  const first = row.tutor.name.split(' ')[0]
  const color = ui.tutorColor?.(row.tutor.id) ?? '#71717a'
  const initials = row.tutor.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
  const openClock = row.clocks.find((c) => c.open)
  return (
    <div className="flex border-b last:border-b-0" style={{ height }}>
      <ContextMenuFor
        disabled={ui.mode !== 'admin'}
        entries={menu(
          { kind: 'label', label: row.tutor.name },
          {
            label: 'Open employee profile',
            icon: LuUserRound,
            onSelect: () => ui.openEmployee(row.tutor.id),
          },
          {
            label: 'Open in new tab',
            onSelect: () => ui.openEmployee(row.tutor.id, true),
          },
          {
            label: `Show only ${first}`,
            onSelect: () => ui.showOnlyTutor(row.tutor.id),
            separatorBefore: true,
          },
          { label: 'Show all tutors', onSelect: () => ui.showOnlyTutor(null) },
          !locked && {
            label: 'Edit availability and hours for this day…',
            icon: LuCalendarCog,
            onSelect: () => ui.editDay(dateKey),
            separatorBefore: true,
          },
        )}
      >
        <div className="sticky left-0 z-10 flex shrink-0 flex-col justify-center gap-1.5 border-r bg-card px-3 py-2" style={{ width: NAME_COL }} data-testid="tutor-head">
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold" style={{ backgroundColor: `${color}1f`, color }}>
              {initials}
              {openClock && isToday ? <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card bg-emerald-500" aria-label="Clocked in" /> : null}
            </span>
            <span className="min-w-0 truncate text-sm font-semibold">{row.tutor.name}</span>
          </div>
          {row.clocks.slice(0, 2).map((c) => (
            <span
              key={c.id}
              className={cn(
                'inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-medium whitespace-nowrap',
                c.open
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {c.open ? (
                <>
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  In {formatMinutes(c.startMin)}
                </>
              ) : (
                `${formatMinutes(c.startMin)} – ${formatMinutes(c.endMin)}`
              )}
            </span>
          ))}
          {row.clocks.length > 2 ? (
            <span className="w-fit rounded-full bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground">+{row.clocks.length - 2} more</span>
          ) : null}
          {inConflict > 0 ? (
            <span className="flex items-start gap-1 text-[11px] leading-tight font-medium text-red-600" data-testid="row-conflicts">
              <LuTriangleAlert className="mt-px size-3 shrink-0" />
              {ui.mode === 'tutor'
                ? `${inConflict} session${inConflict > 1 ? 's' : ''} waiting for the admin`
                : row.isGhost
                  ? `Unavailable · ${inConflict} session${inConflict > 1 ? 's' : ''} to move`
                  : `${inConflict} in conflict`}
            </span>
          ) : null}
        </div>
      </ContextMenuFor>
      <ContextMenuFor
        disabled={!editable}
        entries={menu(
          menuSlot && {
            label: `New session at ${formatMinutes(menuSlot.startMin)}`,
            icon: LuPlus,
            onSelect: () => ui.createAt(row.tutor.id, dateKey, menuSlot.startMin, menuSlot.endMin),
          },
          !menuSlot && { kind: 'label', label: 'No free time here' },
          menuSlot &&
            ui.hasClipboard() && {
              label: `Paste at ${formatMinutes(menuSlot.startMin)}`,
              icon: LuClipboardPaste,
              shortcut: '⌘V',
              onSelect: () => ui.pasteAt(row.tutor.id, dateKey, menuSlot.startMin),
            },
          {
            label: 'Edit availability and hours for this day…',
            icon: LuCalendarCog,
            onSelect: () => ui.editDay(dateKey),
            separatorBefore: true,
          },
        )}
      >
        <div
          data-track
          className={cn('relative bg-muted/40', OFF_HATCH)}
          style={{ width }}
          onClick={(e) => {
            if (!editable || (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.avail)) return
            const r = slotFromEvent(e)
            if (!r.ok) {
              if (r.reason === 'full') toast.error(`This tutor already has ${ui.maxLanes} students at that time.`)
              return
            }
            ui.select({
              kind: 'slot',
              staffId: row.tutor.id,
              dateKey,
              startMin: r.startMin,
              endMin: r.endMin,
            })
          }}
          onDoubleClick={(e) => {
            if (!editable || (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.avail)) return
            const r = slotFromEvent(e)
            if (r.ok) ui.createAt(row.tutor.id, dateKey, r.startMin, r.endMin)
          }}
          onContextMenu={(e) => {
            const r = slotFromEvent(e)
            setMenuSlot(r.ok ? { startMin: r.startMin, endMin: r.endMin } : null)
          }}
          onDragOver={(e) => {
            if (ui.mode === 'admin' && !locked && !row.isGhost && e.dataTransfer.types.includes(SESSION_DRAG_TYPE)) e.preventDefault()
          }}
          onDrop={(e) => {
            const raw = e.dataTransfer.getData(SESSION_DRAG_TYPE)
            if (!raw || locked || row.isGhost) return
            e.preventDefault()
            const data = JSON.parse(raw) as {
              id: string
              grabOffsetMin: number
            }
            ui.moveSession(data.id, row.tutor.id, dateKey, dragStartMinute(e.clientX, e.currentTarget.getBoundingClientRect(), openMin, closeMin, ui.snap, data.grabOffsetMin))
          }}
        >
          {/* Availability bands */}
          {row.segments.map((r, i) => (
            <div
              key={i}
              data-avail="1"
              className="absolute inset-y-1 rounded-lg bg-white ring-1 ring-zinc-200 dark:bg-neutral-950 dark:ring-neutral-800"
              style={{
                left: clampX(r.startMin),
                width: Math.max(2, clampX(r.endMin) - clampX(r.startMin)),
              }}
            />
          ))}
          {/* Hour lines */}
          {hourMarks.map((m) => (
            <span key={`h-${m}`} className="pointer-events-none absolute inset-y-0 w-px bg-border/60" style={{ left: x(m) }} />
          ))}
          {closedSpans.map(([a, b]) => (
            <div
              key={`closed-${a}`}
              className={cn('pointer-events-none absolute inset-y-0 bg-muted/70', CLOSED_HATCH)}
              style={{
                left: clampX(a),
                width: Math.max(0, clampX(b) - clampX(a)),
              }}
              title="Closed"
            />
          ))}
          {/* Clocked time: green lines where the tutor clocked in and out (True Education's look) */}
          {row.clocks.map((c) => {
            const end = c.open && isToday ? Math.max(c.startMin + 1, ui.nowMin) : c.endMin
            return (
              <div
                key={c.id}
                className={cn(
                  'pointer-events-none absolute inset-y-0 z-[1] border-x-[3px] border-[#88D5A4]',
                  c.open
                    ? 'border-r-dashed bg-[repeating-linear-gradient(45deg,rgba(240,253,244,0.85),rgba(240,253,244,0.85)_6px,rgba(255,255,255,0.4)_6px,rgba(255,255,255,0.4)_12px)]'
                    : 'bg-[#F8FFF9]/70 dark:bg-emerald-950/20',
                )}
                style={{
                  left: clampX(c.startMin),
                  width: Math.max(2, clampX(end) - clampX(c.startMin)),
                }}
              />
            )
          })}
          {/* Now line */}
          {isToday && ui.nowMin >= openMin && ui.nowMin <= closeMin ? (
            <div className="pointer-events-none absolute inset-y-0 z-[3] w-0.5 bg-amber-500" style={{ left: x(ui.nowMin) - 1 }} />
          ) : null}
          {/* Selected free time: where a new session would go */}
          {selectedSlot ? (
            <div
              className="pointer-events-none absolute inset-y-2 z-[4] rounded-xl border-2 border-dashed border-zinc-400 bg-white/60 dark:border-zinc-500 dark:bg-neutral-900/60"
              style={{
                left: x(selectedSlot.startMin),
                width: Math.max(24, x(selectedSlot.endMin) - x(selectedSlot.startMin)),
              }}
            >
              <span className="absolute top-1 left-1.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground">
                New at {formatMinutes(selectedSlot.startMin)}
                {ui.hasClipboard() ? ' · ⌘V to paste' : ''}
              </span>
            </div>
          ) : null}
          {/* Canceled markers */}
          {hasCanceled
            ? [...canceledGroups.entries()].map(([key, list]) => (
                <Popover key={key} open={canceledOpen === key} onOpenChange={(o) => setCanceledOpen(o ? key : null)}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="absolute z-[7] inline-flex max-w-32 items-center gap-1 truncate rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-red-600 shadow-sm ring-1 ring-red-200 hover:bg-red-50 dark:bg-neutral-900 dark:ring-red-900"
                      style={{ left: clampX(list[0].startMin) + 3, top: 4 }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setCanceledOpen(key)
                      }}
                    >
                      <LuBan className="size-3" />
                      {list.length} canceled
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="max-h-[420px] w-80 space-y-2 overflow-y-auto p-3">
                    <div className="text-sm font-semibold">Canceled sessions ({row.canceled.length})</div>
                    {row.canceled.map((s) => (
                      <SessionCard
                        key={s.id}
                        session={s}
                        left={0}
                        width={0}
                        top={0}
                        readOnly={locked}
                        bounds={{ openMin, closeMin, width }}
                        segments={row.segments}
                        rowSessions={row.active}
                        inPopover
                      />
                    ))}
                  </PopoverContent>
                </Popover>
              ))
            : null}
          {/* Sessions */}
          {row.active.map((s) => {
            if (s.endMin <= openMin || s.startMin >= closeMin) return null
            const lane = row.lanes.get(s.id) ?? 0
            const left = clampX(s.startMin)
            return (
              <SessionCard
                key={s.id}
                session={s}
                left={left}
                width={Math.max(56, clampX(s.endMin) - left - 4)}
                top={ROW_PAD_TOP + band + lane * (CARD_H + LANE_GAP)}
                readOnly={locked}
                bounds={{ openMin, closeMin, width }}
                segments={row.segments}
                rowSessions={row.active}
              />
            )
          })}
        </div>
      </ContextMenuFor>
    </div>
  )
}
