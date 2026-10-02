import { type WriteBatch, deleteField, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { newMemberData } from '@shared/branchFactory'
import { pickStaffColor } from '@shared/colors'
import { COL, emailKey } from '@shared/paths'
import { ROLE_LABELS, type Role, isStaffRole } from '@shared/roles'
import type { DateKey } from '@shared/time'
import type { Compensation, Member, SignupRequest, Staff, StaffRole, Student, WithId } from '@shared/types'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'
import { writeCompensation } from '@/features/employees/compensation'

export interface PersonLinkInput {
  /** Existing staff record to link, or 'new' to create one. */
  staffId: string | 'new' | null
  /** Existing student record to link, or 'new' to create one. */
  studentId: string | 'new' | null
  /** Parent: linked student IDs. */
  studentIds: string[]
}

export interface MemberInput {
  email: string
  firstName: string
  lastName: string
  role: Role
  status: Member['status']
  links: PersonLinkInput
  /** Hourly rates for a new employee record (left out when the person can't set pay). */
  pay?: { rates: Compensation['rates']; effectiveFrom: DateKey } | null
}

export function newStaffData(input: {
  firstName: string
  lastName: string
  email: string
  role: StaffRole
  createdBy: string
}): Omit<Staff, 'createdAt' | 'updatedAt'> {
  const name = `${input.firstName} ${input.lastName}`.trim()
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    name,
    nameLower: name.toLowerCase(),
    email: input.email,
    phone: '',
    role: input.role,
    status: 'active',
    subjectIds: [],
    color: pickStaffColor(Math.floor(Math.random() * 10)),
    startDate: null,
    endDate: null,
    dob: null,
    address: '',
    hasKioskPin: false,
    notificationPrefs: { announcements: true, sessionCreated: true, sessionChanged: true, sessionCanceled: true },
    createdBy: input.createdBy,
    updatedBy: input.createdBy,
  }
}

export function newStudentData(input: { firstName: string; lastName: string; createdBy: string }): Omit<
  Student,
  'createdAt' | 'updatedAt'
> {
  const name = `${input.firstName} ${input.lastName}`.trim()
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    name,
    nameLower: name.toLowerCase(),
    grade: '',
    school: '',
    status: 'signed_up',
    statusSource: 'auto',
    subjectIds: [],
    learningNote: '',
    signUpDate: null,
    firstSessionDate: null,
    lastSessionDate: null,
    nextSessionDate: null,
    totalSessionHours: 0,
    conference: { baselineHours: 0, lastNoteDate: null, lastResetAt: null },
    schoolRecord: { courses: {}, gradeSnapshots: [], plan: '' },
    followUpReviewedAt: null,
    createdBy: input.createdBy,
    updatedBy: input.createdBy,
  }
}

/**
 * Creates or updates a member (access record) and the person records it links to,
 * in one batch with audit entries. Returns the member ID (lower-cased email).
 */
