import { router, useLocalSearchParams, useNavigation, useScrollToTop } from "expo-router";
import * as Haptics from "expo-haptics";
import { CalendarClock, CalendarX, ChevronDown, ChevronUp, UserRoundX } from "lucide-react-native";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeInLeft, FadeInRight } from "react-native-reanimated";
import { type DateKey, addDays, diffDays, isDateKey, weekDays } from "@shared/time";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { type DayModel, type SessionDoc, buildDays, confirmWithServer, scheduleWindow, useClock, useTutorSchedule } from "@/features/schedule/data";
import { DaySection } from "@/features/schedule/DaySection";
import { DayTimeline } from "@/features/schedule/DayTimeline";
import { plural, weekRange, weekdayName } from "@/features/schedule/format";
import { WaitingBanner } from "@/features/schedule/WaitingBanner";
import { WeekStrip } from "@/features/schedule/WeekStrip";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

type Mode = "list" | "day";

/** "This week", "Next week", "Last week", "In 3 weeks", "2 weeks ago". */
function weekCaption(weeks: number): string {
  if (weeks === 0) return "This week";
  if (weeks === 1) return "Next week";
  if (weeks === -1) return "Last week";
  return weeks > 0 ? `In ${weeks} weeks` : `${-weeks} weeks ago`;
}

/**
 * The tutor's schedule, a week at a time (True Education's phone schedule, rebuilt): the week's days on a strip, then
 * each day's sessions; earlier days of this week fold away; swipe sideways for another week. "Day" shows one day on
 * a timeline. Read-only: tapping a session opens it; only admins change sessions. Notifications link here with
 * `?date=YYYY-MM-DD`.
 */
