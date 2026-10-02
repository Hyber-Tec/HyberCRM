import { arrayRemove, arrayUnion, doc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore'
import { COL, DOC } from '@shared/paths'
import { STAFF_STATUS_LABELS } from '@shared/people'
import { isAhead, isCheckable } from '@shared/schedule/conflicts'
import { nowMinutes, todayKey } from '@shared/time'
import type { Compensation, Staff, StaffStatus, WithId } from '@shared/types'
import { type Actor, addAudit, diffChanges } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'
import { newStaffData } from '@/features/access/api'
import { compensationRef, writeCompensation } from './compensation'

export { compensationRef, writeCompensation }

/** How many pending or confirmed sessions the tutor still has ahead (they'd become conflicts if the tutor stops teaching). */
export async function countUpcomingSessions(branchId: string, staffId: string, timezone: string): Promise<number> {
  const today = todayKey(timezone)
  const nowMin = nowMinutes(timezone)
  const snap = await getDocs(query(branchCol(branchId, COL.sessions), where('tutorId', '==', staffId), where('dateKey', '>=', today)))
  return snap.docs.filter((d) => {
    const s = d.data() as Parameters<typeof isCheckable>[0] & { dateKey: string; endMin: number }
    return isCheckable(s) && isAhead(s, today, nowMin)
  }).length
}

/** The question to ask before a tutor with upcoming sessions stops teaching; null when there is nothing to ask. */
export function stopTeachingQuestion(name: string, count: number, what: string) {
  if (count === 0) return null
  return {
    title: `${name} has ${count} upcoming session${count > 1 ? 's' : ''}`,
    description: `If you ${what}, ${count > 1 ? 'they stay' : 'it stays'} booked and ${count > 1 ? 'show' : 'shows'} as ${count > 1 ? 'conflicts' : 'a conflict'} on the schedule (and on Home) until ${count > 1 ? 'they’re' : 'it’s'} reassigned or canceled.`,
    confirmLabel: 'Continue',
  }
}

export function staffNotesRef(branchId: string, staffId: string) {
  return doc(db, branchCol(branchId, COL.staff).path, staffId, 'private', DOC.staffNotes)
}

export async function createEmployee(
  branchId: string,
  actor: Actor,
  input: { firstName: string; lastName: string; email: string; role: Staff['role'] },
  /** Hourly rates, from the day it's created (left out when the person can't set pay). */
  pay?: { rates: Compensation['rates']; effectiveFrom: string } | null,
): Promise<string> {
  const ref = doc(branchCol(branchId, COL.staff))
  const name = `${input.firstName} ${input.lastName}`.trim()
  const batch = writeBatch(db)
  batch.set(ref, {
    ...newStaffData({ ...input, email: input.email.trim().toLowerCase(), createdBy: actor.email }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  addAudit(batch, branchId, actor, {
    action: 'staff.create',
    category: 'people',
    entityType: 'staff',
    entityId: ref.id,
    summary: `Added the employee ${name}`,
    tutorId: ref.id,
    tutorName: name,
  })
  if (pay) writeCompensation(batch, branchId, actor, { id: ref.id, name, role: input.role }, null, pay.rates, pay.effectiveFrom)
  await batch.commit()
  return ref.id
}

export async function setEmployeeStatus(branchId: string, actor: Actor, staff: WithId<Staff>, status: StaffStatus) {
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.staff, staff.id), { status, updatedAt: serverTimestamp(), updatedBy: actor.email })
  addAudit(batch, branchId, actor, {
    action: 'staff.status',
    category: 'people',
    entityType: 'staff',
    entityId: staff.id,
    summary: `Set ${staff.name} to ${STAFF_STATUS_LABELS[status]}`,
    tutorId: staff.id,
    tutorName: staff.name,
    changes: [{ field: 'status', label: 'Status', from: STAFF_STATUS_LABELS[staff.status], to: STAFF_STATUS_LABELS[status] }],
  })
  await batch.commit()
}

const PROFILE_LABELS: Record<string, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  dob: 'Date of birth',
  address: 'Address',
  startDate: 'Start date',
  endDate: 'End date',
  status: 'Status',
  role: 'Role',
  color: 'Color',
}

export async function saveEmployeeProfile(
  branchId: string,
  actor: Actor,
  before: WithId<Staff>,
  patch: Partial<Staff>,
) {
  const next = { ...before, ...patch }
  const name = `${next.firstName} ${next.lastName}`.trim()
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.staff, before.id), {
    ...patch,
    name,
    nameLower: name.toLowerCase(),
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
  addAudit(batch, branchId, actor, {
    action: 'staff.update',
    category: 'people',
    entityType: 'staff',
    entityId: before.id,
    summary: `Updated ${name}’s profile`,
    tutorId: before.id,
    tutorName: name,
    changes: diffChanges(before as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>, PROFILE_LABELS),
  })
  await batch.commit()
}

export async function saveCompensation(
  branchId: string,
  actor: Actor,
  staff: WithId<Staff>,
  before: Compensation | null,
  next: Pick<Compensation, 'rates'>,
  effectiveFrom: string,
) {
  const changed = !before || before.rates.teaching !== next.rates.teaching || before.rates.admin !== next.rates.admin
  if (!changed) return
  const batch = writeBatch(db)
  writeCompensation(batch, branchId, actor, staff, before, next.rates, effectiveFrom)
  await batch.commit()
}

export async function saveStaffNotes(branchId: string, actor: Actor, staffId: string, adminNote: string) {
  await setDoc(staffNotesRef(branchId, staffId), { adminNote, updatedAt: serverTimestamp(), updatedBy: actor.email })
}

/** Qualifies or unqualifies an employee for a subject (single source: staff.subjectIds). */
export async function setQualification(
  branchId: string,
  actor: Actor,
  staffId: string,
  subjectId: string,
  on: boolean,
  names?: { staff: string; subject: string },
) {
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.staff, staffId), {
    subjectIds: on ? arrayUnion(subjectId) : arrayRemove(subjectId),
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
  addAudit(batch, branchId, actor, {
    action: 'staff.subjects',
    category: 'people',
    entityType: 'staff',
    entityId: staffId,
    tutorId: staffId,
    tutorName: names?.staff ?? null,
    summary: names ? `${on ? 'Added' : 'Removed'} ${names.subject} ${on ? 'to' : 'from'} ${names.staff}’s subjects` : `${on ? 'Added a subject to' : 'Removed a subject from'} a tutor’s subjects`,
  })
  await batch.commit()
}
