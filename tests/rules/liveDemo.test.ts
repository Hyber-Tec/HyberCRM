import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// The live demo switch (`liveDemo`) and the planner's progress (`liveDemoState`) belong to the Super Admin and the
// server: a branch's own admins and owners can't turn a branch into a self-running demo.

let env: RulesTestEnvironment
const B = 'demo-academy'
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')

const user = (email: string) => env.authenticatedContext(email.split('@')[0], { email, email_verified: true }).firestore()
const member = (email: string, role: string) => ({ email, displayName: email, role, status: 'active', staffId: null, studentId: null, studentIds: [], restrictions: [], uid: null })

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hyber',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host, port: Number(port) },
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
    await setDoc(doc(db, `branches/${B}`), { name: 'Demo Academy', status: 'active', timezone: 'America/New_York', settings: {}, liveDemo: false })
    await setDoc(doc(db, `branches/${B}/members/owner@b.test`), member('owner@b.test', 'owner'))
    await setDoc(doc(db, `branches/${B}/members/admin@b.test`), member('admin@b.test', 'admin'))
  })
})

describe('live demo switch', () => {
  it('only the Super Admin turns a branch into a live demo', async () => {
    for (const email of ['owner@b.test', 'admin@b.test']) {
      const db = user(email)
      await assertFails(updateDoc(doc(db, `branches/${B}`), { liveDemo: true, updatedAt: serverTimestamp() }))
      await assertFails(updateDoc(doc(db, `branches/${B}`), { liveDemoState: { changeDate: '2026-10-05' }, updatedAt: serverTimestamp() }))
      // Their own fields still work.
      await assertSucceeds(updateDoc(doc(db, `branches/${B}`), { name: 'Demo Academy', updatedAt: serverTimestamp() }))
    }
    await assertSucceeds(updateDoc(doc(user('super@hyber.test'), `branches/${B}`), { liveDemo: true }))
  })
})
