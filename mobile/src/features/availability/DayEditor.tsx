import { fitRangesToDay, normalizeRanges, rangesEqual, weeklyRepeats } from "@shared/availability";
import { type DateKey, WEEKDAY_LABELS, addDays, formatDateKey, formatMinutes, formatTimeRange, nowMinutes, weekdayOf } from "@shared/time";
import type { AvailabilityRange } from "@shared/types";
import { router, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { CalendarX, Lock, Plus, Trash2, TriangleAlert, X } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ErrorBox } from "@/components/AuthParts";
import { Button } from "@/components/Button";
import { confirmAsync } from "@/components/Confirm";
import { IconButton } from "@/components/IconButton";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SheetScrollArea } from "@/components/SheetScrollArea";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { TimeWheel } from "@/components/TimeWheel";
import { ToastHost } from "@/components/ToastHost";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import { type DayWrite, availabilityError, describeRanges, planDays, saveDays, skippedText } from "./api";
import { useAvailabilityRules, useAvailabilityWindow } from "./hooks";

type DayForm = { ranges: AvailabilityRange[]; off: boolean };

/** The website's Repeat weekly choices (0 = off), and the one it starts on. */
export const REPEAT_WEEKS = [0, 1, 2, 3, 4, 6, 8, 12] as const;
export const DEFAULT_REPEAT_WEEKS = 4;

/** The time choices of a wheel, as the website's TimeSelect: from `min` to `max` in steps, plus the value if it's off the step. */
function timeOptions(min: number, max: number, step: number, value: number): number[] {
  const out: number[] = [];
  for (let m = min; m <= max; m += step) out.push(m);
  if (!out.includes(value)) out.push(value);
  return out.sort((x, y) => x - y);
}

const timeLabel = (m: number) => (m === 1440 ? "Midnight" : formatMinutes(m));

/**
 * One day's availability, in a sheet over the calendar (the website's day dialog): that date's opening hours, its
 * time ranges with start and end wheels (the branch's step, inside that date's hours), up to the branch's number of
 * ranges, "Not available this day", and Repeat weekly. Locked days are read-only, in the website's words. Saving
 * warns first when booked sessions would be left outside the new times.
 */
