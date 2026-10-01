import {
  type User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { COL, DOC, ROOT, emailKey } from '@shared/paths'
import type { BranchPublicProfile, Member, WithId } from '@shared/types'
import { auth, db, googleProvider } from '@/lib/firebase'

export interface Membership {
  branchId: string
  member: WithId<Member>
  profile: BranchPublicProfile | null
}

interface AuthContextValue {
  status: 'loading' | 'signedOut' | 'signedIn'
  user: User | null
  /** Lower-cased Google email. */
  email: string | null
  isSuperAdmin: boolean
  memberships: Membership[]
  /** True once the super-admin check and membership lookup finished. */
  ready: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const RELINK_AFTER_MS = 6 * 60 * 60 * 1000

async function loadAccess(user: User) {
  const email = emailKey(user.email ?? '')
  const [adminSnap, memberSnap] = await Promise.all([
    getDoc(doc(db, ROOT.platformAdmins, email)).catch(() => null),
    getDocs(query(collectionGroup(db, COL.members), where('email', '==', email))),
  ])

  const memberships: Membership[] = await Promise.all(
    memberSnap.docs.map(async (snap) => {
      const branchId = snap.ref.parent.parent?.id ?? ''
      const member = { id: snap.id, ...(snap.data() as Member) }
      const profileSnap = await getDoc(doc(db, ROOT.branches, branchId, COL.public, DOC.publicProfile)).catch(
        () => null,
      )
      const profile = profileSnap?.exists() ? (profileSnap.data() as BranchPublicProfile) : null

      // Link the Google account to the member doc on first sign-in, then refresh occasionally.
      const lastLogin = member.lastLoginAt?.toMillis?.() ?? 0
      if (member.uid !== user.uid || Date.now() - lastLogin > RELINK_AFTER_MS) {
        const patch: Record<string, unknown> = {
          uid: user.uid,
          displayName: member.displayName || user.displayName || '',
          photoURL: user.photoURL ?? null,
          lastLoginAt: serverTimestamp(),
        }
        if (!member.firstLoginAt) patch.firstLoginAt = serverTimestamp()
        await updateDoc(snap.ref, patch).catch((e) => console.warn('Could not link member', branchId, e))
      }
      return { branchId, member, profile }
    }),
  )

  memberships.sort((a, b) => (a.profile?.name ?? a.branchId).localeCompare(b.profile?.name ?? b.branchId))

  // Global profile (one per Google account).
  await setDoc(
    doc(db, ROOT.users, user.uid),
    {
      uid: user.uid,
      email,
      displayName: user.displayName ?? '',
      photoURL: user.photoURL ?? null,
      lastLoginAt: serverTimestamp(),
    },
    { merge: true },
  ).catch((e) => console.warn('Could not save profile', e))

  return { isSuperAdmin: adminSnap?.exists() ?? false, memberships }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthContextValue['status']>('loading')
  const [access, setAccess] = useState<{ isSuperAdmin: boolean; memberships: Membership[]; uid: string } | null>(
    null,
  )

  const refreshFor = useCallback(async (u: User) => {
    try {
      const result = await loadAccess(u)
      setAccess({ ...result, uid: u.uid })
    } catch (e) {
      console.error('Could not load access', e)
      setAccess({ isSuperAdmin: false, memberships: [], uid: u.uid })
    }
  }, [])

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u)
        setStatus(u ? 'signedIn' : 'signedOut')
        setAccess(null)
        if (u) void refreshFor(u)
      }),
    [refreshFor],
  )

  const signIn = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, googleProvider)
        return
      }
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return
      throw e
    }
  }, [])

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth)
  }, [])

  const refresh = useCallback(async () => {
    if (auth.currentUser) await refreshFor(auth.currentUser)
  }, [refreshFor])

  const value = useMemo<AuthContextValue>(() => {
    const current = access && user && access.uid === user.uid ? access : null
    return {
      status,
      user,
      email: user?.email ? emailKey(user.email) : null,
      isSuperAdmin: current?.isSuperAdmin ?? false,
      memberships: current?.memberships ?? [],
      ready: status === 'signedOut' || current !== null,
      signIn,
      signOut,
      refresh,
    }
  }, [status, user, access, signIn, signOut, refresh])

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
