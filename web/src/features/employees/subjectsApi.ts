import { arrayRemove, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { COL } from '@shared/paths'
import { defaultSubjectDocs } from '@shared/subjects'
import type { Subject, SubjectCategory, WithId } from '@shared/types'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'

/**
 * The branch's subject list. Every change writes an audit entry in the same
 * batch; names are unique (ignoring case) within categories and subjects.
 */

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function nameTaken(list: readonly { id: string; name: string }[], name: string, exceptId?: string) {
  return list.some((x) => x.id !== exceptId && same(x.name, name))
}

const audit = (summary: string, entityId: string) => ({ action: 'subject.edit', category: 'settings' as const, entityType: 'subject', entityId, summary })

export async function createCategory(branchId: string, actor: Actor, name: string, order: number) {
  const batch = writeBatch(db)
  const ref = doc(branchCol(branchId, COL.subjectCategories))
  batch.set(ref, { name: name.trim(), order })
  addAudit(batch, branchId, actor, audit(`Added the subject category ${name.trim()}`, ref.id))
  await batch.commit()
}

export async function renameCategory(branchId: string, actor: Actor, c: WithId<SubjectCategory>, name: string) {
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.subjectCategories, c.id), { name: name.trim() })
  addAudit(batch, branchId, actor, { ...audit(`Renamed the subject category ${c.name} to ${name.trim()}`, c.id), changes: [{ field: 'name', label: 'Name', from: c.name, to: name.trim() }] })
  await batch.commit()
}

/** Its subjects move to Uncategorized. */
export async function deleteCategory(branchId: string, actor: Actor, c: WithId<SubjectCategory>, subjects: readonly WithId<Subject>[]) {
  const batch = writeBatch(db)
  batch.delete(branchDocRef(branchId, COL.subjectCategories, c.id))
  for (const s of subjects) if (s.categoryId === c.id) batch.update(branchDocRef(branchId, COL.subjects, s.id), { categoryId: '', updatedAt: serverTimestamp(), updatedBy: actor.email })
  addAudit(batch, branchId, actor, audit(`Deleted the subject category ${c.name}`, c.id))
  await batch.commit()
}

export async function createSubject(branchId: string, actor: Actor, name: string, categoryId: string, order: number) {
  const batch = writeBatch(db)
  const ref = doc(branchCol(branchId, COL.subjects))
  batch.set(ref, {
    name: name.trim(),
    categoryId,
    order,
    createdAt: serverTimestamp(),
    createdBy: actor.email,
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
  addAudit(batch, branchId, actor, { ...audit(`Added the subject ${name.trim()}`, ref.id), action: 'subject.create' })
  await batch.commit()
}

export async function renameSubject(branchId: string, actor: Actor, s: WithId<Subject>, name: string) {
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.subjects, s.id), { name: name.trim(), updatedAt: serverTimestamp(), updatedBy: actor.email })
  addAudit(batch, branchId, actor, { ...audit(`Renamed the subject ${s.name} to ${name.trim()}`, s.id), changes: [{ field: 'name', label: 'Name', from: s.name, to: name.trim() }] })
  await batch.commit()
}

export async function moveSubject(branchId: string, actor: Actor, s: WithId<Subject>, to: { id: string; name: string }, order: number) {
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.subjects, s.id), { categoryId: to.id, order, updatedAt: serverTimestamp(), updatedBy: actor.email })
  addAudit(batch, branchId, actor, audit(`Moved the subject ${s.name} to ${to.name}`, s.id))
  await batch.commit()
}

/** Removes the subject and takes it off every tutor's and student's list (sessions keep the name they were booked with). */
export async function deleteSubject(branchId: string, actor: Actor, s: WithId<Subject>) {
  const [staff, students] = await Promise.all([
    getDocs(query(branchCol(branchId, COL.staff), where('subjectIds', 'array-contains', s.id))),
    getDocs(query(branchCol(branchId, COL.students), where('subjectIds', 'array-contains', s.id))),
  ])
  const batch = writeBatch(db)
  batch.delete(branchDocRef(branchId, COL.subjects, s.id))
  for (const d of [...staff.docs, ...students.docs]) batch.update(d.ref, { subjectIds: arrayRemove(s.id) })
  addAudit(batch, branchId, actor, { ...audit(`Deleted the subject ${s.name}`, s.id), action: 'subject.delete' })
  await batch.commit()
}

export async function reorder(
  branchId: string,
  actor: Actor,
  col: 'subjects' | 'subjectCategories',
  items: readonly { id: string }[],
  summary: string,
) {
  const batch = writeBatch(db)
  items.forEach((item, i) => batch.update(branchDocRef(branchId, col, item.id), { order: i }))
  addAudit(batch, branchId, actor, audit(summary, items[0]?.id ?? ''))
  await batch.commit()
}

/** Default subjects (and categories) the branch doesn't have yet, matched by name. */
export function missingDefaults(subjects: readonly { name: string }[], categories: readonly WithId<SubjectCategory>[]) {
  const { categories: defCats, subjects: defSubjects } = defaultSubjectDocs()
  const have = new Set(subjects.map((s) => s.name.trim().toLowerCase()))
  const missing = defSubjects.filter((s) => !have.has(s.name.toLowerCase()))
  return { missing, defCats, categories }
}

/** Adds the default subjects the branch is missing; deleted or renamed ones come back only through this button. */
export async function addMissingDefaults(branchId: string, actor: Actor, subjects: readonly WithId<Subject>[], categories: readonly WithId<SubjectCategory>[]) {
  const { missing, defCats } = missingDefaults(subjects, categories)
  if (missing.length === 0) return 0
  const batch = writeBatch(db)
  const catIdByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]))
  let nextCat = categories.length
  const nextOrder = new Map<string, number>()
  for (const s of subjects) nextOrder.set(s.categoryId, Math.max(nextOrder.get(s.categoryId) ?? 0, s.order + 1))
  for (const c of defCats) {
    if (catIdByName.has(c.name.toLowerCase()) || !missing.some((s) => s.categoryId === c.id)) continue
    const id = categories.some((x) => x.id === c.id) ? doc(branchCol(branchId, COL.subjectCategories)).id : c.id
    batch.set(branchDocRef(branchId, COL.subjectCategories, id), { name: c.name, order: nextCat++ })
    catIdByName.set(c.name.toLowerCase(), id)
  }
  const taken = new Set(subjects.map((s) => s.id))
  for (const s of missing) {
    const catName = defCats.find((c) => c.id === s.categoryId)?.name ?? ''
    const categoryId = catIdByName.get(catName.toLowerCase()) ?? ''
    const order = nextOrder.get(categoryId) ?? 0
    nextOrder.set(categoryId, order + 1)
    const id = taken.has(s.id) ? doc(branchCol(branchId, COL.subjects)).id : s.id
    batch.set(branchDocRef(branchId, COL.subjects, id), {
      name: s.name,
      categoryId,
      order,
      createdAt: serverTimestamp(),
      createdBy: actor.email,
      updatedAt: serverTimestamp(),
      updatedBy: actor.email,
    })
  }
  addAudit(batch, branchId, actor, { ...audit(`Added ${missing.length} default subject${missing.length > 1 ? 's' : ''}`, 'defaults'), action: 'subject.import_defaults' })
  await batch.commit()
  return missing.length
}
