import { collection, deleteDoc, doc, getDocsFromServer, limit, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from "@react-native-firebase/firestore";
import type { AppNotification } from "@shared/comms";
import { COL, ROOT } from "@shared/paths";
import { db } from "@/lib/firebase";
import { useQuery } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

export type InboxItem = AppNotification & { id: string };

const inboxPath = (branchId: string) => `${ROOT.branches}/${branchId}/${COL.notifications}`;

/** Newest first, as the website's bell lists them (index: recipientKey + createdAt desc). */
const inboxQuery = (branchId: string, email: string) => query(collection(db, inboxPath(branchId)), where("recipientKey", "==", email), orderBy("createdAt", "desc"), limit(100));

/** My newest inbox items in this branch (session changes, announcements), as the website's bell shows them. */
export function useInbox() {
  const { branchId, actor } = useBranch();
  const state = useQuery<AppNotification>(`inbox-${branchId}-${actor.email}`, () => inboxQuery(branchId, actor.email));
  const unread = state.data.filter((n) => !n.readAt).length;
  return { ...state, unread };
}

/** Pull to refresh: asks the server once more (the listener keeps the inbox live anyway). */
export async function refreshInbox(branchId: string, email: string): Promise<void> {
  await getDocsFromServer(inboxQuery(branchId, email)).catch(() => undefined);
}

export async function markNotificationRead(branchId: string, id: string): Promise<void> {
  await updateDoc(doc(db, inboxPath(branchId), id), { readAt: serverTimestamp() }).catch(() => undefined);
}

/** Marks every unread item read in one write (fails as a whole, so the screen can say so). */
export async function markAllNotificationsRead(branchId: string, items: InboxItem[]): Promise<void> {
  const unread = items.filter((n) => !n.readAt).slice(0, 450);
  if (!unread.length) return;
  const batch = writeBatch(db);
  for (const n of unread) batch.update(doc(db, inboxPath(branchId), n.id), { readAt: serverTimestamp() });
  await batch.commit();
}

/** Removes an item from my inbox (it can't be brought back: only the server writes them). */
export async function deleteNotification(branchId: string, id: string): Promise<void> {
  await deleteDoc(doc(db, inboxPath(branchId), id));
}
