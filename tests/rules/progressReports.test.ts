import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const B = 'alpha-academy'
let env: RulesTestEnvironment

const user = (email: string) => env.authenticatedContext(email.split('@')[0], { email, email_verified: true }).firestore()
const R = (id: string) => `branches/${B}/progressReports/${id}`

const report = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  status: 'draft',
  sharedWithParents: false,
  studentId: 'ava',
  studentName: 'Ava Patel',
  generatedBy: { email: 'tutor@a.test', name: 'Tia Tutor', role: 'tutor', staffId: 's-tutor' },
  narrative: { overview: 'Draft text.' },
  narrativeMeta: { source: 'template', sections: {} },
  options: { showStatus: true },
  facts: { attendance: { attended: 3 } },
  customName: null,
  ...over,
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
    const m = (email: string, role: string, extra: Record<string, unknown> = {}) => ({ email, role, status: 'active', staffId: null, studentId: null, studentIds: [], restrictions: [], ...extra })
    await setDoc(doc(db, `branches/${B}/members/admin@a.test`), m('admin@a.test', 'admin'))
    await setDoc(doc(db, `branches/${B}/members/tutor@a.test`), m('tutor@a.test', 'tutor', { staffId: 's-tutor' }))
    await setDoc(doc(db, `branches/${B}/members/other@a.test`), m('other@a.test', 'tutor', { staffId: 's-other' }))
    await setDoc(doc(db, `branches/${B}/members/parent@a.test`), m('parent@a.test', 'parent', { studentIds: ['ava'] }))
    await setDoc(doc(db, `branches/${B}/members/stranger@a.test`), m('stranger@a.test', 'parent', { studentIds: ['noah'] }))
    await setDoc(doc(db, `branches/${B}/members/ava@a.test`), m('ava@a.test', 'student', { studentId: 'ava' }))
    await setDoc(doc(db, R('draft')), report())
    await setDoc(doc(db, R('shared')), report({ status: 'shared', sharedWithParents: true }))
    await setDoc(doc(db, R('admin-draft')), report({ generatedBy: { email: 'admin@a.test', name: 'Ann Admin', role: 'admin', staffId: null } }))
  })
})

describe('who reads progress reports', () => {
  it('families read shared reports of their own student only', async () => {
    await assertSucceeds(getDoc(doc(user('parent@a.test'), R('shared'))))
    await assertFails(getDoc(doc(user('parent@a.test'), R('draft'))))
    await assertFails(getDoc(doc(user('stranger@a.test'), R('shared'))))
    await assertSucceeds(getDoc(doc(user('ava@a.test'), R('shared'))))
    await assertSucceeds(getDocs(query(collection(user('parent@a.test'), `branches/${B}/progressReports`), where('studentId', '==', 'ava'), where('sharedWithParents', '==', true))))
  })

  it('tutors read shared reports and their own drafts', async () => {
    await assertSucceeds(getDoc(doc(user('tutor@a.test'), R('draft'))))
    await assertSucceeds(getDoc(doc(user('other@a.test'), R('shared'))))
    await assertFails(getDoc(doc(user('other@a.test'), R('draft'))))
    await assertFails(getDoc(doc(user('tutor@a.test'), R('admin-draft'))))
    await assertSucceeds(getDocs(query(collection(user('other@a.test'), `branches/${B}/progressReports`), where('sharedWithParents', '==', true))))
    await assertSucceeds(getDocs(query(collection(user('tutor@a.test'), `branches/${B}/progressReports`), where('generatedBy.staffId', '==', 's-tutor'))))
  })
})

describe('changing progress reports', () => {
  it('nobody creates reports directly (the server does)', async () => {
    await assertFails(addDoc(collection(user('admin@a.test'), `branches/${B}/progressReports`), report()))
    await assertFails(addDoc(collection(user('tutor@a.test'), `branches/${B}/progressReports`), report()))
  })

  it('the author and admins edit a draft’s text, switches and name', async () => {
    await assertSucceeds(updateDoc(doc(user('tutor@a.test'), R('draft')), { narrative: { overview: 'Edited.' }, updatedAt: serverTimestamp(), updatedBy: 'tutor@a.test' }))
    await assertSucceeds(updateDoc(doc(user('admin@a.test'), R('draft')), { 'options.showStatus': false, updatedAt: serverTimestamp(), updatedBy: 'admin@a.test' }))
    await assertFails(updateDoc(doc(user('other@a.test'), R('draft')), { narrative: { overview: 'Not mine.' }, updatedAt: serverTimestamp(), updatedBy: 'other@a.test' }))
  })

  it('figures, status and sharing change only on the server', async () => {
    await assertFails(updateDoc(doc(user('admin@a.test'), R('draft')), { facts: { attendance: { attended: 30 } }, updatedAt: serverTimestamp(), updatedBy: 'admin@a.test' }))
    await assertFails(updateDoc(doc(user('admin@a.test'), R('draft')), { status: 'shared', sharedWithParents: true, updatedAt: serverTimestamp(), updatedBy: 'admin@a.test' }))
  })

  it('a shared report is locked; admins may still rename it', async () => {
    await assertFails(updateDoc(doc(user('admin@a.test'), R('shared')), { narrative: { overview: 'Late edit.' }, updatedAt: serverTimestamp(), updatedBy: 'admin@a.test' }))
    await assertSucceeds(updateDoc(doc(user('admin@a.test'), R('shared')), { customName: 'Fall report', updatedAt: serverTimestamp(), updatedBy: 'admin@a.test' }))
    await assertFails(updateDoc(doc(user('tutor@a.test'), R('shared')), { customName: 'Mine', updatedAt: serverTimestamp(), updatedBy: 'tutor@a.test' }))
  })
})

describe('view receipts', () => {
  it('a family member records their own first view of a shared report, once', async () => {
    const parent = user('parent@a.test')
    await assertSucceeds(setDoc(doc(parent, `${R('shared')}/views/parent@a.test`), { viewedAt: serverTimestamp(), role: 'parent' }))
    await assertFails(setDoc(doc(parent, `${R('shared')}/views/parent@a.test`), { viewedAt: serverTimestamp(), role: 'parent' }))
    await assertFails(setDoc(doc(parent, `${R('shared')}/views/someone@else.test`), { viewedAt: serverTimestamp(), role: 'parent' }))
    await assertFails(setDoc(doc(parent, `${R('draft')}/views/parent@a.test`), { viewedAt: serverTimestamp(), role: 'parent' }))
    await assertFails(setDoc(doc(user('stranger@a.test'), `${R('shared')}/views/stranger@a.test`), { viewedAt: serverTimestamp(), role: 'parent' }))
    await assertSucceeds(setDoc(doc(user('ava@a.test'), `${R('shared')}/views/ava@a.test`), { viewedAt: serverTimestamp(), role: 'student' }))
  })
})
