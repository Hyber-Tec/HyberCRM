import { addDoc, deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { COL, DOC } from '@shared/paths'
import { STUDENT_STATUS_LABELS } from '@shared/people'
import type { ConferenceNote, Student, StudentPrivateProfile, StudentStatus, WithId } from '@shared/types'
import { type Actor, addAudit, diffChanges } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'
import { newStudentData } from '@/features/access/api'

export function studentPrivateRef(branchId: string, studentId: string) {
  return doc(db, branchCol(branchId, COL.students).path, studentId, 'private', DOC.privateProfile)
}

export function conferenceNotesCol(branchId: string, studentId: string) {
  return branchCol(branchId, COL.students).path + `/${studentId}/conferenceNotes`
}

export const EMPTY_PRIVATE: StudentPrivateProfile = {
  email: '',
  phone: '',
  dob: null,
  address: '',
  parents: [],
  schoolLogin: '',
  adminNote: '',
  customFields: {},
}

export async function createStudent(
  branchId: string,
  actor: Actor,
  input: { firstName: string; lastName: string; grade: string; signUpDate: string },
): Promise<string> {
  const ref = doc(branchCol(branchId, COL.students))
  const name = `${input.firstName} ${input.lastName}`.trim()
  const batch = writeBatch(db)
  batch.set(ref, {
    ...newStudentData({ firstName: input.firstName, lastName: input.lastName, createdBy: actor.email }),
    grade: input.grade,
    signUpDate: input.signUpDate,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.set(studentPrivateRef(branchId, ref.id), EMPTY_PRIVATE)
  addAudit(batch, branchId, actor, {
    action: 'student.create',
    category: 'people',
    entityType: 'student',
    entityId: ref.id,
    summary: `Added the student ${name}`,
    studentId: ref.id,
    studentName: name,
  })
  await batch.commit()
  return ref.id
}

export async function setStudentStatus(branchId: string, actor: Actor, student: WithId<Student>, status: StudentStatus) {
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.students, student.id), {
    status,
    statusSource: 'manual',
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
  addAudit(batch, branchId, actor, {
    action: 'student.status',
    category: 'people',
    entityType: 'student',
    entityId: student.id,
    summary: `Set ${student.name} to ${STUDENT_STATUS_LABELS[status]}`,
    studentId: student.id,
    studentName: student.name,
    changes: [{ field: 'status', label: 'Status', from: STUDENT_STATUS_LABELS[student.status], to: STUDENT_STATUS_LABELS[status] }],
  })
  await batch.commit()
}

/** Hands a hand-set status back to the automatic rules (applied by the daily job and on log submit). */
export async function resumeAutoStatus(branchId: string, actor: Actor, student: WithId<Student>) {
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.students, student.id), { statusSource: 'auto', updatedAt: serverTimestamp(), updatedBy: actor.email })
  addAudit(batch, branchId, actor, {
    action: 'student.status_auto_resume',
    category: 'people',
    entityType: 'student',
    entityId: student.id,
    summary: `Set ${student.name}’s status to update automatically again`,
    studentId: student.id,
    studentName: student.name,
  })
  await batch.commit()
}

const INFO_LABELS: Record<string, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  grade: 'Grade',
  school: 'School',
  status: 'Status',
  learningNote: 'Learning notes',
  signUpDate: 'Sign-up date',
}

export async function saveStudentInfo(
  branchId: string,
  actor: Actor,
  before: WithId<Student>,
  patch: Partial<Student>,
  privatePatch: StudentPrivateProfile | null,
) {
  const next = { ...before, ...patch }
  const name = `${next.firstName} ${next.lastName}`.trim()
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.students, before.id), {
    ...patch,
    ...(patch.status && patch.status !== before.status ? { statusSource: 'manual' } : {}),
    name,
    nameLower: name.toLowerCase(),
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
  if (privatePatch) batch.set(studentPrivateRef(branchId, before.id), privatePatch)
  addAudit(batch, branchId, actor, {
    action: 'student.update',
    category: 'people',
    entityType: 'student',
    entityId: before.id,
    summary: `Updated ${name}’s info`,
    studentId: before.id,
    studentName: name,
    changes: diffChanges(before as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>, INFO_LABELS),
  })
  await batch.commit()
}

