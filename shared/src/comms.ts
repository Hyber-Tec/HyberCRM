import type { Role } from './roles'
import type { AuditStamp, TimestampLike } from './types'

// ------------------------------------------------------------ announcements

/** "all" = everyone in the tutor portal; "members" = the listed people. */
export type AnnouncementAudience = 'all' | 'members'

export interface AnnouncementAttachment {
  name: string
  url: string
  /** Storage path, for deletes. */
  path: string
  size: number
  contentType: string
}

/** `branches/{b}/announcements/{id}`. */
export interface Announcement extends AuditStamp {
  title: string
  /** Sanitized HTML. Images are uploaded to Storage, never inlined. */
  contentHtml: string
  /** Plain text for search and previews. */
  contentText: string
  category: string
  audienceType: AnnouncementAudience
  /** Member email keys when the audience is "members". */
  audienceKeys: string[]
  commentsEnabled: boolean
  pinned: boolean
  pinnedAt: TimestampLike | null
  archived: boolean
  /**
   * Set when the admin asks to notify the audience (publish with "Notify", or
   * "Notify again" on edit). The server writes inbox items when it changes.
   */
  notifyRequestedAt: TimestampLike | null
  attachments: AnnouncementAttachment[]
  authorKey: string
  authorName: string
  /** Maintained by Cloud Functions. */
  readCount: number
  commentCount: number
}

/** `announcements/{id}/reads/{emailKey}`: written once, the first time the person opens the post. */
export interface AnnouncementRead {
  email: string
  name: string
  branchId: string
  announcementId: string
  readAt: TimestampLike
}

/** `announcements/{id}/comments/{id}`. */
export interface AnnouncementComment {
  authorKey: string
  authorName: string
  authorRole: Role
  text: string
  createdAt: TimestampLike
}

export const ANNOUNCEMENT_COMMENT_MAX = 2000

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" }

/** HTML → searchable text: drops style/script blocks, turns tags into spaces, collapses whitespace. */
export function stripHtmlToText(html: string): string {
  return (html ?? '')
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (_, e: string) => ENTITIES[e] ?? ' ')
    .replace(/[​ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Comment text as stored: trimmed, zero-width spaces removed, non-breaking spaces normalized. */
export function cleanCommentText(text: string): string {
  return (text ?? '').replace(/​/g, '').replace(/ /g, ' ').trim()
}

/** Category list: the branch defaults in order, then the ones used on posts A→Z (case-insensitive de-dup). */
export function announcementCategories(defaults: readonly string[], used: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (name: string) => {
    const n = (name ?? '').trim()
    if (!n || seen.has(n.toLowerCase())) return
    seen.add(n.toLowerCase())
    out.push(n)
  }
  defaults.forEach(add)
  ;[...used].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(add)
  return out
}

/** Who may see a post in the tutor portal. */
export function isInAudience(a: Pick<Announcement, 'audienceType' | 'audienceKeys'>, memberKey: string): boolean {
  return a.audienceType === 'all' || (a.audienceKeys ?? []).includes(memberKey)
}

// ------------------------------------------------------------ notifications

export type NotificationType =
  | 'announcement'
  | 'announcement_updated'
  | 'session_created'
  | 'session_canceled'
  | 'session_restored'
  | 'session_deleted'
  | 'session_time_changed'
  | 'session_date_changed'
  | 'session_reassigned_in'
  | 'session_reassigned_out'
  | 'session_no_show'
  | 'session_subject_changed'

/** `branches/{b}/notifications/{id}`: the in-app inbox (written by Cloud Functions). */
export interface AppNotification {
  recipientKey: string
  type: NotificationType
  title: string
  body: string
  /** In-app path below the branch, e.g. "tutor/announcements/abc". */
  link: string
  refs: { sessionId?: string | null; announcementId?: string | null; dateKey?: string | null }
  createdAt: TimestampLike
  readAt: TimestampLike | null
}

export const NOTIFICATION_TYPES: Record<NotificationType, { label: string; color: string }> = {
  announcement: { label: 'Announcement', color: '#6B7280' },
  announcement_updated: { label: 'Announcement Updated', color: '#6B7280' },
  session_created: { label: 'New Session', color: '#16A34A' },
  session_canceled: { label: 'Session Canceled', color: '#DC2626' },
  session_restored: { label: 'Session Restored', color: '#D97706' },
  session_deleted: { label: 'Session Removed', color: '#DC2626' },
  session_time_changed: { label: 'Time Changed', color: '#2563EB' },
  session_date_changed: { label: 'Date Changed', color: '#7C3AED' },
  session_reassigned_in: { label: 'You Were Assigned', color: '#16A34A' },
  session_reassigned_out: { label: 'Session Reassigned', color: '#D97706' },
  session_no_show: { label: 'No Show', color: '#DC2626' },
  session_subject_changed: { label: 'Subject Changed', color: '#0891B2' },
}

export function notificationMeta(type: string): { label: string; color: string } {
  return NOTIFICATION_TYPES[type as NotificationType] ?? { label: 'Notification', color: '#9CA3AF' }
}
