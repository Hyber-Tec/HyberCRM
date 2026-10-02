import type { DayHours, SessionStatus } from '../settings/defaults'
import type { DateKey } from '../time'
import type { AvailabilityRange } from '../types'
import { type LaneItem, fitsCapacity, layoutLanes, visibleLaneCount } from './lanes'

export interface ModelSession extends LaneItem {
  tutorId: string
  status: SessionStatus
}

export interface ClockInterval {
  id: string
  startMin: number
  endMin: number
  open: boolean
}

export interface TutorRef {
  id: string
  name: string
}

export interface DayAvailability {
  ranges: AvailabilityRange[]
  unavailable: boolean
  hidden: boolean
}

export interface TutorRow<S extends ModelSession = ModelSession> {
  tutor: TutorRef
  /** Availability ranges (empty = not available). */
  segments: AvailabilityRange[]
  /** Has live (not canceled) sessions but no availability on the timeline: shown as unavailable, sessions to move. */
  isGhost: boolean
  active: S[]
  canceled: S[]
  lanes: Map<string, number>
  laneCount: number
  clocks: ClockInterval[]
}

export interface DayModelInput<S extends ModelSession> {
  dateKey: DateKey
  today: DateKey
  hours: DayHours
  tutors: readonly TutorRef[]
  availability: (staffId: string) => DayAvailability | null
  sessions: readonly S[]
  clocks?: (staffId: string) => ClockInterval[]
  maxLanes: number
  /** Admin views add an empty lane for creating; the tutor view doesn't. */
  addEmptyLane: boolean
  /** Unknown tutors (e.g. a finished employee) still get a row when they have sessions. */
  nameFor?: (staffId: string) => string
}

function overlaps(r: AvailabilityRange, open: number, close: number) {
  return r.endMin > open && r.startMin < close
}

/**
 * Which tutors get a row on a day, and what each row holds (True Education's
 * rules): today and future days show tutors with availability on the timeline,
 * sessions or clock activity (unless hidden with nothing on it); past days show
 * tutors with real sessions or clock activity.
 */
export function buildDayRows<S extends ModelSession>(input: DayModelInput<S>): TutorRow<S>[] {
  const { hours, maxLanes } = input
  const isPast = input.dateKey < input.today
  const byTutor = new Map<string, S[]>()
  for (const s of input.sessions) byTutor.set(s.tutorId, [...(byTutor.get(s.tutorId) ?? []), s])

  const tutors: TutorRef[] = [...input.tutors]
  for (const id of byTutor.keys()) {
    if (!tutors.some((t) => t.id === id)) tutors.push({ id, name: input.nameFor?.(id) ?? 'Former tutor' })
  }

  const rows: TutorRow<S>[] = []
  for (const tutor of tutors) {
    const avail = input.availability(tutor.id)
    const segments = avail && !avail.unavailable ? avail.ranges : []
    const sessions = byTutor.get(tutor.id) ?? []
    const active = sessions.filter((s) => s.status !== 'canceled')
    const canceled = sessions.filter((s) => s.status === 'canceled')
    const clocks = input.clocks?.(tutor.id) ?? []
    const hasTimelineAvailability = segments.some((r) => overlaps(r, hours.openMin, hours.closeMin))
    const hasSessions = sessions.length > 0
    const hasClock = clocks.length > 0

    let show: boolean
    if (isPast) show = active.length > 0 || hasClock
    else if (avail?.hidden && !hasSessions && !hasClock) show = false
    else show = hasTimelineAvailability || hasSessions || hasClock
    if (!show) continue

    const lanes = layoutLanes(active, maxLanes)
    rows.push({
      tutor,
      segments,
      isGhost: active.length > 0 && !hasTimelineAvailability,
      active,
      canceled: isPast ? [] : canceled,
      lanes,
      laneCount: visibleLaneCount(lanes, maxLanes, input.addEmptyLane && !isPast),
      clocks,
    })
  }
  return rows
}

export type SlotResult = { ok: true; startMin: number; endMin: number } | { ok: false; reason: 'unavailable' | 'full' }

/**
 * A new session at `minute` in a tutor row: starts at the clicked minute inside the
 * availability segment, lasts `durationMin` (capped at the segment end), shrinking
 * by `snap` minutes until a seat is free.
 */
export function slotAt(
  segments: readonly AvailabilityRange[],
  sessions: readonly LaneItem[],
  minute: number,
  durationMin: number,
  maxLanes: number,
  snap = 5,
  excludeId?: string,
): SlotResult {
  const seg = segments.find((r) => minute >= r.startMin && minute < r.endMin)
  if (!seg) return { ok: false, reason: 'unavailable' }
  const startMin = Math.min(Math.max(minute, seg.startMin), seg.endMin - snap)
  let endMin = Math.min(startMin + durationMin, seg.endMin)
  while (!fitsCapacity(sessions, startMin, endMin, maxLanes, excludeId)) {
    endMin -= snap
    if (endMin <= startMin) return { ok: false, reason: 'full' }
  }
  return { ok: true, startMin, endMin }
}

/** Tutors in the branch's display order, then alphabetically. */
export function orderTutors<T extends { id: string; name: string }>(tutors: readonly T[], order: readonly string[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]))
  return [...tutors].sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.POSITIVE_INFINITY
    const rb = rank.get(b.id) ?? Number.POSITIVE_INFINITY
    return ra - rb || a.name.localeCompare(b.name)
  })
}
