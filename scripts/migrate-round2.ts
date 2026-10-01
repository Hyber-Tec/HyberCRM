/**
 * Round 2 data migration (one role per person, branch business rules, no master
 * schedule). Safe to run more than once. Dry run unless `--apply` is given.
 *
 *   npx tsx scripts/migrate-round2.ts --step add [--apply]      # before deploying round 2
 *   npx tsx scripts/migrate-round2.ts --step cleanup [--apply]  # after deploying it
 *
 * `add` writes the new fields next to the old ones, so the deployed app keeps
 * working until the new one is live; `cleanup` then removes the old fields.
 * Talks to production with the gcloud login (FIRESTORE_EMULATOR_HOST → emulator).
 */
import { parseArgs } from 'node:util'
import { PAY_MODEL_SINCE_START, type BusinessRules } from '../shared/src/settings/businessRules'
import { roleFromLegacy } from '../shared/src/roles'
import { type Patch, deleteDocuments, listDocuments, patchDocuments } from './lib/firestore-rest'

const { values } = parseArgs({ options: { step: { type: 'string' }, apply: { type: 'boolean', default: false } } })
const step = values.step
if (step !== 'add' && step !== 'cleanup') {
  console.error('Usage: npx tsx scripts/migrate-round2.ts --step add|cleanup [--apply]')
  process.exit(1)
}

/** Settings keys that moved to `businessRules` or were dropped. */
const MOVED_SETTINGS = ['payroll.payModel', 'payroll.adminStaffSingleRate', 'schedule.maxConcurrentStudentsPerTutor', 'students.conference']

const get = (obj: unknown, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)

/** What a branch ran with before round 2 (True Education's defaults unless overridden). */
function rulesFromSettings(settings: unknown): BusinessRules {
  const model = get(settings, 'payroll.payModel')
  const max = Number(get(settings, 'schedule.maxConcurrentStudentsPerTutor'))
  const cycle = Number(get(settings, 'students.conference.cycleHours'))
  return {
    payModels: [{ model: model === undefined || model === 'teaching_admin_split' || model === 'single_rate' ? 'teaching_admin' : 'teaching_only', from: PAY_MODEL_SINCE_START }],
    maxStudentsPerTutor: Number.isInteger(max) && max >= 1 ? max : 3,
    conferences: { enabled: true, everyHours: cycle > 0 ? cycle : 25 },
  }
}

const patches: Patch[] = []
const deletes: string[] = []
const branches = await listDocuments('branches')

for (const b of branches) {
  const base = b.path
  const members = await listDocuments(`${base}/members`)
  const staff = await listDocuments(`${base}/staff`)
  const roleByStaff = new Map<string, string>()

  for (const m of members) {
    const role = (m.data.role as string | undefined) ?? roleFromLegacy(m.data.roles as string[] | undefined, m.data.isOwner === true)
    if (m.data.staffId && role) roleByStaff.set(String(m.data.staffId), role)
    if (step === 'add' && !m.data.role && role) {
      patches.push({ path: m.path, set: { role } })
      console.log(`member ${b.id}/${m.id}: ${JSON.stringify(m.data.roles)}${m.data.isOwner ? ' +owner' : ''} → ${role}`)
    }
    if (step === 'cleanup' && ('roles' in m.data || 'isOwner' in m.data)) {
      patches.push({ path: m.path, remove: ['roles', 'isOwner'] })
      console.log(`member ${b.id}/${m.id}: remove roles/isOwner`)
    }
  }

  for (const s of staff) {
    const legacy = (s.data.roles as string[] | undefined) ?? []
    const linked = roleByStaff.get(s.id)
    const role = (s.data.role as string | undefined) ?? (linked && ['owner', 'admin', 'tutor'].includes(linked) ? linked : legacy.includes('admin') ? 'admin' : 'tutor')
    if (step === 'add' && !s.data.role) {
      patches.push({ path: s.path, set: { role } })
      console.log(`staff ${b.id}/${s.id} (${s.data.name}): ${JSON.stringify(legacy)} → ${role}`)
    }
    if (step === 'cleanup' && 'roles' in s.data) {
      patches.push({ path: s.path, remove: ['roles'] })
      console.log(`staff ${b.id}/${s.id}: remove roles`)
    }
  }

  if (step === 'add' && !b.data.businessRules) {
    const rules = rulesFromSettings(b.data.settings)
    patches.push({ path: base, set: { businessRules: rules } })
    console.log(`branch ${b.id}: businessRules ${JSON.stringify(rules)}`)
  }
  if (step === 'cleanup') {
    const present = MOVED_SETTINGS.filter((k) => get(b.data.settings, k) !== undefined).map((k) => `settings.${k}`)
    if (present.length) {
      patches.push({ path: base, remove: present })
      console.log(`branch ${b.id}: remove ${present.join(', ')}`)
    }
  }

  // The master schedule is gone.
  if (step === 'add') {
    for (const col of ['masterSessions', 'masterAvailability', 'masterDayConfigs']) {
      for (const d of await listDocuments(`${base}/${col}`)) {
        deletes.push(d.path)
        console.log(`delete ${d.path}`)
      }
    }
  }
}

console.log(`\n${patches.length} updates, ${deletes.length} deletes${values.apply ? '' : ' (dry run; add --apply to write)'}`)
if (values.apply) {
  await patchDocuments(patches)
  await deleteDocuments(deletes)
  console.log('done')
}
