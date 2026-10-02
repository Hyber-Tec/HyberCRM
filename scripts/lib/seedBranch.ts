import { newBranchData, newMemberData, publicProfileFor } from '../../shared/src/branchFactory'
import { createHash } from 'node:crypto'
import { DEMO_BUSINESS_RULES, DEMO_KIOSK_PINS, buildDemoData } from '../../shared/src/demo/seed'
import { defaultSubjectDocs } from '../../shared/src/subjects'
import { COL, DOC, ROOT } from '../../shared/src/paths'
import type { Role } from '../../shared/src/roles'
import { todayKey } from '../../shared/src/time'
import { type Write, commit, getDocument } from './firestore-rest'

export interface SeedBranchOptions {
  branchId: string
  name: string
  timezone: string
  superAdmin: string
  sample: boolean
  /** Extra documents (tests), with paths relative to the branch. */
  extraDocs?: { path: string; data: Record<string, unknown> }[]
  /** Extra member docs (tests). */
  members?: { email: string; role: Role; staffId?: string; studentId?: string; studentIds?: string[] }[]
  log?: (line: string) => void
}

export async function seedBranch(opts: SeedBranchOptions) {
  const log = opts.log ?? console.log
  const now = new Date()
  const writes: Write[] = []
  const superAdmin = opts.superAdmin.trim().toLowerCase()

  if (!(await getDocument(`${ROOT.platformAdmins}/${superAdmin}`))) {
    writes.push({ path: `${ROOT.platformAdmins}/${superAdmin}`, data: { email: superAdmin, name: '', addedAt: now, addedBy: 'seed' } })
    log(`+ Super Admin ${superAdmin}`)
  }

  const branchPath = `${ROOT.branches}/${opts.branchId}`
  const existing = await getDocument(branchPath)
  const timezone = (existing?.timezone as string | undefined) ?? opts.timezone
  if (!existing) {
    const data = {
      ...newBranchData({ name: opts.name, timezone, createdBy: superAdmin, businessRules: opts.sample ? DEMO_BUSINESS_RULES : undefined }),
      createdAt: now,
      updatedAt: now,
    }
    writes.push({ path: branchPath, data })
    writes.push({ path: `${branchPath}/${COL.public}/${DOC.publicProfile}`, data: { ...publicProfileFor(data) } })
    writes.push({
      path: `${branchPath}/${COL.auditLog}/branch-created`,
      data: {
        at: now, actorUid: 'seed', actorEmail: superAdmin, actorName: 'Seed script', actorRole: 'system',
        action: 'branch.create', category: 'settings', entityType: 'branch', entityId: opts.branchId,
        summary: `Created the branch ${opts.name}`, context: '', dateKey: null, studentId: null, studentName: null,
        tutorId: null, tutorName: null, changes: [], via: 'function',
      },
    })
    log(`+ Branch ${opts.branchId} (${opts.name}, ${timezone})`)
    // Every branch starts with its own copy of the default subject list (sample data writes it too).
    if (!opts.sample) {
      const catalog = defaultSubjectDocs()
      for (const c of catalog.categories) writes.push({ path: `${branchPath}/${COL.subjectCategories}/${c.id}`, data: { name: c.name, order: c.order } })
      for (const s of catalog.subjects) {
        writes.push({
          path: `${branchPath}/${COL.subjects}/${s.id}`,
          data: { name: s.name, categoryId: s.categoryId, order: s.order, createdAt: now, createdBy: superAdmin, updatedAt: now, updatedBy: superAdmin },
        })
      }
      log(`+ Default subjects (${catalog.subjects.length})`)
    }
  } else {
    log(`= Branch ${opts.branchId} already exists`)
  }

  if (opts.sample) {
    const maxStudentsPerTutor = Number((existing?.businessRules as { maxStudentsPerTutor?: number } | undefined)?.maxStudentsPerTutor) || DEMO_BUSINESS_RULES.maxStudentsPerTutor
    const docs = buildDemoData({ branchId: opts.branchId, timezone, today: todayKey(timezone), createdBy: superAdmin, now, maxStudentsPerTutor })
    writes.push(...docs)
    // Demo kiosk PINs (hashed exactly like the setKioskPin function).
    for (const [staffId, pin] of Object.entries(DEMO_KIOSK_PINS)) {
      const hash = createHash('sha256').update(`hyber-kiosk:${opts.branchId}:${pin}`).digest('hex')
      writes.push({ path: `${branchPath}/kioskPins/${hash}`, data: { staffId, updatedAt: now } })
      writes.push({ path: `${branchPath}/kioskPinOwners/${staffId}`, data: { pinHash: hash, updatedAt: now, updatedBy: 'seed' } })
      const staffDoc = writes.find((w) => w.path === `${branchPath}/${COL.staff}/${staffId}`)
      if (staffDoc) staffDoc.data.hasKioskPin = true
    }
    log(`+ ${docs.length} sample documents`)
  }

  for (const d of opts.extraDocs ?? []) writes.push({ path: `${branchPath}/${d.path}`, data: d.data })
  for (const m of opts.members ?? []) {
    writes.push({
      path: `${branchPath}/${COL.members}/${m.email}`,
      data: {
        ...newMemberData({
          email: m.email,
          displayName: m.email.split('@')[0],
          role: m.role,
          staffId: m.staffId ?? null,
          studentId: m.studentId ?? null,
          studentIds: m.studentIds ?? [],
          createdBy: superAdmin,
        }),
        createdAt: now,
        updatedAt: now,
      },
    })
  }

  await commit(writes)
  log(`  wrote ${writes.length} documents`)
}
