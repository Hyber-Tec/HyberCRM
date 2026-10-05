import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { db } from './app'
import {
  type LiveContext,
  type LiveData,
  type LiveDemoBranchFields,
  type LiveRange,
  type LiveUnit,
  type LiveWindows,
  type LiveWrite,
  NIGHTLY_LOCAL_HOUR,
  applyUnits,
  dailyChangeDue,
  describePlan,
  liveToday,
  nightlyWindows,
  planNightly,
  planTick,
  tickWindows,
} from '@shared/demo/live'
import { COL, ROOT } from '@shared/paths'
import { resolveBusinessRules } from '@shared/settings/businessRules'
import { resolveSettings } from '@shared/settings/resolve'
import { isValidTimeZone, minutesOf } from '@shared/time'
import type { Branch } from '@shared/types'

/**
 * The live demo (`@shared/demo/live`): keeps branches with `liveDemo: true` (only the Super Admin sets it; Demo
 * Academy) running by themselves. The nightly run fills availability and sessions ahead and settles the past week;
 * the 15-minute tick clocks tutors in and out, writes today's logs, makes the test tutor's daily schedule change
 * (which the session triggers turn into a real notification) and posts Monday's news (the announcement trigger
 * notifies the tutors). Each branch runs in its own time zone; one bad document only skips its own unit.
 */

type LiveBranch = Branch & LiveDemoBranchFields

async function liveBranches() {
  const snap = await db.collection(ROOT.branches).where('liveDemo', '==', true).get()
  return snap.docs.map((d) => ({ id: d.id, branch: d.data() as LiveBranch })).filter((b) => b.branch.status === 'active')
}

function contextOf(branchId: string, branch: LiveBranch, now: Date): LiveContext {
  return {
    branchId,
    timezone: isValidTimeZone(branch.timezone) ? branch.timezone : 'America/New_York',
    settings: resolveSettings(branch.settings),
    rules: resolveBusinessRules(branch.businessRules),
    now,
  }
}

const rows = <T>(snap: FirebaseFirestore.QuerySnapshot, extra?: (d: FirebaseFirestore.QueryDocumentSnapshot) => Record<string, unknown>) =>
  snap.docs.map((d) => ({ ...d.data(), id: d.id, ...(extra?.(d) ?? {}) }) as T)

/** The snapshot the planner reads: people, catalogs, and the dated collections inside the job's windows. */
async function load(branchId: string, branch: LiveBranch, win: LiveWindows, withSubjects: boolean): Promise<LiveData> {
  const base = `${ROOT.branches}/${branchId}`
  const dated = (col: string, r: LiveRange) => db.collection(`${base}/${col}`).where('dateKey', '>=', r.from).where('dateKey', '<=', r.to).get()
  const [staff, students, subjects, dayConfigs, availability, sessions, shifts, open] = await Promise.all([
    db.collection(`${base}/${COL.staff}`).get(),
    db.collection(`${base}/${COL.students}`).get(),
    withSubjects ? db.collection(`${base}/${COL.subjects}`).get() : null,
    dated(COL.dayConfigs, win.dayConfigs),
    dated(COL.availability, win.availability),
    dated(COL.sessions, win.sessions),
    dated(COL.clockShifts, win.shifts),
    db.collection(`${base}/${COL.openShifts}`).get(),
  ])
  return {
    staff: rows(staff),
    students: rows(students),
    subjects: subjects ? subjects.docs.map((d) => ({ id: d.id, name: String(d.get('name') ?? '') })) : [],
    dayConfigs: rows(dayConfigs, (d) => ({ dateKey: d.get('dateKey') ?? d.id })),
    availability: rows(availability),
    // The update time goes along, so settling or moving a session someone just changed is skipped.
    sessions: rows(sessions, (d) => ({ version: d.updateTime })),
    shifts: rows(shifts, (d) => ({ version: d.updateTime })),
    openShifts: open.docs.map((d) => ({ staffId: d.id, shiftId: String(d.get('shiftId') ?? '') })),
    state: branch.liveDemoState ?? null,
  }
}

/** Drops `undefined` (Firestore refuses it) from plain objects and arrays; dates and field values pass through. */
function clean(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clean)
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, clean(x)]))
  }
  return v
}

/** One batch with the Admin SDK: creates fail on existing documents, updates on missing or changed ones. */
async function commitWrites(writes: LiveWrite[]) {
  const batch = db.batch()
  for (const w of writes) {
    if (w.op === 'add') {
      batch.create(db.collection(w.path).doc(), clean(w.data) as FirebaseFirestore.DocumentData)
      continue
    }
    const ref = db.doc(w.path)
    if (w.op === 'create') batch.create(ref, clean(w.data) as FirebaseFirestore.DocumentData)
    else if (w.op === 'set') batch.set(ref, clean(w.data) as FirebaseFirestore.DocumentData)
    else if (w.op === 'delete') batch.delete(ref)
    else {
      const data = clean(w.data) as Record<string, unknown>
      for (const [field, n] of Object.entries(w.increment ?? {})) data[field] = FieldValue.increment(n)
      if (w.ifVersion instanceof Timestamp) batch.update(ref, data, { lastUpdateTime: w.ifVersion })
      else batch.update(ref, data)
    }
  }
  await batch.commit()
}

async function apply(branchId: string, job: string, units: LiveUnit[]) {
  return applyUnits(units, commitWrites, (unit, error) => logger.warn(`Live demo ${job}: skipped ${unit.key}`, { branchId, error: String(error) }))
}

/**
 * Hourly; each branch's nightly run happens in its own 1 AM hour: availability through 6 weeks ahead, sessions
 * through 3 weeks ahead, and the past week settled (logs, no-shows, shifts).
 */
export const demoLiveNightly = onSchedule({ schedule: '10 * * * *', timeZone: 'UTC', timeoutSeconds: 540, memory: '512MiB' }, async () => {
  const now = new Date()
  for (const { id, branch } of await liveBranches()) {
    try {
      const ctx = contextOf(id, branch, now)
      if (Math.floor(minutesOf(now, ctx.timezone) / 60) !== NIGHTLY_LOCAL_HOUR) continue
      const { today } = liveToday(ctx)
      const plan = planNightly(ctx, await load(id, branch, nightlyWindows(today), true))
      const result = await apply(id, 'nightly', plan.units)
      logger.info(`Live demo nightly: ${describePlan(plan)}`, { branchId: id, today, ...plan.counts, ...result })
    } catch (e) {
      logger.error('Live demo nightly failed', { branchId: id, error: String(e) })
    }
  }
})

/**
 * Every 15 minutes: tutors clock in a little before their first session and out after their last, today's logs
 * appear shortly after sessions end, the test tutor's schedule changes once on most weekday mornings, and Monday
 * morning's post goes out.
 */
export const demoLiveTick = onSchedule({ schedule: 'every 15 minutes', timeZone: 'UTC', timeoutSeconds: 300 }, async () => {
  const now = new Date()
  for (const { id, branch } of await liveBranches()) {
    try {
      const ctx = contextOf(id, branch, now)
      const { today } = liveToday(ctx)
      // The subject list is only needed for the day's new session.
      const plan = planTick(ctx, await load(id, branch, tickWindows(today), dailyChangeDue(ctx, branch.liveDemoState ?? null)))
      if (!plan.units.length) continue
      const result = await apply(id, 'tick', plan.units)
      logger.info(`Live demo tick: ${describePlan(plan)}`, { branchId: id, today, notes: plan.notes, ...plan.counts, ...result })
    } catch (e) {
      logger.error('Live demo tick failed', { branchId: id, error: String(e) })
    }
  }
})
