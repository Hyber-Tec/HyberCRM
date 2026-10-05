/**
 * A clean restart of a live demo branch (Demo Academy, owner 2026-10-04):
 *
 * 1. removes what the seed and the live demo made for the sample staff from 80 days back on (the seed rewrites Ava
 *    Patel's 78 days of history and two weeks for everyone): their sessions with those sessions' logs, their clock
 *    shifts (and open-shift pointers) and their availability;
 * 2. writes the sample data again (buildDemoData, with the test tutor's last three days left for the owner to log;
 *    subjects the branch already has are kept as they are) and the demo kiosk PINs;
 * 3. sets `liveDemo: true` and clears the planner's progress (`liveDemoState`), so the first run fills every gap;
 * 4. makes sure the demo logins exist (scripts/demo-accounts.ts).
 *
 * Never touched: anyone outside the sample staff, sessions people made (random IDs) and their logs, members,
 * phones, inbox items, announcements and the audit log (append-only). Then fill the days ahead right away with
 * `npx tsx scripts/demo-live.ts`.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx tsx scripts/demo-reset.ts
 *   npx tsx scripts/demo-reset.ts --dry-run      # production: only list what it would remove
 *   npx tsx scripts/demo-reset.ts --yes          # production: do it (gcloud login)
 *
 * The demo logins need DEMO_PASSWORD or the git-ignored HyberCRM_Demo_Accounts.md (see scripts/demo-accounts.ts).
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { DEMO_TEST_TUTOR_STAFF_ID } from '../shared/src/demo/accounts'
import { TEST_TUTOR_OPEN_DAYS, isSampleSessionId, isSampleShiftId, isSampleStaffId } from '../shared/src/demo/live'
import { DEMO_KIOSK_PINS, buildDemoData } from '../shared/src/demo/seed'
import { COL, ROOT } from '../shared/src/paths'
import { addDays, todayKey } from '../shared/src/time'
import { type Write, commit, deleteDocuments, getDocument, patchDocuments } from './lib/firestore-rest'
import { ON_EMULATOR, TARGET, autoId, liveContext, query } from './lib/live-rest'

const { values } = parseArgs({
  options: {
    branch: { type: 'string', default: 'demo-academy' },
    'dry-run': { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
    'super-admin': { type: 'string', default: 'goochoi913@gmail.com' },
    'skip-accounts': { type: 'boolean', default: false },
  },
})

/** Ava Patel's scripted history goes 78 days back; everything the seed rewrites is inside this window. */
const BACK_DAYS = 80

