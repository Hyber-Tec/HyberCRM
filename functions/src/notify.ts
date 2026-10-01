import { FieldValue } from 'firebase-admin/firestore'
import { db } from './app'
import type { NotificationType } from '@shared/comms'
import { COL, ROOT } from '@shared/paths'
import type { NotificationPrefs } from '@shared/types'

export interface Outgoing {
  recipientKey: string
  type: NotificationType
  title: string
  body: string
  /** In-app path below the branch. */
  link: string
  refs: { sessionId?: string | null; announcementId?: string | null; dateKey?: string | null }
}

export interface Recipient {
  key: string
  staffId: string | null
  prefs: Partial<NotificationPrefs>
}

/**
 * Writes inbox items. `dedupeKey` makes the IDs deterministic so a retried
 * trigger doesn't notify twice.
 */
export async function sendNotifications(branchId: string, items: Outgoing[], dedupeKey: string) {
  const col = db.collection(`${ROOT.branches}/${branchId}/${COL.notifications}`)
  for (let i = 0; i < items.length; i += 400) {
    const batch = db.batch()
    for (const n of items.slice(i, i + 400)) {
      const id = `${dedupeKey}-${n.recipientKey}`.replace(/[^\w@.-]+/g, '_').slice(0, 700)
      batch.set(col.doc(id), { ...n, createdAt: FieldValue.serverTimestamp(), readAt: null })
    }
    await batch.commit()
  }
}

/** Active members with the tutor role (optionally only the given keys), with their notification preferences. */
export async function tutorRecipients(branchId: string, keys?: string[]): Promise<Recipient[]> {
  const snap = await db.collection(`${ROOT.branches}/${branchId}/${COL.members}`).where('roles', 'array-contains', 'tutor').get()
  const wanted = keys ? new Set(keys) : null
  const members = snap.docs
    .map((d) => ({ key: d.id, data: d.data() }))
    .filter((m) => m.data.status === 'active' && (!wanted || wanted.has(m.key)))
  const staffIds = members.map((m) => m.data.staffId as string | null).filter((id): id is string => !!id)
  const staff = staffIds.length ? await db.getAll(...staffIds.map((id) => db.doc(`${ROOT.branches}/${branchId}/${COL.staff}/${id}`))) : []
  const prefsById = new Map(staff.map((s) => [s.id, (s.data()?.notificationPrefs ?? {}) as Partial<NotificationPrefs>]))
  return members.map((m) => {
    const staffId = (m.data.staffId as string | null) ?? null
    return { key: m.key, staffId, prefs: (staffId && prefsById.get(staffId)) || {} }
  })
}