export function DayEditor({ date, repeatWeeks = 0 }: { date: DateKey; /** Repeat weekly preset (from the ⋯ menu's Repeat weekly). */ repeatWeeks?: number }) {
  const { branchId, actor, settings, timezone, staffId, staff } = useBranch();
  const colors = useColors();
  const a = settings.availability;
  const step = a.stepMinutes;
  const rules = useAvailabilityRules();
  const { today, now, lockDays } = rules;
  const lastRepeat = addDays(date, 7 * REPEAT_WEEKS[REPEAT_WEEKS.length - 1]);
  const { hoursOf, rangesOf, loading } = useAvailabilityWindow(date, lastRepeat);

  const hours = hoursOf(date);
  const saved = rangesOf(date);
  const locked = rules.locked(date);
  const past = date < today;
  const leadWarning = rules.leadWarning(date);

  // The form starts from what is saved once it has loaded (a new day: that date's opening hours).
  const [form, setForm] = useState<DayForm | null>(null);
  const [opened, setOpened] = useState<DayForm | null>(null);
  const [active, setActive] = useState(0);
  const [weeks, setWeeks] = useState(repeatWeeks);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!form && !loading) {
    const first = { ranges: saved.length ? saved : [{ startMin: hours.openMin, endMin: hours.closeMin }], off: false };
    setForm(first);
    setOpened(first);
  }

  const staffName = staff?.name ?? actor.name;
  const weekday = WEEKDAY_LABELS[weekdayOf(date)];
  // Leaving with changes asks first: the close button, a swipe down (iPhone) and the back button (Android) all come
  // here. After a save the sheet closes without asking, and only once.
  const navigation = useNavigation();
  const leaving = useRef(false);
  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : router.replace("/availability"));
  const close = () => {
    if (leaving.current) return;
    leaving.current = true;
    goBack();
  };

  const nextRanges = form ? (form.off ? [] : form.ranges) : saved;
  // Changed since the sheet opened (a new day's prefilled hours aren't a change to throw away).
  const edited = !!form && !!opened && (form.off !== opened.off || !rangesEqual(form.ranges, opened.ranges));
  const dirty = edited || weeks !== repeatWeeks;

  usePreventRemove(dirty, ({ data }) => {
    if (leaving.current) return navigation.dispatch(data.action);
    if (busy) return;
    void confirmAsync({ title: "Discard changes?", message: "Your changes to this day aren’t saved.", confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true }).then((ok) => {
      if (!ok) return;
      leaving.current = true;
      navigation.dispatch(data.action);
    });
  });

  const setRange = (i: number, patch: Partial<AvailabilityRange>) => {
    if (!form) return;
    setError(null);
    setForm({
      ...form,
      ranges: form.ranges.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, ...patch };
        // A start moved past the end takes the end along (one step later, inside the hours).
        if (patch.startMin !== undefined && next.endMin <= next.startMin) next.endMin = Math.min(hours.closeMin, next.startMin + Math.max(step, a.minBlockMinutes));
        return next;
      }),
    });
  };

  const canAdd = !!form && !form.off && form.ranges.length < a.maxRangesPerDay && roomAfter(form.ranges, hours.closeMin, a.minBlockMinutes);
  const addRange = () => {
    if (!form) return;
    const last = normalizeRanges(form.ranges).pop();
    const start = last ? Math.min(last.endMin + step, hours.closeMin - a.minBlockMinutes) : hours.openMin;
    setForm({ ...form, ranges: [...form.ranges, { startMin: start, endMin: Math.min(start + 120, hours.closeMin) }] });
    setActive(form.ranges.length);
    setError(null);
  };
  const removeRange = (i: number) => {
    if (!form) return;
    setForm({ ...form, ranges: form.ranges.filter((_, idx) => idx !== i) });
    setActive((x) => Math.max(0, x >= i ? x - 1 : x));
    setError(null);
  };

  const save = async () => {
    if (!form || !staffId) return;
    setError(null);
    // The website's checks, in its words.
    let dayRanges = saved;
    if (!locked) {
      for (const r of nextRanges) {
        if (r.endMin <= r.startMin) return setError("End time must be after start time.");
        if (r.endMin - r.startMin < a.minBlockMinutes) return setError(`Each range must be at least ${a.minBlockMinutes} minutes.`);
      }
      // Availability follows this date's opening hours (owner rule).
      const fit = fitRangesToDay(nextRanges, hours, a);
      if (!fit.ok) {
        return setError(
          fit.reason === "closed"
            ? "The center is closed on this day."
            : fit.reason === "too_many"
              ? `Use at most ${a.maxRangesPerDay} time ranges per day.`
              : `Choose a time within opening hours (${formatTimeRange(hours.openMin, hours.closeMin)}).`,
        );
      }
      dayRanges = fit.ranges;
    }
    const days: DayWrite[] = [];
    const dayChanged = !locked && !rangesEqual(dayRanges, saved);
    if (dayChanged) days.push({ dateKey: date, ranges: dayRanges });
    let skipped = {};
    if (weeks > 0 && dayRanges.length > 0) {
      const plan = planDays(
        weeklyRepeats(date, weeks).map((d) => ({ date: d, ranges: dayRanges })),
        { locked: rules.locked, hoursOf, rangesOf, availability: a },
      );
      days.push(...plan.writes);
      skipped = plan.skipped;
    }
    const note = skippedText(skipped);
    const repeated = weeks > 0 ? `Repeated for ${weeks} week${weeks > 1 ? "s" : ""}` : null;
    if (days.length === 0) {
      if (repeated) toast.info("Nothing changed", note ? { description: note } : undefined);
      close();
      return;
    }
    const summary =
      weeks > 0 && dayRanges.length > 0
        ? dayChanged
          ? `Set ${staffName}’s availability on ${formatDateKey(date, "weekdayMedium")}: ${describeRanges(dayRanges)}, repeated weekly for ${weeks} week${weeks > 1 ? "s" : ""}`
          : `Repeated ${staffName}’s availability weekly`
        : undefined;
    setBusy(true);
    try {
      const ctx = { branchId, actor, timezone, staffId, staffName, currentRanges: rangesOf, hoursOf, today, nowMin: nowMinutes(timezone, now) };
      if (!(await saveDays(ctx, days, summary))) return;
      if (dayChanged) toast.success("Availability saved", repeated || note ? { description: [repeated && `${repeated}.`, note].filter(Boolean).join(" ") } : undefined);
      else toast.success(repeated ?? "Availability saved", note ? { description: note } : undefined);
      close();
    } catch (e) {
      setError(availabilityError(e, days.length > 1));
    } finally {
      setBusy(false);
    }
  };

  const range = form && !form.off ? (form.ranges[Math.min(active, form.ranges.length - 1)] ?? null) : null;
  const activeIndex = form ? Math.min(active, form.ranges.length - 1) : 0;
  const repeatSource = locked ? saved : nextRanges;
  const showRepeat = !!form && repeatSource.length > 0 && hours.isOpen;
  const lastRepeatDate = weeks > 0 ? addDays(date, 7 * weeks) : null;

  return (
    <View style={styles.sheet} testID="availability-day">
      <View style={styles.head}>
        <View style={styles.grow}>
          <T variant="heading" testID="availability-day-title">
            {formatDateKey(date, "weekdayLong")}
          </T>
          <T variant="small" tone="muted">
            {hours.isOpen ? `Open ${formatTimeRange(hours.openMin, hours.closeMin)} this day` : "Closed this day"}
          </T>
        </View>
        <IconButton icon={<X size={20} color={colors.foreground} />} filled size={34} accessibilityLabel="Close" onPress={goBack} testID="availability-close" />
      </View>

      {loading || !form ? (
        <View style={styles.loading}>
          <Skeleton height={36} />
          <Skeleton height={52} />
          <Skeleton height={160} />
        </View>
      ) : !hours.isOpen ? (
        <Notice icon={<CalendarX size={16} color={colors.mutedForeground} />} text="The center is closed on this day." />
      ) : (
        <>
          {locked ? (
            <Notice
              icon={<Lock size={16} color={colors.mutedForeground} />}
              text={past ? "This day has passed, so its availability can’t be changed." : `This day is within ${lockDays} days and can’t be changed here. Please contact an admin.`}
              testID="availability-locked"
            />
          ) : leadWarning ? (
            <Notice icon={<TriangleAlert size={16} color={colors.warning} />} text={`Please set availability at least ${a.leadTimeDays} days in advance.`} tone="warning" testID="availability-lead-warning" />
          ) : null}

          {locked ? (
            <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {saved.length ? (
                saved.map((r, i) => (
                  <View key={i} style={[styles.rangeRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                    <T variant="label">{formatTimeRange(r.startMin, r.endMin)}</T>
                  </View>
                ))
              ) : (
                <View style={styles.rangeRow}>
                  <T tone="muted">No availability on this day.</T>
                </View>
              )}
            </View>
          ) : (
            <>
              <SegmentedControl
                testID="availability-mode"
                value={form.off ? "off" : "on"}
                options={[
                  { value: "on", label: "Available" },
                  { value: "off", label: "Not available this day" },
                ]}
                onChange={(v) => {
                  setError(null);
                  setForm({ ranges: form.ranges.length ? form.ranges : [{ startMin: hours.openMin, endMin: hours.closeMin }], off: v === "off" });
                }}
              />
              {form.off ? (
                <T tone="muted" style={styles.offText}>
                  No availability on this day.
                </T>
              ) : (
                <>
                  <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    {form.ranges.map((r, i) => {
                      const on = i === activeIndex;
                      return (
                        <View
                          key={i}
                          style={[styles.rangeLine, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, on && form.ranges.length > 1 && { backgroundColor: colors.accent }]}
                        >
                          <Pressable
                            testID={`range-${i}`}
                            accessibilityRole="button"
                            accessibilityLabel={`Time range ${i + 1}: ${formatTimeRange(r.startMin, r.endMin)}`}
                            accessibilityHint={form.ranges.length > 1 ? "Changes this range with the wheels below" : undefined}
                            accessibilityState={{ selected: on }}
                            onPress={() => setActive(i)}
                            style={styles.rangeMain}
                          >
                            <View style={[styles.dot, { backgroundColor: on ? colors.success : colors.border }]} />
                            <T variant="label" style={[styles.grow, r.endMin <= r.startMin && { color: colors.destructive }]}>
                              {formatTimeRange(r.startMin, r.endMin)}
                            </T>
                          </Pressable>
                          {form.ranges.length > 1 ? (
                            <IconButton icon={<Trash2 size={17} color={colors.mutedForeground} />} size={36} accessibilityLabel={`Remove ${formatTimeRange(r.startMin, r.endMin)}`} onPress={() => removeRange(i)} testID={`range-${i}-remove`} />
                          ) : null}
                        </View>
                      );
                    })}
                    {form.ranges.length < a.maxRangesPerDay ? (
                      <Pressable
                        testID="range-add"
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !canAdd }}
                        accessibilityHint={canAdd ? undefined : "End the last range earlier to make room for another"}
                        disabled={!canAdd}
                        onPress={addRange}
                        style={({ pressed }) => [styles.rangeRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
                      >
                        <Plus size={17} color={canAdd ? colors.foreground : colors.mutedForeground} />
                        <View style={styles.grow}>
                          <T variant="label" tone={canAdd ? "default" : "muted"}>
                            Add a time range
                          </T>
                          {!canAdd ? (
                            <T variant="small" tone="muted">
                              End the last range earlier to make room.
                            </T>
                          ) : null}
                        </View>
                      </Pressable>
                    ) : null}
                  </View>
                  {range ? (
                    <SheetScrollArea style={styles.wheels}>
                      <View style={styles.wheel}>
                        <T variant="small" tone="muted" style={styles.wheelLabel}>
                          Start
                        </T>
                        <TimeWheel
                          key={`start-${activeIndex}`}
                          values={timeOptions(hours.openMin, hours.closeMin - step, step, range.startMin)}
                          value={range.startMin}
                          onChange={(m) => setRange(activeIndex, { startMin: m })}
                          format={timeLabel}
                          label="Start time"
                          testID="start"
                        />
                      </View>
                      <View style={styles.wheel}>
                        <T variant="small" tone="muted" style={styles.wheelLabel}>
                          End
                        </T>
                        <TimeWheel
                          key={`end-${activeIndex}`}
                          values={timeOptions(hours.openMin + step, hours.closeMin, step, range.endMin)}
                          value={range.endMin}
                          onChange={(m) => setRange(activeIndex, { endMin: m })}
                          format={timeLabel}
                          label="End time"
                          testID="end"
                        />
                      </View>
                    </SheetScrollArea>
                  ) : null}
                </>
              )}
            </>
          )}

          {showRepeat ? (
            <View style={styles.repeat}>
              <T variant="small" tone="muted" style={styles.caps}>
                REPEAT EVERY {weekday.toUpperCase()}
              </T>
              <SegmentedControl
                testID="availability-repeat-weeks"
                value={String(weeks)}
                options={REPEAT_WEEKS.map((w) => ({ value: String(w), label: w === 0 ? "Off" : String(w) }))}
                onChange={(v) => setWeeks(Number(v))}
              />
              <T variant="small" tone="muted">
                {lastRepeatDate
                  ? `For ${weeks} week${weeks > 1 ? "s" : ""}, through ${formatDateKey(lastRepeatDate, "monthDay")}. Closed and locked days are skipped, and times follow each day’s opening hours.`
                  : `Copy these times to the next ${weekday}s too.`}
              </T>
            </View>
          ) : null}

          {error ? <ErrorBox>{error}</ErrorBox> : null}

          {locked ? (
            showRepeat ? (
              <Button size="lg" testID="availability-repeat" disabled={weeks === 0} busy={busy} onPress={() => void save()}>
                {weeks > 0 ? `Repeat for ${weeks} week${weeks > 1 ? "s" : ""}` : "Repeat weekly"}
              </Button>
            ) : null
          ) : (
            <Button size="lg" testID="availability-save" busy={busy} onPress={() => void save()}>
              Save
            </Button>
          )}
        </>
      )}
      <ToastHost />
    </View>
  );
}

/** Whether another range still fits after the last one before closing. */
function roomAfter(ranges: AvailabilityRange[], closeMin: number, minBlock: number): boolean {
  const last = normalizeRanges(ranges).pop();
  return !last || last.endMin + minBlock <= closeMin;
}

function Notice({ icon, text, tone = "muted", testID }: { icon: React.ReactNode; text: string; tone?: "muted" | "warning"; testID?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.notice, { backgroundColor: tone === "warning" ? colors.warningTint : colors.secondary }]} testID={testID} accessibilityRole="text">
      {icon}
      <T variant="small" style={[styles.grow, { color: tone === "warning" ? colors.warning : colors.foreground }]}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.xl, gap: space.lg },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  grow: { flex: 1 },
  loading: { gap: space.md },
  notice: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.md },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  rangeRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: 6, minHeight: 50 },
  rangeMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 50 },
  rangeLine: { flexDirection: "row", alignItems: "center", paddingRight: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  offText: { paddingHorizontal: space.xs },
  wheels: { flexDirection: "row", gap: space.md },
  wheel: { flex: 1, gap: space.xs },
  wheelLabel: { textAlign: "center", fontWeight: "600" },
  repeat: { gap: space.sm },
  caps: { fontWeight: "600", letterSpacing: 0.5, paddingHorizontal: space.xs },
});
