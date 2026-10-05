import {
  EmailAuthProvider,
  GoogleAuthProvider,
  type User,
  createUserWithEmailAndPassword,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updatePassword,
  updateProfile,
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
import { httpsCallable } from 'firebase/functions'
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { type SignInMethods, signInMethods } from '@shared/auth'
import { COL, DOC, ROOT, emailKey } from '@shared/paths'
import type { BranchPublicProfile, Member, WithId } from '@shared/types'
import { auth, db, functions, googleProvider } from '@/lib/firebase'

export interface Membership {
  branchId: string
  member: WithId<Member>
  profile: BranchPublicProfile | null
}

export type VerificationResult = 'sent' | 'throttled' | 'verified'

interface AuthContextValue {
  status: 'loading' | 'signedOut' | 'signedIn'
  user: User | null
  /** Lower-cased sign-in email. */
  email: string | null
  /**
   * A password account whose email isn't confirmed yet. The rules only trust verified emails, so it can't reach
   * any branch until the person opens the link we emailed (the pages send it to /verify-email).
   */
  needsVerification: boolean
  /** How this account signs in (Google, a password, or both). */
  methods: SignInMethods
  isSuperAdmin: boolean
  memberships: Membership[]
  /** True once the super-admin check and membership lookup finished. */
  ready: boolean
  /** Google. `hint`: the email to pre-select in Google's account chooser (from an invite link). */
  signIn: (hint?: string | null) => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  /** A new password account; the confirmation email goes out at once. */
  signUp: (input: { name: string; email: string; password: string }, next?: string | null) => Promise<void>
  /** Emails the signed-in account its confirmation link again. */
  sendVerification: (next?: string | null) => Promise<VerificationResult>
  /** Asks Firebase whether the email was confirmed (in another tab or on the phone); true once it is. */
  checkVerified: () => Promise<boolean>
  /** Emails a reset link. Says nothing about whether an account exists. */
  sendPasswordReset: (email: string, next?: string | null) => Promise<void>
  /** Changes the password (password accounts), or adds one (Google accounts), after confirming who it is. */
  changePassword: (current: string | null, next: string) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const RELINK_AFTER_MS = 6 * 60 * 60 * 1000

/** Where account emails send people back to (the live site, or this dev server). */
const continueUrl = (path = '/login') => `${window.location.origin}${path}`

const callAccountEmail = httpsCallable<
  { kind: 'verify' | 'reset'; email?: string; next?: string | null },
  { sent: boolean; fallback?: boolean; throttled?: boolean; alreadyVerified?: boolean }
>(functions, 'sendAccountEmail')

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

      // Link the account to the member doc on first sign-in, then refresh occasionally.
      // Nothing waits for these writes: access is known once the reads are done.
      const lastLogin = member.lastLoginAt?.toMillis?.() ?? 0
      if (member.uid !== user.uid || Date.now() - lastLogin > RELINK_AFTER_MS) {
        const patch: Record<string, unknown> = {
          uid: user.uid,
          displayName: member.displayName || user.displayName || '',
          photoURL: user.photoURL ?? null,
          lastLoginAt: serverTimestamp(),
        }
        if (!member.firstLoginAt) patch.firstLoginAt = serverTimestamp()
        void updateDoc(snap.ref, patch).catch((e) => console.warn('Could not link member', branchId, e))
      }
      return { branchId, member, profile }
    }),
  )

  memberships.sort((a, b) => (a.profile?.name ?? a.branchId).localeCompare(b.profile?.name ?? b.branchId))

  // Global profile (one per account).
  void setDoc(
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
  // Mirrors user.emailVerified, which changes in place when the account is reloaded (no auth event fires).
  const [verified, setVerified] = useState(false)
  const [providers, setProviders] = useState<string[]>([])
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
        setVerified(!!u?.emailVerified)
        setProviders(u?.providerData.map((p) => p.providerId) ?? [])
        // The landing page (no Firebase there) offers "Open the app" to people signed in on this device.
        try {
          localStorage.setItem('hyber:signedIn', u ? '1' : '0')
        } catch {
          /* private mode */
        }
        setAccess(null)
        // An unconfirmed email reaches nothing (rules): access is looked up once it's confirmed.
        if (u?.emailVerified) void refreshFor(u)
      }),
    [refreshFor],
  )

  const signIn = useCallback(async (hint?: string | null) => {
    let provider = googleProvider
    if (hint) {
      provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account', login_hint: hint })
    }
    try {
      await signInWithPopup(auth, provider)
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider)
        return
      }
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return
      throw e
    }
  }, [])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password)
  }, [])

  const sendVerification = useCallback(async (next?: string | null): Promise<VerificationResult> => {
    const u = auth.currentUser
    if (!u) throw new Error('Sign in first.')
    try {
      const { data } = await callAccountEmail({ kind: 'verify', next: next ?? null })
      if (data.alreadyVerified) return 'verified'
      if (data.throttled) return 'throttled'
      if (data.sent) return 'sent'
    } catch (e) {
      console.warn('Hyber email not sent, using Firebase’s', e)
    }
    // Our email couldn't go out: Firebase sends its own, with the same kind of link.
    await sendEmailVerification(u, { url: continueUrl(next ?? '/login') })
    return 'sent'
  }, [])

  const signUp = useCallback(
    async ({ name, email, password }: { name: string; email: string; password: string }, next?: string | null) => {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() }).catch(() => undefined)
      setProviders(cred.user.providerData.map((p) => p.providerId))
      await sendVerification(next).catch((e) => console.warn('Could not send the confirmation email', e))
    },
    [sendVerification],
  )

  const checkVerified = useCallback(async () => {
    const u = auth.currentUser
    if (!u) return false
    await reload(u)
    if (!u.emailVerified) return false
    // The rules read email_verified from the ID token: a fresh one carries it.
    await u.getIdToken(true)
    setVerified(true)
    await refreshFor(u)
    return true
  }, [refreshFor])

  const sendPasswordReset = useCallback(async (email: string, next?: string | null) => {
    const address = email.trim().toLowerCase()
    try {
      const { data } = await callAccountEmail({ kind: 'reset', email: address, next: next ?? null })
      if (data.sent || !data.fallback) return
    } catch (e) {
      const code = (e as { code?: string }).code ?? ''
      if (code.endsWith('invalid-argument')) throw Object.assign(new Error('That doesn’t look like an email address.'), { code: 'auth/invalid-email' })
      console.warn('Hyber email not sent, using Firebase’s', e)
    }
    await sendPasswordResetEmail(auth, address, { url: continueUrl(`/login?email=${encodeURIComponent(address)}`) })
  }, [])

  const changePassword = useCallback(async (current: string | null, next: string) => {
    const u = auth.currentUser
    if (!u?.email) throw new Error('Sign in first.')
    const hasPassword = u.providerData.some((p) => p.providerId === 'password')
    if (hasPassword) {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current ?? ''))
      await updatePassword(u, next)
    } else {
      // A Google account gets a password too, for signing in where Google isn't handy.
      await linkWithCredential(u, EmailAuthProvider.credential(u.email, next))
      setProviders(u.providerData.map((p) => p.providerId))
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
    const needsVerification = !!user && !verified
    return {
      status,
      user,
      email: user?.email ? emailKey(user.email) : null,
      needsVerification,
      methods: signInMethods(providers),
      isSuperAdmin: current?.isSuperAdmin ?? false,
      memberships: current?.memberships ?? [],
      ready: status === 'signedOut' || needsVerification || current !== null,
      signIn,
      signInWithPassword,
      signUp,
      sendVerification,
      checkVerified,
      sendPasswordReset,
      changePassword,
      signOut,
      refresh,
    }
  }, [status, user, verified, providers, access, signIn, signInWithPassword, signUp, sendVerification, checkVerified, sendPasswordReset, changePassword, signOut, refresh])

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
