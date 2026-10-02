import { type WriteBatch, doc, serverTimestamp } from 'firebase/firestore'
import { COL, DOC } from '@shared/paths'
import type { Compensation, Staff } from '@shared/types'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol } from '@/lib/firestore'

export function compensationRef(branchId: string, staffId: string) {
  return doc(db, branchCol(branchId, COL.staff).path, staffId, 'private', DOC.compensation)
}

/** Adds an employee's new hourly rates (with their history and audit entry) to a batch. */
export function writeCompensation(
  batch: WriteBatch,
  branchId: string,
  actor: Actor,
  staff: { id: string; name: string; role: Staff['role'] },
  before: Compensation | null,
  rates: Compensation['rates'],
  effectiveFrom: string,
) {
  const history = [...(before?.history ?? []), { effectiveFrom, rates, setAt: new Date().toISOString(), setBy: actor.email }]
  // Owners and admins have one hourly rate, kept in `rates.admin`.
  const single = staff.role === 'owner' || staff.role === 'admin'
  batch.set(compensationRef(branchId, staff.id), {
    rates,
    history,
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
  addAudit(batch, branchId, actor, {
    action: 'pay.rates',
    category: 'pay',
    entityType: 'staff',
    entityId: staff.id,
    summary: before ? `Changed pay rates for ${staff.name}` : `Set pay rates for ${staff.name}`,
    tutorId: staff.id,
    tutorName: staff.name,
    changes: [
      ...(!single && before?.rates.teaching !== rates.teaching ? [{ field: 'teaching', label: 'Teaching rate', from: before?.rates.teaching ?? null, to: rates.teaching }] : []),
      ...(before?.rates.admin !== rates.admin ? [{ field: 'admin', label: single ? 'Hourly rate' : 'Admin rate', from: before?.rates.admin ?? null, to: rates.admin }] : []),
    ],
  })
}
