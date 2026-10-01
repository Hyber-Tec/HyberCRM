import { type DocumentData, type Query, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { COL } from '@shared/paths'
import type { DateKey } from '@shared/time'
import type { Session, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import type { ProgressReport } from '@/features/sessions/reportModel'
import { branchCol, branchDocRef } from '@/lib/firestore'

/** Parents see their linked children; students see themselves. */
export function useLinkedStudentIds(mode: 'parent' | 'student'): string[] {
  const { member } = useBranch()
  return useMemo(() => {
    if (mode === 'student') return member?.studentId ? [member.studentId] : []
    return [...new Set(member?.studentIds ?? [])]
  }, [mode, member?.studentId, member?.studentIds])
}

/** Live student docs by ID (one listener each; the rules allow only linked records). */
export function useStudentsById(ids: string[]) {
  const { branchId } = useBranch()
  const key = ids.join(',')
  const [state, setState] = useState<{ key: string; map: Map<string, WithId<Student>>; loading: boolean }>({ key: '', map: new Map(), loading: true })
  useEffect(() => {
    const list = key ? key.split(',') : []
    const map = new Map<string, WithId<Student>>()
    const seen = new Set<string>()
    const done = () => setState({ key, map: new Map(map), loading: seen.size < list.length })
    if (!list.length) return
    const unsubs = list.map((id) =>
      onSnapshot(
        branchDocRef(branchId, COL.students, id),
        (snap) => {
          seen.add(id)
          if (snap.exists()) map.set(id, { id, ...(snap.data() as Student) })
          else map.delete(id)
          done()
        },
        () => {
          seen.add(id)
          done()
        },
      ),
    )
    return () => unsubs.forEach((u) => u())
  }, [branchId, key])
  if (!key) return { map: new Map<string, WithId<Student>>(), loading: false }
  if (state.key !== key) return { map: new Map<string, WithId<Student>>(), loading: true }
  return state
}

/** Several live queries merged into one list (de-duplicated by ID). */
function useMergedQueries<T>(queries: Query<DocumentData>[], key: string) {
  const [state, setState] = useState<{ key: string; data: WithId<T>[]; loading: boolean }>({ key: '', data: [], loading: true })
  useEffect(() => {
    if (!queries.length) return
    const parts = new Map<number, WithId<T>[]>()
    const emit = () => {
      const byId = new Map<string, WithId<T>>()
      for (const list of parts.values()) for (const d of list) byId.set(d.id, d)
      setState({ key, data: [...byId.values()], loading: parts.size < queries.length })
    }
    const unsubs = queries.map((q, i) =>
      onSnapshot(
        q,
        (snap) => {
          parts.set(i, snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }) as WithId<T>))
          emit()
        },
        () => {
          parts.set(i, [])
          emit()
        },
      ),
    )
    return () => unsubs.forEach((u) => u())
    // The key identifies the queries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!queries.length) return { data: [] as WithId<T>[], loading: false }
  if (state.key !== key) return { data: [] as WithId<T>[], loading: true }
  return state
}

/** Sessions of the given students between two dates (one query per student, as the rules require). */
export function useFamilySessions(ids: string[], from: DateKey, to: DateKey) {
  const { branchId } = useBranch()
  const queries = useMemo(
    () => ids.map((id) => query(branchCol(branchId, COL.sessions), where('studentId', '==', id), where('dateKey', '>=', from), where('dateKey', '<=', to))),
    [branchId, ids, from, to],
  )
  const res = useMergedQueries<Session>(queries, `family-sessions-${branchId}-${ids.join(',')}-${from}-${to}`)
  const data = useMemo(
    () => res.data.filter((s) => !s.isDeleted).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin),
    [res.data],
  )
  return { data, loading: res.loading }
}

/** Progress reports the branch shared with the family. */
export function useSharedReports(ids: string[]) {
  const { branchId } = useBranch()
  const queries = useMemo(
    () =>
      ids.map((id) =>
        query(branchCol(branchId, COL.progressReports), where('studentId', '==', id), where('sharedWithParents', '==', true), orderBy('generatedAt', 'desc')),
      ),
    [branchId, ids],
  )
  const res = useMergedQueries<ProgressReport>(queries, `family-reports-${branchId}-${ids.join(',')}`)
  const data = useMemo(() => res.data.slice().sort((a, b) => (b.generatedAt?.toMillis() ?? 0) - (a.generatedAt?.toMillis() ?? 0)), [res.data])
  return { data, loading: res.loading }
}
