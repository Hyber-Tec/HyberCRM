import { collection, getDocs, query, serverTimestamp, where, writeBatch } from "@react-native-firebase/firestore";
import { dayStartInstant, effectiveRanges, fitRangesToDay, normalizeRanges, rangesContain } from "@shared/availability";
import { COL, ROOT, availabilityDocId } from "@shared/paths";
import { isAhead, isCheckable } from "@shared/schedule/conflicts";
import type { BranchSettings, DayHours } from "@shared/settings/defaults";
import { type DateKey, formatDateKey, formatTimeRange, weekdayOf } from "@shared/time";
import type { AvailabilityRange, Session } from "@shared/types";
import { confirmAsync } from "@/components/Confirm";
import { branchDoc } from "@/features/data/hooks";
import { errorMessage } from "@/lib/api";
import { addAudit } from "@/lib/audit";
import { db } from "@/lib/firebase";
import type { Actor } from "@/state/BranchProvider";

/**
 * The tutor's availability writes, exactly as the website makes them (web/src/features/availability/api.ts): one
 * doc per day (`availability/{staffId}_{dateKey}`, removed when the day has no times), several days in one batch
 * with one audit entry, and a warning first when booked sessions would be left outside the new times.
 */

export interface DayWrite {
  dateKey: DateKey;
  /** Empty = no availability (the doc is removed). */
  ranges: AvailabilityRange[];
}

type SessionDoc = Session & { id: string };

/** Booked sessions (pending or confirmed, still ahead) that a change would leave outside the availability they were inside. */
export async function sessionsLeftUncovered(opts: {
  branchId: string;
  staffId: string;
  days: DayWrite[];
  /** What counts today for each day (saved ranges inside that date's hours). */
  currentRanges: (dateKey: DateKey) => AvailabilityRange[];
  hoursOf: (dateKey: DateKey) => DayHours;
  today: DateKey;
  nowMin: number;
}): Promise<SessionDoc[]> {
  const { branchId, staffId, days, currentRanges, hoursOf, today, nowMin } = opts;
  const after = new Map(days.map((d) => [d.dateKey, effectiveRanges(normalizeRanges(d.ranges), hoursOf(d.dateKey))]));
  // Days that only gain time can't leave anything uncovered.
  const shrinking = days.filter((d) => currentRanges(d.dateKey).some((r) => !rangesContain(after.get(d.dateKey) ?? [], r.startMin, r.endMin))).map((d) => d.dateKey);
  const out: SessionDoc[] = [];
  for (let i = 0; i < shrinking.length; i += 30) {
    const chunk = shrinking.slice(i, i + 30);
    const snap = await getDocs(query(collection(db, ROOT.branches, branchId, COL.sessions), where("tutorId", "==", staffId), where("dateKey", "in", chunk)));
    for (const d of snap.docs) {
      const s = { id: d.id, ...(d.data() as Session) };
      if (!isCheckable(s) || !isAhead(s, today, nowMin)) continue;
      const coveredNow = rangesContain(currentRanges(s.dateKey), s.startMin, s.endMin);
      const coveredAfter = rangesContain(after.get(s.dateKey) ?? [], s.startMin, s.endMin);
      if (coveredNow && !coveredAfter) out.push(s);
    }
  }
  return out.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin);
}

/** "Ava Patel (Fri, Oct 2, 4:00 PM - 5:30 PM), Theo Roberts (…) and 2 more" */
export function describeSessions(list: readonly Pick<Session, "studentName" | "dateKey" | "startMin" | "endMin">[], max = 3): string {
  const shown = list.slice(0, max).map((s) => `${s.studentName} (${formatDateKey(s.dateKey, "weekdayMedium")}, ${formatTimeRange(s.startMin, s.endMin)})`);
  const more = list.length - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : (shown[0] ?? "");
}

export function describeRanges(ranges: readonly AvailabilityRange[]): string {
  return ranges.length ? ranges.map((r) => formatTimeRange(r.startMin, r.endMin)).join(", ") : "none";
}

/** Writes availability for the tutor on several days in one batch (with one audit entry). The rules check the lock window. */
export async function writeAvailability(opts: { branchId: string; actor: Actor; timezone: string; staffId: string; staffName: string; days: DayWrite[]; summary?: string }) {
  const { branchId, actor, timezone, staffId, staffName, days } = opts;
  if (days.length === 0) return;
  for (let i = 0; i < days.length; i += 300) {
    const batch = writeBatch(db);
    for (const d of days.slice(i, i + 300)) {
      const ref = branchDoc(branchId, COL.availability, availabilityDocId(staffId, d.dateKey));
      const ranges = normalizeRanges(d.ranges);
      if (ranges.length === 0) {
        batch.delete(ref);
      } else {
        batch.set(ref, {
          staffId,
          dateKey: d.dateKey,
          weekday: weekdayOf(d.dateKey),
          ranges,
          unavailable: false,
          hidden: false,
          dayStartAt: dayStartInstant(d.dateKey, timezone),
          updatedVia: "tutor",
          updatedAt: serverTimestamp(),
          updatedBy: actor.email,
        });
      }
    }
    if (i === 0) {
      const first = days[0];
      addAudit(batch, branchId, actor, {
        action: "availability.update",
        category: "availability",
        entityType: "availability",
        entityId: availabilityDocId(staffId, first.dateKey),
        summary:
          opts.summary ??
          (days.length === 1
            ? `Set ${staffName}’s availability on ${formatDateKey(first.dateKey, "weekdayMedium")}: ${describeRanges(normalizeRanges(first.ranges))}`
            : `Updated ${staffName}’s availability on ${days.length} days`),
        tutorId: staffId,
        tutorName: staffName,
        dateKey: first.dateKey,
      });
    }
    await batch.commit();
  }
}

