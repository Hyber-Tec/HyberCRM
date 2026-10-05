import * as Haptics from "expo-haptics";
import { CalendarOff, CircleAlert, CircleCheck, StickyNote, TriangleAlert } from "lucide-react-native";
import { useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { studentLabel } from "@shared/people";
import { layoutLanes } from "@shared/schedule/lanes";
import type { SessionStatus } from "@shared/settings/defaults";
import { type DateKey, formatMinutesShort } from "@shared/time";
import { EmptyState } from "@/components/EmptyState";
import { ListRow, ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { radius, space, useColors, useIsDark, useStatusColors } from "@/theme";
import { type DayModel, type SessionDoc, type TutorSchedule, isLive, logStateOf } from "./data";
import { clock, timeRange } from "./format";
import { rangesText } from "./DaySection";

/** Height of one minute on the timeline. */
const PX = 1.1;
const GUTTER = 54;
const PAD = 12;

/** A clock-in to clock-out on the timeline (an open shift runs to now). */
interface ClockSpan {
  id: string;
  startMin: number;
  endMin: number;
  open: boolean;
}

/**
 * Overlapping sessions share the width, as a phone's calendar draws them: each run of overlapping sessions gets as
 * many columns as it needs (at most the branch's students at once; True Education's lanes), and a session on its own
 * takes the full width.
 */
function columns(items: readonly SessionDoc[], maxLanes: number): Map<string, { col: number; cols: number }> {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out = new Map<string, { col: number; cols: number }>();
  let run: SessionDoc[] = [];
  let runEnd = -1;
  const flush = () => {
    const lanes = layoutLanes(run, maxLanes);
    const cols = Math.max(1, ...lanes.values()) + 1;
    for (const s of run) out.set(s.id, { col: lanes.get(s.id) ?? 0, cols: Math.min(cols, Math.max(1, maxLanes)) });
    run = [];
  };
  for (const s of sorted) {
    if (run.length && s.startMin >= runEnd) flush();
    run.push(s);
    runEnd = Math.max(runEnd, s.endMin);
  }
  if (run.length) flush();
  return out;
}

/**
 * One day on a timeline, time running down as in the phone's calendar: the tutor's availability (white; gray when
 * not available), their sessions side by side when they overlap, the clock-in and clock-out lines (green, as on the
 * website), and a red line at the current time today. Canceled sessions are listed under it.
 */
export function DayTimeline({
  dateKey,
  day,
  data,
  today,
  nowMin,
  hour12,
  allowed,
  maxLanes,
  onOpen,
  scrollTo,
}: {
  dateKey: DateKey;
  day: DayModel;
  data: Pick<TutorSchedule, "shifts" | "conflictsOf">;
  today: DateKey;
  nowMin: number;
  hour12: boolean;
  allowed: readonly SessionStatus[];
  maxLanes: number;
  onOpen: (s: SessionDoc) => void;
  /** Scrolls the screen to a point of the timeline (from its top). */
  scrollTo: (y: number) => void;
}) {
  const colors = useColors();
  const dark = useIsDark();
  const statusColors = useStatusColors();
  const isToday = dateKey === today;
  const canceled = day.sessions.filter((s) => s.status === "canceled");
  const active = day.active;

  const clocks: ClockSpan[] = data.shifts
    .filter((sh) => sh.dateKey === dateKey)
    .map((sh) => ({
      id: sh.id,
      startMin: sh.inMin,
      endMin: sh.status === "open" ? (isToday ? Math.max(sh.inMin + 1, nowMin) : 1440) : sh.outDateKey && sh.outDateKey > sh.dateKey ? 1440 : (sh.outMin ?? sh.inMin),
      open: sh.status === "open",
    }));

  // From the earlier of opening time, the first session and clocking in, to the latest of them, in whole hours.
  const points = [
    ...(day.hours.isOpen ? [day.hours.openMin, day.hours.closeMin] : []),
    ...active.flatMap((s) => [s.startMin, s.endMin]),
    ...clocks.flatMap((c) => [c.startMin, c.endMin]),
  ];
  const lo = points.length ? Math.max(0, Math.floor(Math.min(...points) / 60) * 60) : 14 * 60;
  const hi = points.length ? Math.min(1440, Math.ceil(Math.max(...points) / 60) * 60) : 21 * 60;
  const startMin = lo;
  const endMin = Math.max(hi, Math.min(1440, lo + 180));
  // A little room above the first hour and below the last, so their labels aren't cut.
  const y = (m: number) => PAD + (m - startMin) * PX;
  const height = y(endMin) + PAD;
  const hoursList: number[] = [];
  for (let m = startMin; m <= endMin; m += 60) hoursList.push(m);
  const showNow = isToday && nowMin >= startMin && nowMin <= endMin;
  const cols = columns(active, maxLanes);

  // Opening today late in the day: bring the current time into view, once the layout is known.
  const scrolled = useRef<string | null>(null);
  const rootTop = useRef(0);
  const gridTop = useRef(0);
  const settle = () => {
    if (scrolled.current === dateKey || !showNow || y(nowMin) < 280) return;
    scrolled.current = dateKey;
    requestAnimationFrame(() => scrollTo(Math.max(0, rootTop.current + gridTop.current + y(nowMin) - 160)));
  };

  if (!day.hours.isOpen && day.sessions.length === 0) {
    return <EmptyState icon={<CalendarOff size={26} color={colors.mutedForeground} />} title="Closed" text="The center is closed this day." testID="schedule-timeline-closed" />;
  }

  const unavailable = dark ? colors.background : colors.secondary;
  const clocked = clocks.length ? clocks.map((c) => (c.open ? `in since ${clock(c.startMin, hour12)}` : timeRange(c.startMin, c.endMin, hour12))).join(", ") : null;

  return (
    <View
      style={styles.wrap}
      testID="schedule-timeline"
      onLayout={(e) => {
        rootTop.current = e.nativeEvent.layout.y;
      }}
    >
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: colors.card, borderColor: colors.border }]} />
          <T variant="small" tone="muted">
            {!day.hours.isOpen
              ? "The center is closed this day"
              : day.ranges.length
                ? `Available ${rangesText(day.ranges, hour12)}`
                : day.availabilitySet
                  ? "Not available"
                  : "No availability set"}
          </T>
        </View>
        {clocked ? (
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: colors.success, borderColor: colors.success }]} />
            <T variant="small" tone="muted">
              Clocked {clocked}
            </T>
          </View>
        ) : null}
      </View>

      <View
        style={[styles.grid, { height, borderColor: colors.border, backgroundColor: colors.card }]}
        onLayout={(e) => {
          gridTop.current = e.nativeEvent.layout.y;
          settle();
        }}
      >
        {/* Not available (and closed) time is gray; the tutor's availability stays white. */}
        <View style={[styles.lanes, { backgroundColor: unavailable }]} />
        {day.ranges.map((r) => (
          <View key={`${r.startMin}-${r.endMin}`} style={[styles.band, { top: y(Math.max(r.startMin, startMin)), height: y(Math.min(r.endMin, endMin)) - y(Math.max(r.startMin, startMin)), backgroundColor: colors.card }]} />
        ))}

        {hoursList.map((m) => (
          <View key={m} style={[styles.hourLine, { top: y(m), borderTopColor: colors.border }]} />
        ))}
        {hoursList.map((m) =>
          showNow && Math.abs(m - nowMin) < 12 ? null : (
            <T key={`l${m}`} variant="tiny" tone="muted" style={[styles.hourLabel, { top: y(m) - 7 }]}>
              {hour12 ? formatMinutesShort(m) : `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:00`}
            </T>
          ),
        )}

        {/* Clocked time: a green bar by the hours and a line at each clock-in and clock-out. */}
        {clocks.map((c) => (
          <View key={c.id} pointerEvents="none">
            <View style={[styles.clockBar, { top: y(c.startMin), height: Math.max(2, y(c.endMin) - y(c.startMin)), backgroundColor: colors.success }]} />
            <View style={[styles.clockLine, { top: y(c.startMin) - 1, borderTopColor: colors.success, opacity: 0.8 }]} />
            {c.open ? null : <View style={[styles.clockLine, { top: y(c.endMin) - 1, borderTopColor: colors.success, opacity: 0.8 }]} />}
          </View>
        ))}

        <View style={styles.blocks} pointerEvents="box-none">
          {active.map((s) => {
            const st = statusColors[s.status] ?? statusColors.pending;
            const place = cols.get(s.id) ?? { col: 0, cols: 1 };
            const conflicts = data.conflictsOf(s.id);
            const log = logStateOf(s, today, nowMin, allowed);
            const h = Math.max(26, y(s.endMin) - y(s.startMin) - 2);
            const live = isLive(s, today, nowMin);
            return (
              <Pressable
                key={s.id}
                testID={`timeline-session-${s.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${s.studentName}${s.studentGrade ? `, grade ${s.studentGrade}` : ""}, ${s.subject || "no subject"}, ${clock(s.startMin, hour12)} to ${clock(s.endMin, hour12)}${live ? ", happening now" : ""}${conflicts.length ? ", not confirmed" : ""}`}
                onPress={() => {
                  void Haptics.selectionAsync().catch(() => undefined);
                  onOpen(s);
                }}
                style={({ pressed }) => [
                  styles.block,
                  {
                    top: y(s.startMin) + 1,
                    height: h,
                    left: `${(place.col / place.cols) * 100}%`,
                    width: `${100 / place.cols}%`,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.blockInner,
                    {
                      backgroundColor: st.bg,
                      borderColor: conflicts.length ? colors.destructive : st.border,
                      borderStyle: conflicts.length ? "dashed" : "solid",
                      borderWidth: conflicts.length ? 1.5 : StyleSheet.hairlineWidth * 2,
                      borderLeftColor: conflicts.length ? colors.destructive : st.bar,
                    },
                  ]}
                >
                  <View style={styles.blockHead}>
                    <T variant="small" numberOfLines={1} style={styles.blockName}>
                      {studentLabel(s.studentName, s.studentGrade)}
                    </T>
                    {conflicts.length ? <TriangleAlert size={12} color={colors.destructive} /> : null}
                    {s.note ? <StickyNote size={12} color={colors.info} /> : null}
                    {log === "submitted" ? <CircleCheck size={12} color={colors.info} /> : log === "missing" ? <CircleAlert size={12} color={colors.destructive} /> : null}
                  </View>
                  {h >= 40 ? (
                    <T variant="tiny" numberOfLines={1} style={{ color: st.text }}>
                      {s.subject || "No subject"}
                    </T>
                  ) : null}
                  {h >= 56 ? (
                    <T variant="tiny" numberOfLines={1} style={[styles.tabular, { color: st.text }]}>
                      {timeRange(s.startMin, s.endMin, hour12)}
                    </T>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        {showNow ? (
          <>
            <T variant="tiny" style={[styles.nowLabel, { top: y(nowMin) - 7, color: colors.now, backgroundColor: colors.card }]}>
              {clock(nowMin, hour12).replace(/ (AM|PM)$/, "")}
            </T>
            <View pointerEvents="none" style={[styles.now, { top: y(nowMin) - 4 }]} testID="schedule-now-line">
              <View style={[styles.nowDot, { backgroundColor: colors.now }]} />
              <View style={[styles.nowLine, { backgroundColor: colors.now }]} />
            </View>
          </>
        ) : null}
      </View>

      {active.length === 0 ? (
        <T tone="muted" style={styles.center}>
          No sessions this day.
        </T>
      ) : null}

      {canceled.length ? (
        <ListSection title="Canceled">
          {canceled.map((s) => (
            <ListRow
              key={s.id}
              testID={`timeline-canceled-${s.id}`}
              title={studentLabel(s.studentName, s.studentGrade)}
              subtitle={`${timeRange(s.startMin, s.endMin, hour12)} · ${s.subject || "No subject"}`}
              onPress={() => onOpen(s)}
            />
          ))}
        </ListSection>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  legend: { gap: 4, paddingHorizontal: space.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.sm },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth },
  grid: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  lanes: { position: "absolute", left: GUTTER, right: 0, top: 0, bottom: 0 },
  band: { position: "absolute", left: GUTTER, right: 0 },
  hourLine: { position: "absolute", left: GUTTER - 6, right: 0, borderTopWidth: StyleSheet.hairlineWidth },
  hourLabel: { position: "absolute", left: 0, width: GUTTER - 10, textAlign: "right", fontVariant: ["tabular-nums"] },
  clockBar: { position: "absolute", left: GUTTER - 4, width: 3, borderRadius: 2 },
  clockLine: { position: "absolute", left: GUTTER - 4, right: 0, borderTopWidth: 1.5 },
  blocks: { position: "absolute", left: GUTTER + 4, right: 6, top: 0, bottom: 0 },
  block: { position: "absolute", paddingHorizontal: 2 },
  blockInner: { flex: 1, borderRadius: 8, borderLeftWidth: 3, paddingHorizontal: 6, paddingVertical: 4, gap: 1, overflow: "hidden" },
  blockHead: { flexDirection: "row", alignItems: "center", gap: 4 },
  blockName: { flex: 1, fontWeight: "600" },
  tabular: { fontVariant: ["tabular-nums"] },
  now: { position: "absolute", left: GUTTER - 4, right: 0, height: 8, flexDirection: "row", alignItems: "center" },
  nowLabel: { position: "absolute", left: 0, width: GUTTER - 8, paddingRight: 2, textAlign: "right", fontWeight: "700", fontVariant: ["tabular-nums"] },
  nowDot: { width: 8, height: 8, borderRadius: 4 },
  nowLine: { flex: 1, height: 2 },
  center: { textAlign: "center" },
});
