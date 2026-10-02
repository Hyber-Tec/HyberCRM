import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { addDays, dayEndInstant, toInstant, todayKey } from '../../shared/src/time'

const B = 'alpha-academy'
const TZ = 'America/New_York'
let env: RulesTestEnvironment

const user = (email: string) => env.authenticatedContext(email.split('@')[0], { email, email_verified: true }).firestore()

/** A session later today (its day is still open, so admins may change it). */
function session(over: Record<string, unknown> = {}) {
  const d = todayKey(TZ)
  return {
    tutorId: 's-tutor',
    tutorName: 'Tia Tutor',
    studentId: 'st-1',
    studentName: 'Sam Student',
    subject: 'Algebra 2',
    status: 'confirmed',
    dateKey: d,
    startMin: 1380,
    endMin: 1435,
    startAt: Timestamp.fromDate(toInstant(d, 1380, TZ)),
    endAt: Timestamp.fromDate(toInstant(d, 1435, TZ)),
    dayEndAt: Timestamp.fromDate(dayEndInstant(d, TZ)),
    logStatus: 'none',
    isDeleted: false,
    ...over,
  }
}

const draft = (over: Record<string, unknown> = {}) => ({
  sessionId: 'sess-1',
  status: 'draft',
  sessionType: 'School Help',
  topics: [],
  topicCovered: 'Quadratics',
  homeworkStatus: '',
  homeworkComments: '',
  materials: [],
  questionsAttempted: null,
  questionsWrong: null,
  lessonActivity: 'We worked on factoring.',
  learningInsight: '',
  nextFocus: '',
  homeworkGiven: '',
  ratings: {},
  studentFlag: '',
  tutorId: 's-tutor',
  tutorName: 'Tia Tutor',
  studentId: 'st-1',
  studentName: 'Sam Student',
  subject: 'Algebra 2',
  subjectId: null,
  dateKey: todayKey(TZ),
  startMin: 1380,
  endMin: 1435,
  updatedBy: 'tutor@a.test',
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
    await setDoc(doc(db, `branches/${B}`), { name: B, status: 'active', timezone: TZ, settings: { sessionLogs: { tutorsSeeAllLogs: false } } })
    const m = (email: string, role: string, staffId: string | null) => ({ email, role, status: 'active', staffId, restrictions: [] })
    await setDoc(doc(db, `branches/${B}/members/tutor@a.test`), m('tutor@a.test', 'tutor', 's-tutor'))
    await setDoc(doc(db, `branches/${B}/members/other@a.test`), m('other@a.test', 'tutor', 's-other'))
    await setDoc(doc(db, `branches/${B}/members/admin@a.test`), m('admin@a.test', 'admin', null))
    await setDoc(doc(db, `branches/${B}/sessions/sess-1`), session())
    await setDoc(doc(db, `branches/${B}/sessions/sess-logged`), session({ status: 'present', logStatus: 'submitted' }))
  })
})

describe('session log drafts', () => {
  it('the session’s tutor and admins save drafts with the log’s own fields', async () => {
    await assertSucceeds(setDoc(doc(user('tutor@a.test'), `branches/${B}/sessionLogs/sess-1`), draft()))
    await assertSucceeds(setDoc(doc(user('admin@a.test'), `branches/${B}/sessionLogs/sess-1`), draft({ updatedBy: 'admin@a.test' }), { merge: true }))
  })

  it('a draft can’t carry other fields, claim to be submitted, or belong to another tutor', async () => {
    const tutor = user('tutor@a.test')
    await assertFails(setDoc(doc(tutor, `branches/${B}/sessionLogs/sess-1`), draft({ usedHours: 5 })))
    await assertFails(setDoc(doc(tutor, `branches/${B}/sessionLogs/sess-1`), draft({ enteredByAdmin: { email: 'x', name: 'x' } })))
    await assertFails(setDoc(doc(tutor, `branches/${B}/sessionLogs/sess-1`), draft({ status: 'submitted' })))
    await assertFails(setDoc(doc(user('other@a.test'), `branches/${B}/sessionLogs/sess-1`), draft()))
  })

  it('a submitted log changes only through the submit function', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `branches/${B}/sessionLogs/sess-1`), { ...draft(), status: 'submitted', usedHours: 1 })
    })
    await assertFails(setDoc(doc(user('admin@a.test'), `branches/${B}/sessionLogs/sess-1`), draft()))
  })
})

describe('reading session logs', () => {
  it('a tutor who may read only their own logs can still open a log that isn’t written yet', async () => {
    await assertSucceeds(getDoc(doc(user('tutor@a.test'), `branches/${B}/sessionLogs/sess-1`)))
  })

  it('but not another tutor’s log', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `branches/${B}/sessionLogs/sess-1`), draft())
    })
    await assertSucceeds(getDoc(doc(user('tutor@a.test'), `branches/${B}/sessionLogs/sess-1`)))
    await assertFails(getDoc(doc(user('other@a.test'), `branches/${B}/sessionLogs/sess-1`)))
  })
})

describe('a session with a submitted log', () => {
  it('stays Present', async () => {
    const admin = user('admin@a.test')
    await assertFails(updateDoc(doc(admin, `branches/${B}/sessions/sess-logged`), { status: 'canceled' }))
    await assertFails(updateDoc(doc(admin, `branches/${B}/sessions/sess-logged`), { status: 'no_show' }))
  })

  it('can still change otherwise, and unlogged sessions change freely', async () => {
    const admin = user('admin@a.test')
    await assertSucceeds(updateDoc(doc(admin, `branches/${B}/sessions/sess-logged`), { note: 'Brought a calculator' }))
    await assertSucceeds(updateDoc(doc(admin, `branches/${B}/sessions/sess-1`), { status: 'canceled' }))
  })
})

describe('session dates', () => {
  it('past days stay locked for admins too', async () => {
    const d = addDays(todayKey(TZ), -1)
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `branches/${B}/sessions/sess-past`),
        session({ dateKey: d, startAt: Timestamp.fromDate(toInstant(d, 900, TZ)), endAt: Timestamp.fromDate(toInstant(d, 960, TZ)), dayEndAt: Timestamp.fromDate(dayEndInstant(d, TZ)) }),
      )
    })
    await assertFails(updateDoc(doc(user('admin@a.test'), `branches/${B}/sessions/sess-past`), { note: 'late change' }))
  })
})
