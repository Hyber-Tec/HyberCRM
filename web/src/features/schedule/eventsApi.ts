import { deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { COL } from '@shared/paths'
import type { ScheduleEvent } from '@shared/schedule/events'
import { formatDateKey, formatTimeRange } from '@shared/time'
import type { WithId } from '@shared/types'
import { addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'
import type { ScheduleCtx } from './api'
import type { EventDoc } from './useScheduleData'

function context(e: ScheduleEvent) {
  return `${formatDateKey(e.dateKey, 'weekdayLong').split(',')[0]}, ${formatDateKey(e.dateKey, 'short')} (${formatTimeRange(e.startMin, e.endMin)})`
}

export async function saveEvent(ctx: ScheduleCtx, value: ScheduleEvent, existing: WithId<EventDoc> | null) {
  const batch = writeBatch(db)
  const ref = existing ? branchDocRef(ctx.branchId, COL.events, existing.id) : doc(branchCol(ctx.branchId, COL.events))
  batch.set(
    ref,
    {
      ...value,
      title: value.title.trim(),
      notes: value.notes.trim(),
      isRecurring: !!value.recurrence,
      googleSync: null,
      ...(existing ? {} : { createdAt: serverTimestamp(), createdBy: ctx.actor.email }),
      updatedAt: serverTimestamp(),
      updatedBy: ctx.actor.email,
    },
    { merge: true },
  )
  addAudit(batch, ctx.branchId, ctx.actor, {
    action: existing ? 'event.update' : 'event.create',
    category: 'event',
    entityType: 'event',
    entityId: ref.id,
    summary: `${existing ? 'Updated' : 'Created'} the event “${value.title.trim()}”`,
    context: context(value),
    dateKey: value.dateKey,
  })
  await batch.commit()
}

export async function moveEventTime(ctx: ScheduleCtx, e: WithId<EventDoc>, startMin: number) {
  const duration = e.endMin - e.startMin
  const s = Math.max(0, Math.min(1440 - duration, startMin))
  if (s === e.startMin) return
  const batch = writeBatch(db)
  batch.update(branchDocRef(ctx.branchId, COL.events, e.id), { startMin: s, endMin: s + duration, updatedAt: serverTimestamp(), updatedBy: ctx.actor.email })
  addAudit(batch, ctx.branchId, ctx.actor, {
    action: 'event.move',
    category: 'event',
    entityType: 'event',
    entityId: e.id,
    summary: `Moved the event “${e.title}”${e.recurrence ? ' (whole series)' : ''}`,
    context: context(e),
    dateKey: e.dateKey,
    changes: [{ field: 'time', label: 'Time', from: formatTimeRange(e.startMin, e.endMin), to: formatTimeRange(s, s + duration) }],
  })
  await batch.commit()
}

export async function deleteEvent(ctx: ScheduleCtx, e: WithId<EventDoc>) {
  await deleteDoc(branchDocRef(ctx.branchId, COL.events, e.id))
  const batch = writeBatch(db)
  addAudit(batch, ctx.branchId, ctx.actor, {
    action: 'event.delete',
    category: 'event',
    entityType: 'event',
    entityId: e.id,
    summary: `Deleted the event “${e.title}”${e.recurrence ? ' (whole series)' : ''}`,
    context: context(e),
    dateKey: e.dateKey,
  })
  await batch.commit()
}
