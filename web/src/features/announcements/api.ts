import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { useMemo } from 'react'
import {
  type Announcement,
  type AnnouncementAttachment,
  type AnnouncementAudience,
  type AnnouncementComment,
  type AnnouncementRead,
  ANNOUNCEMENT_COMMENT_MAX,
  cleanCommentText,
  stripHtmlToText,
} from '@shared/comms'
import { COL, branchColPath } from '@shared/paths'
import type { Role } from '@shared/roles'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { type Actor, addAudit } from '@/lib/audit'
import { db, storage } from '@/lib/firebase'
import { branchCol, branchDocRef, useQuery } from '@/lib/firestore'
import { sanitizeHtml } from './html'

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

export function announcementRef(branchId: string, id: string) {
  return branchDocRef(branchId, COL.announcements, id)
}

/** A fresh ID, so uploads can live under the post's folder before it is saved. */
export function newAnnouncementId(branchId: string) {
  return doc(branchCol(branchId, COL.announcements)).id
}

function subCol(branchId: string, id: string, name: 'reads' | 'comments') {
  return collection(db, branchColPath(branchId, COL.announcements), id, name)
}

// ---------------------------------------------------------------- live data

/** Admin feed: every post, newest first. */
export function useAllAnnouncements(enabled = true) {
  const { branchId } = useBranch()
  const q = useMemo(() => (enabled ? query(branchCol(branchId, COL.announcements), orderBy('createdAt', 'desc')) : null), [branchId, enabled])
  return useQuery<Announcement>(q, `announcements-${branchId}`)
}

/**
 * Tutor feed: posts for everyone plus posts addressed to me (two queries the
 * rules can verify), archived posts dropped.
 */
export function useMyAnnouncements(enabled = true) {
  const { branchId, actor } = useBranch()
  const allQ = useMemo(
    () => (enabled ? query(branchCol(branchId, COL.announcements), where('audienceType', '==', 'all')) : null),
    [branchId, enabled],
  )
  const mineQ = useMemo(
    () => (enabled ? query(branchCol(branchId, COL.announcements), where('audienceKeys', 'array-contains', actor.email)) : null),
    [branchId, actor.email, enabled],
  )
  const all = useQuery<Announcement>(allQ, `announcements-all-${branchId}`)
  const mine = useQuery<Announcement>(mineQ, `announcements-mine-${branchId}-${actor.email}`)
  const data = useMemo(() => {
    const byId = new Map<string, WithId<Announcement>>()
    for (const a of [...all.data, ...mine.data]) if (!a.archived) byId.set(a.id, a)
    return [...byId.values()]
  }, [all.data, mine.data])
  return { data, loading: all.loading || mine.loading, error: all.error ?? mine.error }
}

/** IDs of the posts I have opened in this branch (one collection-group listener). */
export function useMyReadIds(enabled = true) {
  const { branchId, actor } = useBranch()
  const q = useMemo(() => (enabled ? query(collectionGroup(db, 'reads'), where('email', '==', actor.email)) : null), [actor.email, enabled])
  const { data, loading } = useQuery<AnnouncementRead>(q, `my-reads-${actor.email}`)
  const ids = useMemo(() => new Set(data.filter((r) => r.branchId === branchId).map((r) => r.announcementId)), [data, branchId])
  return { ids, loading }
}

/** Unread posts in the tutor portal (sidebar and News badges). */
export function useUnreadAnnouncementCount(enabled = true) {
  const feed = useMyAnnouncements(enabled)
  const reads = useMyReadIds(enabled)
  if (!enabled || feed.loading || reads.loading) return 0
  return feed.data.filter((a) => !reads.ids.has(a.id)).length
}

export function useComments(id: string) {
  const { branchId } = useBranch()
  const q = useMemo(() => query(subCol(branchId, id, 'comments'), orderBy('createdAt', 'asc')), [branchId, id])
  return useQuery<AnnouncementComment>(q, `comments-${branchId}-${id}`)
}

export function useReads(id: string, enabled: boolean) {
  const { branchId } = useBranch()
  const q = useMemo(() => (enabled ? query(subCol(branchId, id, 'reads'), orderBy('readAt', 'desc')) : null), [branchId, id, enabled])
  return useQuery<AnnouncementRead>(q, `reads-${branchId}-${id}`)
}

// ---------------------------------------------------------------- writes

export interface AnnouncementInput {
  title: string
  contentHtml: string
  category: string
  audienceType: AnnouncementAudience
  audienceKeys: string[]
  commentsEnabled: boolean
  attachments: AnnouncementAttachment[]
  /** Create: notify the audience. Edit: notify them again. */
  notify: boolean
}