export async function saveSchoolRecord(branchId: string, actor: Actor, studentId: string, schoolRecord: Student['schoolRecord']) {
  await updateDoc(branchDocRef(branchId, COL.students, studentId), {
    schoolRecord,
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
}

/** Restarts the conference cycle at the student's current hours. */
export async function restartConferenceCycle(branchId: string, actor: Actor, student: WithId<Student>) {
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.students, student.id), {
    'conference.baselineHours': student.totalSessionHours ?? 0,
    'conference.lastResetAt': serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
  addAudit(batch, branchId, actor, {
    action: 'student.conference_restart',
    category: 'people',
    entityType: 'student',
    entityId: student.id,
    summary: `Restarted the conference cycle for ${student.name}`,
    studentId: student.id,
    studentName: student.name,
  })
  await batch.commit()
}

/** Saves a conference note; a note also completes the conference (baseline = current hours). */
export async function saveConferenceNote(
  branchId: string,
  actor: Actor,
  student: WithId<Student>,
  note: Pick<ConferenceNote, 'date' | 'text' | 'categoryId'>,
  noteId: string | null,
  allNoteDates: string[],
) {
  const col = conferenceNotesCol(branchId, student.id)
  const ref = noteId ? doc(db, col, noteId) : doc(db, col, crypto.randomUUID())
  const latest = [...allNoteDates, note.date].sort().pop() ?? note.date
  const batch = writeBatch(db)
  batch.set(
    ref,
    {
      ...note,
      authorName: actor.name,
      ...(noteId ? {} : { createdAt: serverTimestamp(), createdBy: actor.email }),
      updatedAt: serverTimestamp(),
      updatedBy: actor.email,
    },
    { merge: true },
  )
  batch.update(branchDocRef(branchId, COL.students, student.id), {
    'conference.baselineHours': student.totalSessionHours ?? 0,
    'conference.lastNoteDate': latest,
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
  addAudit(batch, branchId, actor, {
    action: noteId ? 'student.conference_edit' : 'student.conference_add',
    category: 'people',
    entityType: 'student',
    entityId: student.id,
    summary: `${noteId ? 'Edited' : 'Added'} a conference note for ${student.name}`,
    studentId: student.id,
    studentName: student.name,
  })
  await batch.commit()
}

export async function deleteConferenceNote(branchId: string, student: WithId<Student>, noteId: string, remainingDates: string[]) {
  await deleteDoc(doc(db, conferenceNotesCol(branchId, student.id), noteId))
  await updateDoc(branchDocRef(branchId, COL.students, student.id), {
    'conference.lastNoteDate': [...remainingDates].sort().pop() ?? null,
  })
}

export async function addConferenceCategory(branchId: string, name: string, color: string) {
  await addDoc(branchCol(branchId, COL.conferenceCategories), { name, color })
}

export async function updateConferenceCategory(branchId: string, id: string, name: string, color: string) {
  await setDoc(branchDocRef(branchId, COL.conferenceCategories, id), { name, color })
}

export async function deleteConferenceCategory(branchId: string, id: string) {
  await deleteDoc(branchDocRef(branchId, COL.conferenceCategories, id))
}

export async function advanceGrades(branchId: string, actor: Actor, students: { id: string; name: string; grade: string; next: string }[]) {
  for (let i = 0; i < students.length; i += 200) {
    const batch = writeBatch(db)
    for (const s of students.slice(i, i + 200)) {
      batch.update(branchDocRef(branchId, COL.students, s.id), { grade: s.next, updatedAt: serverTimestamp(), updatedBy: actor.email })
    }
    if (i === 0) {
      addAudit(batch, branchId, actor, {
        action: 'student.grade_advance',
        category: 'people',
        entityType: 'student',
        entityId: 'many',
        summary: `Advanced ${students.length} students by one grade`,
      })
    }
    await batch.commit()
  }
}