export interface SaveContext {
  branchId: string;
  actor: Actor;
  timezone: string;
  staffId: string;
  staffName: string;
  /** What counts today for a day (saved ranges inside its hours). */
  currentRanges: (dateKey: DateKey) => AvailabilityRange[];
  hoursOf: (dateKey: DateKey) => DayHours;
  today: DateKey;
  nowMin: number;
}

/**
 * Saves days of availability; first warns when booked sessions would end up outside it (they stay booked, as
 * conflicts, as on the website). False when the person backs out.
 */
export async function saveDays(ctx: SaveContext, days: DayWrite[], summary?: string): Promise<boolean> {
  if (days.length === 0) return true;
  const uncovered = await sessionsLeftUncovered({ branchId: ctx.branchId, staffId: ctx.staffId, days, currentRanges: ctx.currentRanges, hoursOf: ctx.hoursOf, today: ctx.today, nowMin: ctx.nowMin });
  if (uncovered.length) {
    const n = uncovered.length;
    const ok = await confirmAsync({
      title: `${n} booked session${n > 1 ? "s are" : " is"} in this time`,
      message: `${describeSessions(uncovered)} ${n > 1 ? "are" : "is"} booked in the time you’re removing. If you save, ${n > 1 ? "they stay" : "it stays"} booked and ${n > 1 ? "show" : "shows"} as a conflict until the admin moves, reassigns or cancels ${n > 1 ? "them" : "it"}. If it’s urgent, tell the admin too.`,
      confirmLabel: "Save anyway",
    });
    if (!ok) return false;
  }
  await writeAvailability({ branchId: ctx.branchId, actor: ctx.actor, timezone: ctx.timezone, staffId: ctx.staffId, staffName: ctx.staffName, days, summary });
  return true;
}

export const SKIP_REASON = { closed: "closed", outside: "outside opening hours", too_many: "too many ranges", locked: "locked" } as const;
export type SkipReason = keyof typeof SKIP_REASON;

/**
 * Turns a plan (day → times) into writes as the website's bulk tools do: locked days are skipped, each day is fitted
 * to its opening hours (closed days and times outside them are skipped), and unchanged days aren't written.
 */
export function planDays(
  plan: { date: DateKey; ranges: AvailabilityRange[] }[],
  opts: { locked: (d: DateKey) => boolean; hoursOf: (d: DateKey) => DayHours; rangesOf: (d: DateKey) => AvailabilityRange[]; availability: BranchSettings["availability"] },
): { writes: DayWrite[]; skipped: Partial<Record<SkipReason, number>> } {
  const writes: DayWrite[] = [];
  const skipped: Partial<Record<SkipReason, number>> = {};
  const skip = (why: SkipReason) => (skipped[why] = (skipped[why] ?? 0) + 1);
  for (const { date, ranges } of plan) {
    if (opts.locked(date)) {
      skip("locked");
      continue;
    }
    const fit = fitRangesToDay(ranges, opts.hoursOf(date), opts.availability);
    if (!fit.ok) {
      skip(fit.reason);
      continue;
    }
    if (JSON.stringify(opts.rangesOf(date)) !== JSON.stringify(fit.ranges)) writes.push({ dateKey: date, ranges: fit.ranges });
  }
  return { writes, skipped };
}

/** "Skipped: 2 locked, 1 closed." */
export function skippedText(skipped: Partial<Record<SkipReason, number>>): string | null {
  const notes = (Object.entries(skipped) as [SkipReason, number][]).map(([why, n]) => `${n} ${SKIP_REASON[why]}`);
  return notes.length ? `Skipped: ${notes.join(", ")}.` : null;
}

/** A refused or failed save in words (the rules refuse days inside the lock window). */
export function availabilityError(e: unknown, manyDays: boolean): string {
  const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
  const message = e instanceof Error ? e.message : "";
  if (/permission-denied/.test(code) || /permission/i.test(message)) return manyDays ? "Some of those days are locked. Please contact an admin." : "This day is locked. Please contact an admin.";
  return errorMessage(e, "Couldn’t save your availability. Try again.");
}