export default function ScheduleScreen() {
  const { branchId, staffId, settings, rules } = useBranch();
  const colors = useColors();
  const navigation = useNavigation<{ setParams: (params: { date?: string }) => void }>();
  const params = useLocalSearchParams<{ date?: string }>();
  const now = useClock();
  const { today, nowMin } = now;
  const weekStartsOn = settings.general.weekStartsOn;
  const hour12 = settings.general.timeFormat !== "24h";
  const allowed = settings.sessionLogs.allowForStatuses;

  const [anchor, setAnchor] = useState<DateKey>(() => (isDateKey(params.date) ? params.date : today));
  const [mode, setMode] = useState<Mode>("list");
  const [earlierOpen, setEarlierOpen] = useState(() => isDateKey(params.date) && params.date < today);
  const [direction, setDirection] = useState(0);
  const [jump, setJump] = useState<{ dateKey: DateKey; n: number } | null>(() => (isDateKey(params.date) ? { dateKey: params.date, n: 0 } : null));
  const [appliedParam, setAppliedParam] = useState(params.date);

  // A notification (or any link) opened /schedule?date=…: show that day's week and scroll to it, once per link.
  if (params.date !== appliedParam) {
    setAppliedParam(params.date);
    if (isDateKey(params.date)) {
      setAnchor(params.date);
      setEarlierOpen(params.date < today);
      setJump((j) => ({ dateKey: params.date as DateKey, n: (j?.n ?? 0) + 1 }));
    }
  }
  // Then forget the link, so coming back to the tab later doesn't jump again (True Education's bug).
  useEffect(() => {
    if (params.date) navigation.setParams({ date: undefined });
  }, [params.date, navigation]);

  const days = weekDays(anchor, weekStartsOn);
  const weekStart = days[0];
  const thisWeekStart = weekDays(today, weekStartsOn)[0];
  const isThisWeek = weekStart === thisWeekStart;
  const win = scheduleWindow(today, weekStartsOn);
  const range = weekStart >= win.from && days[6] <= win.to ? win : { from: weekStart, to: days[6] };
  const data = useTutorSchedule(range.from, range.to, now);
  const model = buildDays(days, data, today, nowMin, allowed);

  const weekHasSessions = model.some((d) => d.sessions.length > 0);
  // Past days show only when something was booked; closed days only when sessions are still on them.
  const shown = model.filter((d) => d.visible && (d.sessions.length > 0 || d.dateKey >= today));
  const earlier = isThisWeek ? shown.filter((d) => d.dateKey < today) : [];
  const rest = isThisWeek ? shown.filter((d) => d.dateKey >= today) : shown;
  const waiting = model.reduce((n, d) => n + d.conflicts, 0);

  // Where each day's section sits in the list, to scroll to it from the strip or a link.
  const scroll = useRef<ScrollView>(null);
  // Tapping the Schedule tab again goes back to the top of the week.
  useScrollToTop(scroll);
  const listTop = useRef(0);
  const offsets = useRef(new Map<DateKey, number>());
  const pending = useRef<DateKey | null>(null);
  const scrollToDay = (d: DateKey): boolean => {
    const y = offsets.current.get(d);
    if (y === undefined) return false;
    scroll.current?.scrollTo({ y: Math.max(0, listTop.current + y - space.sm), animated: true });
    pending.current = null;
    return true;
  };
  // Another week starts at its top (before any jump into it). Positions are kept by date, so each week has its own;
  // its sections report them again as they lay out (possibly before this runs).
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [weekStart]);

  const onJump = useEffectEvent((d: DateKey) => {
    pending.current = d;
    scrollToDay(d);
  });
  useEffect(() => {
    if (jump) onJump(jump.dateKey);
  }, [jump]);

  const goWeek = (delta: number) => {
    setDirection(delta);
    setAnchor(addDays(anchor, 7 * delta));
    setEarlierOpen(false);
  };
  const isShownDay = (d: DateKey) => data.hoursOf(d).isOpen || data.sessions.some((s) => s.dateKey === d);
  const stepDay = (delta: number) => {
    let d = anchor;
    for (let i = 0; i < 14; i++) {
      d = addDays(d, delta);
      if (isShownDay(d)) break;
    }
    setDirection(delta);
    setAnchor(d);
  };
  const goToday = () => {
    setDirection(today >= anchor ? 1 : -1);
    setAnchor(today);
    setEarlierOpen(false);
  };
  const selectDay = (d: DateKey) => {
    setDirection(d >= anchor ? 1 : -1);
    setAnchor(d);
    if (mode === "list") {
      if (isThisWeek && d < today) setEarlierOpen(true);
      setJump((j) => ({ dateKey: d, n: (j?.n ?? 0) + 1 }));
    }
  };
  const changeMode = (m: Mode) => {
    setMode(m);
    if (m === "day" && !isShownDay(anchor)) {
      // The first day of this week that is on the schedule, from today (or the week's start) on.
      const from = isThisWeek ? today : weekStart;
      const next = model.find((d) => d.visible && d.dateKey >= from) ?? model.find((d) => d.visible);
      if (next) setAnchor(next.dateKey);
    }
  };

  // Swipe sideways for the next or previous week (a day, on the timeline), as True Education's phone schedule did.
  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-24, 24])
    .failOffsetY([-14, 14])
    .onEnd((e) => {
      if (Math.abs(e.translationX) < 60 || Math.abs(e.translationX) < 1.4 * Math.abs(e.translationY)) return;
      void Haptics.selectionAsync().catch(() => undefined);
      if (mode === "list") goWeek(e.translationX < 0 ? 1 : -1);
      else stepDay(e.translationX < 0 ? 1 : -1);
    });

  const open = (s: SessionDoc) => router.push({ pathname: "/session/[id]", params: { id: s.id } });
  const writeLog = (s: SessionDoc) => router.push(`/log/${s.id}`);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (!staffId) return;
    setRefreshing(true);
    const [ok] = await Promise.all([confirmWithServer(branchId, staffId, range.from, range.to), new Promise((r) => setTimeout(r, 500))]);
    setRefreshing(false);
    if (!ok) toast.error("You’re offline", { description: "This is what was saved on this phone. It updates by itself once you’re back online." });
  };

  if (!staffId) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="schedule-screen">
        <EmptyState icon={<UserRoundX size={26} color={colors.mutedForeground} />} title="No employee record yet" text="Your employee record isn’t linked yet. Ask an admin." />
      </View>
    );
  }

  const entering = direction >= 0 ? FadeInRight.duration(220) : FadeInLeft.duration(220);
  const earlierSessions = earlier.reduce((n, d) => n + d.active.length, 0);
  const earlierMissing = earlier.reduce((n, d) => n + d.missingLogs, 0);
  // The anchor is always in the week shown.
  const anchorDay = model.find((d) => d.dateKey === anchor) ?? model[0];

  return (
    <View style={[styles.fill, { backgroundColor: colors.grouped }]}>
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <WeekStrip
          days={model}
          selected={mode === "day" ? anchor : null}
          today={today}
          label={weekRange(days[0], days[6])}
          caption={weekCaption(Math.round(diffDays(thisWeekStart, weekStart) / 7))}
          showToday={mode === "day" ? anchor !== today : !isThisWeek}
          onSelect={selectDay}
          onPrev={() => goWeek(-1)}
          onNext={() => goWeek(1)}
          onToday={goToday}
        />
        <SegmentedControl<Mode>
          testID="schedule-mode"
          value={mode}
          options={[
            { value: "list", label: "Week" },
            { value: "day", label: "Day" },
          ]}
          onChange={changeMode}
        />
      </View>
      <GestureDetector gesture={swipe}>
        <ScrollView
          ref={scroll}
          testID="schedule-screen"
          style={styles.fill}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        >
          {data.loading ? (
            <SkeletonCards count={4} height={84} />
          ) : data.error ? (
            <EmptyState icon={<CalendarX size={26} color={colors.mutedForeground} />} title="Couldn’t load your schedule" text="Check your connection, then pull down to try again." />
          ) : mode === "day" ? (
            <Animated.View
              key={`day-${anchor}`}
              entering={entering}
              style={styles.list}
              onLayout={(e) => {
                listTop.current = e.nativeEvent.layout.y;
              }}
            >
              <WaitingBanner count={anchorDay.conflicts} scope={anchor === today ? "today" : `on ${weekdayName(anchor)}`} />
              <DayTimeline
                dateKey={anchor}
                day={anchorDay}
                data={data}
                today={today}
                nowMin={nowMin}
                hour12={hour12}
                allowed={allowed}
                maxLanes={rules.maxStudentsPerTutor}
                onOpen={open}
                scrollTo={(y) => scroll.current?.scrollTo({ y: listTop.current + y, animated: false })}
              />
            </Animated.View>
          ) : !weekHasSessions ? (
            <Animated.View key={`empty-${weekStart}`} entering={entering}>
              <EmptyWeek days={model} today={today} isThisWeek={isThisWeek} onToday={goToday} />
            </Animated.View>
          ) : (
            <Animated.View
              key={`list-${weekStart}`}
              entering={entering}
              style={styles.list}
              onLayout={(e) => {
                listTop.current = e.nativeEvent.layout.y;
              }}
            >
              <WaitingBanner count={waiting} scope="this week" />
              {earlier.length > 0 ? (
                <Pressable
                  testID="schedule-earlier"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: earlierOpen }}
                  onPress={() => {
                    void Haptics.selectionAsync().catch(() => undefined);
                    setEarlierOpen(!earlierOpen);
                  }}
                  style={({ pressed }) => [styles.earlier, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                >
                  {earlierOpen ? <ChevronUp size={18} color={colors.mutedForeground} /> : <ChevronDown size={18} color={colors.mutedForeground} />}
                  <View style={styles.grow}>
                    <T variant="label">{earlierOpen ? "Hide earlier days" : "Show earlier this week"}</T>
                    <T variant="small" tone="muted">
                      {plural(earlier.length, "day")} · {plural(earlierSessions, "session")}
                      {earlierMissing ? (
                        <T variant="small" style={{ color: colors.warning, fontWeight: "600" }}>
                          {" "}
                          · {plural(earlierMissing, "log")} to write
                        </T>
                      ) : null}
                    </T>
                  </View>
                </Pressable>
              ) : null}
              {[...(earlierOpen ? earlier : []), ...rest].map((d) => (
                <DaySection
                  key={d.dateKey}
                  day={d}
                  today={today}
                  nowMin={nowMin}
                  hour12={hour12}
                  allowed={allowed}
                  conflictsOf={data.conflictsOf}
                  onOpen={open}
                  onWriteLog={writeLog}
                  onLayout={(e) => {
                    offsets.current.set(d.dateKey, e.nativeEvent.layout.y);
                    if (pending.current === d.dateKey) scrollToDay(d.dateKey);
                  }}
                />
              ))}
              {rest.length === 0 ? (
                <T tone="muted" style={styles.center}>
                  No more sessions this week.
                </T>
              ) : null}
            </Animated.View>
          )}
        </ScrollView>
      </GestureDetector>
    </View>
  );
}

