import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
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

let env: RulesTestEnvironment

const A = 'alpha-academy'
const B = 'beta-academy'

function user(email: string, uid = email.split('@')[0]) {
  return env.authenticatedContext(uid, { email, email_verified: true }).firestore()
}

const member = (email: string, role: string, extra: Record<string, unknown> = {}) => ({
  email,
  displayName: email.split('@')[0],
  role,
  status: 'active',
  staffId: null,
  studentId: null,
  studentIds: [],
  restrictions: [],
  uid: null,
  ...extra,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hyber',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'platformAdmins/super@hyber.test'), { email: 'super@hyber.test' })
    for (const b of [A, B]) {
      await setDoc(doc(db, `branches/${b}`), { name: b, status: 'active', timezone: 'America/New_York', settings: {} })
      await setDoc(doc(db, `branches/${b}/public/profile`), {
        name: b,
        status: 'active',
        signupEnabled: true,
        signupRoles: ['tutor', 'parent', 'student'],
      })
    }
    await setDoc(doc(db, `branches/${A}/members/owner@a.test`), member('owner@a.test', 'owner'))
    await setDoc(doc(db, `branches/${A}/members/admin@a.test`), member('admin@a.test', 'admin'))
    await setDoc(
      doc(db, `branches/${A}/members/limited@a.test`),
      member('limited@a.test', 'admin', { restrictions: ['payRates'] }),
    )
    await setDoc(doc(db, `branches/${A}/members/tutor@a.test`), member('tutor@a.test', 'tutor', { staffId: 'staff-tutor' }))
    await setDoc(doc(db, `branches/${A}/members/paused@a.test`), member('paused@a.test', 'tutor', { status: 'disabled' }))
    await setDoc(doc(db, `branches/${A}/staff/staff-tutor`), { name: 'Tutor', role: 'tutor' })
    await setDoc(doc(db, `branches/${A}/staff/staff-other`), { name: 'Other', role: 'tutor' })
    await setDoc(doc(db, `branches/${A}/staff/staff-tutor/private/compensation`), { rates: { teaching: 30, admin: 20 } })
    await setDoc(doc(db, `branches/${A}/staff/staff-other/private/compensation`), { rates: { teaching: 31, admin: 21 } })
    await setDoc(doc(db, `branches/${A}/students/s1`), { name: 'Student One' })
    await setDoc(doc(db, `branches/${A}/students/s1/private/profile`), { parents: [] })
    await setDoc(doc(db, `branches/${B}/members/admin@b.test`), member('admin@b.test', 'admin'))
  })
})

describe('branch isolation', () => {
  it('anyone can read the public profile, nobody else the branch', async () => {
    const anon = env.unauthenticatedContext().firestore()
    await assertSucceeds(getDoc(doc(anon, `branches/${A}/public/profile`)))
    await assertFails(getDoc(doc(anon, `branches/${A}`)))
  })

  it('members read their own branch only', async () => {
    const tutor = user('tutor@a.test')
    await assertSucceeds(getDoc(doc(tutor, `branches/${A}`)))
    await assertFails(getDoc(doc(tutor, `branches/${B}`)))
    await assertFails(getDoc(doc(user('admin@b.test'), `branches/${A}/students/s1`)))
  })

  it('paused members and suspended branches are closed', async () => {
    await assertFails(getDoc(doc(user('paused@a.test'), `branches/${A}`)))
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `branches/${A}`), { status: 'suspended' })
    })
    await assertFails(getDoc(doc(user('tutor@a.test'), `branches/${A}`)))
    await assertSucceeds(getDoc(doc(user('super@hyber.test'), `branches/${A}`)))
  })

  it('super admins read every branch', async () => {
    const sa = user('super@hyber.test')
    await assertSucceeds(getDoc(doc(sa, `branches/${B}`)))
    await assertSucceeds(getDoc(doc(sa, `branches/${A}/staff/staff-other/private/compensation`)))
  })

  it('unverified emails get nothing', async () => {
    const db = env.authenticatedContext('x', { email: 'tutor@a.test', email_verified: false }).firestore()
    await assertFails(getDoc(doc(db, `branches/${A}`)))
  })
})

