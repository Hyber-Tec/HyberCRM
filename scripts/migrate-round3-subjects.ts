/**
 * Round 3: every branch gets the default subject list (125 subjects in 7
 * categories). Only what's missing is added, matched by name ignoring case, so
 * a branch's own, renamed or extra subjects stay as they are. A branch still
 * on the old sample subjects (IDs `demo-…`) is moved to the default ones: its
 * staff, students, sessions and session logs point at the new subjects, the
 * sample's two extras move to an "Other" category, and the old docs are deleted.
 * Safe to run more than once. Dry run unless `--apply`.
 *
 *   npx tsx scripts/migrate-round3-subjects.ts [--apply]
 *
 * Talks to production with the gcloud login (FIRESTORE_EMULATOR_HOST → emulator).
 */
import { parseArgs } from 'node:util'
import { COL } from '../shared/src/paths'
import { defaultSubjectDocs, subjectSlug } from '../shared/src/subjects'
import { type Patch, type Write, commit, deleteDocuments, listDocuments, patchDocuments } from './lib/firestore-rest'

const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } })
const now = new Date()
const BY = 'migration'

/** Old sample subject → default (or extra) subject name. PSAT splits by section, so it goes by the tutor. */
const OLD_SAMPLE: Record<string, string | ((tutorId: string | null) => string)> = {
  'SAT Math': 'SAT Math',
  'SAT Reading & Writing': 'SAT R/W',
  PSAT: (tutorId) => (tutorId === 'demo-hannah-becker' ? 'PSAT R/W' : 'PSAT Math'),
  'ACT Math': 'ACT Math',
  'ACT English': 'ACT English',
  'ACT Science': 'ACT Science',
  'Pre-Algebra': 'Pre-Algebra',
  'Algebra 1': 'Algebra 1',
  Geometry: 'Geometry',
  'Algebra 2': 'Algebra 2',
  'Pre-Calculus': 'Precalculus',
  'AP Calculus AB': 'AP Calculus AB',
  'AP Statistics': 'AP Statistics',
  'Reading Comprehension': 'Middle School English',
  Grammar: 'Middle School English',
  'Essay Writing': 'High School English',
  Biology: 'Biology',
  Chemistry: 'Chemistry',
  Physics: 'Physics',
  'Homework Help': 'Homework Help',
  'Study Skills': 'Study Skills',
}
const EXTRAS = { category: 'Other', subjects: ['Homework Help', 'Study Skills'] }

const lower = (s: unknown) => String(s ?? '').trim().toLowerCase()
const catalog = defaultSubjectDocs()
const creates: Write[] = []
const patches: Patch[] = []
const deletes: string[] = []

