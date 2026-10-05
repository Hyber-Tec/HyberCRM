import { queryParams } from './auth'
import type { NotificationType } from './comms'
import type { TimestampLike } from './types'

/**
 * Push notifications to the phone app (iPhone and Android, through Firebase Cloud Messaging). Every inbox item the
 * server writes (`branches/{b}/notifications`) is also pushed to the recipient's phones, honoring the same
 * per-person switches (`staff.notificationPrefs`), so the inbox, the bell and the phone always say the same thing.
 */

/** `users/{uid}/devices/{deviceId}`: one per app install, written by the app, removed when it signs out. */
export interface DeviceDoc {
  /** The FCM registration token. */
  token: string
  /** The signed-in email (lower case): the server finds a recipient's phones by it. */
  email: string
  platform: 'ios' | 'android'
  /** "1.0.0 (3)". */
  appVersion: string
  /** "Apple iPhone 17 Pro, iOS 27.0": for the person's own list of devices. */
  label: string
  createdAt: TimestampLike | null
  updatedAt: TimestampLike | null
}

/** Android notification channels (the app creates them; a push names one). */
export const PUSH_CHANNELS = {
  sessions: { id: 'sessions', name: 'Sessions', description: 'New sessions and changes to your schedule' },
  announcements: { id: 'announcements', name: 'Announcements', description: 'News from your center' },
} as const

export type PushChannel = keyof typeof PUSH_CHANNELS

export function channelFor(type: NotificationType | string): PushChannel {
  return type.startsWith('announcement') ? 'announcements' : 'sessions'
}

/**
 * The data every push carries (all strings, as FCM requires). `link` is the inbox item's in-app path below the
 * branch (`tutor/schedule?date=…`, `tutor/announcements/{id}`); the app opens the matching screen, the website
 * the matching page (`url`).
 */
export interface PushData {
  [key: string]: string
  type: string
  branchId: string
  notificationId: string
  link: string
  url: string
  sessionId: string
  announcementId: string
  dateKey: string
}

/** Where a push or an inbox item leads in the phone app, from its `link`. */
export type AppTarget =
  | { screen: 'schedule'; dateKey: string | null; sessionId: string | null }
  | { screen: 'announcement'; announcementId: string }
  | { screen: 'announcements' }
  | { screen: 'today' }

export function appTargetOf(link: string, refs?: { sessionId?: string | null; announcementId?: string | null; dateKey?: string | null }): AppTarget {
  const [path, search = ''] = (link ?? '').split('?')
  const params = queryParams(search)
  const parts = path.split('/').filter(Boolean)
  if (parts.includes('announcements')) {
    const id = parts[parts.indexOf('announcements') + 1] ?? refs?.announcementId ?? null
    return id ? { screen: 'announcement', announcementId: id } : { screen: 'announcements' }
  }
  if (parts.includes('schedule')) {
    return { screen: 'schedule', dateKey: params.get('date') ?? refs?.dateKey ?? null, sessionId: refs?.sessionId ?? null }
  }
  return { screen: 'today' }
}
