import { useRef, useState } from 'react'
import { FaCheckCircle } from 'react-icons/fa'
import { FaTriangleExclamation } from 'react-icons/fa6'
import { IoMdNotificationsOutline } from 'react-icons/io'
import { studentLabel } from '@shared/people'
import { fitsCapacity } from '@shared/schedule/lanes'
import { SESSION_STATUSES, SESSION_STATUS_LABELS, SESSION_STATUS_STYLE } from '@shared/schedule/status'
import { formatTimeRange } from '@shared/time'
import type { AvailabilityRange, Session, WithId } from '@shared/types'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useScheduleUi } from './context'
import { CARD_H } from './geometry'

export const SESSION_DRAG_TYPE = 'application/x-hyber-session'

interface Props {
  session: WithId<Session>
  left: number
  width: number
  top: number
  readOnly: boolean
  /** Geometry of the row's timeline, for resizing. */
  bounds: { openMin: number; closeMin: number; width: number }
  segments: readonly AvailabilityRange[]
  rowSessions: readonly WithId<Session>[]
  inPopover?: boolean
}

export function SessionCard({ session, left, width, top, readOnly, bounds, segments, rowSessions, inPopover }: Props) {
  const ui = useScheduleUi()
  const [preview, setPreview] = useState<{ startMin: number; endMin: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const st = SESSION_STATUS_STYLE[session.status] ?? SESSION_STATUS_STYLE.pending
  const selected = ui.selection?.kind === 'session' && ui.selection.id === session.id
  const bell = ui.mode === 'admin' ? ui.bellFor(session) : []
  const ended = ui.today > session.dateKey || (ui.today === session.dateKey && session.endMin <= ui.nowMin)
  const logSubmitted = session.logStatus === 'submitted'
  // Only sessions that can be logged (by branch setting) show the missing-log warning.
  const loggable = (ui.loggableStatuses ?? ['pending', 'confirmed', 'present']).includes(session.status)
  const showLog = logSubmitted || (ended && loggable)
  const canEdit = !readOnly && ui.mode === 'admin'

  const startMin = preview?.startMin ?? session.startMin
  const endMin = preview?.endMin ?? session.endMin
  const pxPerMin = bounds.width / (bounds.closeMin - bounds.openMin)
  const cardLeft = inPopover ? 0 : preview ? (startMin - bounds.openMin) * pxPerMin : left
  const cardWidth = inPopover ? undefined : preview ? Math.max(56, (endMin - startMin) * pxPerMin - 4) : width

  function startResize(edge: 'start' | 'end', e: React.PointerEvent) {
    if (!canEdit) return
    e.preventDefault()
    e.stopPropagation()
    const track = cardRef.current?.parentElement
    if (!track) return
    const rect = track.getBoundingClientRect()
    let current = { startMin: session.startMin, endMin: session.endMin }
    const onMove = (ev: PointerEvent) => {
      const ratio = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width))
      const raw = bounds.openMin + ratio * (bounds.closeMin - bounds.openMin)
      const m = Math.round(raw / ui.snap) * ui.snap
      const cand =
        edge === 'start'
          ? { startMin: Math.min(Math.max(bounds.openMin, m), session.endMin - ui.snap), endMin: session.endMin }
          : { startMin: session.startMin, endMin: Math.max(Math.min(bounds.closeMin, m), session.startMin + ui.snap) }
      const inside = segments.some((r) => r.startMin <= cand.startMin && r.endMin >= cand.endMin)
      const fits = fitsCapacity(
        rowSessions.filter((s) => s.status !== 'canceled'),
        cand.startMin,
        cand.endMin,
        ui.maxLanes,
        session.id,
      )
      if (inside && fits) {
        current = cand
        setPreview(cand)
      }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setPreview(null)
      if (current.startMin !== session.startMin || current.endMin !== session.endMin) {
        ui.resizeSession(session, current.startMin, current.endMin)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const card = (
    <div
      ref={cardRef}
      role="button"
      tabIndex={-1}
      draggable={canEdit && !inPopover}
      onDragStart={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const ratio = (e.clientX - rect.left) / rect.width
        const grabOffsetMin = Math.round((ratio * (session.endMin - session.startMin)) / ui.snap) * ui.snap
        e.dataTransfer.setData(SESSION_DRAG_TYPE, JSON.stringify({ id: session.id, grabOffsetMin, tutorId: session.tutorId, dateKey: session.dateKey }))
        e.dataTransfer.effectAllowed = 'move'
        ui.select({ kind: 'session', id: session.id })
      }}
      onDragOver={(e) => {
        if (canEdit && e.dataTransfer.types.includes(SESSION_DRAG_TYPE)) e.preventDefault()
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData(SESSION_DRAG_TYPE)
        if (!raw || !canEdit) return
        const data = JSON.parse(raw) as { id: string; tutorId: string; dateKey: string }
        if (data.id === session.id) return
        if (data.tutorId === session.tutorId && data.dateKey === session.dateKey) {
          e.preventDefault()
          e.stopPropagation()
          ui.reorderSession(data.id, session.id)
        }
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (ui.mode === 'tutor') ui.openLog(session)
        else ui.select({ kind: 'session', id: session.id })
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (ui.mode === 'admin') ui.editSession(session)
      }}
      className={cn(
        'group/card absolute flex flex-col justify-center overflow-hidden rounded-md border px-2 text-left leading-tight shadow-xs select-none',
        canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        selected && 'outline-2 outline-offset-2 outline-foreground outline-dashed',
        session.note && 'border-l-[5px] border-l-[#1650A5]',
        inPopover && 'relative w-full',
      )}
      style={{
        left: cardLeft,
        width: cardWidth,
        top: inPopover ? undefined : top,
        height: CARD_H,
        backgroundColor: selected ? undefined : st.bg,
        borderColor: session.note ? undefined : st.border,
        ...(selected ? { backgroundColor: '#F0F0F0' } : {}),
        zIndex: preview ? 8 : 5,
      }}
    >
      <div className="truncate pr-4 text-[13px] font-extrabold text-black">{studentLabel(session.studentName, session.studentGrade)}</div>
      <div className="truncate text-xs font-semibold text-neutral-800">{session.subject || 'No subject'}</div>
      <div className="truncate pr-4 text-[11px] font-semibold text-neutral-700">{formatTimeRange(startMin, endMin)}</div>
      {bell.length > 0 ? (
        <button
          type="button"
          aria-label={`${bell.length} notification${bell.length > 1 ? 's' : ''}`}
          className="absolute top-1 right-1 text-neutral-900"
          onClick={(e) => {
            e.stopPropagation()
            ui.showBell(session, bell)
          }}
        >
          <IoMdNotificationsOutline className="size-3.5" />
          <span className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-600 px-0.5 text-[9px] font-bold text-white">
            {bell.length > 9 ? '9+' : bell.length}
          </span>
        </button>
      ) : null}
      {showLog ? (
        <button
          type="button"
          aria-label={logSubmitted ? 'Session log submitted' : 'Session ended without a log'}
          title={logSubmitted ? 'Session log submitted' : 'Session ended — no log yet'}
          className="absolute right-1 bottom-1"
          onClick={(e) => {
            e.stopPropagation()
            ui.openLog(session)
          }}
        >
          {logSubmitted ? <FaCheckCircle className="size-3 text-blue-700" /> : <FaTriangleExclamation className="size-3 text-red-700" />}
        </button>
      ) : null}
      {canEdit && !inPopover ? (
        <>
          <div className="absolute inset-y-0 left-0 w-2 cursor-ew-resize" onPointerDown={(e) => startResize('start', e)} />
          <div className="absolute inset-y-0 right-0 w-2 cursor-ew-resize" onPointerDown={(e) => startResize('end', e)} />
        </>
      ) : null}
    </div>
  )

  const withNote = session.note ? (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64">
        <span className="font-semibold">Note:</span> {session.note}
      </TooltipContent>
    </Tooltip>
  ) : (
    card
  )

  if (!canEdit) return withNote
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{withNote}</ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuLabel className="text-xs text-muted-foreground">Status</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuRadioGroup value={session.status} onValueChange={(v) => ui.setStatus(session, v as Session['status'])}>
          {SESSION_STATUSES.map((s) => (
            <ContextMenuRadioItem key={s} value={s}>
              <span className="size-2.5 rounded-full border" style={{ backgroundColor: SESSION_STATUS_STYLE[s].bg, borderColor: SESSION_STATUS_STYLE[s].border }} />
              {SESSION_STATUS_LABELS[s]}
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}