describe('membership', () => {
  it('finds my own memberships by email, not other people’s', async () => {
    const tutor = user('tutor@a.test')
    await assertSucceeds(getDocs(query(collectionGroup(tutor, 'members'), where('email', '==', 'tutor@a.test'))))
    await assertFails(getDocs(query(collectionGroup(tutor, 'members'), where('email', '==', 'owner@a.test'))))
  })

  it('people link their own account but cannot change their role', async () => {
    const tutor = user('tutor@a.test', 'uid-tutor')
    const ref = doc(tutor, `branches/${A}/members/tutor@a.test`)
    await assertSucceeds(updateDoc(ref, { uid: 'uid-tutor', lastLoginAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { role: 'admin' }))
    await assertFails(updateDoc(ref, { uid: 'someone-else' }))
  })

  it('admins add tutors; only owners add admins', async () => {
    const admin = user('admin@a.test')
    await assertSucceeds(setDoc(doc(admin, `branches/${A}/members/new@a.test`), member('new@a.test', 'tutor')))
    await assertFails(setDoc(doc(admin, `branches/${A}/members/boss@a.test`), member('boss@a.test', 'admin')))
    await assertSucceeds(setDoc(doc(user('owner@a.test'), `branches/${A}/members/boss@a.test`), member('boss@a.test', 'admin')))
  })

  it('only owners make owners, and only the super admin removes one', async () => {
    await assertFails(setDoc(doc(user('admin@a.test'), `branches/${A}/members/o2@a.test`), member('o2@a.test', 'owner')))
    await assertSucceeds(setDoc(doc(user('owner@a.test'), `branches/${A}/members/o2@a.test`), member('o2@a.test', 'owner')))
    await assertFails(deleteDoc(doc(user('owner@a.test'), `branches/${A}/members/o2@a.test`)))
    await assertSucceeds(deleteDoc(doc(user('super@hyber.test'), `branches/${A}/members/o2@a.test`)))
  })

  it('a member has exactly one valid role', async () => {
    await assertFails(setDoc(doc(user('owner@a.test'), `branches/${A}/members/x2@a.test`), member('x2@a.test', 'teacher')))
    await assertFails(setDoc(doc(user('owner@a.test'), `branches/${A}/members/x3@a.test`), { ...member('x3@a.test', 'tutor'), role: null }))
  })

  it('member docs must be keyed by their email', async () => {
    await assertFails(setDoc(doc(user('owner@a.test'), `branches/${A}/members/x@a.test`), member('y@a.test', 'tutor')))
  })

  it('tutors cannot manage members', async () => {
    await assertFails(setDoc(doc(user('tutor@a.test'), `branches/${A}/members/z@a.test`), member('z@a.test', 'tutor')))
  })
})

describe('people and pay', () => {
  it('tutors read their own staff record and pay, not colleagues’', async () => {
    const tutor = user('tutor@a.test')
    await assertSucceeds(getDoc(doc(tutor, `branches/${A}/staff/staff-tutor`)))
    await assertFails(getDoc(doc(tutor, `branches/${A}/staff/staff-other`)))
    await assertSucceeds(getDoc(doc(tutor, `branches/${A}/staff/staff-tutor/private/compensation`)))
    await assertFails(getDoc(doc(tutor, `branches/${A}/staff/staff-other/private/compensation`)))
  })

  it('restricted admins cannot see pay rates', async () => {
    await assertFails(getDoc(doc(user('limited@a.test'), `branches/${A}/staff/staff-other/private/compensation`)))
    await assertSucceeds(getDoc(doc(user('admin@a.test'), `branches/${A}/staff/staff-other/private/compensation`)))
  })

  it('tutors see students but not their private profile', async () => {
    const tutor = user('tutor@a.test')
    await assertSucceeds(getDoc(doc(tutor, `branches/${A}/students/s1`)))
    await assertFails(getDoc(doc(tutor, `branches/${A}/students/s1/private/profile`)))
  })

  it('tutors edit only allowed fields of their own record', async () => {
    const tutor = user('tutor@a.test')
    await assertSucceeds(updateDoc(doc(tutor, `branches/${A}/staff/staff-tutor`), { phone: '555' }))
    await assertFails(updateDoc(doc(tutor, `branches/${A}/staff/staff-tutor`), { role: 'admin' }))
  })
})

describe('sign-up requests', () => {
  const request = (email: string, uid: string, extra: Record<string, unknown> = {}) => ({
    email,
    uid,
    requestedRole: 'parent',
    firstName: 'Pat',
    lastName: 'Lee',
    phone: '',
    message: '',
    studentNames: 'Kid Lee',
    status: 'pending',
    ...extra,
  })

  it('anyone signed in can request access for their own email', async () => {
    const stranger = user('pat@x.test', 'uid-pat')
    await assertSucceeds(setDoc(doc(stranger, `branches/${A}/signupRequests/pat@x.test`), request('pat@x.test', 'uid-pat')))
    await assertFails(setDoc(doc(stranger, `branches/${A}/signupRequests/other@x.test`), request('other@x.test', 'uid-pat')))
    await assertFails(
      setDoc(doc(stranger, `branches/${B}/signupRequests/pat@x.test`), request('pat@x.test', 'uid-pat', { status: 'approved' })),
    )
  })

  it('closed sign-up pages refuse requests', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `branches/${A}/public/profile`), { signupEnabled: false })
    })
    await assertFails(
      setDoc(doc(user('pat@x.test', 'uid-pat'), `branches/${A}/signupRequests/pat@x.test`), request('pat@x.test', 'uid-pat')),
    )
  })
})

describe('audit log', () => {
  const entry = (email: string) => ({ actorEmail: email, at: serverTimestamp(), action: 'test', summary: 'x' })

  it('is append-only and readable by admins only', async () => {
    const admin = user('admin@a.test')
    const ref = doc(admin, `branches/${A}/auditLog/e1`)
    await assertSucceeds(setDoc(ref, entry('admin@a.test')))
    await assertFails(updateDoc(ref, { summary: 'changed' }))
    await assertFails(setDoc(doc(admin, `branches/${A}/auditLog/e2`), entry('someone@else.test')))
    await assertFails(getDoc(doc(user('tutor@a.test'), `branches/${A}/auditLog/e1`)))
  })
})