for (const b of await listDocuments('branches')) {
  const base = b.path
  const categories = await listDocuments(`${base}/${COL.subjectCategories}`)
  const subjects = await listDocuments(`${base}/${COL.subjects}`)
  const oldSample = subjects.length > 0 && subjects.every((s) => s.id.startsWith('demo-'))
  // The old sample catalog is replaced, so it doesn't count as existing.
  const keptCats = oldSample ? [] : categories
  const keptSubjects = oldSample ? [] : subjects

  // Categories: reuse a same-named one, else add the default.
  const catIdByName = new Map(keptCats.map((c) => [lower(c.data.name), c.id]))
  let catOrder = keptCats.length
  const categoryIdFor = (name: string, defaultId: string, defaultOrder: number) => {
    const found = catIdByName.get(lower(name))
    if (found) return found
    const id = keptCats.some((c) => c.id === defaultId) ? `${defaultId}-${Date.now()}` : defaultId
    creates.push({ path: `${base}/${COL.subjectCategories}/${id}`, data: { name, order: keptCats.length ? catOrder++ : defaultOrder } })
    catIdByName.set(lower(name), id)
    return id
  }

  // Subjects: never duplicate a name.
  const subjectIdByName = new Map(keptSubjects.map((s) => [lower(s.data.name), s.id]))
  const nextOrder = new Map<string, number>()
  for (const s of keptSubjects) nextOrder.set(String(s.data.categoryId), Math.max(nextOrder.get(String(s.data.categoryId)) ?? 0, Number(s.data.order ?? 0) + 1))
  let added = 0
  const addSubject = (name: string, categoryId: string, order: number) => {
    if (subjectIdByName.has(lower(name))) return
    const id = subjectSlug(name)
    const finalId = keptSubjects.some((s) => s.id === id) ? `${id}-${Date.now()}` : id
    const at = keptSubjects.length ? (nextOrder.get(categoryId) ?? 0) : order
    nextOrder.set(categoryId, at + 1)
    creates.push({ path: `${base}/${COL.subjects}/${finalId}`, data: { name, categoryId, order: at, createdAt: now, createdBy: BY, updatedAt: now, updatedBy: BY } })
    subjectIdByName.set(lower(name), finalId)
    added++
  }
  for (const c of catalog.categories) {
    const categoryId = categoryIdFor(c.name, c.id, c.order)
    for (const s of catalog.subjects.filter((x) => x.categoryId === c.id)) addSubject(s.name, categoryId, s.order)
  }

  if (oldSample) {
    const extraCat = categoryIdFor(EXTRAS.category, subjectSlug(EXTRAS.category), catalog.categories.length)
    EXTRAS.subjects.forEach((name, i) => addSubject(name, extraCat, i))
    const oldName = new Map(subjects.map((s) => [s.id, String(s.data.name)]))
    const newIdFor = (oldId: string, tutorId: string | null) => {
      const to = OLD_SAMPLE[oldName.get(oldId) ?? '']
      const name = typeof to === 'function' ? to(tutorId) : to
      return name ? { id: subjectIdByName.get(lower(name)) ?? null, name } : null
    }
    const remapIds = (ids: unknown, tutorId: string | null) =>
      [...new Set(((ids as string[] | undefined) ?? []).map((id) => (id.startsWith('demo-') ? (newIdFor(id, tutorId)?.id ?? null) : id)).filter(Boolean))] as string[]

    for (const st of await listDocuments(`${base}/${COL.staff}`)) {
      if ((st.data.subjectIds as string[] | undefined)?.some((id) => id.startsWith('demo-'))) patches.push({ path: st.path, set: { subjectIds: remapIds(st.data.subjectIds, st.id) } })
    }
    for (const s of await listDocuments(`${base}/${COL.students}`)) {
      if ((s.data.subjectIds as string[] | undefined)?.some((id) => id.startsWith('demo-'))) patches.push({ path: s.path, set: { subjectIds: remapIds(s.data.subjectIds, null) } })
    }
    const renamed = new Map<string, string>()
    for (const s of await listDocuments(`${base}/${COL.sessions}`)) {
      const oldId = String(s.data.subjectId ?? '')
      if (!oldId.startsWith('demo-')) continue
      const to = newIdFor(oldId, String(s.data.tutorId ?? ''))
      if (!to?.id) continue
      patches.push({ path: s.path, set: { subjectId: to.id, subject: to.name } })
      renamed.set(s.id, to.name)
    }
    for (const l of await listDocuments(`${base}/${COL.sessionLogs}`)) {
      const name = renamed.get(l.id)
      if (name && l.data.subject !== name) patches.push({ path: l.path, set: { subject: name } })
    }
    for (const s of subjects) deletes.push(s.path)
    for (const c of categories) if (c.id.startsWith('demo-')) deletes.push(c.path)
    console.log(`${b.id}: old sample subjects → default list (${renamed.size} sessions remapped, ${subjects.length} old subjects removed)`)
  }

  if (added) {
    creates.push({
      path: `${base}/${COL.auditLog}/round3-subjects`,
      data: {
        at: now, actorUid: 'migration', actorEmail: BY, actorName: 'Hyber CRM', actorRole: 'system',
        action: 'subject.import_defaults', category: 'settings', entityType: 'subject', entityId: 'defaults',
        summary: `Added the default subject list (${added} subjects)`, context: '', dateKey: null, studentId: null, studentName: null,
        tutorId: null, tutorName: null, changes: [], via: 'function',
      },
    })
  }
  console.log(`${b.id}: ${added} default subjects to add`)
}

console.log(`\n${creates.length} writes, ${patches.length} updates, ${deletes.length} deletes`)
if (!values.apply) {
  console.log('Dry run. Re-run with --apply to write.')
} else {
  await commit(creates)
  await patchDocuments(patches)
  await deleteDocuments(deletes)
  console.log('Applied.')
}