function contentFields(input: AnnouncementInput) {
  const contentHtml = sanitizeHtml(input.contentHtml)
  return {
    title: input.title.trim(),
    contentHtml,
    contentText: stripHtmlToText(contentHtml),
    category: input.category.trim() || 'General',
    audienceType: input.audienceType,
    audienceKeys: input.audienceType === 'members' ? [...new Set(input.audienceKeys)] : [],
    commentsEnabled: input.commentsEnabled,
    attachments: input.attachments,
  }
}

export async function createAnnouncement(branchId: string, actor: Actor, id: string, input: AnnouncementInput) {
  const batch = writeBatch(db)
  const fields = contentFields(input)
  batch.set(announcementRef(branchId, id), {
    ...fields,
    pinned: false,
    pinnedAt: null,
    archived: false,
    notifyRequestedAt: input.notify ? serverTimestamp() : null,
    authorKey: actor.email,
    authorName: actor.name,
    readCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
    createdBy: actor.email,
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
  addAudit(batch, branchId, actor, {
    action: 'announcement.create',
    category: 'announcements',
    entityType: 'announcement',
    entityId: id,
    summary: `Published “${fields.title}”`,
  })
  await batch.commit()
}

export async function updateAnnouncement(branchId: string, actor: Actor, id: string, input: AnnouncementInput) {
  const batch = writeBatch(db)
  const fields = contentFields(input)
  batch.update(announcementRef(branchId, id), {
    ...fields,
    ...(input.notify ? { notifyRequestedAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
  addAudit(batch, branchId, actor, {
    action: 'announcement.update',
    category: 'announcements',
    entityType: 'announcement',
    entityId: id,
    summary: `Edited “${fields.title}”${input.notify ? ' and notified the audience again' : ''}`,
  })
  await batch.commit()
}

export async function setPinned(branchId: string, actor: Actor, a: WithId<Announcement>, pinned: boolean) {
  await updateDoc(announcementRef(branchId, a.id), {
    pinned,
    pinnedAt: pinned ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
}

/** Archiving also unpins. */
export async function setArchived(branchId: string, actor: Actor, a: WithId<Announcement>, archived: boolean) {
  const batch = writeBatch(db)
  batch.update(announcementRef(branchId, a.id), {
    archived,
    ...(archived ? { pinned: false, pinnedAt: null } : {}),
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
  addAudit(batch, branchId, actor, {
    action: archived ? 'announcement.archive' : 'announcement.restore',
    category: 'announcements',
    entityType: 'announcement',
    entityId: a.id,
    summary: `${archived ? 'Archived' : 'Restored'} “${a.title}”`,
  })
  await batch.commit()
}

/** Deletes the post; a Cloud Function removes its reads, comments and files. */
export async function deleteAnnouncement(branchId: string, actor: Actor, a: WithId<Announcement>) {
  const batch = writeBatch(db)
  batch.delete(announcementRef(branchId, a.id))
  addAudit(batch, branchId, actor, {
    action: 'announcement.delete',
    category: 'announcements',
    entityType: 'announcement',
    entityId: a.id,
    summary: `Deleted “${a.title}”`,
  })
  await batch.commit()
}

/** First open of a post (tutor portal). Receipts are write-once. */
export async function markRead(branchId: string, actor: Actor, id: string) {
  await setDoc(doc(subCol(branchId, id, 'reads'), actor.email), {
    email: actor.email,
    name: actor.name,
    branchId,
    announcementId: id,
    readAt: serverTimestamp(),
  })
}

export async function addComment(branchId: string, actor: Actor, role: Role, id: string, text: string) {
  const clean = cleanCommentText(text).slice(0, ANNOUNCEMENT_COMMENT_MAX)
  if (!clean) return
  await addDoc(subCol(branchId, id, 'comments'), {
    authorKey: actor.email,
    authorName: actor.name,
    authorRole: role,
    text: clean,
    createdAt: serverTimestamp(),
  })
}

export async function deleteComment(branchId: string, id: string, commentId: string) {
  await deleteDoc(doc(subCol(branchId, id, 'comments'), commentId))
}

/** Uploads an image or attachment under the post's Storage folder. */
export async function uploadAnnouncementFile(branchId: string, id: string, file: File, kind: 'images' | 'files'): Promise<AnnouncementAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name} is larger than 20 MB.`)
  const safe = file.name.replace(/[^\w.\- ]+/g, '_').slice(-120) || 'file'
  const path = `branches/${branchId}/announcements/${id}/${kind}/${crypto.randomUUID().slice(0, 8)}-${safe}`
  const r = storageRef(storage, path)
  await uploadBytes(r, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: 'private, max-age=31536000',
    contentDisposition: kind === 'files' ? `attachment; filename="${safe}"` : undefined,
  })
  return { name: file.name, url: await getDownloadURL(r), path, size: file.size, contentType: file.type || 'application/octet-stream' }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
