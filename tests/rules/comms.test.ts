import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const B = 'alpha-academy'
const P = `branches/${B}/announcements`
let env: RulesTestEnvironment

const user = (email: string) => env.authenticatedContext(email.split('@')[0], { email, email_verified: true }).firestore()

const post = (extra: Record<string, unknown> = {}) => ({
  title: 'Hello',
  contentHtml: '<p>Hi</p>',
  contentText: 'Hi',
  category: 'General',
  audienceType: 'all',
  audienceKeys: [],
  commentsEnabled: true,
  pinned: false,
  pinnedAt: null,
  archived: false,
  notifyRequestedAt: null,
  attachments: [],
  authorKey: 'admin@a.test',
  authorName: 'Admin',
  readCount: 0,
  commentCount: 0,
  ...extra,
})

const receipt = (email: string, announcementId: string) => ({ email, name: email, branchId: B, announcementId, readAt: serverTimestamp() })
const comment = (email: string, text = 'Nice') => ({ authorKey: email, authorName: email, authorRole: 'tutor', text, createdAt: serverTimestamp() })

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
    const m = (email: string, roles: string[]) => ({ email, roles, status: 'active', staffId: null, restrictions: [] })
    await setDoc(doc(db, `branches/${B}/members/admin@a.test`), m('admin@a.test', ['admin']))
    await setDoc(doc(db, `branches/${B}/members/tutor@a.test`), m('tutor@a.test', ['tutor']))
    await setDoc(doc(db, `branches/${B}/members/other@a.test`), m('other@a.test', ['tutor']))
    await setDoc(doc(db, `branches/${B}/members/parent@a.test`), m('parent@a.test', ['parent']))
    await setDoc(doc(db, `${P}/everyone`), post())
    await setDoc(doc(db, `${P}/for-tutor`), post({ audienceType: 'members', audienceKeys: ['tutor@a.test'] }))
    await setDoc(doc(db, `${P}/for-other`), post({ audienceType: 'members', audienceKeys: ['other@a.test'], commentsEnabled: false }))
    await setDoc(doc(db, `${P}/no-comments`), post({ commentsEnabled: false }))
    await setDoc(doc(db, `${P}/everyone/comments/c-other`), { ...comment('other@a.test'), createdAt: new Date() })
    await setDoc(doc(db, `branches/${B}/notifications/n1`), { recipientKey: 'tutor@a.test', type: 'announcement', title: 'New', body: '', link: '', refs: {}, readAt: null, createdAt: new Date() })
  })
})

describe('announcements', () => {
  it('tutors read posts for everyone and posts addressed to them', async () => {
    const db = user('tutor@a.test')
    await assertSucceeds(getDocs(query(collection(db, P), where('audienceType', '==', 'all'))))
    await assertSucceeds(getDocs(query(collection(db, P), where('audienceKeys', 'array-contains', 'tutor@a.test'))))
    await assertSucceeds(getDoc(doc(db, `${P}/for-tutor`)))
    await assertFails(getDoc(doc(db, `${P}/for-other`)))
    await assertFails(getDocs(collection(db, P)))
  })

  it('parents see no announcements', async () => {
    await assertFails(getDocs(query(collection(user('parent@a.test'), P), where('audienceType', '==', 'all'))))
  })

  it('admins publish with zero counters and cannot touch them later', async () => {
    const db = user('admin@a.test')
    await assertSucceeds(setDoc(doc(db, `${P}/new`), post()))
    await assertFails(setDoc(doc(db, `${P}/bad`), post({ readCount: 5 })))
    await assertFails(setDoc(doc(db, `${P}/bad2`), post({ authorKey: 'someone@else.test' })))
    await assertFails(setDoc(doc(db, `${P}/bad3`), post({ audienceType: 'members', audienceKeys: [] })))
    await assertSucceeds(updateDoc(doc(db, `${P}/everyone`), { pinned: true }))
    await assertFails(updateDoc(doc(db, `${P}/everyone`), { readCount: 9 }))
    await assertFails(setDoc(doc(user('tutor@a.test'), `${P}/t`), post({ authorKey: 'tutor@a.test' })))
  })

  it('read receipts are written once, by the reader, for posts they can see', async () => {
    const db = user('tutor@a.test')
    await assertSucceeds(setDoc(doc(db, `${P}/everyone/reads/tutor@a.test`), receipt('tutor@a.test', 'everyone')))
    await assertFails(setDoc(doc(db, `${P}/everyone/reads/tutor@a.test`), receipt('tutor@a.test', 'everyone')))
    await assertFails(setDoc(doc(db, `${P}/everyone/reads/other@a.test`), receipt('other@a.test', 'everyone')))
    await assertFails(setDoc(doc(db, `${P}/for-other/reads/tutor@a.test`), receipt('tutor@a.test', 'for-other')))
    await assertSucceeds(getDocs(query(collectionGroup(db, 'reads'), where('email', '==', 'tutor@a.test'))))
    await assertFails(getDocs(query(collectionGroup(db, 'reads'), where('email', '==', 'other@a.test'))))
    await assertSucceeds(getDocs(collection(user('admin@a.test'), `${P}/everyone/reads`)))
    await assertFails(getDocs(collection(db, `${P}/everyone/reads`)))
  })

  it('comments follow the post’s setting; authors and admins delete', async () => {
    const tutor = user('tutor@a.test')
    await assertSucceeds(addDoc(collection(tutor, `${P}/everyone/comments`), comment('tutor@a.test')))
    await assertFails(addDoc(collection(tutor, `${P}/no-comments/comments`), comment('tutor@a.test')))
    await assertFails(addDoc(collection(tutor, `${P}/everyone/comments`), comment('other@a.test')))
    await assertFails(addDoc(collection(tutor, `${P}/for-other/comments`), comment('tutor@a.test')))
    await assertSucceeds(addDoc(collection(user('admin@a.test'), `${P}/no-comments/comments`), comment('admin@a.test')))
    await assertFails(deleteDoc(doc(tutor, `${P}/everyone/comments/c-other`)))
    await assertSucceeds(deleteDoc(doc(user('other@a.test'), `${P}/everyone/comments/c-other`)))
  })
})

describe('notifications', () => {
  it('people read, mark read and delete only their own items', async () => {
    const db = user('tutor@a.test')
    const col = collection(db, `branches/${B}/notifications`)
    await assertSucceeds(getDocs(query(col, where('recipientKey', '==', 'tutor@a.test'))))
    await assertFails(getDocs(query(collection(user('other@a.test'), `branches/${B}/notifications`), where('recipientKey', '==', 'tutor@a.test'))))
    await assertSucceeds(updateDoc(doc(col, 'n1'), { readAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(col, 'n1'), { title: 'Changed' }))
    await assertFails(addDoc(col, { recipientKey: 'tutor@a.test', type: 'announcement', title: 'Fake' }))
    await assertFails(deleteDoc(doc(collection(user('other@a.test'), `branches/${B}/notifications`), 'n1')))
    await assertSucceeds(deleteDoc(doc(col, 'n1')))
  })
})