async function main() {
  const branchId = values.branch!
  const dry = values['dry-run']!
  const superAdmin = values['super-admin']!.trim().toLowerCase()
  const base = `${ROOT.branches}/${branchId}`
  const branch = await getDocument(base)
  if (!branch) throw new Error(`Branch ${branchId} doesn't exist. Seed it first (npm run seed).`)
  // Only a sample center: its sample tutor must be there.
  if (!(await getDocument(`${base}/${COL.staff}/${DEMO_TEST_TUTOR_STAFF_ID}`))) throw new Error(`${branchId} has no sample staff (${DEMO_TEST_TUTOR_STAFF_ID}); it isn't a demo branch.`)
  if (!ON_EMULATOR && !values.yes && !dry) throw new Error('This is production: run with --dry-run to see what it does, then with --yes.')

  const now = new Date()
  const ctx = liveContext(branchId, branch, now, now)
  const today = todayKey(ctx.timezone, now)
  const from = addDays(today, -BACK_DAYS)
  const since = { field: 'dateKey', from, to: '9999-12-31' }
  console.log(`Restarting the live demo ${branchId} (${String(branch.name)}) on ${TARGET}`)
  console.log(`Today is ${today} (${ctx.timezone}); sample data from ${from} on is replaced${dry ? '. Dry run: nothing is written.' : '.'}`)

  // 1. What the seed and the planner made for the sample staff.
  const [sessions, shifts, availability, open] = await Promise.all([
    query(`${base}/${COL.sessions}`, since),
    query(`${base}/${COL.clockShifts}`, since),
    query(`${base}/${COL.availability}`, since),
    query(`${base}/${COL.openShifts}`),
  ])
  const goneSessions = sessions.filter((d) => isSampleSessionId(d.id) && isSampleStaffId(String(d.data.tutorId ?? '')))
  const goneShifts = shifts.filter((d) => isSampleShiftId(d.id) && isSampleStaffId(String(d.data.staffId ?? '')))
  const goneShiftIds = new Set(goneShifts.map((d) => d.id))
  const goneOpen = open.filter((d) => goneShiftIds.has(String(d.data.shiftId ?? '')))
  const goneAvailability = availability.filter((d) => isSampleStaffId(String(d.data.staffId ?? '')))
  const kept = sessions.length - goneSessions.length
  console.log(`\nRemove: ${goneSessions.length} sessions (and their logs), ${goneShifts.length} shifts, ${goneOpen.length} open-shift pointers, ${goneAvailability.length} availability days`)
  if (kept) console.log(`Keep: ${kept} sessions people made or of other staff in that window`)

  // 2. The sample data again, as of now.
  const rules = ctx.rules
  const docs = buildDemoData({
    branchId,
    timezone: ctx.timezone,
    today,
    createdBy: superAdmin,
    now,
    maxStudentsPerTutor: rules.maxStudentsPerTutor,
    branchName: String(branch.name ?? 'Demo Academy'),
    week: ctx.settings.schedule.defaultWeek,
    openLogs: { staffId: DEMO_TEST_TUTOR_STAFF_ID, days: TEST_TUTOR_OPEN_DAYS },
  })
  const writes: Write[] = []
  const catalog = new Set((await Promise.all([query(`${base}/${COL.subjects}`), query(`${base}/${COL.subjectCategories}`)])).flat().map((d) => d.path))
  for (const d of docs) if (!catalog.has(d.path)) writes.push(d)
  for (const [staffId, pin] of Object.entries(DEMO_KIOSK_PINS)) {
    // Hashed exactly like the setKioskPin function (functions/src/pins.ts).
    const hash = createHash('sha256').update(`hyber-kiosk:${branchId}:${pin}`).digest('hex')
    writes.push({ path: `${base}/${COL.kioskPins}/${hash}`, data: { staffId, updatedAt: now } })
    writes.push({ path: `${base}/kioskPinOwners/${staffId}`, data: { pinHash: hash, updatedAt: now, updatedBy: 'demo-reset' } })
    const staff = writes.find((w) => w.path === `${base}/${COL.staff}/${staffId}`)
    if (staff) staff.data.hasKioskPin = true
  }
  console.log(`Write: ${writes.length} sample documents (seed as of today)`)
  if (dry) return

  const paths = [
    ...goneSessions.flatMap((d) => [d.path, `${base}/${COL.sessionLogs}/${d.id}`]),
    ...goneShifts.map((d) => d.path),
    ...goneOpen.map((d) => d.path),
    ...goneAvailability.map((d) => d.path),
  ]
  await deleteDocuments(paths)
  console.log(`  removed ${paths.length} documents`)
  await commit(writes, (done, total) => process.stdout.write(`\r  wrote ${done}/${total}`))
  console.log()

  // 3. Live from now on; the planner starts over.
  await patchDocuments([{ path: base, set: { liveDemo: true }, remove: ['liveDemoState'] }])
  await commit([
    {
      path: `${base}/${COL.auditLog}/${autoId()}`,
      data: {
        at: now,
        actorUid: 'demo-reset',
        actorEmail: superAdmin,
        actorName: superAdmin,
        actorRole: 'super_admin',
        action: 'branch.sample_data',
        category: 'settings',
        entityType: 'branch',
        entityId: branchId,
        summary: `Restarted the live demo (removed ${paths.length} and wrote ${writes.length} sample documents)`,
        context: '',
        dateKey: today,
        studentId: null,
        studentName: null,
        tutorId: null,
        tutorName: null,
        changes: [],
        via: 'function',
      },
    },
  ])
  console.log('  liveDemo: true')

  // 4. The demo logins (their own script, so there is one way to make them).
  if (values['skip-accounts']) console.log('\nSkipped the demo logins (--skip-accounts).')
  else if (ON_EMULATOR && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.log('\n! Skipped the demo logins: set FIREBASE_AUTH_EMULATOR_HOST too, or they would be made in the real project.')
  } else {
    console.log('\nDemo logins:')
    const r = spawnSync('npx', ['tsx', 'scripts/demo-accounts.ts', '--branch', branchId], { cwd: new URL('..', import.meta.url).pathname, stdio: 'inherit', env: process.env })
    if (r.status !== 0) throw new Error('The demo logins failed (see above); the sample data is in place. Fix it and run scripts/demo-accounts.ts.')
  }
  console.log('\nNext: fill the days ahead now with  npx tsx scripts/demo-live.ts')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
