import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { type DateKey, addDays } from "@shared/time";
import { T } from "@/components/Text";
import { clock, shortDay } from "@/features/schedule/format";
import { radius, space, useColors } from "@/theme";
import type { ClockTone } from "./model";

/** The time clock at a glance: clocked in (a breathing green dot), clocked out, or not yet. */
export function ClockChip({
  status,
  today,
  hour12,
}: {
  status: { tone: ClockTone; inMin?: number; outMin?: number; since?: DateKey; startMin?: number };
  today: DateKey;
  hour12: boolean;
}) {
  const colors = useColors();
  const pulse = useSharedValue(1);
  const live = status.tone === "in";
  useEffect(() => {
    pulse.value = live ? withRepeat(withTiming(0.35, { duration: 900 }), -1, true) : 1;
  }, [live, pulse]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const look = {
    in: { bg: colors.successTint, fg: colors.success, border: "transparent" },
    out: { bg: colors.card, fg: colors.mutedForeground, border: colors.border },
    late: { bg: colors.warningTint, fg: colors.warning, border: "transparent" },
    idle: { bg: colors.card, fg: colors.mutedForeground, border: colors.border },
  }[status.tone];
  const at = (m: number | undefined) => clock(m ?? 0, hour12);
  const text =
    status.tone === "in"
      ? status.since && status.since !== today
        ? `Clocked in since ${status.since === addDays(today, -1) ? "yesterday" : shortDay(status.since)}, ${at(status.inMin)}`
        : `Clocked in since ${at(status.inMin)}`
      : status.tone === "out"
        ? `Clocked out at ${at(status.outMin)}`
        : status.tone === "late"
          ? `Not clocked in · your session started at ${at(status.startMin)}`
          : "Not clocked in yet";

  return (
    <View style={[styles.chip, { backgroundColor: look.bg, borderColor: look.border }]} testID="today-clock" accessible accessibilityLabel={text}>
      <Animated.View style={[styles.dot, { backgroundColor: look.fg }, dotStyle]} />
      <T variant="small" style={[styles.text, { color: look.fg }]} numberOfLines={1}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: space.sm, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: StyleSheet.hairlineWidth, maxWidth: "100%" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontWeight: "600", flexShrink: 1 },
});
