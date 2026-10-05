import { type Conflict, isAhead, sessionConflicts } from "@shared/schedule/conflicts";
import type { DayHours } from "@shared/settings/defaults";
import type { DateKey } from "@shared/time";
import type { Availability, Session, Student } from "@shared/types";

type SessionDoc = Session & { id: string };

/**
 * Which of the tutor's sessions may not happen as booked, by session ID (shared/src/schedule/conflicts.ts applied to
 * each session still ahead), as the website's tutor schedule computes it (web/src/features/schedule/conflicts.ts): a
 * tutor sees only their own sessions and counts as active.
 */
export function computeConflicts(input: {
  sessions: readonly SessionDoc[];
  /** The tutor's availability by date. */
  availability: ReadonlyMap<DateKey, Availability>;
  hoursOf: (dateKey: DateKey) => DayHours;
  students: ReadonlyMap<string, Student>;
  maxPerTutor: number;
  today: DateKey;
  nowMin: number;
}): Map<string, Conflict[]> {
  const byDay = new Map<DateKey, SessionDoc[]>();
  const byStudentDay = new Map<string, SessionDoc[]>();
  for (const s of input.sessions) {
    if (s.isDeleted) continue;
    byDay.set(s.dateKey, [...(byDay.get(s.dateKey) ?? []), s]);
    const k = `${s.studentId}|${s.dateKey}`;
    byStudentDay.set(k, [...(byStudentDay.get(k) ?? []), s]);
  }
  const out = new Map<string, Conflict[]>();
  for (const s of input.sessions) {
    if (s.isDeleted || !isAhead(s, input.today, input.nowMin)) continue;
    const a = input.availability.get(s.dateKey);
    const list = sessionConflicts(s, {
      hours: input.hoursOf(s.dateKey),
      availability: a ? { ranges: a.ranges, unavailable: a.unavailable } : null,
      tutorState: "active",
      studentStatus: input.students.get(s.studentId)?.status ?? null,
      tutorSessions: byDay.get(s.dateKey) ?? [],
      studentSessions: byStudentDay.get(`${s.studentId}|${s.dateKey}`) ?? [],
      maxPerTutor: input.maxPerTutor,
    });
    if (list.length) out.set(s.id, list);
  }
  return out;
}
