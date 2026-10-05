import AsyncStorage from "@react-native-async-storage/async-storage";
import { collectionGroup, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "@react-native-firebase/firestore";
import { COL, DOC, ROOT } from "@shared/paths";
import type { BranchPublicProfile, Member, SignupRequest } from "@shared/types";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { db } from "@/lib/firebase";
import { useAuth } from "./AuthProvider";

export interface Membership {
  branchId: string;
  member: Member & { id: string };
  profile: BranchPublicProfile | null;
}

export interface AccessState {
  /** Until the memberships of this account are known. */
  loading: boolean;
  error: string | null;
  isSuperAdmin: boolean;
  /** Every branch this email belongs to, active or paused. */
  memberships: Membership[];
  /** Sign-up requests still waiting for a branch's answer. */
  /** Sign-up requests still waiting for a center, with the center's name when its public profile has one. */
  pending: (SignupRequest & { branchId: string; branchName: string | null })[];
  /** The branch the app shows: the only one, or the one picked (remembered on this phone). */
  current: Membership | null;
  choose: (branchId: string | null) => void;
  refresh: () => Promise<void>;
}

const AccessContext = createContext<AccessState | null>(null);
const LAST_BRANCH_KEY = "hybercrm.lastBranch";
const RELINK_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Which branches this account can open, as the website's sign-in does (web/src/auth/AuthProvider.tsx): member docs
 * are keyed by email, so a collection-group query on the verified email finds them all. The account is linked to
 * each member doc on its first sign-in (uid, last sign-in), which the admin's Account page shows.
 */
export function AccessProvider({ children }: { children: ReactNode }) {
  const { user, email } = useAuth();
  const [state, setState] = useState<{ loading: boolean; error: string | null; isSuperAdmin: boolean; memberships: Membership[]; pending: AccessState["pending"] }>({
    loading: true,
    error: null,
    isSuperAdmin: false,
    memberships: [],
    pending: [],
  });
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void AsyncStorage.getItem(LAST_BRANCH_KEY)
      .then((v) => setChosen(v ?? null))
      .catch(() => setChosen(null));
  }, []);

  const load = useCallback(async () => {
    if (!user || !email) return;
    try {
      const [adminSnap, memberSnap, requestSnap] = await Promise.all([
        getDoc(doc(db, ROOT.platformAdmins, email)).catch(() => null),
        getDocs(query(collectionGroup(db, COL.members), where("email", "==", email))),
        getDocs(query(collectionGroup(db, COL.signupRequests), where("email", "==", email))).catch(() => null),
      ]);
      const memberships = await Promise.all(
        memberSnap.docs.map(async (snap) => {
          const branchId = snap.ref.parent.parent?.id ?? "";
          const member = { id: snap.id, ...(snap.data() as Member) };
          const profileSnap = await getDoc(doc(db, ROOT.branches, branchId, COL.public, DOC.publicProfile)).catch(() => null);
          const profile = profileSnap?.exists() ? (profileSnap.data() as BranchPublicProfile) : null;
          const lastLogin = (member.lastLoginAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
          if (member.uid !== user.uid || Date.now() - lastLogin > RELINK_AFTER_MS) {
            const patch: Record<string, unknown> = { uid: user.uid, displayName: member.displayName || user.displayName || "", photoURL: user.photoURL ?? null, lastLoginAt: serverTimestamp() };
            if (!member.firstLoginAt) patch.firstLoginAt = serverTimestamp();
            void updateDoc(snap.ref, patch).catch(() => undefined);
          }
          return { branchId, member, profile };
        }),
      );
      memberships.sort((a, b) => (a.profile?.name ?? a.branchId).localeCompare(b.profile?.name ?? b.branchId));
      const pending = await Promise.all(
        (requestSnap?.docs ?? [])
          .map((d) => ({ ...(d.data() as SignupRequest), branchId: d.ref.parent.parent?.id ?? "" }))
          .filter((r) => r.status === "pending")
          .map(async (r) => {
            const profileSnap = await getDoc(doc(db, ROOT.branches, r.branchId, COL.public, DOC.publicProfile)).catch(() => null);
            return { ...r, branchName: profileSnap?.exists() ? (profileSnap.data() as BranchPublicProfile).name || null : null };
          }),
      );
      // One profile per account, as the website keeps it.
      void setDoc(doc(db, ROOT.users, user.uid), { uid: user.uid, email, displayName: user.displayName ?? "", photoURL: user.photoURL ?? null, lastLoginAt: serverTimestamp() }, { merge: true }).catch(() => undefined);
      setState({ loading: false, error: null, isSuperAdmin: !!adminSnap?.exists(), memberships, pending });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }, [user, email]);

  useEffect(() => {
    setState({ loading: true, error: null, isSuperAdmin: false, memberships: [], pending: [] });
    void load();
  }, [load]);

  const choose = useCallback((branchId: string | null) => {
    setChosen(branchId);
    if (branchId) void AsyncStorage.setItem(LAST_BRANCH_KEY, branchId).catch(() => undefined);
    else void AsyncStorage.removeItem(LAST_BRANCH_KEY).catch(() => undefined);
  }, []);

  const value = useMemo<AccessState>(() => {
    const active = state.memberships.filter((m) => m.member.status === "active");
    const current = active.length === 1 ? active[0] : (active.find((m) => m.branchId === chosen) ?? null);
    return { ...state, loading: state.loading || chosen === undefined, current, choose, refresh: load };
  }, [state, chosen, choose, load]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessState {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess outside AccessProvider");
  return ctx;
}
