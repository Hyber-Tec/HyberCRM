import { type DateKey, type Weekday } from "@shared/time";
import { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { MonthScroller, WeekdayHeader } from "@/components/MonthScroller";
import { T } from "@/components/Text";
import { ToastHost } from "@/components/ToastHost";
import { radius, space, useColors } from "@/theme";

const ROW = 42;

/**
 * Picks a date from months that scroll vertically (permanent rule: never a month with ‹ › arrows, date pickers
 * included), in a card over the dimmed app like the Dialog. Dates outside `min`–`max`, or that `isDisabled` refuses,
 * can't be picked.
 */
export function DatePickerDialog({
  open,
  title,
  value,
  today,
  weekStartsOn,
  min,
  max,
  isDisabled,
  hint,
  onPick,
  onClose,
  testID,
}: {
  open: boolean;
  title: string;
  value: DateKey | null;
  /** The branch's today (marked). */
  today: DateKey;
  weekStartsOn: Weekday;
  min?: DateKey | null;
  max?: DateKey | null;
  isDisabled?: (date: DateKey) => boolean;
  /** A line under the title (what to pick). */
  hint?: string;
  onPick: (date: DateKey) => void;
  onClose: () => void;
  testID?: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const renderDay = useCallback(
    (d: DateKey, size: { width: number; height: number }) => {
      const off = (!!min && d < min) || (!!max && d > max) || !!isDisabled?.(d);
      const on = d === value;
      const isToday = d === today;
      return (
        <Pressable
          testID={`pick-${d}`}
          accessibilityRole="button"
          accessibilityState={{ selected: on, disabled: off }}
          accessibilityLabel={d}
          disabled={off}
          onPress={() => onPick(d)}
          style={[styles.day, { width: size.width, height: size.height }]}
        >
          <View style={[styles.circle, on && { backgroundColor: colors.primary }]}>
            <Text style={[styles.number, { color: on ? colors.primaryForeground : off ? colors.border : isToday ? colors.now : colors.foreground }, (on || isToday) && styles.bold]}>{Number(d.slice(8))}</Text>
          </View>
        </Pressable>
      );
    },
    [min, max, isDisabled, value, today, onPick, colors],
  );
  // The days' look depends on these; a new `isDisabled` draws every month again.
  const [disabledRule, setDisabledRule] = useState({ fn: isDisabled, n: 0 });
  if (disabledRule.fn !== isDisabled) setDisabledRule({ fn: isDisabled, n: disabledRule.n + 1 });
  const signature = useCallback(
    (m: DateKey) => `${m}|${value}|${min}|${max}|${today}|${colors.foreground}|${disabledRule.n}`,
    [value, min, max, today, colors.foreground, disabledRule.n],
  );
  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay, paddingTop: Math.max(insets.top, space.xl), paddingBottom: Math.max(insets.bottom, space.xl) }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID={testID}>
          <View style={styles.title}>
            <T variant="heading">{title}</T>
            {hint ? (
              <T variant="small" tone="muted">
                {hint}
              </T>
            ) : null}
          </View>
          <WeekdayHeader weekStartsOn={weekStartsOn} inset={space.md} />
          <View style={styles.months}>
            <MonthScroller anchor={value ?? today} weekStartsOn={weekStartsOn} rowHeight={ROW} variant="compact" inset={space.md} renderDay={renderDay} monthSignature={signature} />
          </View>
          <View style={styles.footer}>
            <Button variant="ghost" onPress={onClose}>
              Cancel
            </Button>
          </View>
        </View>
      </View>
      <ToastHost />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", paddingHorizontal: space.xl },
  card: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, maxWidth: 440, width: "100%", alignSelf: "center", overflow: "hidden", paddingTop: space.xl },
  title: { paddingHorizontal: space.xl, paddingBottom: space.md, gap: 2 },
  months: { height: 360 },
  footer: { padding: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "transparent" },
  day: { alignItems: "center", justifyContent: "center" },
  circle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  number: { fontSize: 15, fontVariant: ["tabular-nums"] },
  bold: { fontWeight: "700" },
});
