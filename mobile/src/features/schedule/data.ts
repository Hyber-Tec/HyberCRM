import { collection, getDocsFromServer, query, where } from "@react-native-firebase/firestore";
import { effectiveRanges, normalizeRanges } from "@shared/availability";
import { COL, ROOT } from "@shared/paths";
import type { Conflict } from "@shared/schedule/conflicts";
import { unionMinutes } from "@shared/schedule/lanes";
import { canLog } from "@shared/sessions/logs";
import type { DayHours, SessionStatus } from "@shared/settings/defaults";
import { type DateKey, type Weekday, addDays, startOfWeek } from "@shared/time";
import type { Availability, AvailabilityRange, ClockShift, Session } from "@shared/types";
import { useMemo } from "react";
import { useBranchNow, useHoursOf, useMyAvailability, useMySessions, useMyShifts, useStudentsByIds } from "@/features/data/hooks";
import { db } from "@/lib/firebase";
import { useBranch } from "@/state/BranchProvider";
import { computeConflicts } from "./conflicts";

export type SessionDoc = Session & { id: string };
export type ShiftDoc = ClockShift & { id: string };

/** "Now" in the branch's zone, for the schedule's screens (today, the minute of the day, the instant). */
export function useClock(): { today: DateKey; nowMin: number; now: number } {
  return useBranchNow();
}

/**
 * The dates Today and Schedule keep live: two weeks before this week to five weeks after it. Both screens read this
 * same range, so their listeners are shared, Today's lists (logs to write, the next four weeks) fit in it, and moving
 * between nearby weeks on the schedule needs no new reads.
 */
export function scheduleWindow(today: DateKey, weekStartsOn: Weekday): { from: DateKey; to: DateKey } {
  const start = startOfWeek(today, weekStartsOn);
  return { from: addDays(start, -14), to: addDays(start, 41) };
}

export const isEnded = (s: Pick<Session, "dateKey" | "endMin">, today: DateKey, nowMin: number) => s.dateKey < today || (s.dateKey === today && s.endMin <= nowMin);

export const hasStarted = (s: Pick<Session, "dateKey" | "startMin">, today: DateKey, nowMin: number) => s.dateKey < today || (s.dateKey === today && s.startMin <= nowMin);

/** Happening right now (and still expected: not canceled or a no-show). */
export const isLive = (s: Pick<Session, "dateKey" | "startMin" | "endMin" | "status">, today: DateKey, nowMin: number) =>
  s.status !== "canceled" && s.status !== "no_show" && s.dateKey === today && s.startMin <= nowMin && nowMin < s.endMin;

export type LogState = "submitted" | "missing" | null;

/**
 * The session-log mark a card shows (True Education's, DECISIONS §5): ✓ once the log is submitted; ⚠ "Please write
 * your session log." when the session has ended, its status takes a log and none is submitted; otherwise nothing.
 */
export function logStateOf(s: Pick<Session, "dateKey" | "endMin" | "status" | "logStatus">, today: DateKey, nowMin: number, allowed: readonly SessionStatus[]): LogState {
  if (s.logStatus === "submitted") return "submitted";
  return isEnded(s, today, nowMin) && canLog(s.status, allowed) ? "missing" : null;
}

/** Availability that counts on a date: inside that date's opening hours, none when marked unavailable. */
export function rangesOn(a: Availability | undefined, hours: DayHours): AvailabilityRange[] {
  if (!a || a.unavailable) return [];
  return effectiveRanges(normalizeRanges(a.ranges ?? []), hours);
}

/**
 * Everything the tutor's schedule shows for a range of dates, live: their sessions (Trash left out), availability,
 * each date's opening hours, clock shifts, the students' records, and the sessions in conflict.
 */
