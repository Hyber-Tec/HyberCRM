import { orderBy, query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import type { Availability, ConferenceCategory, DayConfig, Member, Staff, Student, Subject, SubjectCategory } from '@shared/types'
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

/** Day configs (opening-hour overrides) between two dates, as a map by dateKey. */
export function useDayConfigs(from: string, to: string) {
  const { branchId } = useBranch()
  const q = useMemo(
    () => query(branchCol(branchId, COL.dayConfigs), where('dateKey', '>=', from), where('dateKey', '<=', to)),
    [branchId, from, to],
  )
  const { data, loading } = useQuery<DayConfig>(q, `dayconfigs-${branchId}-${from}-${to}`)
  const map = useMemo(() => new Map(data.map((d) => [d.dateKey, d])), [data])
  return { map, loading }
}

/** One employee's availability between two dates, as a map by dateKey. */
export function useAvailability(staffId: string | null, from: string, to: string) {
  const { branchId } = useBranch()
  const q = useMemo(
    () =>
      staffId
        ? query(branchCol(branchId, COL.availability), where('staffId', '==', staffId), where('dateKey', '>=', from), where('dateKey', '<=', to))
        : null,
    [branchId, staffId, from, to],
  )
  const { data, loading, error } = useQuery<Availability>(q, `availability-${staffId}-${from}-${to}`)
  const map = useMemo(() => new Map(data.map((d) => [d.dateKey, d])), [data])
  return { map, loading, error }
}
