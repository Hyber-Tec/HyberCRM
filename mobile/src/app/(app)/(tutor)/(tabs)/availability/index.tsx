import { type DateKey, addDays, addMonths, endOfMonth, nowMinutes, startOfMonth, startOfWeek } from "@shared/time";
import { router, Stack } from "expo-router";
import { CalendarDays, Ellipsis } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { DatePickerDialog } from "@/components/DatePickerDialog";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { MonthScroller, type MonthScrollerHandle, WeekdayHeader } from "@/components/MonthScroller";
import { availabilityError, planDays, saveDays, skippedText } from "@/features/availability/api";
import { CalendarDay, type DayLook } from "@/features/availability/CalendarDay";
import { CopyWeekDialog, type WeekChoice } from "@/features/availability/CopyWeekDialog";
import { DEFAULT_REPEAT_WEEKS } from "@/features/availability/DayEditor";
import { useAvailabilityRules, useAvailabilityStanding, useAvailabilityWindow } from "@/features/availability/hooks";
import { AvailabilityStanding, availabilityRule } from "@/features/availability/Standing";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { useColors } from "@/theme";

const ROW_HEIGHT = 84;

/**
 * The tutor's availability: months stacked vertically and scrolled like the phone's Calendar (permanent rule),
 * opening on this month, with each day's times as boxes. Tap a day to set its times (the day sheet). The top says
 * where the tutor stands and the branch's rule; the ⋯ menu has the website's Copy last week and Repeat weekly.
 */
