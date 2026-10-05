import { doc, onSnapshot, type DocumentData, type Query } from "@react-native-firebase/firestore";
import { useEffect, useEffectEvent, useState } from "react";
import { auth, db } from "@/lib/firebase";

export interface DocState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** True once the data has been confirmed by the server (not only the phone's copy). */
  fromServer: boolean;
}

const MAX_RETRIES = 3;

function isRetryable(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return /permission-denied|unauthenticated|unavailable/.test(code);
}

/**
 * A fresh ID token for the listeners a rule refused, shared by all of them: every new token makes Firestore rebuild
 * its connections, so one per refused listener would be a burst of them. (A just-confirmed email reaches the rules
 * only in a new token.)
 */
let refreshingToken: Promise<unknown> | null = null;
function refreshTokenOnce(): void {
  refreshingToken ??= (auth.currentUser?.getIdToken(true) ?? Promise.resolve())
    .catch(() => undefined)
    .finally(() => {
      refreshingToken = null;
    });
}

/**
 * Live document listener keyed by path (`branches/b/staff/s`), as on the website. Pass null to pause.
 * - "Does not exist" straight from the phone's copy keeps the state loading until the server answers.
 * - A permission error refreshes the token (once for all listeners refused together) and listens again a few times.
 */
export function useDoc<T>(path: string | null): DocState<T & { id: string }> {
  type D = T & { id: string };
  const [state, setState] = useState<DocState<D> & { path: string | null }>({ path, data: null, loading: !!path, error: null, fromServer: false });
  const [attempt, setAttempt] = useState(0);
  // A new path starts from nothing rather than showing the previous document for a moment.
  if (state.path !== path) {
    setState({ path, data: null, loading: !!path, error: null, fromServer: false });
    setAttempt(0);
  }
  useEffect(() => {
    if (!path) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = onSnapshot(
      doc(db, path),
      { includeMetadataChanges: true },
      (snap) => {
        const fromCache = snap.metadata.fromCache;
        if (fromCache && !snap.exists()) return;
        setState({ path, data: snap.exists() ? ({ id: snap.id, ...snap.data() } as D) : null, loading: false, error: null, fromServer: !fromCache });
      },
      (error) => {
        setState({ path, data: null, loading: false, error, fromServer: false });
        if (isRetryable(error) && attempt < MAX_RETRIES) {
          refreshTokenOnce();
          timer = setTimeout(() => setAttempt((a) => a + 1), 2000 * (attempt + 1));
        }
      },
    );
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [path, attempt]);
  return state;
}

export interface QueryState<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
}

/**
 * Live query listener. `key` names the query: it is built again (by `build`) whenever the key changes; a null key
 * pauses it. Same cache and retry behaviour as `useDoc`.
 */
export function useQuery<T>(key: string | null, build: () => Query<DocumentData>): QueryState<T & { id: string }> {
  type D = T & { id: string };
  const [state, setState] = useState<QueryState<D> & { key: string | null }>({ key, data: [], loading: !!key, error: null });
  const [attempt, setAttempt] = useState(0);
  if (state.key !== key) {
    setState({ key, data: [], loading: !!key, error: null });
    setAttempt(0);
  }
  const makeQuery = useEffectEvent(build);
  useEffect(() => {
    if (!key) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = onSnapshot(
      makeQuery(),
      { includeMetadataChanges: true },
      (snap) => {
        const fromCache = snap.metadata.fromCache;
        // An empty answer from the phone's copy says nothing yet: wait for the server.
        if (fromCache && snap.empty) return;
        setState({ key, data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as D), loading: false, error: null });
      },
      (error) => {
        setState({ key, data: [], loading: false, error });
        if (isRetryable(error) && attempt < MAX_RETRIES) {
          refreshTokenOnce();
          timer = setTimeout(() => setAttempt((a) => a + 1), 2000 * (attempt + 1));
        }
      },
    );
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [key, attempt]);
  return state;
}
