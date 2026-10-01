import {
  type DocumentData,
  type DocumentReference,
  type FirestoreError,
  type Query,
  collection,
  doc,
  onSnapshot,
} from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { type BranchCollection, ROOT, branchColPath } from '@shared/paths'
import type { WithId } from '@shared/types'
import { db } from './firebase'

export function branchCol(branchId: string, name: BranchCollection) {
  return collection(db, branchColPath(branchId, name))
}

export function branchDocRef(branchId: string, name: BranchCollection, id: string) {
  return doc(db, branchColPath(branchId, name), id)
}

export function branchRef(branchId: string) {
  return doc(db, ROOT.branches, branchId)
}

export interface DocState<T> {
  data: WithId<T> | null
  loading: boolean
  error: FirestoreError | null
}

/** Live document. Pass `null` to wait (e.g. until an ID is known). */
export function useDoc<T>(ref: DocumentReference<DocumentData> | null): DocState<T> {
  const path = ref?.path ?? null
  const [state, setState] = useState<DocState<T> & { path: string | null }>({
    data: null,
    loading: ref !== null,
    error: null,
    path,
  })

  useEffect(() => {
    if (!ref) return
    return onSnapshot(
      ref,
      (snap) =>
        setState({
          data: snap.exists() ? ({ id: snap.id, ...(snap.data() as T) } as WithId<T>) : null,
          loading: false,
          error: null,
          path: ref.path,
        }),
      (error) => setState({ data: null, loading: false, error, path: ref.path }),
    )
    // The path identifies the reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  if (!ref) return { data: null, loading: false, error: null }
  if (state.path !== path) return { data: null, loading: true, error: null }
  return state
}

export interface QueryState<T> {
  data: WithId<T>[]
  loading: boolean
  error: FirestoreError | null
}

/**
 * Live query. `key` must change whenever the query changes (Firestore queries
 * can't be compared cheaply). Pass a `null` query to wait.
 */
export function useQuery<T>(query: Query<DocumentData> | null, key: string): QueryState<T> {
  const effectiveKey = query ? key : null
  const [state, setState] = useState<QueryState<T> & { key: string | null }>({
    data: [],
    loading: query !== null,
    error: null,
    key: effectiveKey,
  })

  useEffect(() => {
    if (!query) return
    return onSnapshot(
      query,
      (snap) =>
        setState({
          data: snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }) as WithId<T>),
          loading: false,
          error: null,
          key: effectiveKey,
        }),
      (error) => {
        console.error(`Query failed (${key})`, error)
        setState({ data: [], loading: false, error, key: effectiveKey })
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveKey])

  if (!query) return { data: [], loading: false, error: null }
  if (state.key !== effectiveKey) return { data: [], loading: true, error: null }
  return state
}

/** Memoized lookup map by ID. */
export function useById<T extends { id: string }>(items: T[]): Map<string, T> {
  return useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
}
