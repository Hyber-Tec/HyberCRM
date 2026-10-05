import * as Haptics from "expo-haptics";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { type DateKey, parseDateKey } from "@shared/time";
import { IconButton } from "@/components/IconButton";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";
import type { DayModel } from "./data";
import { longDay, plural, weekdayInitial } from "./format";

/**
 * The top of the schedule: which week it is (with ‹ › and a "Today" pill when it isn't this week) and its seven days.
 * A dot marks days with sessions: red when one is waiting for the admin, amber when a log is missing. Closed days
 * with nothing booked are dimmed and can't be picked (they aren't on the schedule at all).
 */
export function WeekStrip({
  days,
  selected,
  today,
  label,
  caption,
  showToday,
  onSelect,
  onPrev,
  onNext,
  onToday,
}: {
  days: DayModel[];
  selected: DateKey | null;
  today: DateKey;
  label: string;
  caption: string;
  showToday: boolean;
  onSelect: (dateKey: DateKey) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.grow}>
          <T variant="small" tone="muted" testID="schedule-week-caption">
            {caption}
          </T>
          <T variant="subheading" testID="schedule-week-label" accessibilityRole="header">
            {label}
          </T>
        </View>
        {showToday ? (
          <Pressable
            testID="schedule-today"
            accessibilityRole="button"
            accessibilityLabel="Go to today"
            hitSlop={8}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => undefined);
              onToday();
            }}
            style={({ pressed }) => [styles.todayPill, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
          >
            <T variant="small" style={{ color: colors.primaryForeground, fontWeight: "600" }}>
              Today
            </T>
          </Pressable>
        ) : null}
        <IconButton testID="schedule-prev" icon={<ChevronLeft size={22} color={colors.foreground} />} accessibilityLabel="Previous week" onPress={onPrev} size={36} />
        <IconButton testID="schedule-next" icon={<ChevronRight size={22} color={colors.foreground} />} accessibilityLabel="Next week" onPress={onNext} size={36} />
      </View>
      <View style={styles.days}>
        {days.map((d) => {
          const isToday = d.dateKey === today;
          const isSelected = d.dateKey === selected;
          const dot = d.conflicts > 0 ? colors.destructive : d.missingLogs > 0 ? colors.warning : d.active.length > 0 ? colors.mutedForeground : "transparent";
          const fill = isSelected ? (isToday ? colors.now : colors.foreground) : "transparent";
          const numberColor = isSelected ? (isToday ? "#ffffff" : colors.background) : isToday ? colors.now : colors.foreground;
          const count = d.active.length;
          return (
            <Pressable
              key={d.dateKey}
              testID={`schedule-day-${d.dateKey}`}
              accessibilityRole="button"
              accessibilityLabel={`${isToday ? "Today, " : ""}${longDay(d.dateKey)}, ${d.visible ? (count ? plural(count, "session") : "no sessions") : "closed"}`}
              accessibilityState={{ selected: isSelected, disabled: !d.visible }}
              disabled={!d.visible}
              onPress={() => {
                void Haptics.selectionAsync().catch(() => undefined);
                onSelect(d.dateKey);
              }}
              style={({ pressed }) => [styles.day, { opacity: d.visible ? (pressed ? 0.6 : 1) : 0.35 }]}
            >
              <T variant="tiny" style={{ color: isToday ? colors.now : colors.mutedForeground, fontWeight: "600" }}>
                {weekdayInitial(d.dateKey)}
              </T>
              <View style={[styles.circle, { backgroundColor: fill }]}>
                <T style={[styles.number, { color: numberColor, fontWeight: isToday || isSelected ? "700" : "500" }]}>{parseDateKey(d.dateKey).day}</T>
              </View>
              <View style={[styles.dot, { backgroundColor: dot }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.xs },
  grow: { flex: 1 },
  todayPill: { paddingHorizontal: 12, height: 30, borderRadius: radius.full, alignItems: "center", justifyContent: "center", marginRight: space.xs },
  days: { flexDirection: "row" },
  day: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 2 },
  circle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  number: { fontSize: 17, fontVariant: ["tabular-nums"] },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