/** A week with nothing booked: say so, with what the tutor can do about it. */
function EmptyWeek({ days, today, isThisWeek, onToday }: { days: DayModel[]; today: DateKey; isThisWeek: boolean; onToday: () => void }) {
  const colors = useColors();
  const open = days.filter((d) => d.hours.isOpen && d.dateKey >= today);
  const unset = open.filter((d) => !d.availabilitySet).length;
  const past = days[6].dateKey < today;
  const text = past
    ? "Nothing was booked for you that week."
    : open.length === 0
      ? "The center is closed for the rest of this week."
      : unset === open.length
        ? "Nothing is booked for you yet, and you haven’t set your availability for these days."
        : unset > 0
          ? `Nothing is booked for you yet. ${plural(unset, "open day")} still ${unset === 1 ? "needs" : "need"} your availability.`
          : "Nothing is booked for you yet.";
  return (
    <View testID="schedule-empty">
      <EmptyState
        icon={<CalendarClock size={26} color={colors.mutedForeground} />}
        title={isThisWeek ? "No sessions this week" : past ? "No sessions that week" : "No sessions yet"}
        text={text}
        action={
          <View style={styles.actions}>
            {!past && unset > 0 ? (
              <Button variant="outline" onPress={() => router.navigate("/availability")} testID="schedule-set-availability">
                Set availability
              </Button>
            ) : null}
            {!isThisWeek ? (
              <Button variant="outline" onPress={onToday} testID="schedule-go-this-week">
                Go to this week
              </Button>
            ) : null}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  content: { padding: space.lg, paddingBottom: space.xxl * 2 },
  list: { gap: space.xl },
  grow: { flex: 1 },
  earlier: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  center: { textAlign: "center", paddingVertical: space.md },
  actions: { flexDirection: "row", gap: space.md, flexWrap: "wrap", justifyContent: "center" },
});
