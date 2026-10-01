import type { Timestamp } from 'firebase-admin/firestore'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { db } from './app'
import { sendNotifications } from './notify'
import { COL, ROOT } from '@shared/paths'
import { type SessionNotice, type SessionSnapshot, sessionChangeNotices } from '@shared/schedule/notify'
import { resolveSettings } from '@shared/settings/resolve'
import type { BranchSettings } from '@shared/settings/defaults'
import { todayKey } from '@shared/time'
import type { Branch, NotificationPrefs } from '@shared/types'

export function snapshotOf(d: FirebaseFirestore.DocumentData): SessionSnapshot {
  return {
    tutorId: (d.tutorId as string | null) ?? null,
    studentName: String(d.studentName ?? ''),
    subject: String(d.subject ?? ''),
    status: String(d.status ?? ''),
    dateKey: String(d.dateKey ?? ''),
    startMin: Number(d.startMin ?? 0),
    endMin: Number(d.endMin ?? 0),
    startMs: (d.startAt as Timestamp | undefined)?.toMillis() ?? 0,
    isDeleted: d.isDeleted === true,
  }
}

export async function branchContext(branchId: string): Promise<{ settings: BranchSettings; timezone: string; active: boolean }> {
  const snap = await db.doc(`${ROOT.branches}/${branchId}`).get()
  const b = snap.data() as Branch | undefined
  return { settings: resolveSettings(b?.settings), timezone: b?.timezone ?? 'America/New_York', active: b?.status === 'active' }
}

/** Resolves each notice's tutor to their member email, honors their switches and writes the inbox items. */
export async function deliverSessionNotices(branchId: string, sessionId: string, notices: SessionNotice[], dedupeKey: string) {
  if (!notices.length) return
  const items = []
  for (const n of notices) {
    const [staff, members] = await Promise.all([
      db.doc(`${ROOT.branches}/${branchId}/${COL.staff}/${n.staffId}`).get(),
      db.collection(`${ROOT.branches}/${branchId}/${COL.members}`).where('staffId', '==', n.staffId).limit(1).get(),
    ])
    const prefs = (staff.data()?.notificationPrefs ?? {}) as Partial<NotificationPrefs>
    if (prefs[n.pref] === false) continue
    const member = members.docs[0]
    if (!member || member.data().status !== 'active') continue
    items.push({
      recipientKey: member.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: `tutor/schedule?date=${n.dateKey}`,
      refs: { sessionId, dateKey: n.dateKey },
    })
  }
  await sendNotifications(branchId, items, dedupeKey)
}

/** Session changes inside the notification window reach the tutor's inbox (TE's decision table). */
export const onSessionUpdated = onDocumentUpdated('branches/{branchId}/sessions/{sessionId}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!before || !after) return
  const { branchId, sessionId } = event.params
  const ctx = await branchContext(branchId)
  if (!ctx.active) return
  const notices = sessionChangeNotices(snapshotOf(before), snapshotOf(after), {
    now: Date.now(),
    today: todayKey(ctx.timezone),
    windowHours: ctx.settings.notifications.sessionChangeWindowHours,
  })
  await deliverSessionNotices(branchId, sessionId, notices, `sess-${sessionId}-${event.id}`)
})
