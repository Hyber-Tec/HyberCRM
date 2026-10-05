import { getAuth } from 'firebase-admin/auth'
import { FieldValue, type Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { type AccountEmailKind, accountActionUrl, looksLikeEmail } from '@shared/auth'
import { APP_URL, PRODUCT_NAME, isReservedEmail } from '@shared/brand'
import { accountEmail } from '@shared/email/account'
import { COL, ROOT, USER_COL } from '@shared/paths'
import { db } from './app'
import { gmailAppPassword, sendMail } from './email'

/**
 * How often each kind may be sent to one account: at most one per `gap`, and `perHour` an hour. A reset can be asked
 * for by anyone who types the address, so the limit also keeps the sending address from being used to flood someone.
 */
const LIMITS: Record<AccountEmailKind, { gapMs: number; perHour: number }> = {
  verify: { gapMs: 30_000, perHour: 6 },
  reset: { gapMs: 30_000, perHour: 5 },
}

/** Records one more email of `kind` for `uid`, unless the limits say wait. */
async function allowed(uid: string, kind: AccountEmailKind): Promise<boolean> {
  const ref = db.doc(`${ROOT.users}/${uid}/${USER_COL.private}/accountEmails`)
  const now = Date.now()
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const sent = ((snap.get(kind) as Timestamp[] | undefined) ?? []).map((t) => t.toMillis()).filter((t) => now - t < 3_600_000)
    const { gapMs, perHour } = LIMITS[kind]
    if (sent.length >= perHour || (sent.length && now - Math.max(...sent) < gapMs)) return false
    tx.set(ref, { [kind]: [...sent, now].map((t) => new Date(t)), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return true
  })
}

const safeNext = (next: unknown): string | null => (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next.slice(0, 300) : null)

/**
 * Hyber's own "Confirm your email" and "Reset your password" emails, sent from HyberTec's address with a link to
 * Hyber's page (`/auth/action`), not Firebase's plain ones.
 * - `verify`: the signed-in caller's own address (a new password account).
 * - `reset`: any address. The answer never says whether an account exists.
 * `{ sent: false, fallback: true }` tells the app to ask Firebase to send its own email instead (the sending
 * password isn't set, or Gmail refused), so nobody is ever left without the link.
 */
export const sendAccountEmail = onCall({ secrets: [gmailAppPassword], maxInstances: 5, timeoutSeconds: 30 }, async (req) => {
  const { kind, email: rawEmail, next } = (req.data ?? {}) as { kind?: string; email?: string; next?: string }
  if (kind !== 'verify' && kind !== 'reset') throw new HttpsError('invalid-argument', 'Unknown email.')
  const auth = getAuth()

  if (kind === 'verify') {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const user = await auth.getUser(req.auth.uid)
    if (!user.email) throw new HttpsError('failed-precondition', 'This account has no email address.')
    if (user.emailVerified) return { sent: false, alreadyVerified: true }
    if (!(await allowed(user.uid, 'verify'))) return { sent: false, throttled: true }
    if (isReservedEmail(user.email)) return { sent: false, fallback: false }
    const link = await auth.generateEmailVerificationLink(user.email, { url: `${APP_URL}/login` })
    const content = accountEmail({ kind, to: user.email, name: user.displayName ?? '', url: accountActionUrl(link, APP_URL, safeNext(next)) })
    const result = await sendMail({ to: user.email, ...content, fromName: PRODUCT_NAME })
    if (result.status !== 'sent') logger.warn('Verification email not sent', { uid: user.uid, status: result.status })
    return { sent: result.status === 'sent', fallback: result.status !== 'sent' }
  }

  const email = (rawEmail ?? '').trim().toLowerCase()
  if (!looksLikeEmail(email)) throw new HttpsError('invalid-argument', 'That doesn’t look like an email address.')
  let uid: string
  let name = ''
  try {
    const user = await auth.getUserByEmail(email)
    uid = user.uid
    name = user.displayName ?? ''
    if (user.disabled) return { sent: true }
  } catch {
    // No account with this address: the same answer as when there is one.
    return { sent: true }
  }
  if (isReservedEmail(email) || !(await allowed(uid, 'reset'))) return { sent: true }
  const link = await auth.generatePasswordResetLink(email, { url: `${APP_URL}/login?email=${encodeURIComponent(email)}` })
  const content = accountEmail({ kind, to: email, name, url: accountActionUrl(link, APP_URL, safeNext(next)) })
  const result = await sendMail({ to: email, ...content, fromName: PRODUCT_NAME })
  if (result.status !== 'sent') logger.warn('Password reset email not sent', { uid, status: result.status })
  return { sent: result.status === 'sent', fallback: result.status !== 'sent' }
})

/**
 * "Delete my account" (Apple asks it of every app where people create accounts, guideline 5.1.1(v)): the sign-in and
 * the personal profile (users/{uid}, with the phone app's devices) go at once. The centers' own records stay theirs:
 * the member docs (their access lists) are only unlinked from the account, and employee, student, session and pay
 * records are untouched, as the privacy policy says. Needs a sign-in within the last 10 minutes. The platform
 * owner's account can't be deleted this way.
 */
export const deleteMyAccount = onCall({ timeoutSeconds: 60 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const { uid, token } = req.auth
  const email = typeof token.email === 'string' ? token.email.toLowerCase() : null
  if (Date.now() / 1000 - Number(token.auth_time ?? 0) > 600) throw new HttpsError('failed-precondition', 'For your security, sign in again, then delete the account.')
  if (email && (await db.doc(`${ROOT.platformAdmins}/${email}`).get()).exists) throw new HttpsError('failed-precondition', 'The platform owner’s account can’t be deleted from the app.')
  if (email) {
    const members = await db.collectionGroup(COL.members).where('email', '==', email).get()
    await Promise.all(members.docs.map((m) => m.ref.update({ uid: null, photoURL: null, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'account-deleted' }).catch(() => undefined)))
  }
  await db.recursiveDelete(db.doc(`${ROOT.users}/${uid}`))
  await getAuth().deleteUser(uid)
  logger.info('Account deleted by its owner', { uid })
  return { ok: true }
})
