import { orderBy, query } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import type { ConferenceCategory, Member, Staff, Student, Subject, SubjectCategory } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { branchCol, useQuery } from '@/lib/firestore'

/** Live branch-wide lists shared by many pages (Firestore de-duplicates identical listeners). */

export function useStaffList() {
  const { branchId } = useBranch()
  const q = useMemo(() => query(branchCol(branchId, COL.staff), orderBy('nameLower')), [branchId])
  return useQuery<Staff>(q, `staff-${branchId}`)
}

export function useStudentList() {
  const { branchId } = useBranch()
  const q = useMemo(() => query(branchCol(branchId, COL.students), orderBy('nameLower')), [branchId])
  return useQuery<Student>(q, `students-${branchId}`)
}

export function useSubjects() {
  const { branchId } = useBranch()
  const q = useMemo(() => query(branchCol(branchId, COL.subjects), orderBy('order')), [branchId])
  return useQuery<Subject>(q, `subjects-${branchId}`)
}

export function useSubjectCategories() {
  const { branchId } = useBranch()
  const q = useMemo(() => query(branchCol(branchId, COL.subjectCategories), orderBy('order')), [branchId])
  return useQuery<SubjectCategory>(q, `subject-categories-${branchId}`)
}

export function useConferenceCategories() {
  const { branchId } = useBranch()
  const q = useMemo(() => query(branchCol(branchId, COL.conferenceCategories), orderBy('name')), [branchId])
  return useQuery<ConferenceCategory>(q, `conference-categories-${branchId}`)
}

export function useMembers(enabled = true) {
  const { branchId } = useBranch()
  const q = useMemo(() => (enabled ? query(branchCol(branchId, COL.members), orderBy('email')) : null), [branchId, enabled])
  return useQuery<Member>(q, `members-${branchId}`)
}
