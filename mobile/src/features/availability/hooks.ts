import { availabilityGaps, dayHours, effectiveLockDays, effectiveRanges, isInsideLeadTime, isLockedForTutor, normalizeRanges } from "@shared/availability";
import { type DateKey, addDays } from "@shared/time";
import type { Availability, AvailabilityRange, DayConfig } from "@shared/types";
import { useCallback, useMemo, useState } from "react";
import { useBranchNow, useDayConfigs, useMyAvailability } from "@/features/data/hooks";
import { useBranch } from "@/state/BranchProvider";

type AvailabilityMap = Map<DateKey, Availability & { id: string }>;
type DayConfigMap = Map<DateKey, DayConfig & { id: string }>;

/**
 * The tutor's availability and each date's opening hours between two dates, live. While a new range loads, the
 * last one stays on screen (no blank calendar while scrolling). `rangesOf` is what counts on a date: the saved
 * times inside that date's hours (none on closed days), as on the website.
 */
export function useAvailabilityWindow(from: DateKey, to: DateKey) {
  const { settings } = useBranch();
  const avail = useMyAvailability(from, to);
  const configs = useDayConfigs(from, to);
  const ready = !avail.loading && !configs.loading;
  const [kept, setKept] = useState<{ a: AvailabilityMap; c: DayConfigMap } | null>(null);
  if (ready && (kept?.a !== avail.map || kept?.c !== configs.map)) setKept({ a: avail.map, c: configs.map });
  const availability = ready ? avail.map : (kept?.a ?? avail.map);
  const dayConfigs = ready ? configs.map : (kept?.c ?? configs.map);
  const hoursOf = useCallback((d: DateKey) => dayHours(d, settings, dayConfigs), [settings, dayConfigs]);
  const rangesOf = useCallback((d: DateKey): AvailabilityRange[] => effectiveRanges(normalizeRanges(availability.get(d)?.ranges ?? []), hoursOf(d)), [availability, hoursOf]);
  return { availability, dayConfigs, hoursOf, rangesOf, loading: !ready && !kept, error: avail.error };
}

/** The last date for which `test` holds, walking forward from `from` (the rules below are true up to a date, then false). */
function lastDayWhere(from: DateKey, maxDays: number, test: (d: DateKey) => boolean): DateKey {
  let last = addDays(from, -1);
  for (let i = 0; i <= maxDays; i++) {
    const d = addDays(from, i);
    if (!test(d)) break;
    last = d;
  }
  return last;
}

/**
 * Where the lock window and the lead time end today, from the shared rules (`@shared/availability`): days up to
 * `lockedThrough` can't be changed by the tutor (past days included), and open days up to `leadThrough` should
 * already have times. Recomputed as the clock moves, but the dates only change when a boundary is crossed.
 */
export function useAvailabilityRules() {
  const { settings, timezone } = useBranch();
  const { today, now } = useBranchNow();
  const a = settings.availability;
  const lockDays = effectiveLockDays(settings);
  const lockedThrough = useMemo(() => lastDayWhere(today, Math.max(lockDays, 0) + 2, (d) => isLockedForTutor(d, timezone, lockDays, new Date(now))), [today, lockDays, timezone, now]);
  const leadThrough = useMemo(() => lastDayWhere(today, a.leadTimeDays + 2, (d) => isInsideLeadTime(d, timezone, a.leadTimeDays, new Date(now))), [today, a.leadTimeDays, timezone, now]);
  return {
    today,
    now,
    lockDays,
    lockedThrough,
    leadThrough,
    locked: useCallback((d: DateKey) => d <= lockedThrough, [lockedThrough]),
    /** The website's lead-time warning: only when the branch warns, inside the lead time, and not locked. */
    leadWarning: useCallback((d: DateKey) => a.leadTimeEnforcement === "warn" && d <= leadThrough && d > lockedThrough, [a.leadTimeEnforcement, leadThrough, lockedThrough]),
  };
}

/**
 * Where the tutor stands: the open days inside the lead time that still need times (the calendar's amber days and
 * Today's "availability still to set", counted by the shared `availabilityGaps`), and the furthest date with times.
 */
export function useAvailabilityStanding(availability: AvailabilityMap, dayConfigs: DayConfigMap, rangesOf: (d: DateKey) => AvailabilityRange[]) {
  const { settings, timezone } = useBranch();
  const { today, now } = useBranchNow();
  // The lock and the lead time move at a local midnight, which in every zone falls on a quarter hour: the gaps are
  // counted again then, not on every tick of the clock.
  const quarter = Math.floor(now / 900_000) * 900_000;
  const gaps = useMemo(
    () => availabilityGaps({ today, timeZone: timezone, settings, dayConfigs, rangesOn: (d) => availability.get(d)?.ranges, now: new Date(quarter) }),
    [today, timezone, settings, dayConfigs, availability, quarter],
  );
  const setThrough = useMemo(() => {
    let last: DateKey | null = null;
    for (const d of availability.keys()) if (d >= today && (!last || d > last) && rangesOf(d).length > 0) last = d;
    return last;
  }, [availability, today, rangesOf]);
  return { gaps, gapSet: useMemo(() => new Set(gaps), [gaps]), setThrough };
}
