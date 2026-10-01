import { type Transaction, type WriteBatch, doc, serverTimestamp } from 'firebase/firestore'
import type { Role } from '@shared/roles'
import type { AuditCategory, AuditChange } from '@shared/types'
import { branchCol } from './firestore'

export interface Actor {
  uid: string
  email: string
  name: string
  role: Role | 'super_admin'
}

export interface AuditInput {
  action: string
  category: AuditCategory
  entityType: string
  entityId: string
  summary: string
  context?: string
  dateKey?: string | null
  studentId?: string | null
  studentName?: string | null
  tutorId?: string | null
  tutorName?: string | null
  changes?: AuditChange[]
}

export function auditData(actor: Actor, input: AuditInput) {
  return {
    at: serverTimestamp(),
    actorUid: actor.uid,
    actorEmail: actor.email,
    actorName: actor.name,
    actorRole: actor.role,
    action: input.action,
    category: input.category,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    context: input.context ?? '',
    dateKey: input.dateKey ?? null,
    studentId: input.studentId ?? null,
    studentName: input.studentName ?? null,
    tutorId: input.tutorId ?? null,
    tutorName: input.tutorName ?? null,
    changes: input.changes ?? [],
    via: 'web' as const,
  }
}

/** Adds an append-only audit entry to a batch or transaction. */
export function addAudit(writer: WriteBatch | Transaction, branchId: string, actor: Actor, input: AuditInput) {
  const ref = doc(branchCol(branchId, 'auditLog'))
  // WriteBatch and Transaction share this signature.
  ;(writer as WriteBatch).set(ref, auditData(actor, input))
}

/** Field-level diff for audit entries. */
export function diffChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string>,
): AuditChange[] {
  const out: AuditChange[] = []
  for (const [field, label] of Object.entries(labels)) {
    const a = normalize(before[field])
    const b = normalize(after[field])
    if (a !== b) out.push({ field, label, from: a, to: b })
  }
  return out
}

function normalize(v: unknown): string | number | boolean | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v)) return v.join(', ') || null
  return JSON.stringify(v)
}
