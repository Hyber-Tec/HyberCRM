import { serverTimestamp, writeBatch } from 'firebase/firestore'
import { dayStartInstant, normalizeRanges } from '@shared/availability'
import { COL, availabilityDocId } from '@shared/paths'
import { type DateKey, formatDateKey, formatTimeRange, weekdayOf } from '@shared/time'
import type { AvailabilityRange } from '@shared/types'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchDocRef } from '@/lib/firestore'

export interface DayWrite {
  dateKey: DateKey
  /** Empty = no availability (the doc is removed). */
  ranges: AvailabilityRange[]
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
