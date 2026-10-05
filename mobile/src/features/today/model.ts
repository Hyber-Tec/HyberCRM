import type { Conflict } from "@shared/schedule/conflicts";
import { unionMinutes } from "@shared/schedule/lanes";
import { canLog } from "@shared/sessions/logs";
import type { SessionStatus } from "@shared/settings/defaults";
import { type DateKey, addDays } from "@shared/time";
import { type SessionDoc, type ShiftDoc, isEnded, isLive, logStateOf } from "@/features/schedule/data";

/** What Today puts first: the session in progress, else the next one today, else the next one on a later day. */
export interface NextUp {
  kind: "live" | "next" | "later";
  session: SessionDoc;
  /** Others at the same time (in progress together, or starting together). */
  also: SessionDoc[];
}

const byTime = (a: SessionDoc, b: SessionDoc) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin || a.endMin - b.endMin || a.studentName.localeCompare(b.studentName);

/** Sessions still expected to happen (not canceled, not a no-show). */
const expected = (s: SessionDoc) => s.status !== "canceled" && s.status !== "no_show" && !s.isDeleted;

export function nextUp(sessions: readonly SessionDoc[], today: DateKey, nowMin: number): NextUp | null {
  const pool = sessions.filter(expected);
  const live = pool.filter((s) => isLive(s, today, nowMin)).sort((a, b) => a.endMin - b.endMin || byTime(a, b));
  if (live.length) return { kind: "live", session: live[0], also: live.slice(1) };
  const later = pool.filter((s) => s.dateKey > today || (s.dateKey === today && s.startMin > nowMin)).sort(byTime);
  const first = later[0];
  if (!first) return null;
  return { kind: first.dateKey === today ? "next" : "later", session: first, also: later.filter((s) => s.id !== first.id && s.dateKey === first.dateKey && s.startMin === first.startMin) };
}

/** Today's sessions in time order, canceled ones included. */
export function sessionsOn(sessions: readonly SessionDoc[], dateKey: DateKey): SessionDoc[] {
  return sessions.filter((s) => s.dateKey === dateKey).sort(byTime);
}

/**
 * Logs to write: sessions in the last `lookbackDays` (the website's Home uses the same window) that have ended, take
 * a log by their status, and have none submitted. Most recent first.
 */
export function logsToWrite(sessions: readonly SessionDoc[], today: DateKey, nowMin: number, allowed: readonly SessionStatus[], lookbackDays: number): SessionDoc[] {
  const from = addDays(today, -lookbackDays);
  return sessions.filter((s) => s.dateKey >= from && logStateOf(s, today, nowMin, allowed) === "missing").sort((a, b) => byTime(b, a));
}

/** Sessions in conflict in the next `days` days, soonest first. */
export function conflictsAhead(sessions: readonly SessionDoc[], conflicts: ReadonlyMap<string, Conflict[]>, today: DateKey, days = 28): { session: SessionDoc; conflicts: Conflict[] }[] {
  const until = addDays(today, days - 1);
  return sessions
    .filter((s) => s.dateKey <= until && conflicts.has(s.id))
    .sort(byTime)
    .map((session) => ({ session, conflicts: conflicts.get(session.id) ?? [] }));
}

export interface WeekSummary {
  sessions: number;
  /** Still to come (not ended). */
  remaining: number;
  bookedMin: number;
  /** Ended sessions that take a log, and how many of those have one. */
  logsDue: number;
  logsDone: number;
}

export function weekSummary(sessions: readonly SessionDoc[], days: readonly DateKey[], today: DateKey, nowMin: number, allowed: readonly SessionStatus[]): WeekSummary {
  const inWeek = sessions.filter((s) => days.includes(s.dateKey));
  const active = inWeek.filter((s) => s.status !== "canceled");
  const due = inWeek.filter((s) => isEnded(s, today, nowMin) && (s.logStatus === "submitted" || canLog(s.status, allowed)));
  return {
    sessions: active.length,
    remaining: active.filter((s) => expected(s) && !isEnded(s, today, nowMin)).length,
    bookedMin: days.reduce((n, d) => n + unionMinutes(active.filter((s) => s.dateKey === d)), 0),
    logsDue: due.length,
    logsDone: due.filter((s) => s.logStatus === "submitted").length,
  };
}

export type ClockTone = "in" | "out" | "late" | "idle";

/**
 * The time clock, as Today shows it: clocked in (since when), clocked out (at what time), or not yet, in amber once a
 * session has started without a clock-in (the website's Home marks such tutors the same way; unclocked time isn't
 * paid). Nothing on a day without sessions.
 */
export function clockStatus(shifts: readonly ShiftDoc[], todays: readonly SessionDoc[], today: DateKey, nowMin: number): { tone: ClockTone; inMin?: number; outMin?: number; since?: DateKey; startMin?: number } | null {
  const open = shifts.find((s) => s.status === "open");
  if (open) return { tone: "in", inMin: open.inMin, since: open.dateKey };
  const closed = shifts.filter((s) => s.dateKey === today && s.status === "closed").sort((a, b) => (a.outMin ?? 0) - (b.outMin ?? 0));
  const last = closed[closed.length - 1];
  if (last) return { tone: "out", inMin: closed[0].inMin, outMin: last.outMin ?? last.inMin };
  const coming = todays.filter(expected);
  if (!coming.length) return null;
  const started = coming.find((s) => s.startMin <= nowMin);
  return started ? { tone: "late", startMin: started.startMin } : { tone: "idle" };
}

/** "Good morning", "Good afternoon" or "Good evening" by the branch's clock. */
export function greeting(nowMin: number): string {
  return nowMin < 12 * 60 ? "Good morning" : nowMin < 17 * 60 ? "Good afternoon" : "Good evening";
}