export default function AvailabilityScreen() {
  const { branchId, actor, settings, timezone, staffId, staff } = useBranch();
  const colors = useColors();
  const a = settings.availability;
  const rules = useAvailabilityRules();
  const { today, now, locked, lockedThrough, lockDays } = rules;

  // The data window: two months back, a year ahead, and wider as the calendar scrolls past either end.
  const [win, setWin] = useState(() => ({ from: startOfMonth(addMonths(today, -2)), to: endOfMonth(addMonths(today, 12)) }));
  const onVisibleRangeChange = useCallback((from: DateKey, to: DateKey) => {
    setWin((w) => {
      const next = { ...w };
      if (from < addMonths(w.from, 1)) next.from = startOfMonth(addMonths(from, -6));
      if (to > addMonths(w.to, -1)) next.to = endOfMonth(addMonths(to, 6));
      return next.from === w.from && next.to === w.to ? w : next;
    });
  }, []);
  const { availability, dayConfigs, hoursOf, rangesOf, loading } = useAvailabilityWindow(win.from, win.to);
  const { gaps, gapSet, setThrough } = useAvailabilityStanding(availability, dayConfigs, rangesOf);

  const look = useCallback(
    (d: DateKey): DayLook => ({ ranges: rangesOf(d), isOpen: hoursOf(d).isOpen, isToday: d === today, isPast: d < today, locked: locked(d), needsTimes: gapSet.has(d) }),
    [rangesOf, hoursOf, today, locked, gapSet],
  );
  // A month is drawn again only when what its days show changes.
  const monthSignature = useCallback(
    (month: DateKey) => {
      const days = Number(endOfMonth(month).slice(8));
      let sig = `${today}|${lockedThrough}`;
      for (let i = 0; i < days; i++) {
        const l = look(addDays(month, i));
        sig += `;${l.isOpen ? 1 : 0}${l.needsTimes ? 1 : 0}${l.ranges.map((r) => `${r.startMin}-${r.endMin}`).join(",")}`;
      }
      return sig;
    },
    [look, today, lockedThrough],
  );

  const openDay = useCallback((d: DateKey) => router.push({ pathname: "/availability-day", params: { date: d } }), []);
  const renderDay = useCallback((d: DateKey, size: { width: number; height: number }) => <CalendarDay date={d} look={look(d)} width={size.width} height={size.height} onPress={openDay} />, [look, openDay]);

  const scroller = useRef<MonthScrollerHandle>(null);
  const goToday = () => scroller.current?.scrollToDate(today);

  // Copy last week: the coming weeks that still have days the tutor can change.
  const [copyOpen, setCopyOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const weekStartsOn = settings.general.weekStartsOn;
  const weeks = useMemo((): WeekChoice[] => {
    const out: WeekChoice[] = [];
    const first = startOfWeek(today, weekStartsOn);
    for (let i = 0; i < 12 && out.length < 8; i++) {
      const start = addDays(first, 7 * i);
      const days = Array.from({ length: 7 }, (_, k) => addDays(start, k));
      const open = days.filter((d) => hoursOf(d).isOpen);
      const editable = open.filter((d) => !locked(d)).length;
      if (!editable) continue;
      out.push({ start, editable, open: open.length, sourceDays: days.filter((d) => rangesOf(addDays(d, -7)).length > 0).length });
    }
    return out;
  }, [today, weekStartsOn, locked, hoursOf, rangesOf]);

  const staffName = staff?.name ?? actor.name;
  const copyWeek = async (start: DateKey) => {
    if (!staffId) return;
    const days = Array.from({ length: 7 }, (_, k) => addDays(start, k));
    const { writes, skipped } = planDays(
      days.map((d) => ({ date: d, ranges: rangesOf(addDays(d, -7)) })),
      { locked, hoursOf, rangesOf, availability: a },
    );
    setCopying(true);
    try {
      const ctx = { branchId, actor, timezone, staffId, staffName, currentRanges: rangesOf, hoursOf, today, nowMin: nowMinutes(timezone, now) };
      if (writes.length && !(await saveDays(ctx, writes, `Copied last week’s availability for ${staffName}`))) return;
      const note = skippedText(skipped);
      if (writes.length) toast.success("Last week copied", note ? { description: note } : undefined);
      else toast.info("Nothing changed", note ? { description: note } : undefined);
      setCopyOpen(false);
      scroller.current?.scrollToDate(start);
    } catch (e) {
      toast.error(availabilityError(e, true));
    } finally {
      setCopying(false);
    }
  };

  // Repeat weekly: pick a day with times, then its sheet opens with the repeat already set (the website's dialog).
  const [repeatOpen, setRepeatOpen] = useState(false);
  const noTimes = useCallback((d: DateKey) => rangesOf(d).length === 0, [rangesOf]);
  const repeatDay = (d: DateKey) => {
    setRepeatOpen(false);
    // The picker's fade finishes first: the phone presents one screen at a time.
    setTimeout(() => router.push({ pathname: "/availability-day", params: { date: d, repeat: String(DEFAULT_REPEAT_WEEKS) } }), 350);
  };

  const menu = () => {
    // Android: the phone's own dialog lists the tools (iPhone gets a menu in the header).
    Alert.alert("Availability", undefined, [
      { text: "Copy last week…", onPress: () => setCopyOpen(true) },
      { text: "Repeat weekly…", onPress: () => setRepeatOpen(true) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  if (!staffId) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]} testID="availability-screen">
        <EmptyState icon={<CalendarDays size={26} color={colors.mutedForeground} />} title="Your employee record isn’t linked yet" text="Ask an admin to link it, then your availability shows here." />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]} testID="availability-screen">
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button onPress={goToday} accessibilityLabel="Go to today">
            Today
          </Stack.Toolbar.Button>
          <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="More">
            <Stack.Toolbar.MenuAction icon="doc.on.doc" onPress={() => setCopyOpen(true)}>
              Copy last week…
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon="repeat" onPress={() => setRepeatOpen(true)}>
              Repeat weekly…
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      ) : (
        <Stack.Screen
          options={{
            headerRight: () => (
              <View style={styles.headerButtons}>
                <Button variant="ghost" size="sm" onPress={goToday} accessibilityLabel="Go to today" testID="availability-today">
                  Today
                </Button>
                <IconButton icon={<Ellipsis size={22} color={colors.foreground} />} accessibilityLabel="More" onPress={menu} testID="availability-more" />
              </View>
            ),
          }}
        />
      )}
      <AvailabilityStanding
        today={today}
        setThrough={setThrough}
        gaps={gaps}
        leadDays={a.leadTimeDays}
        asksNotice={a.leadTimeEnforcement !== "off"}
        rule={availabilityRule(a, lockDays)}
        loading={loading}
        onSetFirstGap={() => {
          if (!gaps[0]) return;
          scroller.current?.scrollToDate(gaps[0]);
          openDay(gaps[0]);
        }}
      />
      <WeekdayHeader weekStartsOn={weekStartsOn} />
      <MonthScroller
        ref={scroller}
        anchor={today}
        weekStartsOn={weekStartsOn}
        rowHeight={ROW_HEIGHT}
        monthsBefore={24}
        renderDay={renderDay}
        monthSignature={monthSignature}
        onVisibleRangeChange={onVisibleRangeChange}
        testID="availability-calendar"
      />
      <CopyWeekDialog open={copyOpen} weeks={weeks} busy={copying} onClose={() => !copying && setCopyOpen(false)} onCopy={(start) => void copyWeek(start)} />
      <DatePickerDialog
        open={repeatOpen}
        title="Repeat weekly"
        hint="Pick a day with times to copy to the same weekday in the following weeks."
        value={null}
        today={today}
        weekStartsOn={weekStartsOn}
        min={today}
        isDisabled={noTimes}
        onPick={repeatDay}
        onClose={() => setRepeatOpen(false)}
        testID="repeat-pick"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerButtons: { flexDirection: "row", alignItems: "center", gap: 4 },
});
