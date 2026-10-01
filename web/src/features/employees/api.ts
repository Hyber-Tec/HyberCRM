import { arrayRemove, arrayUnion, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { COL, DOC } from '@shared/paths'
import { STAFF_STATUS_LABELS } from '@shared/people'
import type { Compensation, Staff, StaffStatus, WithId } from '@shared/types'
import { type Actor, addAudit, diffChanges } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'
import { newStaffData } from '@/features/access/api'

export function compensationRef(branchId: string, staffId: string) {
  return doc(db, branchCol(branchId, COL.staff).path, staffId, 'private', DOC.compensation)
}

export function staffNotesRef(branchId: string, staffId: string) {
  return doc(db, branchCol(branchId, COL.staff).path, staffId, 'private', DOC.staffNotes)
}

export async function createEmployee(
  branchId: string,
  actor: Actor,
  input: { firstName: string; lastName: string; email: string; roles: Staff['roles'] },
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
  next: Pick<Compensation, 'rates' | 'payModel'>,
  effectiveFrom: string,
) {
  const changed =
    !before || before.rates.teaching !== next.rates.teaching || before.rates.admin !== next.rates.admin || before.payModel !== next.payModel
  if (!changed) return
  const history = [...(before?.history ?? [])]
  if (!before || before.rates.teaching !== next.rates.teaching || before.rates.admin !== next.rates.admin) {
    history.push({ effectiveFrom, rates: next.rates, setAt: new Date().toISOString(), setBy: actor.email })
  }
  const batch = writeBatch(db)
  batch.set(compensationRef(branchId, staff.id), {
    rates: next.rates,
    payModel: next.payModel,
    history,
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
  addAudit(batch, branchId, actor, {
    action: 'pay.rates',
    category: 'pay',
    entityType: 'staff',
    entityId: staff.id,
    summary: `Changed pay rates for ${staff.name}`,
    tutorId: staff.id,
    tutorName: staff.name,
    changes: [
      ...(before?.rates.teaching !== next.rates.teaching
        ? [{ field: 'teaching', label: 'Teaching rate', from: before?.rates.teaching ?? null, to: next.rates.teaching }]
        : []),
      ...(before?.rates.admin !== next.rates.admin
        ? [{ field: 'admin', label: 'Admin rate', from: before?.rates.admin ?? null, to: next.rates.admin }]
        : []),
      ...(before?.payModel !== next.payModel ? [{ field: 'payModel', label: 'Pay model', from: before?.payModel ?? null, to: next.payModel }] : []),
    ],
  })
  await batch.commit()
}

export async function saveStaffNotes(branchId: string, actor: Actor, staffId: string, adminNote: string) {
  await setDoc(staffNotesRef(branchId, staffId), { adminNote, updatedAt: serverTimestamp(), updatedBy: actor.email })
}

/** Qualifies or unqualifies an employee for a subject (single source: staff.subjectIds). */
export async function setQualification(branchId: string, actor: Actor, staffId: string, subjectId: string, on: boolean) {
  await updateDoc(branchDocRef(branchId, COL.staff, staffId), {
    subjectIds: on ? arrayUnion(subjectId) : arrayRemove(subjectId),
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
}
