/**
 * The demo logins for Demo Academy (owner, 2026-10-04): a tutor, a parent and a student who sign in with an email
 * and a password, for trying the phone app and the website as those people, and later for the App Store's
 * reviewers. They are the sample center's own people: Maya Thompson (tutor), Ava Patel (student) and Ava's parent.
 *
 *   DEMO_PASSWORD='…' npx tsx scripts/demo-accounts.ts            # the real project (gcloud login)
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     DEMO_PASSWORD='…' npx tsx scripts/demo-accounts.ts         # the practice copy (emulators)
 *
 * The password is never in the repository (it is public): it comes from DEMO_PASSWORD, or the owner's git-ignored
 * HyberCRM_Demo_Accounts.md, whose "Password:" line the script reads.
 */
import { existsSync, readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { newMemberData } from '../shared/src/branchFactory'
import { DEMO_ACCOUNTS } from '../shared/src/demo/accounts'
import { COL, DOC, ROOT } from '../shared/src/paths'
import { upsertPasswordUser } from './lib/auth-rest'
import { commit, getDocument, patchDocuments } from './lib/firestore-rest'

const { values } = parseArgs({ options: { branch: { type: 'string', default: 'demo-academy' } } })
const branchId = values.branch!

function password(): string {
  if (process.env.DEMO_PASSWORD) return process.env.DEMO_PASSWORD
  const file = new URL('../HyberCRM_Demo_Accounts.md', import.meta.url).pathname
  const m = existsSync(file) ? /Password:\s*`?([^`\s]+)`?/.exec(readFileSync(file, 'utf8')) : null
  if (m) return m[1]
  throw new Error('Set DEMO_PASSWORD (or put "Password: …" in HyberCRM_Demo_Accounts.md).')
}

async function main() {
  const pw = password()
  if (!(await getDocument(`${ROOT.branches}/${branchId}`))) throw new Error(`Branch ${branchId} doesn't exist. Seed it first (npm run seed).`)
  const now = new Date()
  for (const a of DEMO_ACCOUNTS) {
    // The parent's name comes from the student's record, so the sample stays consistent.
    let displayName = a.displayName
    if (a.role === 'parent' && a.studentIds?.[0]) {
      const priv = await getDocument(`${ROOT.branches}/${branchId}/${COL.students}/${a.studentIds[0]}/private/${DOC.privateProfile}`)
      const parent = (priv?.parents as { name?: string }[] | undefined)?.[0]?.name
      if (parent) displayName = parent
    }
    const { uid, created } = await upsertPasswordUser({ email: a.email, password: pw, displayName })
    const memberPath = `${ROOT.branches}/${branchId}/${COL.members}/${a.email}`
    const existing = await getDocument(memberPath)
    const fields = { role: a.role, status: 'active', displayName, staffId: a.staffId ?? null, studentId: a.studentId ?? null, studentIds: a.studentIds ?? [], updatedAt: now, updatedBy: 'demo-accounts' }
    if (existing) await patchDocuments([{ path: memberPath, set: fields }])
    else
      await commit([
        {
          path: memberPath,
          data: { ...newMemberData({ email: a.email, displayName, role: a.role, staffId: a.staffId, studentId: a.studentId, studentIds: a.studentIds, createdBy: 'demo-accounts' }), createdAt: now, updatedAt: now },
        },
      ])
    // The tutor's employee record shows the login email.
    if (a.staffId) await patchDocuments([{ path: `${ROOT.branches}/${branchId}/${COL.staff}/${a.staffId}`, set: { email: a.email, updatedAt: now, updatedBy: 'demo-accounts' } }]).catch(() => undefined)
    console.log(`${created ? '+' : '='} ${a.role.padEnd(7)} ${a.email}  (${displayName}, uid ${uid})`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
