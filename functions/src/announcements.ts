import type { Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions'
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { db } from './app'
import { sendNotifications, tutorRecipients } from './notify'
import type { Announcement } from '@shared/comms'
import { COL, ROOT } from '@shared/paths'

// Literal paths so the trigger params are typed (branches/{b}/announcements/{id}).
const POST = 'branches/{branchId}/announcements/{announcementId}'

const postPath = (branchId: string, id: string) => `${ROOT.branches}/${branchId}/${COL.announcements}/${id}`

/**
 * Publishing with "Notify" (or saving with "Notify again") puts the post in the
 * audience's inbox, honoring each tutor's Announcements preference. Deleting a
 * post removes its read receipts, comments and uploaded files.
 */
export const onAnnouncementWritten = onDocumentWritten(POST, async (event) => {
  const { branchId, announcementId } = event.params
  const before = event.data?.before.data() as Announcement | undefined
  const after = event.data?.after.data() as Announcement | undefined

  if (!after) {
    if (!before) return
    await db.recursiveDelete(db.doc(postPath(branchId, announcementId)))
    try {
      await getStorage().bucket().deleteFiles({ prefix: `branches/${branchId}/announcements/${announcementId}/` })
    } catch (e) {
      logger.warn('Could not delete announcement files', { branchId, announcementId, error: String(e) })
    }
    return
  }

  const requested = after.notifyRequestedAt as Timestamp | null
  const previous = before?.notifyRequestedAt as Timestamp | null | undefined
  if (!requested || (previous && previous.isEqual(requested)) || after.archived) return

  const recipients = await tutorRecipients(branchId, after.audienceType === 'members' ? after.audienceKeys : undefined)
  const updated = !!before
  const items = recipients
    .filter((r) => r.key !== after.authorKey && r.prefs.announcements !== false)
    .map((r) => ({
      recipientKey: r.key,
      type: updated ? ('announcement_updated' as const) : ('announcement' as const),
      title: updated ? 'Announcement updated' : 'New announcement',
      body: after.title || 'Check the announcements for new updates.',
      link: `tutor/announcements/${announcementId}`,
      refs: { announcementId },
    }))
  await sendNotifications(branchId, items, `ann-${announcementId}-${requested.toMillis()}`)
})

/** Keeps `readCount` equal to the number of read receipts. */
export const onAnnouncementRead = onDocumentCreated('branches/{branchId}/announcements/{announcementId}/reads/{readerKey}', async (event) => {
  const ref = db.doc(postPath(event.params.branchId, event.params.announcementId))
  const count = (await ref.collection('reads').count().get()).data().count
  await ref.update({ readCount: count }).catch(() => undefined)
})

/** Keeps `commentCount` equal to the number of comments. */
export const onAnnouncementComment = onDocumentWritten('branches/{branchId}/announcements/{announcementId}/comments/{commentId}', async (event) => {
  if (event.data?.before.exists === event.data?.after.exists) return
  const ref = db.doc(postPath(event.params.branchId, event.params.announcementId))
  const count = (await ref.collection('comments').count().get()).data().count
  await ref.update({ commentCount: count }).catch(() => undefined)
})
