import { serverTimestamp, writeBatch } from 'firebase/firestore'
import { COL } from '@shared/paths'
import type { NotificationPrefs, Staff, WithId } from '@shared/types'
import { type Actor, addAudit, diffChanges } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchDocRef } from '@/lib/firestore'

/** The contact details a tutor keeps up to date themselves (the rules allow only these). */
export interface MyDetails {
  phone: string
  dob: string | null
  address: string
}

const DETAIL_LABELS: Record<keyof MyDetails, string> = { phone: 'Phone', dob: 'Date of birth', address: 'Address' }

/** Saves the tutor's own phone, birth date and address, with an audit entry in the same batch. */
export async function saveMyDetails(branchId: string, actor: Actor, staff: WithId<Staff>, details: MyDetails) {
  const patch = { phone: details.phone.trim(), dob: details.dob || null, address: details.address.trim() }
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.staff, staff.id), { ...patch, updatedAt: serverTimestamp(), updatedBy: actor.email })
  addAudit(batch, branchId, actor, {
    action: 'staff.update',
    category: 'people',
    entityType: 'staff',
    entityId: staff.id,
    summary: `Updated ${staff.name}’s contact details`,
    tutorId: staff.id,
    tutorName: staff.name,
    changes: diffChanges(staff as unknown as Record<string, unknown>, { ...staff, ...patch } as unknown as Record<string, unknown>, DETAIL_LABELS),
  })
  await batch.commit()
}

/** The four notification switches, in the order the page shows them. */
export const NOTIFICATION_SWITCHES: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: 'announcements', label: 'Announcements', description: 'New posts from the center, and posts sent to you again.' },
  { key: 'sessionCreated', label: 'New sessions', description: 'A session booked for you.' },
  { key: 'sessionChanged', label: 'Session changes', description: 'A new day, time or subject, a no-show, or a session moved to or from you.' },
  { key: 'sessionCanceled', label: 'Cancellations', description: 'A confirmed session canceled, removed or put back.' },
]

/** A missing switch counts as on (as on the server). */
export function prefOn(prefs: Partial<NotificationPrefs> | null | undefined, key: keyof NotificationPrefs): boolean {
  return prefs?.[key] !== false
}

/** Turns one of the tutor's notification switches on or off, with an audit entry. */
export async function setMyNotificationPref(branchId: string, actor: Actor, staff: WithId<Staff>, key: keyof NotificationPrefs, on: boolean) {
  const label = NOTIFICATION_SWITCHES.find((s) => s.key === key)?.label ?? key
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.staff, staff.id), { [`notificationPrefs.${key}`]: on, updatedAt: serverTimestamp(), updatedBy: actor.email })
  addAudit(batch, branchId, actor, {
    action: 'staff.notifications',
    category: 'people',
    entityType: 'staff',
    entityId: staff.id,
    summary: `Turned ${on ? 'on' : 'off'} “${label}” notifications for ${staff.name}`,
    tutorId: staff.id,
    tutorName: staff.name,
    changes: [{ field: `notificationPrefs.${key}`, label: `${label} notifications`, from: on ? 'Off' : 'On', to: on ? 'On' : 'Off' }],
  })
  await batch.commit()
}
