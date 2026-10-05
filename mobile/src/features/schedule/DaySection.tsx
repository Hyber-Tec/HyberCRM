import { CalendarOff } from "lucide-react-native";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import type { Conflict } from "@shared/schedule/conflicts";
import type { SessionStatus } from "@shared/settings/defaults";
import { type DateKey, addDays } from "@shared/time";
import type { AvailabilityRange } from "@shared/types";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";
import { type DayModel, type SessionDoc, isLive, logStateOf } from "./data";
import { hours, listWords, monthDay, plural, shortDay, timeRange, weekdayName } from "./format";
import { SessionCard } from "./SessionCard";

/** "2:00 – 4:30 PM and 6:00 – 9:00 PM". */
export function rangesText(ranges: readonly AvailabilityRange[], hour12: boolean): string {
  return listWords(ranges.map((r) => timeRange(r.startMin, r.endMin, hour12)));
}

/** "Today", "Tomorrow", "Yesterday" or the weekday, and the date beside it. */
export function dayWords(dateKey: DateKey, today: DateKey): { primary: string; secondary: string; relative: boolean } {
  const relative = dateKey === today ? "Today" : dateKey === addDays(today, 1) ? "Tomorrow" : dateKey === addDays(today, -1) ? "Yesterday" : null;
  return relative ? { primary: relative, secondary: shortDay(dateKey), relative: true } : { primary: weekdayName(dateKey), secondary: monthDay(dateKey), relative: false };
}

/** One day of the week list: its heading, then its sessions (or, on an open day, that nothing is booked). */
export function DaySection({
  day,
  today,
  nowMin,
  hour12,
  allowed,
  conflictsOf,
  onOpen,
  onWriteLog,
  onLayout,
}: {
  day: DayModel;
  today: DateKey;
  nowMin: number;
  hour12: boolean;
  allowed: readonly SessionStatus[];
  conflictsOf: (id: string) => Conflict[];
  onOpen: (s: SessionDoc) => void;
  onWriteLog: (s: SessionDoc) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const colors = useColors();
  const words = dayWords(day.dateKey, today);
  const isToday = day.dateKey === today;
  const past = day.dateKey < today;
  const summary = day.active.length ? `${plural(day.active.length, "session")} · ${hours(day.bookedMin)}` : day.sessions.length ? plural(day.sessions.length, "canceled session") : "";
  return (
    <View style={styles.section} onLayout={onLayout} testID={`schedule-section-${day.dateKey}`}>
      <View style={styles.head} accessibilityRole="header" accessibilityLabel={`${words.primary}, ${words.secondary}${summary ? `, ${summary}` : ""}`}>
        <T variant="label" style={{ color: isToday ? colors.now : past ? colors.mutedForeground : colors.foreground }}>
          {words.primary}
        </T>
        <T variant="label" tone="muted" style={styles.date}>
          {words.secondary}
        </T>
        <View style={styles.grow} />
        {!day.hours.isOpen ? (
          <View style={[styles.closed, { backgroundColor: colors.destructiveTint }]}>
            <CalendarOff size={12} color={colors.destructive} />
            <T variant="tiny" style={{ color: colors.destructive, fontWeight: "600" }}>
              Center closed
            </T>
          </View>
        ) : (
          <T variant="small" tone="muted" style={styles.tabular}>
            {summary}
          </T>
        )}
      </View>
      {day.sessions.length ? (
        day.sessions.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            conflicts={conflictsOf(s.id)}
            logState={logStateOf(s, today, nowMin, allowed)}
            live={isLive(s, today, nowMin)}
            hour12={hour12}
            onPress={() => onOpen(s)}
            onWriteLog={() => onWriteLog(s)}
          />
        ))
      ) : (
        <View style={[styles.empty, { borderColor: colors.border }]} testID={`schedule-free-${day.dateKey}`}>
          <T variant="small" tone="muted">
            No sessions ·{" "}
            {day.ranges.length ? `You’re available ${rangesText(day.ranges, hour12)}` : day.availabilitySet ? "You’re not available" : "No availability set"}
          </T>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.xs },
  date: { fontWeight: "500" },
  grow: { flex: 1 },
  tabular: { fontVariant: ["tabular-nums"] },
  closed: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  empty: { borderWidth: StyleSheet.hairlineWidth, borderStyle: "dashed", borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md },
});
