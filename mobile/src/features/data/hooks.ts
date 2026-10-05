import { collection, doc, documentId, orderBy, query, where } from "@react-native-firebase/firestore";
import { dayHours } from "@shared/availability";
import { COL, DOC, ROOT } from "@shared/paths";
import { type DateKey, nowMinutes, todayKey } from "@shared/time";
import type { Availability, ClockShift, Compensation, DayConfig, Session, Student, Subject, SubjectCategory } from "@shared/types";
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { db } from "@/lib/firebase";
import { useDoc, useQuery } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

/**
 * The app's live data, as the website's hooks read it (web/src/features/data/hooks.ts, timeclock/api.ts): always one
 * branch, always the signed-in tutor's own records (the rules allow nothing else). Firestore de-duplicates identical
 * listeners, so several screens can use the same hook.
 */

const col = (branchId: string, name: string) => collection(db, ROOT.branches, branchId, name);

/** Today in the branch's zone and the minute of the day, kept current (every 30 s, and when the app comes back). */
export function useBranchNow(): { today: DateKey; nowMin: number; now: number } {
  const { timezone } = useBranch();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && setNow(Date.now()));
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, []);
  return useMemo(() => ({ today: todayKey(timezone, now), nowMin: nowMinutes(timezone, now), now }), [timezone, now]);
}

/** The tutor's own sessions between two dates (inclusive), deleted ones (Trash) left out. */
export function useMySessions(from: DateKey, to: DateKey) {
  const { branchId, staffId } = useBranch();
  const state = useQuery<Session>(staffId ? `my-sessions-${branchId}-${staffId}-${from}-${to}` : null, () =>
    query(col(branchId, COL.sessions), where("tutorId", "==", staffId), where("dateKey", ">=", from), where("dateKey", "<=", to)),
  );
  const data = useMemo(() => state.data.filter((s) => !s.isDeleted).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin), [state.data]);
  return { ...state, data };
}

/** One session by ID (a deep link, a push, the session sheet). */
export function useSession(id: string | null) {
  const { branchId } = useBranch();
  return useDoc<Session>(id ? `${ROOT.branches}/${branchId}/${COL.sessions}/${id}` : null);
}

/** The tutor's availability between two dates, as a map by dateKey. */
export function useMyAvailability(from: DateKey, to: DateKey) {
  const { branchId, staffId } = useBranch();
  const state = useQuery<Availability>(staffId ? `my-availability-${branchId}-${staffId}-${from}-${to}` : null, () =>
    query(col(branchId, COL.availability), where("staffId", "==", staffId), where("dateKey", ">=", from), where("dateKey", "<=", to)),
  );
  const map = useMemo(() => new Map(state.data.map((d) => [d.dateKey, d])), [state.data]);
  return { map, loading: state.loading, error: state.error };
}

/** Per-date opening hours (day configs) between two dates, as a map by dateKey. */
export function useDayConfigs(from: DateKey, to: DateKey) {
  const { branchId } = useBranch();
  const state = useQuery<DayConfig>(`dayconfigs-${branchId}-${from}-${to}`, () => query(col(branchId, COL.dayConfigs), where("dateKey", ">=", from), where("dateKey", "<=", to)));
  const map = useMemo(() => new Map(state.data.map((d) => [d.dateKey, d])), [state.data]);
  return { map, loading: state.loading };
}

/** A date's opening hours (its day config, else the branch's default week). */
export function useHoursOf(from: DateKey, to: DateKey) {
  const { settings } = useBranch();
  const { map, loading } = useDayConfigs(from, to);
  return { hoursOf: (dateKey: DateKey) => dayHours(dateKey, settings, map), loading };
}

/** The tutor's clock shifts (the kiosk's clock-ins and clock-outs) between two dates. */
export function useMyShifts(from: DateKey, to: DateKey) {
  const { branchId, staffId } = useBranch();
  const state = useQuery<ClockShift>(staffId ? `my-shifts-${branchId}-${staffId}-${from}-${to}` : null, () =>
    query(col(branchId, COL.clockShifts), where("staffId", "==", staffId), where("dateKey", ">=", from), where("dateKey", "<=", to)),
  );
  const data = useMemo(() => state.data.slice().sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.inMin - b.inMin), [state.data]);
  return { ...state, data };
}

/** The tutor's pay rates (their own compensation record; the rules let them read it). */
export function useMyCompensation() {
  const { branchId, staffId } = useBranch();
  return useDoc<Compensation>(staffId ? `${ROOT.branches}/${branchId}/${COL.staff}/${staffId}/private/${DOC.compensation}` : null);
}

/** One student's basic record (every staff member may read it; contacts stay admin-only). */
export function useStudent(id: string | null) {
  const { branchId } = useBranch();
  return useDoc<Student>(id ? `${ROOT.branches}/${branchId}/${COL.students}/${id}` : null);
}

/** Several students by ID (in chunks of 30, as Firestore's `in` allows), as a map. */
export function useStudentsByIds(ids: string[]) {
  const { branchId } = useBranch();
  const unique = useMemo(() => [...new Set(ids.filter(Boolean))].sort(), [ids]);
  const chunks = useMemo(() => {
    const out: string[][] = [];
    for (let i = 0; i < unique.length; i += 30) out.push(unique.slice(i, i + 30));
    return out.slice(0, 4);
  }, [unique]);
  const a = useQuery<Student>(chunks[0] ? `students-${branchId}-${chunks[0].join(",")}` : null, () => query(col(branchId, COL.students), where(documentId(), "in", chunks[0])));
  const b = useQuery<Student>(chunks[1] ? `students-${branchId}-${chunks[1].join(",")}` : null, () => query(col(branchId, COL.students), where(documentId(), "in", chunks[1])));
  const c = useQuery<Student>(chunks[2] ? `students-${branchId}-${chunks[2].join(",")}` : null, () => query(col(branchId, COL.students), where(documentId(), "in", chunks[2])));
  const d = useQuery<Student>(chunks[3] ? `students-${branchId}-${chunks[3].join(",")}` : null, () => query(col(branchId, COL.students), where(documentId(), "in", chunks[3])));
  const map = useMemo(() => new Map([...a.data, ...b.data, ...c.data, ...d.data].map((s) => [s.id, s])), [a.data, b.data, c.data, d.data]);
  return { map, loading: a.loading || b.loading || c.loading || d.loading };
}

/** The branch's subject catalog (categories → subjects), in their order. */
export function useSubjectCatalog() {
  const { branchId } = useBranch();
  const subjects = useQuery<Subject>(`subjects-${branchId}`, () => query(col(branchId, COL.subjects), orderBy("order")));
  const categories = useQuery<SubjectCategory>(`subject-categories-${branchId}`, () => query(col(branchId, COL.subjectCategories), orderBy("order")));
  return { subjects: subjects.data, categories: categories.data, loading: subjects.loading || categories.loading };
}

/** A document reference inside the branch, for writes. */
export function branchDoc(branchId: string, ...segments: string[]) {
  return doc(db, ROOT.branches, branchId, ...(segments as [string, ...string[]]));
}
