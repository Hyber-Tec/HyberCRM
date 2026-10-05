import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collectionGroup, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const B = 'alpha-academy'
let env: RulesTestEnvironment

/** A signed-in account; `verified: false` is a password account that hasn't confirmed its email yet. */
const user = (uid: string, email: string, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified }).firestore()

const device = (email: string, extra: Record<string, unknown> = {}) => ({
  token: 'fcm-token-123',
  email,
  platform: 'ios',
  appVersion: '1.0.0 (1)',
  label: 'Apple iPhone 17 Pro, iOS 27.0',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hyber',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(async () => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, `branches/${B}`), { name: B, status: 'active', timezone: 'America/New_York', settings: {} })
    await setDoc(doc(db, `branches/${B}/members/tutor@a.test`), { email: 'tutor@a.test', role: 'tutor', status: 'active', staffId: 's-tutor', restrictions: [] })
    await setDoc(doc(db, `users/u-other/devices/d1`), device('other@a.test'))
    await setDoc(doc(db, `users/u-tutor/private/accountEmails`), { verify: [], reset: [] })
  })
})

describe('email and password accounts', () => {
  it('an unconfirmed email reaches nothing in a branch, even with a member doc', async () => {
    const db = user('u-tutor', 'tutor@a.test', false)
    await assertFails(getDoc(doc(db, `branches/${B}`)))
    await assertFails(getDoc(doc(db, `branches/${B}/members/tutor@a.test`)))
    await assertFails(getDocs(query(collectionGroup(db, 'members'), where('email', '==', 'tutor@a.test'))))
  })

  it('once confirmed, the same account is in', async () => {
    const db = user('u-tutor', 'tutor@a.test')
    await assertSucceeds(getDoc(doc(db, `branches/${B}`)))
    await assertSucceeds(getDocs(query(collectionGroup(db, 'members'), where('email', '==', 'tutor@a.test'))))
  })

  it('the server-only account email limits are closed to everyone', async () => {
    await assertFails(getDoc(doc(user('u-tutor', 'tutor@a.test'), 'users/u-tutor/private/accountEmails')))
    await assertFails(setDoc(doc(user('u-tutor', 'tutor@a.test'), 'users/u-tutor/private/accountEmails'), { verify: [] }))
  })
})

describe('phone devices', () => {
  it('people register, read and remove their own phone', async () => {
    const db = user('u-tutor', 'tutor@a.test')
    await assertSucceeds(setDoc(doc(db, 'users/u-tutor/devices/install-1'), device('tutor@a.test')))
    await assertSucceeds(getDoc(doc(db, 'users/u-tutor/devices/install-1')))
    await assertSucceeds(deleteDoc(doc(db, 'users/u-tutor/devices/install-1')))
  })

  it('a device carries the signed-in email, nothing else and nothing extra', async () => {
    const db = user('u-tutor', 'tutor@a.test')
    await assertFails(setDoc(doc(db, 'users/u-tutor/devices/install-1'), device('someone@else.test')))
    await assertFails(setDoc(doc(db, 'users/u-tutor/devices/install-1'), device('tutor@a.test', { admin: true })))
    await assertFails(setDoc(doc(db, 'users/u-tutor/devices/install-1'), device('tutor@a.test', { platform: 'web' })))
    await assertFails(setDoc(doc(db, 'users/u-tutor/devices/install-1'), device('tutor@a.test', { token: '' })))
  })

  it('nobody reads or writes someone else’s devices', async () => {
    const db = user('u-tutor', 'tutor@a.test')
    await assertFails(getDoc(doc(db, 'users/u-other/devices/d1')))
    await assertFails(deleteDoc(doc(db, 'users/u-other/devices/d1')))
    await assertFails(setDoc(doc(db, 'users/u-other/devices/d2'), device('tutor@a.test')))
  })

  it('an unconfirmed account can’t register a phone', async () => {
    await assertFails(setDoc(doc(user('u-tutor', 'tutor@a.test', false), 'users/u-tutor/devices/install-1'), device('tutor@a.test')))
  })
})
