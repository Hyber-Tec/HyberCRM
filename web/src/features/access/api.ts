import { type WriteBatch, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { newMemberData } from '@shared/branchFactory'
import { pickStaffColor } from '@shared/colors'
import { COL, emailKey } from '@shared/paths'
import { ROLE_LABELS, type Role, sortRoles } from '@shared/roles'
import type { Member, SignupRequest, Staff, StaffRole, Student, WithId } from '@shared/types'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'

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
  roles: Role[]
  status: Member['status']
  links: PersonLinkInput
}

export function newStaffData(input: {
  firstName: string
  lastName: string
  email: string
  roles: StaffRole[]
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
    roles: input.roles,
    status: 'active',
    subjectIds: [],
    color: pickStaffColor(Math.floor(Math.random() * 10)),
    startDate: null,
    endDate: null,
    hasKioskPin: false,
    notificationPrefs: { announcements: true, sessionCreated: true, sessionChanged: true, sessionCanceled: true },
    profileNote: '',
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
    conference: { lastCompletedAt: null, lastCompletedHours: 0, lastNoteAt: null },
    createdBy: input.createdBy,
    updatedBy: input.createdBy,
  }
}

function staffRoles(roles: Role[]): StaffRole[] {
  return roles.filter((r): r is StaffRole => r === 'admin' || r === 'tutor')
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
  const roles = sortRoles(input.roles)
  const batch = writeBatch(db)
  const displayName = `${input.firstName} ${input.lastName}`.trim()

  // Staff record for admin/tutor roles.
  let staffId: string | null = null
  const sRoles = staffRoles(roles)
  if (sRoles.length > 0) {
    if (input.links.staffId === 'new' || input.links.staffId === null) {
      const ref = doc(branchCol(branchId, COL.staff))
      staffId = ref.id
      batch.set(ref, {
        ...newStaffData({ firstName: input.firstName, lastName: input.lastName, email: key, roles: sRoles, createdBy: actor.email }),
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
    } else {
      staffId = input.links.staffId
      const staff = staffById.get(staffId)
      const sameRoles = staff && [...staff.roles].sort().join() === [...sRoles].sort().join()
      if (!sameRoles || (staff && !staff.email)) {
        batch.update(branchDocRef(branchId, COL.staff, staffId), {
          roles: sRoles,
          ...(staff && !staff.email ? { email: key } : {}),
          updatedAt: serverTimestamp(),
          updatedBy: actor.email,
        })
      }
    }
  }

  // Student record for the student role.
  let studentId: string | null = null
  if (roles.includes('student')) {
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
    studentIds: roles.includes('parent') ? input.links.studentIds : [],
  }
  if (existing) {
    batch.update(memberRef, {
      displayName,
      roles,
      status: input.status,
      ...linkFields,
      ...(roles.includes('admin') ? {} : { isOwner: false, restrictions: [] }),
      updatedAt: serverTimestamp(),
      updatedBy: actor.email,
    })
    const before = sortRoles(existing.roles).map((r) => ROLE_LABELS[r]).join(', ')
    const after = roles.map((r) => ROLE_LABELS[r]).join(', ')
    addAudit(batch, branchId, actor, {
      action: 'member.update',
      category: 'access',
      entityType: 'member',
      entityId: key,
      summary: `Updated access for ${displayName || key}`,
      changes: [
        ...(before !== after ? [{ field: 'roles', label: 'Roles', from: before, to: after }] : []),
        ...(existing.status !== input.status ? [{ field: 'status', label: 'Status', from: existing.status, to: input.status }] : []),
      ],
    })
  } else {
    batch.set(memberRef, {
      ...newMemberData({ email: key, displayName, roles, createdBy: actor.email, ...linkFields }),
      status: input.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    addAudit(batch, branchId, actor, {
      action: 'member.create',
      category: 'access',
      entityType: 'member',
      entityId: key,
      summary: `Gave ${displayName || key} access as ${roles.map((r) => ROLE_LABELS[r]).join(', ')}`,
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
