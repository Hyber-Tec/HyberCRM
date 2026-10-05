import { addDoc, collection, collectionGroup, deleteDoc, doc, getDocsFromServer, orderBy, query, serverTimestamp, setDoc, where } from "@react-native-firebase/firestore";
import { ANNOUNCEMENT_COMMENT_MAX, type Announcement, type AnnouncementComment, type AnnouncementRead, cleanCommentText } from "@shared/comms";
import { COL, ROOT } from "@shared/paths";
import type { Role } from "@shared/roles";
import { useMemo } from "react";
import { db } from "@/lib/firebase";
import { useDoc, useQuery } from "@/lib/firestore";
import { type Actor, useBranch } from "@/state/BranchProvider";

export type Post = Announcement & { id: string };
export type Comment = AnnouncementComment & { id: string };

const postsPath = (branchId: string) => `${ROOT.branches}/${branchId}/${COL.announcements}`;

const forAll = (branchId: string) => query(collection(db, postsPath(branchId)), where("audienceType", "==", "all"));
const forMe = (branchId: string, email: string) => query(collection(db, postsPath(branchId)), where("audienceKeys", "array-contains", email));

/**
 * The tutor's feed, as on the website (web/src/features/announcements/api.ts): posts for everyone plus posts addressed
 * to them (two queries the rules can verify), archived posts dropped, pinned first, then newest first.
 */
export function useMyAnnouncements() {
  const { branchId, actor } = useBranch();
  const all = useQuery<Announcement>(`ann-all-${branchId}`, () => forAll(branchId));
  const mine = useQuery<Announcement>(`ann-mine-${branchId}-${actor.email}`, () => forMe(branchId, actor.email));
  const data = useMemo(() => {
    const byId = new Map<string, Post>();
    for (const a of [...all.data, ...mine.data]) if (!a.archived) byId.set(a.id, a);
    // A post the server hasn't stamped yet is the newest.
    const ms = (a: Post) => (a.createdAt as { toMillis?: () => number } | null)?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    const pinMs = (a: Post) => (a.pinnedAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
    return [...byId.values()].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.pinned && b.pinned ? pinMs(b) - pinMs(a) : 0) || ms(b) - ms(a));
  }, [all.data, mine.data]);
  return { data, loading: all.loading || mine.loading, error: all.error ?? mine.error };
}

/** IDs of the posts I have opened in this branch (one collection-group listener). */
export function useMyReadIds() {
  const { branchId, actor } = useBranch();
  const { data, loading } = useQuery<AnnouncementRead>(`my-reads-${actor.email}`, () => query(collectionGroup(db, "reads"), where("email", "==", actor.email)));
  const ids = useMemo(() => new Set(data.filter((r) => r.branchId === branchId).map((r) => r.announcementId)), [data, branchId]);
  return { ids, loading };
}

/** The feed with each post's read state, and how many are unread (the News tab's badge). */
export function useNews() {
  const feed = useMyAnnouncements();
  const reads = useMyReadIds();
  const loading = feed.loading || reads.loading;
  const unread = loading ? 0 : feed.data.filter((a) => !reads.ids.has(a.id)).length;
  return { posts: feed.data, readIds: reads.ids, unread, loading, error: feed.error };
}

/** Pull to refresh: asks the server once more (the listeners keep the feed live anyway). */
export async function refreshNews(branchId: string, email: string): Promise<void> {
  await Promise.all([getDocsFromServer(forAll(branchId)), getDocsFromServer(forMe(branchId, email))]).catch(() => undefined);
}

/** One post by ID (a deep link or a push opens it), also one that has left the feed since. */
export function usePost(id: string) {
  const { branchId } = useBranch();
  return useDoc<Announcement>(id ? `${postsPath(branchId)}/${id}` : null);
}

/** My read receipt for a post, if I have opened it before. */
export function useMyRead(id: string) {
  const { branchId, actor } = useBranch();
  return useDoc<AnnouncementRead>(id ? `${postsPath(branchId)}/${id}/reads/${actor.email}` : null);
}

/** A post's comments, oldest first (as on the website). */
export function useComments(id: string) {
  const { branchId } = useBranch();
  return useQuery<AnnouncementComment>(id ? `comments-${branchId}-${id}` : null, () => query(collection(db, postsPath(branchId), id, "comments"), orderBy("createdAt", "asc")));
}

/** The first time a post is opened: a read receipt, written once (the rules refuse a second). */
export async function markRead(branchId: string, actor: Actor, id: string): Promise<void> {
  await setDoc(doc(db, postsPath(branchId), id, "reads", actor.email), { email: actor.email, name: actor.name, branchId, announcementId: id, readAt: serverTimestamp() }).catch(() => undefined);
}

export async function addComment(branchId: string, actor: Actor, role: Role, id: string, text: string): Promise<void> {
  const clean = cleanCommentText(text).slice(0, ANNOUNCEMENT_COMMENT_MAX);
  if (!clean) return;
  await addDoc(collection(db, postsPath(branchId), id, "comments"), { authorKey: actor.email, authorName: actor.name, authorRole: role, text: clean, createdAt: serverTimestamp() });
}

export async function deleteComment(branchId: string, id: string, commentId: string): Promise<void> {
  await deleteDoc(doc(db, postsPath(branchId), id, "comments", commentId));
}
