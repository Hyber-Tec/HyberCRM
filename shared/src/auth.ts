/**
 * Signing in with an email and a password (owner, 2026-10-04: other emails besides Google accounts), next to
 * Google, which stays the recommended way. The website and the phone app share these rules and words.
 *
 * Access never depends on how someone signed in: a branch's member doc is keyed by the email, and the rules
 * read it only from a verified email (`email_verified`), so a password account must confirm its address
 * before it sees anything. Google accounts are verified by Google.
 */

/** Firebase accepts 6; Hyber asks for 8. */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

/** Why a new password can't be used, or null when it can. */
export function passwordProblem(password: string, email?: string | null): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`
  if (/^\s|\s$/.test(password)) return 'Remove the spaces at the start or end.'
  if (/^(.)\1+$/.test(password)) return 'Use more than one repeated character.'
  const local = (email ?? '').split('@')[0]?.toLowerCase() ?? ''
  if (local.length >= 4 && password.toLowerCase() === local) return 'Don’t use your email name as the password.'
  if (password.toLowerCase() === (email ?? '').toLowerCase()) return 'Don’t use your email as the password.'
  return null
}

/** A rough strength for the meter under a new password: 0 (too short) to 4 (strong). */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (password.length < PASSWORD_MIN_LENGTH) return 0
  let kinds = 0
  if (/[a-z]/.test(password)) kinds++
  if (/[A-Z]/.test(password)) kinds++
  if (/\d/.test(password)) kinds++
  if (/[^A-Za-z0-9]/.test(password)) kinds++
  const long = password.length >= 12 ? 1 : 0
  return Math.min(4, Math.max(1, kinds - 1 + long)) as 1 | 2 | 3 | 4
}

export const PASSWORD_STRENGTH_LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'] as const

/** A plausible email address (the server has the final word). */
export function looksLikeEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
}

/** Gmail addresses are Google accounts: for them, "Continue with Google" is the obvious way in. */
export function isGoogleMailbox(email: string): boolean {
  return /@(gmail|googlemail)\.com$/i.test(email.trim())
}

export type AuthAction = 'sign-in' | 'sign-up' | 'google' | 'reset' | 'change-password' | 'verify'

/** Firebase Auth error codes in plain words. Unknown codes fall back to a generic line. */
export function authErrorMessage(code: string | undefined | null, action: AuthAction = 'sign-in'): string {
  const c = (code ?? '').replace(/^auth\//, '')
  switch (c) {
    case 'invalid-credential':
    case 'invalid-login-credentials':
    case 'wrong-password':
    case 'user-not-found':
      return action === 'change-password' ? 'Your current password isn’t right.' : 'That email and password don’t match. Check them, or reset your password.'
    case 'invalid-email':
      return 'That doesn’t look like an email address.'
    case 'missing-password':
      return 'Enter your password.'
    case 'email-already-in-use':
      return 'There’s already an account with this email. Sign in instead, or reset the password if you forgot it.'
    case 'weak-password':
    case 'password-does-not-meet-requirements':
      return `Choose a stronger password (at least ${PASSWORD_MIN_LENGTH} characters).`
    case 'too-many-requests':
      return 'Too many tries. Wait a few minutes, then try again.'
    case 'user-disabled':
      return 'This account has been turned off. Contact your center.'
    case 'network-request-failed':
      return 'No connection. Check your internet and try again.'
    case 'requires-recent-login':
      return 'For your security, sign in again, then try once more.'
    case 'account-exists-with-different-credential':
      return 'This email already signs in with a password. Sign in with your email and password instead.'
    case 'credential-already-in-use':
      return 'That account is already linked to another sign-in.'
    case 'operation-not-allowed':
      return action === 'google' ? 'Google sign-in isn’t turned on for Hyber CRM yet.' : 'Signing in with a password isn’t turned on for Hyber CRM yet.'
    case 'expired-action-code':
      return 'This link has expired. Ask for a new one.'
    case 'invalid-action-code':
      return 'This link has already been used or isn’t valid anymore. Ask for a new one.'
    case 'popup-blocked':
      return 'Your browser blocked the Google window. Allow pop-ups for this site and try again.'
    case 'unauthorized-domain':
      return 'Sign-in isn’t allowed from this address.'
    case 'internal-error':
      return 'Something went wrong on our side. Try again in a moment.'
    default:
      return action === 'reset'
        ? 'Couldn’t send the email. Try again in a moment.'
        : action === 'sign-up'
          ? 'Couldn’t create the account. Try again in a moment.'
          : 'Couldn’t sign you in. Try again in a moment.'
  }
}

/** How an account signs in, from Firebase's provider ids. */
export interface SignInMethods {
  google: boolean
  password: boolean
}

export function signInMethods(providerIds: readonly string[]): SignInMethods {
  return { google: providerIds.includes('google.com'), password: providerIds.includes('password') }
}

/** The page that handles links in account emails (verify the email, reset the password): `{APP_URL}/auth/action`. */
export const AUTH_ACTION_PATH = '/auth/action'

/** What an account email is for. */
export type AccountEmailKind = 'verify' | 'reset'

/** The query of a URL or path as a map (no `URL` object: shared code also runs in React Native). */
export function queryParams(urlOrQuery: string): Map<string, string> {
  const q = urlOrQuery.includes('?') ? urlOrQuery.slice(urlOrQuery.indexOf('?') + 1) : urlOrQuery
  const out = new Map<string, string>()
  for (const part of q.split('#')[0].split('&')) {
    if (!part) continue
    const [k, v = ''] = part.split('=')
    try {
      out.set(decodeURIComponent(k.replace(/\+/g, ' ')), decodeURIComponent(v.replace(/\+/g, ' ')))
    } catch {
      // A malformed pair is left out.
    }
  }
  return out
}

/** Turns the link Firebase makes into one for Hyber's own page, keeping the one-time code. */
export function accountActionUrl(firebaseLink: string, appUrl: string, next?: string | null): string {
  const from = queryParams(firebaseLink)
  const pairs: string[] = []
  for (const key of ['mode', 'oobCode', 'lang']) {
    const v = from.get(key)
    if (v) pairs.push(`${key}=${encodeURIComponent(v)}`)
  }
  if (next && next.startsWith('/') && !next.startsWith('//')) pairs.push(`next=${encodeURIComponent(next)}`)
  return `${appUrl.replace(/\/+$/, '')}${AUTH_ACTION_PATH}?${pairs.join('&')}`
}