export async function saveMember(opts: {
  branchId: string
  actor: Actor
  input: MemberInput
  existing: WithId<Member> | null
  staffById: Map<string, WithId<Staff>>
  approveRequest?: WithId<SignupRequest> | null
}): Promise<string> {
  const { branchId, actor, input, existing, staffById } = opts
  const key = existing?.id ?? emailKey(input.email)
  const role = input.role
  const batch = writeBatch(db)
  const displayName = `${input.firstName} ${input.lastName}`.trim()

  // Staff record for owners, admins and tutors (clock and pay; only tutors teach).
  let staffId: string | null = null
  if (isStaffRole(role)) {
    const staffRole = role as StaffRole
    if (input.links.staffId === 'new' || input.links.staffId === null) {
      const ref = doc(branchCol(branchId, COL.staff))
      staffId = ref.id
      batch.set(ref, {
        ...newStaffData({ firstName: input.firstName, lastName: input.lastName, email: key, role: staffRole, createdBy: actor.email }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      addAudit(batch, branchId, actor, {
        action: 'staff.create',
        category: 'people',
        entityType: 'staff',
        entityId: ref.id,
        summary: `Added the employee ${displayName}`,
        tutorId: ref.id,
        tutorName: displayName,
      })
      if (input.pay) writeCompensation(batch, branchId, actor, { id: ref.id, name: displayName, role: staffRole }, null, input.pay.rates, input.pay.effectiveFrom)
    } else {
      staffId = input.links.staffId
      const staff = staffById.get(staffId)
      if (staff?.role !== staffRole || (staff && !staff.email)) {
        batch.update(branchDocRef(branchId, COL.staff, staffId), {
          role: staffRole,
          roles: deleteField(),
          ...(staff && !staff.email ? { email: key } : {}),
          updatedAt: serverTimestamp(),
          updatedBy: actor.email,
        })
      }
    }
  }

  // Student record for the student role.
  let studentId: string | null = null
  if (role === 'student') {
    if (input.links.studentId === 'new' || input.links.studentId === null) {
      const ref = doc(branchCol(branchId, COL.students))
      studentId = ref.id
      batch.set(ref, {
        ...newStudentData({ firstName: input.firstName, lastName: input.lastName, createdBy: actor.email }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      addAudit(batch, branchId, actor, {
        action: 'student.create',
        category: 'people',
        entityType: 'student',
        entityId: ref.id,
        summary: `Added the student ${displayName}`,
        studentId: ref.id,
        studentName: displayName,
      })
    } else {
      studentId = input.links.studentId
    }
  }

  const memberRef = branchDocRef(branchId, COL.members, key)
  const linkFields = {
    staffId,
    studentId,
    studentIds: role === 'parent' ? input.links.studentIds : [],
  }
  if (existing) {
    batch.update(memberRef, {
      displayName,
      role,
      status: input.status,
      ...linkFields,
      // Restrictions apply to admins only.
      ...(role === 'admin' ? {} : { restrictions: [] }),
      // Fields from before one role per person.
      roles: deleteField(),
      isOwner: deleteField(),
      updatedAt: serverTimestamp(),
      updatedBy: actor.email,
    })
    const before = existing.role ? ROLE_LABELS[existing.role] : '—'
    const after = ROLE_LABELS[role]
    addAudit(batch, branchId, actor, {
      action: 'member.update',
      category: 'access',
      entityType: 'member',
      entityId: key,
      summary: `Updated access for ${displayName || key}`,
      changes: [
        ...(before !== after ? [{ field: 'role', label: 'Role', from: before, to: after }] : []),
        ...(existing.status !== input.status ? [{ field: 'status', label: 'Status', from: existing.status, to: input.status }] : []),
      ],
    })
  } else {
    batch.set(memberRef, {
      ...newMemberData({ email: key, displayName, role, createdBy: actor.email, ...linkFields }),
      status: input.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    addAudit(batch, branchId, actor, {
      action: 'member.create',
      category: 'access',
      entityType: 'member',
      entityId: key,
      summary: `Gave ${displayName || key} access as ${ROLE_LABELS[role]}`,
    })
  }

  if (opts.approveRequest) {
    markRequest(batch, branchId, actor, opts.approveRequest, 'approved')
  }

  await batch.commit()
  return key
}

export function markRequest(
  batch: WriteBatch,
  branchId: string,
  actor: Actor,
  request: WithId<SignupRequest>,
  status: 'approved' | 'rejected',
  note?: string,
) {
  batch.update(branchDocRef(branchId, COL.signupRequests, request.id), {
    status,
    decidedAt: serverTimestamp(),
    decidedBy: actor.email,
    decisionNote: note ?? null,
    updatedAt: serverTimestamp(),
  })
  addAudit(batch, branchId, actor, {
    action: status === 'approved' ? 'signup.approve' : 'signup.reject',
    category: 'access',
    entityType: 'signupRequest',
    entityId: request.id,
    summary: `${status === 'approved' ? 'Approved' : 'Declined'} the sign-up request from ${request.firstName} ${request.lastName} (${request.email})`,
  })
}

export async function rejectRequest(branchId: string, actor: Actor, request: WithId<SignupRequest>, note: string) {
  const batch = writeBatch(db)
  markRequest(batch, branchId, actor, request, 'rejected', note)
  await batch.commit()
}

export async function removeMember(branchId: string, actor: Actor, member: WithId<Member>) {
  const batch = writeBatch(db)
  batch.delete(branchDocRef(branchId, COL.members, member.id))
  addAudit(batch, branchId, actor, {
    action: 'member.delete',
    category: 'access',
    entityType: 'member',
    entityId: member.id,
    summary: `Removed access for ${member.displayName || member.email}`,
  })
  await batch.commit()
}
