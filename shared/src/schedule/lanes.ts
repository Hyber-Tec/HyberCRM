/**
 * Lane layout and capacity for one tutor's sessions on one day (True Education's
 * DaySection algorithm). A tutor teaches at most N students at once; overlapping
 * sessions stack into lanes.
 */

export interface LaneItem {
  id: string
  startMin: number
  endMin: number
  /** Manual stacking order among overlapping sessions (lower = higher up). */
  visualOrder?: number | null
}

/** Greedy first-fit lanes. Overflowing items share the lane that frees up first (visual overlap). */
export function layoutLanes(items: readonly LaneItem[], maxLanes: number): Map<string, number> {
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || (a.visualOrder ?? 0) - (b.visualOrder ?? 0) || a.endMin - b.endMin,
  )
  const laneEnds: number[] = Array.from({ length: Math.max(1, maxLanes) }, () => Number.NEGATIVE_INFINITY)
  const out = new Map<string, number>()
  for (const s of sorted) {
    const start = s.startMin
    const end = Math.max(start + 5, s.endMin)
    let lane = laneEnds.findIndex((e) => e <= start)
    if (lane === -1) lane = laneEnds.indexOf(Math.min(...laneEnds))
    laneEnds[lane] = Math.max(laneEnds[lane], end)
    out.set(s.id, lane)
  }
  return out
}

/** Lanes to draw for a row: occupied lanes + 1 empty lane for creating, capped at max. */
export function visibleLaneCount(lanes: Map<string, number>, maxLanes: number, addEmptyLane: boolean): number {
  const used = lanes.size ? Math.max(...lanes.values()) + 1 : 0
  return Math.min(maxLanes, Math.max(1, used + (addEmptyLane ? 1 : 0)))
}

/**
 * Peak number of sessions running at the same time inside [startMin, endMin).
 * Back-to-back sessions don't overlap (end sorts before start).
 */
export function peakConcurrency(items: readonly LaneItem[], startMin: number, endMin: number, excludeId?: string): number {
  const points: [number, number][] = []
  for (const s of items) {
    if (s.id === excludeId) continue
    const a = Math.max(s.startMin, startMin)
    const b = Math.min(s.endMin, endMin)
    if (b <= a) continue
    points.push([a, 1], [b, -1])
  }
  points.sort((x, y) => x[0] - y[0] || x[1] - y[1])
  let cur = 0
  let peak = 0
  for (const [, d] of points) {
    cur += d
    peak = Math.max(peak, cur)
  }
  return peak
}

/** Seats left for a new or moved session in [startMin, endMin). */
export function seatsLeft(items: readonly LaneItem[], startMin: number, endMin: number, maxLanes: number, excludeId?: string): number {
  return Math.max(0, maxLanes - peakConcurrency(items, startMin, endMin, excludeId))
}

/** True when the candidate fits without exceeding the per-tutor limit. */
export function fitsCapacity(items: readonly LaneItem[], startMin: number, endMin: number, maxLanes: number, excludeId?: string): boolean {
  return peakConcurrency(items, startMin, endMin, excludeId) < maxLanes
}
