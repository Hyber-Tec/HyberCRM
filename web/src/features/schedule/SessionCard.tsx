import { useRef, useState } from 'react'
import {
  LuArrowRightLeft,
  LuBell,
  LuCalendarPlus,
  LuCircleAlert,
  LuCircleCheck,
  LuCopy,
  LuGraduationCap,
  LuNotebookPen,
  LuPencil,
  LuStickyNote,
  LuTrash2,
  LuTriangleAlert,
  LuUserRoundCheck,
} from 'react-icons/lu'
import { type Conflict, tutorConflictText } from '@shared/schedule/conflicts'
import { fitsCapacity } from '@shared/schedule/lanes'
import { SESSION_STATUSES, SESSION_STATUS_LABELS, SESSION_STATUS_STYLE } from '@shared/schedule/status'
import { formatMinutes, formatTimeRange } from '@shared/time'
import type { AvailabilityRange, Session, WithId } from '@shared/types'
import { ContextMenuFor, type MenuEntry, menu } from '@/components/app/ItemMenu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { SESSION_CARD_STYLE } from './cardStyle'
import { useScheduleUi } from './context'
import { CARD_H } from './geometry'
import { sessionDrag } from './dragState'

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
  const selected = ui.selection?.kind === 'session' && ui.selection.id === session.id
  const bell = ui.mode === 'admin' ? ui.bellFor(session) : []
  const ended = ui.today > session.dateKey || (ui.today === session.dateKey && session.endMin <= ui.nowMin)
  const logSubmitted = session.logStatus === 'submitted'
  // Only sessions that can be logged (by branch setting) show the missing-log warning.
  const loggable = (ui.loggableStatuses ?? ['pending', 'confirmed', 'present']).includes(session.status)
  const showLog = logSubmitted || (ended && loggable)
  // True Education's wording: the tutor is asked to write it; the admin sees it as missing.
  const logTip =
    ui.mode === 'tutor' ? (logSubmitted ? 'Session log submitted.' : 'Please write your session log.') : logSubmitted ? 'Session log submitted' : 'Session log missing'
  const canEdit = !readOnly && ui.mode === 'admin'
  const conflicts = ui.conflictsOf(session)
  const inConflict = conflicts.length > 0

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

  const soft = SESSION_CARD_STYLE[session.status] ?? SESSION_CARD_STYLE.pending
  // Short sessions: the name gets the room (no grade chip).
  const narrow = !inPopover && (cardWidth ?? 0) < 130
  const card = (
    <div
      ref={cardRef}
      role="button"
      tabIndex={-1}
      data-testid="session-card"
      draggable={canEdit && !inPopover}
      onDragStart={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        // Minutes from the card's start to where it was grabbed (unrounded; the drop snaps once).
        const grabOffsetMin = ratio * (session.endMin - session.startMin)
        e.dataTransfer.setData(SESSION_DRAG_TYPE, JSON.stringify({ id: session.id, grabOffsetMin, tutorId: session.tutorId, dateKey: session.dateKey }))
        e.dataTransfer.effectAllowed = 'move'
        sessionDrag.current = { id: session.id, grabOffsetMin, durationMin: session.endMin - session.startMin }
        ui.select({ kind: 'session', id: session.id })
      }}
      onDragEnd={() => {
        sessionDrag.current = null
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
        'group/card absolute flex flex-col justify-center overflow-hidden rounded-xl px-2.5 text-left leading-tight select-none',
        canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        inConflict ? 'ring-2 ring-inset' : 'ring-1 ring-inset',
        selected ? 'shadow-lg outline-2 outline-offset-2 outline-foreground' : 'shadow-sm',
        inPopover && 'relative w-full',
      )}
      style={
        {
          left: cardLeft,
          width: cardWidth,
          top: inPopover ? undefined : top,
          height: CARD_H,
          backgroundColor: soft.bg,
          color: soft.text,
          '--tw-ring-color': inConflict ? '#ef4444' : soft.border,
          zIndex: preview ? 8 : 5,
        } as React.CSSProperties
      }
    >
      {inConflict ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(220,38,38,0.12)_0,rgba(220,38,38,0.12)_5px,transparent_5px,transparent_11px)]"
        />
      ) : null}
      <div className={cn('relative flex min-w-0 items-center gap-1', bell.length || inConflict ? 'pr-9' : 'pr-1')}>
        <span className="truncate text-[13px] font-semibold text-zinc-900">{session.studentName}</span>
        {session.studentGrade && !narrow ? <span className="shrink-0 rounded bg-white/70 px-1 text-[10px] font-semibold text-zinc-600">{session.studentGrade}</span> : null}
        {session.note ? <LuStickyNote className="size-3 shrink-0 text-blue-700" aria-label="Has a note" /> : null}
      </div>
      <div className="relative truncate text-xs font-medium opacity-90">{session.subject || 'No subject'}</div>
      <div className="relative truncate pr-4 text-[11px] opacity-75 tabular-nums">{formatTimeRange(startMin, endMin).replace(' - ', ' – ')}</div>
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
        {bell.length > 0 ? (
          <button
            type="button"
            aria-label={`${bell.length} notification${bell.length > 1 ? 's' : ''}`}
            className="relative flex size-4 items-center justify-center text-zinc-800"
            onClick={(e) => {
              e.stopPropagation()
              ui.showBell(session, bell)
            }}
          >
            <LuBell className="size-3" />
            <span className="absolute -top-1 -right-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-red-600 px-0.5 text-[8px] font-bold text-white">{bell.length > 9 ? '9+' : bell.length}</span>
          </button>
        ) : null}
        {inConflict ? (
          <span data-testid="session-conflict" aria-label="In conflict" className="flex size-4 items-center justify-center rounded-full bg-red-600 text-white">
            <LuTriangleAlert className="size-2.5" />
          </span>
        ) : null}
      </div>
      {showLog ? (
        <button
          type="button"
          aria-label={ui.mode === 'admin' ? (logSubmitted ? 'Open session log' : 'Open missing session log') : logTip}
          title={logTip}
          className={cn('absolute right-1.5 bottom-1.5', logSubmitted ? 'text-blue-600' : 'text-red-600')}
          onClick={(e) => {
            e.stopPropagation()
            ui.openLog(session)
          }}
        >
          {logSubmitted ? <LuCircleCheck className="size-3.5" /> : <LuCircleAlert className="size-3.5" />}
        </button>
      ) : null}
      {canEdit && !inPopover ? (
        <>
          <div className="absolute inset-y-0 left-0 w-2 cursor-ew-resize" onPointerDown={(e) => startResize('start', e)}>
            <span className="absolute inset-y-2 left-0 w-1.5 rounded-full group-hover/card:bg-zinc-900/15" />
          </div>
          <div className="absolute inset-y-0 right-0 w-2 cursor-ew-resize" onPointerDown={(e) => startResize('end', e)}>
            <span className="absolute inset-y-2 right-0 w-1.5 rounded-full group-hover/card:bg-zinc-900/15" />
          </div>
        </>
      ) : null}
    </div>
  )

  const conflictText = !inConflict ? null : ui.mode === 'tutor' ? tutorConflictText(conflicts) : conflicts.map((c) => c.message).join(' ')
  // The tooltip wraps the right-click menu, which wraps the card.
  const withMenu = (
    <ContextMenuFor entries={sessionMenu(session, { ui, canEdit, conflicts, logSubmitted, loggable })} className="w-64">
      {card}
    </ContextMenuFor>
  )
  return session.note || conflictText ? (
    <Tooltip>
      <TooltipTrigger asChild>{withMenu}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-72 space-y-1">
        {conflictText ? (
          <p>
            <span className="font-semibold">{ui.mode === 'tutor' ? 'Not confirmed: ' : 'Conflict: '}</span>
            {conflictText}
            {ui.mode === 'admin' ? ' Move it, give it to another tutor or cancel it.' : ''}
          </p>
        ) : null}
        {session.note ? (
          <p>
            <span className="font-semibold">Note:</span> {session.note}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  ) : (
    withMenu
  )
}

/**
 * Right-click menu of a session card. Admins (editable days): resolve a conflict,
 * status, log, edit, reassign, copy, duplicate, student, Trash. Past days and
 * tutors: the log and the student.
 */
function sessionMenu(
  s: WithId<Session>,
  {
    ui,
    canEdit,
    conflicts,
    logSubmitted,
    loggable,
  }: { ui: ReturnType<typeof useScheduleUi>; canEdit: boolean; conflicts: Conflict[]; logSubmitted: boolean; loggable: boolean },
): MenuEntry[] {
  const admin = ui.mode === 'admin'
  const time = formatTimeRange(s.startMin, s.endMin)
  const firstName = s.tutorName.split(' ')[0] || 'the tutor'
  const options = canEdit ? ui.reassignOptions(s) : null
  const reassignMenu = (label: string, separatorBefore = false): MenuEntry | false =>
    canEdit &&
    (options === null
      ? { label: `${label}…`, icon: LuArrowRightLeft, onSelect: () => ui.editSession(s), separatorBefore }
      : {
          kind: 'sub',
          label,
          icon: LuArrowRightLeft,
          separatorBefore,
          entries: options.length
            ? options.map((o) => ({ label: `${o.name} · ${o.seats} seat${o.seats === 1 ? '' : 's'} left`, onSelect: () => ui.reassign(s, o.id) }))
            : [{ label: 'No other tutor is free then', onSelect: () => undefined, disabled: true }],
        })
  const inConflict = conflicts.length > 0
  const kinds = new Set(conflicts.map((c) => c.kind))
  const canMakeAvailable = kinds.has('tutor_unavailable') && !kinds.has('center_closed') && !kinds.has('outside_hours') && !kinds.has('tutor_inactive')

  return menu(
    { kind: 'label', label: `${s.studentName} · ${formatMinutes(s.startMin)}` },
    // Resolve first: a conflict decides whether the session happens at all.
    inConflict && { kind: 'label', label: conflicts[0].message, tone: 'danger', separatorBefore: true },
    inConflict && reassignMenu('Give to another tutor'),
    inConflict && canEdit && canMakeAvailable && { label: `Make ${firstName} available ${time}`, icon: LuUserRoundCheck, onSelect: () => ui.makeAvailable(s) },
    inConflict && canEdit && { label: 'Move to another time…', icon: LuCalendarPlus, onSelect: () => ui.editSession(s) },
    inConflict && canEdit && { label: 'Cancel session', onSelect: () => ui.setStatus(s, 'canceled') },
    canEdit && {
      kind: 'radio',
      value: s.status,
      separatorBefore: true,
      // A session with a submitted log stays Present: its log marked attendance and billed the hours.
      options: SESSION_STATUSES.map((st) => ({
        value: st,
        label: SESSION_STATUS_LABELS[st],
        swatch: SESSION_STATUS_STYLE[st],
        disabled: logSubmitted && st !== 'present' && st !== s.status,
      })),
      onChange: (v) => ui.setStatus(s, v as Session['status']),
    },
    canEdit && logSubmitted && { kind: 'label', label: 'Has a submitted log, so it stays Present.' },
    logSubmitted
      ? { label: 'View session log', icon: LuNotebookPen, onSelect: () => ui.viewLog(s), separatorBefore: true }
      : loggable && { label: admin ? 'Write session log' : 'Open session log', icon: LuNotebookPen, onSelect: () => ui.openLog(s), separatorBefore: true },
    logSubmitted && (admin || ui.mode === 'tutor') && { label: 'Edit session log', onSelect: () => ui.openLog(s) },
    admin && { label: canEdit ? 'Edit session…' : 'View session', icon: LuPencil, onSelect: () => ui.editSession(s), separatorBefore: !logSubmitted && !loggable },
    !inConflict && reassignMenu('Reassign to'),
    canEdit && { label: 'Copy', icon: LuCopy, shortcut: '⌘C', onSelect: () => ui.copySession(s), separatorBefore: true },
    canEdit && { label: 'Duplicate to next week…', onSelect: () => ui.duplicateSession(s) },
    { label: 'Open student profile', icon: LuGraduationCap, onSelect: () => ui.openStudent(s), separatorBefore: true },
    { label: 'Open student in new tab', onSelect: () => ui.openStudent(s, true) },
    canEdit && { label: 'Move to Trash', icon: LuTrash2, shortcut: '⌫', destructive: true, onSelect: () => ui.trashSession(s), separatorBefore: true },
  )
}
