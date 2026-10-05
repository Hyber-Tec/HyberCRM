/**
 * Runs the live demo for a branch now: what the demoLiveNightly and demoLiveTick Cloud Functions do (see
 * shared/src/demo/live.ts), through the REST API. Use it for the first fill after scripts/demo-reset.ts, or to
 * pretend another day.
 *
 *   npx tsx scripts/demo-live.ts                                   # Demo Academy: the nightly run, then the tick
 *   npx tsx scripts/demo-live.ts --dry-run                         # only print what it would write
 *   npx tsx scripts/demo-live.ts --job tick                        # only the 15-minute tick
 *   npx tsx scripts/demo-live.ts --date 2026-10-12 --time 09:50    # pretend another day and time (branch time)
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/demo-live.ts   # the emulators
 *
 * Production uses the developer's gcloud login. Only branches with `liveDemo: true` run (demo-reset sets it), unless
 * --force. A pretended day is written as if it happened (logs, shifts), with real write times in the audit log.
 */
import { parseArgs } from 'node:util'
import { type LivePlan, applyUnits, describePlan, liveToday, nightlyWindows, planNightly, planTick, tickWindows } from '../shared/src/demo/live'
import { ROOT } from '../shared/src/paths'
import { formatMinutes, isDateKey, minutesOf, parseHHMM, toInstant, todayKey } from '../shared/src/time'
import { getDocument } from './lib/firestore-rest'
import { TARGET, commitLive, liveContext, loadLiveData } from './lib/live-rest'

const { values } = parseArgs({
  options: {
    branch: { type: 'string', default: 'demo-academy' },
    date: { type: 'string' },
    time: { type: 'string' },
    job: { type: 'string', default: 'all' },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false },
  },
})

/** The nightly's new sessions per day, e.g. "Mon 10/26: 23". */
function sessionsByDay(plan: LivePlan): string {
  const days = new Map<string, number>()
  for (const u of plan.units) {
    const m = u.kind === 'session' ? /-s-(\d{4}-\d{2}-\d{2})-/.exec(u.key) : null
    if (m) days.set(m[1], (days.get(m[1]) ?? 0) + 1)
  }
  return [...days.entries()].map(([d, n]) => `${d.slice(5)}: ${n}`).join(', ')
}

async function main() {
  const branchId = values.branch!
  const dry = values['dry-run']!
  const jobs = values.job === 'all' ? (['nightly', 'tick'] as const) : values.job === 'nightly' || values.job === 'tick' ? ([values.job] as const) : null
  if (!jobs) throw new Error('--job must be all, nightly or tick.')
  const branch = await getDocument(`${ROOT.branches}/${branchId}`)
  if (!branch) throw new Error(`Branch ${branchId} doesn't exist.`)
  if (branch.liveDemo !== true && !values.force) throw new Error(`${branchId} isn't a live demo (liveDemo isn't true). Run scripts/demo-reset.ts first, or pass --force.`)

  const real = new Date()
  const tz = liveContext(branchId, branch, real, real).timezone
  const date = values.date ?? todayKey(tz, real)
  if (!isDateKey(date)) throw new Error(`--date must be YYYY-MM-DD, not ${date}.`)
  const minutes = values.time !== undefined ? parseHHMM(values.time) : minutesOf(real, tz)
  if (Number.isNaN(minutes)) throw new Error(`--time must be HH:MM, not ${values.time}.`)
  const pretend = values.date !== undefined || values.time !== undefined
  const now = pretend ? toInstant(date, minutes, tz) : real

  console.log(`Live demo for ${branchId} (${String(branch.name)}) on ${TARGET}`)
  console.log(`As of ${date} ${formatMinutes(minutes)} (${tz})${pretend ? ', pretended' : ''}${dry ? ', dry run: nothing is written' : ''}`)

  for (const job of jobs) {
    // Read again for each job: the nightly may have moved the state on.
    const fresh = (await getDocument(`${ROOT.branches}/${branchId}`))!
    const ctx = liveContext(branchId, fresh, now, real)
    const { today } = liveToday(ctx)
    const data = await loadLiveData(branchId, (fresh.liveDemoState as never) ?? null, job === 'nightly' ? nightlyWindows(today) : tickWindows(today))
    const plan = job === 'nightly' ? planNightly(ctx, data) : planTick(ctx, data)
    const writes = plan.units.reduce((n, u) => n + u.writes.length, 0)
    console.log(`\n${job === 'nightly' ? 'Nightly' : 'Tick'}: ${describePlan(plan)} (${plan.units.length} units, ${writes} writes)`)
    if (job === 'nightly' && plan.counts.session) console.log(`  new sessions by day: ${sessionsByDay(plan)}`)
    for (const n of plan.notes) console.log(`  · ${n}`)
    if (values.verbose) for (const u of plan.units) console.log(`    ${u.key}`)
    if (dry || !plan.units.length) continue
    const result = await applyUnits(plan.units, commitLive, (u, e) => console.log(`  ! skipped ${u.key}: ${String(e).slice(0, 200)}`))
    console.log(`  applied ${result.applied} units${result.skipped ? `, skipped ${result.skipped}` : ''}`)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
