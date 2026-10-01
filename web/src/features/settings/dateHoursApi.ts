import { type WriteBatch, serverTimestamp, writeBatch } from 'firebase/firestore'
import { COL } from '@shared/paths'
import { type DateKey, formatDateKey, formatTimeRange } from '@shared/time'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchDocRef } from '@/lib/firestore'

/** What a date's hours become: open with times, closed, or back to the weekly default. */
export type DateHoursValue = { isOpen: true; openMin: number; closeMin: number } | { isOpen: false } | 'default'

export function describeHoursValue(v: DateHoursValue): string {
  if (v === 'default') return 'the weekly default'
  return v.isOpen ? formatTimeRange(v.openMin, v.closeMin) : 'closed'
}

/**
 * Sets the opening hours of many dates at once (Settings → Schedule). Writes the
 * per-date records the schedule and availability read (`dayConfigs`), in
 * batches, with one audit entry. Closing dates moves their sessions to Trash,
 * as closing a day on the schedule does.
 */
export async function setDateHours(opts: {
  branchId: string
  actor: Actor
  dates: DateKey[]
  value: DateHoursValue
  /** Default hours to keep when a date is closed (shown if it's reopened later). */
  closedTimes: { openMin: number; closeMin: number }
  summaryRange: string
  /** Sessions on the dates being closed. */
  trashSessionIds?: string[]
}) {
  const { branchId, actor, dates, value } = opts
  const trash = value !== 'default' && !value.isOpen ? (opts.trashSessionIds ?? []) : []
  const writes: ((b: WriteBatch) => void)[] = [
    ...dates.map((d) => (b: WriteBatch) => {
      const ref = branchDocRef(branchId, COL.dayConfigs, d)
      if (value === 'default') b.delete(ref)
      else
        b.set(ref, {
          dateKey: d,
          isOpen: value.isOpen,
          openMin: value.isOpen ? value.openMin : opts.closedTimes.openMin,
          closeMin: value.isOpen ? value.closeMin : opts.closedTimes.closeMin,
          updatedAt: serverTimestamp(),
          updatedBy: actor.email,
        })
    }),
    ...trash.map((id) => (b: WriteBatch) => {
      b.update(branchDocRef(branchId, COL.sessions, id), {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: actor.name,
        updatedAt: serverTimestamp(),
        updatedBy: actor.email,
      })
    }),
  ]
  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(db)
    for (const w of writes.slice(i, i + 400)) w(batch)
    if (i === 0) {
      addAudit(batch, branchId, actor, {
        action: 'dayConfig.update',
        category: 'schedule',
        entityType: 'dayConfig',
        entityId: dates[0],
        dateKey: dates[0],
        summary:
          dates.length === 1
            ? `Set ${formatDateKey(dates[0], 'weekdayMedium')} to ${describeHoursValue(value)}`
            : `Set ${dates.length} dates to ${describeHoursValue(value)} (${opts.summaryRange})`,
      })
      if (trash.length) {
        addAudit(batch, branchId, actor, {
          action: 'session.delete_day',
          category: 'schedule',
          entityType: 'session',
          entityId: dates[0],
          dateKey: dates[0],
          summary: `Moved ${trash.length} session${trash.length > 1 ? 's' : ''} to Trash when closing ${dates.length === 1 ? formatDateKey(dates[0], 'weekdayMedium') : opts.summaryRange}`,
        })
      }
    }
    await batch.commit()
  }
}
