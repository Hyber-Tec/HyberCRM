import { useRef, useState } from 'react'
import { BiSolidEdit } from 'react-icons/bi'
import type { TutorRow } from '@shared/schedule/dayModel'
import { layoutEventLanes } from '@shared/schedule/events'
import { slotAt } from '@shared/schedule/dayModel'
import type { DayHours } from '@shared/settings/defaults'
import { type DateKey, formatDateKey, formatMinutes, formatMinutesShort, formatTimeRange } from '@shared/time'
import type { Session, WithId } from '@shared/types'
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
  minuteAt,
  rowHeight,
  timelineWidth,
} from './geometry'
import { SESSION_DRAG_TYPE, SessionCard } from './SessionCard'
import type { EventDoc } from './useScheduleData'

export const EVENT_DRAG_TYPE = 'application/x-hyber-event'

interface Props {
  dateKey: DateKey
  hours: DayHours
  rows: TutorRow<WithId<Session>>[]
  events: WithId<EventDoc>[]
  /** Master template: show the weekday only. */
  headerLabel?: string
  sectionId?: string
}

export function DaySection({ dateKey, hours, rows, events, headerLabel, sectionId }: Props) {
  const ui = useScheduleUi()
  const locked = ui.isLocked(dateKey)
  const isToday = dateKey === ui.today && !ui.master
  const openMin = Math.floor(hours.openMin / 5) * 5
  const closeMin = Math.max(openMin + 60, Math.ceil(hours.closeMin / 5) * 5)
  const width = timelineWidth(openMin, closeMin)
  const x = (m: number) => ((m - openMin) / (closeMin - openMin)) * width
  const hoverRef = useRef<HTMLDivElement>(null)
  const hoverLabelRef = useRef<HTMLDivElement>(null)

  const hourMarks: number[] = []
  for (let m = Math.ceil(openMin / 60) * 60; m <= closeMin; m += 60) hourMarks.push(m)

  const showEvents = ui.mode === 'admin' && !ui.master
  const eventLanes = layoutEventLanes(events.map((e) => ({ id: e.id, startMin: e.startMin, endMin: e.endMin })))
  const usedEventLanes = events.length ? Math.max(...eventLanes.values()) + 1 : 0
  const eventLaneCount = showEvents ? (locked ? usedEventLanes : usedEventLanes + 1) : 0

  function onHover(e: React.PointerEvent<HTMLDivElement>) {
    const track = (e.target as HTMLElement).closest('[data-track]') as HTMLElement | null
    if (!track || !hoverRef.current || !hoverLabelRef.current) return
    const m = minuteAt(e.clientX, track.getBoundingClientRect(), openMin, closeMin, ui.snap)
    hoverRef.current.style.display = 'block'
    hoverRef.current.style.left = `${NAME_COL + x(m)}px`
    hoverLabelRef.current.style.display = 'block'
    hoverLabelRef.current.style.left = `${NAME_COL + x(m)}px`
    hoverLabelRef.current.textContent = formatMinutes(m)
  }
  function onLeave() {
    if (hoverRef.current) hoverRef.current.style.display = 'none'
    if (hoverLabelRef.current) hoverLabelRef.current.style.display = 'none'
  }

  return (
    <section id={sectionId} className="w-max min-w-full overflow-hidden rounded-xl border bg-card shadow-xs" data-date={dateKey}>
      <header className="flex items-center justify-between border-b bg-muted px-3 py-2">
        <h2 className="text-base font-bold tracking-tight">
          {headerLabel ?? `${formatDateKey(dateKey, 'weekdayLong').split(',')[0]}, ${formatDateKey(dateKey, 'short')}`}
          {isToday ? <span className="ml-2 rounded-full bg-foreground px-2 py-0.5 align-middle text-[10px] font-semibold text-background">TODAY</span> : null}
        </h2>
        {ui.mode === 'admin' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="Edit day" className="text-muted-foreground hover:text-foreground" onClick={() => ui.editDay(dateKey)}>
                <BiSolidEdit className="size-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Edit day</TooltipContent>
          </Tooltip>
        ) : null}
      </header>

      <div className="relative" onPointerMove={onHover} onPointerLeave={onLeave} style={{ width: NAME_COL + width }}>
        {/* Time axis */}
        <div className="relative flex border-b" style={{ height: AXIS_H }}>
          <div className="shrink-0 border-r bg-card" style={{ width: NAME_COL }} />
          <div className="relative" style={{ width }}>
            {hourMarks.map((m) => (
              <div key={m} className="absolute top-0 h-full border-l border-border" style={{ left: x(m) }}>
                <span className="ml-1.5 text-[13px] leading-[36px] font-bold whitespace-nowrap text-neutral-600 dark:text-neutral-300">{formatMinutesShort(m)}</span>
              </div>
            ))}
          </div>
          <div
            ref={hoverLabelRef}
            className="pointer-events-none absolute top-1.5 z-20 hidden -translate-x-1/2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950"
          />
        </div>

        {/* Events strip */}
        {eventLaneCount > 0 ? (
          <EventsRow dateKey={dateKey} events={events} lanes={eventLanes} laneCount={eventLaneCount} openMin={openMin} closeMin={closeMin} width={width} locked={locked} />
        ) : null}

        {/* Tutor rows */}
        {rows.map((row) => (
          <TutorRowView key={row.tutor.id} row={row} dateKey={dateKey} openMin={openMin} closeMin={closeMin} width={width} locked={locked} isToday={isToday} />
        ))}
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">{locked ? 'No sessions on this day.' : 'No tutors available.'}</div>
        ) : null}

        {/* Global hover line */}
        <div ref={hoverRef} className="pointer-events-none absolute top-0 bottom-0 z-10 hidden border-l-2 border-dashed border-blue-600/70" />
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
      <div className="shrink-0 border-r bg-card px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase" style={{ width: NAME_COL }}>
        Events
      </div>
      <div
        data-track
        className="relative bg-sky-50 dark:bg-sky-950/30"
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
          const data = JSON.parse(raw) as { id: string; grabOffsetMin: number; dateKey: string }
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
          return (
            <Tooltip key={ev.id}>
              <TooltipTrigger asChild>
                <div
                  role="button"
                  tabIndex={-1}
                  draggable={!locked}
                  onDragStart={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const off = Math.round((((e.clientX - rect.left) / rect.width) * (ev.endMin - ev.startMin)) / ui.snap) * ui.snap
                    e.dataTransfer.setData(EVENT_DRAG_TYPE, JSON.stringify({ id: ev.id, grabOffsetMin: off, dateKey }))
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
                    'absolute flex cursor-pointer flex-col justify-center overflow-hidden rounded-md bg-[#009EEB] px-2 text-white shadow-xs hover:brightness-110',
                    selected && 'ring-2 ring-[#1a5cb5] ring-offset-1',
                  )}
                  style={{ left: x(ev.startMin), width: Math.max(48, x(ev.endMin) - x(ev.startMin) - 3), top: 5 + lane * (EVENT_H + EVENT_GAP), height: EVENT_H }}
                >
                  <div className="truncate text-[13px] leading-tight font-bold">
                    {ev.title}
                    {ev.recurrence ? ' ↺' : ''}
                  </div>
                  <div className="truncate text-[11px] leading-tight opacity-95">{formatTimeRange(ev.startMin, ev.endMin).replace(' - ', ' – ')}</div>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                <div className="font-semibold">{ev.title}</div>
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
  openMin,
  closeMin,
  width,
  locked,
  isToday,
}: {
  row: TutorRow<WithId<Session>>
  dateKey: DateKey
  openMin: number
  closeMin: number
  width: number
  locked: boolean
  isToday: boolean
}) {
  const ui = useScheduleUi()
  const [canceledOpen, setCanceledOpen] = useState<string | null>(null)
  const hasCanceled = row.canceled.length > 0 && ui.mode === 'admin'
  const height = rowHeight(row.laneCount, hasCanceled)
  const band = hasCanceled ? CANCELED_BAND : 0
  const x = (m: number) => ((m - openMin) / (closeMin - openMin)) * width
  const clampX = (m: number) => x(Math.min(Math.max(m, openMin), closeMin))
  const editable = ui.mode === 'admin' && !locked && !row.isGhost
  const selectedSlot = ui.selection?.kind === 'slot' && ui.selection.staffId === row.tutor.id && ui.selection.dateKey === dateKey ? ui.selection : null

  // Group canceled sessions by identical time range for the "N Canceled" pills.
  const canceledGroups = new Map<string, WithId<Session>[]>()
  for (const s of row.canceled) canceledGroups.set(`${s.startMin}-${s.endMin}`, [...(canceledGroups.get(`${s.startMin}-${s.endMin}`) ?? []), s])

  function slotFromEvent(e: React.MouseEvent<HTMLDivElement>) {
    const m = minuteAt(e.clientX, e.currentTarget.getBoundingClientRect(), openMin, closeMin, ui.snap)
    return slotAt(row.segments, row.active, m, ui.defaultDuration, ui.maxLanes, ui.snap)
  }

  return (
    <div className="flex border-b last:border-b-0" style={{ height }}>
      <div className="flex shrink-0 flex-col justify-center gap-1 border-r bg-card px-3 py-2" style={{ width: NAME_COL }}>
        <div className="truncate text-[15px] font-bold">{row.tutor.name}</div>
        {row.clocks.slice(0, 2).map((c) => (
          <span
            key={c.id}
            className={cn(
              'w-fit rounded-full border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap',
              c.open ? 'border-green-200 bg-green-50 text-green-800' : 'border-[#7EECA7] bg-[#EFFFF5] text-[#20723B]',
            )}
          >
            {c.open ? `In ${formatMinutes(c.startMin)}` : `${formatMinutes(c.startMin)} - ${formatMinutes(c.endMin)}`}
          </span>
        ))}
        {row.clocks.length > 2 ? (
          <span className="w-fit rounded-full border bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">+{row.clocks.length - 2} more</span>
        ) : null}
        {row.isGhost && ui.mode === 'admin' ? <span className="text-xs font-bold text-red-600">Unavailable. Move sessions.</span> : null}
      </div>
      <div
        data-track
        className={cn('relative', row.isGhost ? 'bg-card' : 'bg-[#F6F6F6] dark:bg-neutral-900')}
        style={{ width }}
        onClick={(e) => {
          if (!editable || (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.avail)) return
          const r = slotFromEvent(e)
          if (!r.ok) {
            if (r.reason === 'full') toast.error(`This tutor already has ${ui.maxLanes} students at that time.`)
            return
          }
          ui.select({ kind: 'slot', staffId: row.tutor.id, dateKey, startMin: r.startMin, endMin: r.endMin })
        }}
        onDoubleClick={(e) => {
          if (!editable || (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.avail)) return
          const r = slotFromEvent(e)
          if (r.ok) ui.createAt(row.tutor.id, dateKey, r.startMin, r.endMin)
        }}
        onDragOver={(e) => {
          if (ui.mode === 'admin' && !locked && !row.isGhost && e.dataTransfer.types.includes(SESSION_DRAG_TYPE)) e.preventDefault()
        }}
        onDrop={(e) => {
          const raw = e.dataTransfer.getData(SESSION_DRAG_TYPE)
          if (!raw || locked || row.isGhost) return
          e.preventDefault()
          const data = JSON.parse(raw) as { id: string; grabOffsetMin: number }
          const m = minuteAt(e.clientX, e.currentTarget.getBoundingClientRect(), openMin, closeMin, ui.snap) - data.grabOffsetMin
          ui.moveSession(data.id, row.tutor.id, dateKey, Math.max(openMin, m))
        }}
      >
        {/* Availability bands */}
        {row.segments.map((r, i) => (
          <div
            key={i}
            data-avail="1"
            className="absolute inset-y-0 border-x border-[#cfd4db] bg-white dark:border-neutral-700 dark:bg-neutral-950"
            style={{ left: clampX(r.startMin), width: Math.max(2, clampX(r.endMin) - clampX(r.startMin)) }}
          />
        ))}
        {/* Clocked time */}
        {row.clocks.map((c) => {
          const end = c.open && isToday ? Math.max(c.startMin + 1, ui.nowMin) : c.endMin
          return (
            <div
              key={c.id}
              className={cn('pointer-events-none absolute inset-y-0 z-[1] border-x-[3px] border-[#88D5A4]', c.open ? 'border-r-dashed bg-[repeating-linear-gradient(45deg,#F0FDF4,#F0FDF4_6px,#fff_6px,#fff_12px)]' : 'bg-[#F8FFF9]')}
              style={{ left: clampX(c.startMin), width: Math.max(2, clampX(end) - clampX(c.startMin)) }}
            />
          )
        })}
        {/* Now line */}
        {isToday && ui.nowMin >= openMin && ui.nowMin <= closeMin ? (
          <div className="pointer-events-none absolute inset-y-0 z-[2] w-0.5 bg-amber-500" style={{ left: x(ui.nowMin) }} />
        ) : null}
        {/* Selected slot */}
        {selectedSlot ? (
          <div className="pointer-events-none absolute inset-y-0 z-[3] w-0.5 bg-neutral-900/50" style={{ left: x(selectedSlot.startMin) }} />
        ) : null}
        {/* Canceled markers */}
        {hasCanceled
          ? [...canceledGroups.entries()].map(([key, list]) => (
              <Popover key={key} open={canceledOpen === key} onOpenChange={(o) => setCanceledOpen(o ? key : null)}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="absolute z-[7] max-w-32 truncate rounded-full border border-[#d4a2a2] bg-[#efe3e3] px-2 py-0.5 text-[10px] font-bold text-[#7f1d1d]"
                    style={{ left: clampX(list[0].startMin) + 3, top: 4 }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setCanceledOpen(key)
                    }}
                  >
                    {list.length} Canceled
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="max-h-[420px] w-80 space-y-2 overflow-y-auto p-3">
                  <div className="text-sm font-semibold">Canceled Sessions ({row.canceled.length})</div>
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
    </div>
  )
}
