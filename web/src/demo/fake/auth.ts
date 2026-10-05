/**
 * Stand-in for `firebase/auth` in the demo build: the visitor is always signed
 * in as the demo center's owner. Signing out is a no-op (the demo can't be left
 * from inside); see `src/demo/data.ts` for who that owner is.
 */

export interface DemoUser {
  uid: string
  email: string
  displayName: string
  photoURL: string | null
  emailVerified: boolean
  isAnonymous: boolean
  providerData: unknown[]
  getIdToken: () => Promise<string>
}

const auth: { currentUser: DemoUser | null; app: unknown } = { currentUser: null, app: null }
const observers = new Set<(u: DemoUser | null) => void>()

export function getAuth() {
  return auth
}

export function connectAuthEmulator() {}

/** Called once by the demo entry before the app renders. */
export function signInDemoUser(user: { uid: string; email: string; displayName: string }) {
  auth.currentUser = {
    ...user,
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    providerData: [{ providerId: 'google.com', email: user.email }],
    getIdToken: async () => 'demo',
  }
  for (const o of observers) o(auth.currentUser)
}

export function onAuthStateChanged(_auth: unknown, next: (u: DemoUser | null) => void) {
  observers.add(next)
  queueMicrotask(() => observers.has(next) && next(auth.currentUser))
  return () => void observers.delete(next)
}

export async function signInWithPopup() {
  return { user: auth.currentUser }
}

export async function signInWithRedirect() {}

export async function signInWithCredential() {
  return { user: auth.currentUser }
}

export async function signOut() {}

export class GoogleAuthProvider {
  static credential(idToken?: string | null) {
    return { providerId: 'google.com', idToken }
  }

  setCustomParameters() {
    return this
  }

  addScope() {
    return this
  }
}

/** Email and password: the demo is already signed in, so these explain that instead of acting. */
const NOT_IN_DEMO = 'This works in your own center. The demo is signed in already and doesn’t change sign-in details.'
const notInDemo = async (..._args: unknown[]): Promise<never> => {
  throw Object.assign(new Error(NOT_IN_DEMO), { code: 'auth/operation-not-allowed' })
}

export const signInWithEmailAndPassword = notInDemo
export const createUserWithEmailAndPassword = notInDemo
export const sendEmailVerification = notInDemo
export const sendPasswordResetEmail = notInDemo
export const reauthenticateWithCredential = notInDemo
export const updatePassword = notInDemo
export const linkWithCredential = notInDemo
export const applyActionCode = notInDemo
export const checkActionCode = notInDemo
export const verifyPasswordResetCode = notInDemo
export const confirmPasswordReset = notInDemo
export async function updateProfile() {}
export async function reload() {}

export class EmailAuthProvider {
  static credential(email: string, password: string) {
    return { providerId: 'password', email, password }
  }
}
