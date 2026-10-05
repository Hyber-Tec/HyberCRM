import * as Haptics from "expo-haptics";
import { Check } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { radius, space, useColors, useIsDark } from "@/theme";
import { STEPS } from "./content";

/**
 * The six steps (the website's step tabs): any step can be tapped at any time. The current one is dark and named,
 * a step whose required fields are all filled shows a green check, and once a submit has been tried a red dot marks
 * the steps still missing something. A thin line under them fills as the four steps with fields get done.
 */
export function StepBar({ step, done, flagged, onSelect, hidden = false }: { step: number; done: boolean[]; flagged: Set<number>; onSelect: (i: number) => void; hidden?: boolean }) {
  const colors = useColors();
  const dark = useIsDark();
  const scroll = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const xs = useRef<Record<number, { x: number; w: number }>>({});
  // Keep the current step in view (the strip scrolls sideways on narrow phones).
  useEffect(() => {
    const p = xs.current[step];
    if (!p || !width) return;
    scroll.current?.scrollTo({ x: Math.max(0, p.x + p.w / 2 - width / 2), animated: true });
  }, [step, width]);
  const progress = done.slice(1, 5).filter(Boolean).length / 4;

  return (
    <View style={[styles.wrap, { borderBottomColor: colors.border, backgroundColor: colors.background }, hidden && styles.hidden]} accessibilityRole="tablist" testID="log-steps">
      <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {STEPS.map((label, i) => {
          const active = i === step;
          const isDone = done[i] && i > 0;
          const missing = flagged.has(i);
          return (
            <Pressable
              key={label}
              accessibilityRole="tab"
              accessibilityLabel={`Step ${i + 1} of ${STEPS.length}, ${label}${isDone ? ", done" : ""}${missing ? ", missing required fields" : ""}`}
              accessibilityState={{ selected: active }}
              testID={`log-step-${i + 1}`}
              hitSlop={{ top: 4, bottom: 4 }}
              onLayout={(e) => {
                xs.current[i] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
              }}
              onPress={() => {
                if (active) return;
                void Haptics.selectionAsync().catch(() => undefined);
                onSelect(i);
              }}
              style={({ pressed }) => [styles.pill, active ? { backgroundColor: colors.primary } : pressed && { backgroundColor: colors.accent }]}
            >
              {isDone && !active ? (
                <View style={[styles.num, { backgroundColor: colors.successTint }]}>
                  <Check size={14} color={colors.success} strokeWidth={3} />
                </View>
              ) : (
                <View style={[styles.num, { backgroundColor: active ? (dark ? "#0000001f" : "#ffffff26") : colors.secondary }]}>
                  <T variant="tiny" style={{ fontWeight: "700", color: active ? colors.primaryForeground : colors.mutedForeground }}>
                    {i + 1}
                  </T>
                </View>
              )}
              {active ? (
                <T variant="small" style={{ fontWeight: "600", color: colors.primaryForeground }} numberOfLines={1}>
                  {label}
                </T>
              ) : null}
              {missing ? <View style={[styles.dot, { backgroundColor: colors.destructive, borderColor: active ? colors.primary : colors.background }]} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[styles.track, { backgroundColor: colors.secondary }]}>
        <View style={[styles.fill, { backgroundColor: colors.success, width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  hidden: { display: "none" },
  row: { paddingHorizontal: space.md, gap: 6, alignItems: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 8, height: 40, minWidth: 40, paddingHorizontal: 8, borderRadius: radius.md, justifyContent: "center" },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 4, right: 4, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
  track: { height: 3, marginHorizontal: space.lg, borderRadius: 2, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2 },
});
