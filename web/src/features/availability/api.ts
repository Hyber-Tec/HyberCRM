import { getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { dayStartInstant, effectiveRanges, normalizeRanges, rangesContain } from '@shared/availability'
import { isAhead, isCheckable } from '@shared/schedule/conflicts'
import type { DayHours } from '@shared/settings/defaults'
import { COL, availabilityDocId } from '@shared/paths'
import { type DateKey, formatDateKey, formatTimeRange, weekdayOf } from '@shared/time'
import type { AvailabilityRange, Session, WithId } from '@shared/types'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'

export interface DayWrite {
  dateKey: DateKey
  /** Empty = no availability (the doc is removed). */
  ranges: AvailabilityRange[]
}

/**
 * Booked sessions (pending or confirmed, still ahead) that a change would leave
 * outside the tutor's availability, though they were inside it before.
 */
export async function sessionsLeftUncovered(opts: {
  branchId: string
  staffId: string
  days: DayWrite[]
  /** What counts today for each day (saved ranges inside that date's hours). */
  currentRanges: (dateKey: DateKey) => AvailabilityRange[]
  hoursOf: (dateKey: DateKey) => DayHours
  today: DateKey
  nowMin: number
}): Promise<WithId<Session>[]> {
  const { branchId, staffId, days, currentRanges, hoursOf, today, nowMin } = opts
  const after = new Map(days.map((d) => [d.dateKey, effectiveRanges(normalizeRanges(d.ranges), hoursOf(d.dateKey))]))
  // Days that only gain time can't leave anything uncovered.
  const shrinking = days.filter((d) => currentRanges(d.dateKey).some((r) => !rangesContain(after.get(d.dateKey) ?? [], r.startMin, r.endMin))).map((d) => d.dateKey)
  const out: WithId<Session>[] = []
  for (let i = 0; i < shrinking.length; i += 30) {
    const chunk = shrinking.slice(i, i + 30)
    const snap = await getDocs(query(branchCol(branchId, COL.sessions), where('tutorId', '==', staffId), where('dateKey', 'in', chunk)))
    for (const d of snap.docs) {
      const s = { id: d.id, ...(d.data() as Session) }
      if (!isCheckable(s) || !isAhead(s, today, nowMin)) continue
      const coveredNow = rangesContain(currentRanges(s.dateKey), s.startMin, s.endMin)
      const coveredAfter = rangesContain(after.get(s.dateKey) ?? [], s.startMin, s.endMin)
      if (coveredNow && !coveredAfter) out.push(s)
    }
  }
  return out.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin)
}

/** "Ava Patel (Fri, Oct 2, 4:00 PM - 5:30 PM), Theo Roberts (…) and 2 more" */
export function describeSessions(list: readonly Pick<Session, 'studentName' | 'dateKey' | 'startMin' | 'endMin'>[], max = 3): string {
  const shown = list.slice(0, max).map((s) => `${s.studentName} (${formatDateKey(s.dateKey, 'weekdayMedium')}, ${formatTimeRange(s.startMin, s.endMin)})`)
  const more = list.length - shown.length
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}` : (shown[0] ?? '')
}

export function describeRanges(ranges: readonly AvailabilityRange[]): string {
  return ranges.length ? ranges.map((r) => formatTimeRange(r.startMin, r.endMin)).join(', ') : 'none'
}

/**
 * Writes availability for one employee on several days in one batch (with one
 * audit entry). Tutors' writes are checked against the lock window by the rules.
 */
export async function writeAvailability(opts: {
  branchId: string
  actor: Actor
  timezone: string
  staffId: string
  staffName: string
  via: 'tutor' | 'admin'
  days: DayWrite[]
  summary?: string
}) {
  const { branchId, actor, timezone, staffId, staffName, via, days } = opts
  if (days.length === 0) return
  for (let i = 0; i < days.length; i += 300) {
    const batch = writeBatch(db)
    for (const d of days.slice(i, i + 300)) {
      const ref = branchDocRef(branchId, COL.availability, availabilityDocId(staffId, d.dateKey))
      const ranges = normalizeRanges(d.ranges)
      if (ranges.length === 0) {
        batch.delete(ref)
      } else {
        batch.set(ref, {
          staffId,
          dateKey: d.dateKey,
          weekday: weekdayOf(d.dateKey),
          ranges,
          unavailable: false,
          hidden: false,
          dayStartAt: dayStartInstant(d.dateKey, timezone),
          updatedVia: via,
          updatedAt: serverTimestamp(),
          updatedBy: actor.email,
        })
      }
    }
    if (i === 0) {
      const first = days[0]
      addAudit(batch, branchId, actor, {
        action: 'availability.update',
        category: 'availability',
        entityType: 'availability',
        entityId: availabilityDocId(staffId, first.dateKey),
        summary:
          opts.summary ??
          (days.length === 1
            ? `Set ${staffName}’s availability on ${formatDateKey(first.dateKey, 'weekdayMedium')}: ${describeRanges(normalizeRanges(first.ranges))}`
            : `Updated ${staffName}’s availability on ${days.length} days`),
        tutorId: staffId,
        tutorName: staffName,
        dateKey: first.dateKey,
      })
    }
    await batch.commit()
  }
}
