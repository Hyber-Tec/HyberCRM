import { type DateKey, formatDateKey } from "@shared/time";
import type { AvailabilityRange } from "@shared/types";
import { Lock } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, useColors, useIsDark } from "@/theme";
import { describeRanges } from "./api";
import { boxRange } from "./format";

/** What a day shows on the tutor's availability calendar. */
export interface DayLook {
  ranges: AvailabilityRange[];
  isOpen: boolean;
  isToday: boolean;
  isPast: boolean;
  /** Inside the lock window: only an admin can change it. */
  locked: boolean;
  /** Open, inside the lead time, not locked, and still without times (amber). */
  needsTimes: boolean;
}

/** The website's emerald boxes, in light and dark. */
const BOX = {
  light: { bg: "#ecfdf5", border: "#a7f3d0", text: "#065f46" },
  dark: { bg: "#064e3b66", border: "#065f46", text: "#6ee7b7" },
};

const NUMBER = 22;
const MAX_BOXES = 3;

/**
 * One day of the availability calendar: its number (today in a red circle, a lock inside the lock window), then each
 * time range as a box that fills the day (several share its height, DECISIONS §6). Closed days are dimmed and can't
 * be opened; past days are muted; open days inside the lead time without times are tinted amber.
 */
export function CalendarDay({ date, look, width, height, onPress }: { date: DateKey; look: DayLook; width: number; height: number; onPress?: (date: DateKey) => void }) {
  const colors = useColors();
  const dark = useIsDark();
  const box = dark ? BOX.dark : BOX.light;
  const { ranges, isOpen, isToday, isPast, locked, needsTimes } = look;
  const shown = ranges.length > MAX_BOXES ? ranges.slice(0, MAX_BOXES - 1) : ranges;
  const more = ranges.length - shown.length;
  const boxesHeight = height - NUMBER - 6;
  const each = shown.length ? (boxesHeight - (shown.length - 1) * 2 - (more ? 14 : 0)) / shown.length : 0;
  const twoLines = each >= 26;
  const label = `${formatDateKey(date, "weekdayLong")}: ${!isOpen ? "closed" : ranges.length ? describeRanges(ranges) : needsTimes ? "no times yet, needs your availability" : "no availability"}${locked && isOpen && !isPast ? ", locked" : ""}`;
  const disabled = !isOpen || !onPress;
  return (
    <Pressable
      testID={`day-${date}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onPress?.(date)}
      style={({ pressed }) => [
        styles.cell,
        { width, height },
        !isOpen && { backgroundColor: dark ? colors.card : colors.secondary },
        needsTimes && { backgroundColor: colors.warningTint },
        pressed && { backgroundColor: colors.accent },
      ]}
    >
      <View style={styles.top}>
        {locked && isOpen && !isPast ? <Lock size={9} color={colors.mutedForeground} style={styles.lock} /> : null}
        <View style={[styles.number, isToday && { backgroundColor: colors.now }]}>
          <Text style={[styles.numberText, { color: isToday ? "#ffffff" : isPast || !isOpen ? colors.mutedForeground : colors.foreground }, isToday && styles.today]}>{Number(date.slice(8))}</Text>
        </View>
      </View>
      {!isOpen ? (
        <Text style={[styles.closed, { color: colors.mutedForeground }]} numberOfLines={1}>
          Closed
        </Text>
      ) : (
        <View style={styles.boxes}>
          {shown.map((r) => (
            <View
              key={`${r.startMin}-${r.endMin}`}
              style={[
                styles.box,
                { height: each, backgroundColor: isPast ? colors.secondary : box.bg, borderColor: isPast ? colors.border : box.border },
              ]}
            >
              <Text
                style={[styles.boxText, { color: isPast ? colors.mutedForeground : box.text, fontSize: twoLines ? 10.5 : 9.5 }]}
                numberOfLines={twoLines ? 2 : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {boxRange(r.startMin, r.endMin)}
              </Text>
            </View>
          ))}
          {more ? <Text style={[styles.more, { color: colors.mutedForeground }]}>+{more} more</Text> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: { padding: 2 },
  top: { height: NUMBER, alignItems: "center", justifyContent: "center" },
  lock: { position: "absolute", left: 2, top: 3 },
  number: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  numberText: { fontSize: 12, fontWeight: "500", fontVariant: ["tabular-nums"] },
  today: { fontWeight: "700" },
  closed: { flex: 1, textAlign: "center", textAlignVertical: "center", fontSize: 9.5, fontWeight: "500", marginTop: 12 },
  boxes: { flex: 1, gap: 2, marginTop: 2 },
  box: { borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", paddingHorizontal: 1 },
  boxText: { fontWeight: "600", textAlign: "center", fontVariant: ["tabular-nums"] },
  more: { fontSize: 9, textAlign: "center", height: 12 },
});
