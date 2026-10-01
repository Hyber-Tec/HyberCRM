/** Timeline geometry (True Education's proportions). */
export const NAME_COL = 170
export const PX_PER_MIN = 2.15
export const MIN_TIMELINE = 720
export const CARD_H = 64
export const LANE_GAP = 8
export const ROW_PAD_TOP = 12
export const ROW_PAD_BOTTOM = 12
export const CANCELED_BAND = 22
export const ROW_MIN_H = 84
export const EVENT_H = 40
export const EVENT_GAP = 3
export const AXIS_H = 36

export function timelineWidth(openMin: number, closeMin: number): number {
  return Math.max(MIN_TIMELINE, (closeMin - openMin) * PX_PER_MIN)
}

export function xOf(minute: number, openMin: number, closeMin: number, width: number): number {
  return ((minute - openMin) / (closeMin - openMin)) * width
}

/** Pointer position → minute, snapped and clamped. Uses ratios, so CSS zoom doesn't matter. */
export function minuteAt(clientX: number, rect: DOMRect, openMin: number, closeMin: number, snap: number): number {
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  const raw = openMin + ratio * (closeMin - openMin)
  return Math.min(closeMin, Math.max(openMin, Math.round(raw / snap) * snap))
}

export function rowHeight(laneCount: number, hasCanceled: boolean): number {
  return Math.max(
    ROW_MIN_H,
    (hasCanceled ? CANCELED_BAND : 0) + ROW_PAD_TOP + ROW_PAD_BOTTOM + laneCount * CARD_H + (laneCount - 1) * LANE_GAP,
  )
}

export function eventsRowHeight(lanes: number): number {
  return 10 + EVENT_H * lanes + EVENT_GAP * Math.max(0, lanes - 1)
}