export function useTutorSchedule(from: DateKey, to: DateKey, clock: { today: DateKey; nowMin: number; now: number }) {
  const { rules } = useBranch();
  const sessions = useMySessions(from, to);
  const availability = useMyAvailability(from, to);
  const { hoursOf, loading: hoursLoading } = useHoursOf(from, to);
  // Shifts exist up to today only.
  const shifts = useMyShifts(from, to < clock.today ? to : clock.today);
  const studentIds = useMemo(() => sessions.data.map((s) => s.studentId), [sessions.data]);
  const students = useStudentsByIds(studentIds);

  const conflicts = useMemo(
    () =>
      computeConflicts({
        sessions: sessions.data,
        availability: availability.map,
        hoursOf,
        students: students.map,
        maxPerTutor: rules.maxStudentsPerTutor,
        today: clock.today,
        nowMin: clock.nowMin,
      }),
    [sessions.data, availability.map, hoursOf, students.map, rules.maxStudentsPerTutor, clock.today, clock.nowMin],
  );

  return {
    sessions: sessions.data as SessionDoc[],
    availability: availability.map,
    hoursOf,
    shifts: shifts.data as ShiftDoc[],
    students: students.map,
    conflicts,
    conflictsOf: (id: string): Conflict[] => conflicts.get(id) ?? [],
    loading: sessions.loading || hoursLoading,
    availabilityLoading: availability.loading,
    error: sessions.error,
  };
}

export type TutorSchedule = ReturnType<typeof useTutorSchedule>;

/** One day of the tutor's week, as the schedule draws it. */
export interface DayModel {
  dateKey: DateKey;
  hours: DayHours;
  /** In time order, canceled ones included. */
  sessions: SessionDoc[];
  /** Not canceled. */
  active: SessionDoc[];
  /** The availability that counts that day. */
  ranges: AvailabilityRange[];
  /** An availability record exists for the day (times, or marked unavailable). */
  availabilitySet: boolean;
  conflicts: number;
  missingLogs: number;
  /** Booked time, overlapping sessions counted once (as the website's rail). */
  bookedMin: number;
  /** Closed days show only when sessions are still booked on them (DECISIONS Q20). */
  visible: boolean;
}

export function buildDays(days: readonly DateKey[], data: Pick<TutorSchedule, "sessions" | "availability" | "hoursOf" | "conflicts">, today: DateKey, nowMin: number, allowed: readonly SessionStatus[]): DayModel[] {
  return days.map((dateKey) => {
    const hours = data.hoursOf(dateKey);
    const sessions = data.sessions.filter((s) => s.dateKey === dateKey).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.studentName.localeCompare(b.studentName));
    const active = sessions.filter((s) => s.status !== "canceled");
    const a = data.availability.get(dateKey);
    return {
      dateKey,
      hours,
      sessions,
      active,
      ranges: rangesOn(a, hours),
      availabilitySet: !!a && (a.unavailable || (a.ranges ?? []).length > 0),
      conflicts: sessions.filter((s) => data.conflicts.has(s.id)).length,
      missingLogs: sessions.filter((s) => logStateOf(s, today, nowMin, allowed) === "missing").length,
      bookedMin: unionMinutes(active),
      visible: hours.isOpen || sessions.length > 0,
    };
  });
}

/**
 * Pull to refresh: the listeners are live already, so this asks the server once to make sure what's shown is current
 * (and to tell an offline phone apart). False when the server couldn't be reached.
 */
export async function confirmWithServer(branchId: string, staffId: string, from: DateKey, to: DateKey): Promise<boolean> {
  try {
    await getDocsFromServer(query(collection(db, ROOT.branches, branchId, COL.sessions), where("tutorId", "==", staffId), where("dateKey", ">=", from), where("dateKey", "<=", to)));
    return true;
  } catch {
    return false;
  }
}

/** The tutor's first name, for greetings. */
export function firstNameOf(staff: { firstName?: string; name?: string } | null, fallback: string): string {
  return (staff?.firstName || staff?.name?.split(/\s+/)[0] || fallback.split(/\s+/)[0] || "").trim();
}
