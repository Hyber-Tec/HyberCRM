import { FieldValue } from 'firebase-admin/firestore'
import { type Message, getMessaging } from 'firebase-admin/messaging'
import { logger } from 'firebase-functions/v2'
import { APP_URL } from '@shared/brand'
import { COL, ROOT, USER_COL } from '@shared/paths'
import { PUSH_CHANNELS, type PushData, channelFor } from '@shared/push'
import { db } from './app'
import type { Outgoing } from './notify'

/** Tokens FCM says will never work again: their device docs are removed. */
const DEAD_TOKEN = /registration-token-not-registered|invalid-registration-token|invalid-argument/

/**
 * Pushes new inbox items to their recipients' phones (the app's installs, `users/{uid}/devices`, found by email).
 * The iPhone badge is the recipient's unread inbox count in that branch. Never throws: the inbox item is already
 * written, and a push that fails must not make the trigger retry.
 */
export async function pushItems(branchId: string, items: { id: string; n: Outgoing }[]): Promise<void> {
  if (!items.length) return
  try {
    const byRecipient = new Map<string, { id: string; n: Outgoing }[]>()
    for (const item of items) byRecipient.set(item.n.recipientKey, [...(byRecipient.get(item.n.recipientKey) ?? []), item])

    const messages: Message[] = []
    const owners: { path: string; token: string }[] = []
    for (const [email, list] of byRecipient) {
      const devices = await db.collectionGroup(USER_COL.devices).where('email', '==', email).get()
      if (devices.empty) continue
      const unread = (
        await db.collection(`${ROOT.branches}/${branchId}/${COL.notifications}`).where('recipientKey', '==', email).where('readAt', '==', null).count().get()
      ).data().count
      for (const device of devices.docs) {
        const token = device.get('token') as string | undefined
        if (!token) continue
        for (const { id, n } of list) {
          const channel = PUSH_CHANNELS[channelFor(n.type)]
          const data: PushData = {
            type: n.type,
            branchId,
            notificationId: id,
            link: n.link,
            url: `${APP_URL}/${branchId}/${n.link}`,
            sessionId: n.refs.sessionId ?? '',
            announcementId: n.refs.announcementId ?? '',
            dateKey: n.refs.dateKey ?? '',
          }
          messages.push({
            token,
            notification: { title: n.title, body: n.body },
            data,
            apns: { payload: { aps: { badge: unread, sound: 'default', threadId: channel.id } } },
            android: { priority: 'high', notification: { channelId: channel.id, sound: 'default', tag: id.slice(0, 64) } },
          })
          owners.push({ path: device.ref.path, token })
        }
      }
    }
    if (!messages.length) return

    const dead = new Set<string>()
    for (let i = 0; i < messages.length; i += 500) {
      const res = await getMessaging().sendEach(messages.slice(i, i + 500))
      res.responses.forEach((r, j) => {
        if (!r.success && DEAD_TOKEN.test(r.error?.code ?? '')) dead.add(owners[i + j].path)
      })
    }
    await Promise.all([...dead].map((path) => db.doc(path).delete().catch(() => undefined)))
    await Promise.all(items.map(({ id }) => db.doc(`${ROOT.branches}/${branchId}/${COL.notifications}/${id}`).update({ pushedAt: FieldValue.serverTimestamp() }).catch(() => undefined)))
    if (dead.size) logger.info(`Removed ${dead.size} expired push token(s)`, { branchId })
  } catch (e) {
    logger.error('Push failed', { branchId, error: String(e) })
  }
}
