import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { T } from "@/components/Text";
import { radius, useColors } from "@/theme";

const ITEM = 40;
const VISIBLE = 5;
const PAD = ((VISIBLE - 1) / 2) * ITEM;

/**
 * A wheel of choices, as the phone's own time pickers: flick or drag it and the middle row is the value; a tap on a
 * row picks it. Each step clicks softly. Screen readers adjust it up and down. Used for the times of an availability
 * range, where the choices come from the branch's step and that date's opening hours. In a sheet, put the wheels in a
 * SheetScrollArea, or a drag on them moves the sheet on Android.
 */
export function TimeWheel({
  values,
  value,
  onChange,
  format,
  label,
  testID,
}: {
  values: readonly number[];
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  /** What the wheel sets ("Start time"), for screen readers. */
  label: string;
  /** Each row gets `${testID}-${value}`. */
  testID?: string;
}) {
  const colors = useColors();
  const ref = useAnimatedRef<Animated.ScrollView>();
  const index = Math.max(0, values.indexOf(value));
  const y = useSharedValue(index * ITEM);
  const lastStep = useSharedValue(index);
  const byUser = useSharedValue(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A value set from outside (the end moved after the start) turns the wheel to it.
  const shown = useRef(index);
  useEffect(() => {
    if (shown.current === index) return;
    shown.current = index;
    ref.current?.scrollTo({ y: index * ITEM, animated: true });
  }, [index, ref]);

  // The first position is set again once the rows are laid out: an offset given before that can be clamped to the top.
  const placed = useRef(false);
  const place = (contentHeight: number) => {
    if (placed.current || contentHeight <= PAD * 2) return;
    placed.current = true;
    ref.current?.scrollTo({ y: shown.current * ITEM, animated: false });
  };

  const tick = () => void Haptics.selectionAsync().catch(() => undefined);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      y.value = e.contentOffset.y;
      const step = Math.round(e.contentOffset.y / ITEM);
      if (step !== lastStep.value) {
        lastStep.value = step;
        if (byUser.value) scheduleOnRN(tick);
      }
    },
  });

  const settle = (offsetY: number) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    byUser.value = false;
    const i = Math.min(values.length - 1, Math.max(0, Math.round(offsetY / ITEM)));
    shown.current = i;
    if (values[i] !== undefined && values[i] !== value) onChange(values[i]);
  };
  const offsetOf = (e: NativeSyntheticEvent<NativeScrollEvent>) => e.nativeEvent.contentOffset.y;

  const pick = (i: number) => {
    shown.current = i;
    ref.current?.scrollTo({ y: i * ITEM, animated: true });
    if (values[i] !== value) {
      tick();
      onChange(values[i]);
    }
  };

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        const next = e.nativeEvent.actionName === "increment" ? index + 1 : index - 1;
        if (next >= 0 && next < values.length) pick(next);
      }}
      testID={testID}
    >
      <View pointerEvents="none" style={[styles.band, { backgroundColor: colors.secondary }]} />
      <Animated.ScrollView
        ref={ref}
        onScroll={onScroll}
        scrollEventThrottle={16}
        snapToInterval={ITEM}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentOffset={{ x: 0, y: index * ITEM }}
        onContentSizeChange={(_w, h) => place(h)}
        contentContainerStyle={styles.content}
        onScrollBeginDrag={() => {
          byUser.value = true;
          if (settleTimer.current) clearTimeout(settleTimer.current);
        }}
        onScrollEndDrag={(e) => {
          const at = offsetOf(e);
          // Without a flick no momentum follows: settle shortly unless it does.
          settleTimer.current = setTimeout(() => settle(at), 150);
        }}
        onMomentumScrollBegin={() => {
          if (settleTimer.current) clearTimeout(settleTimer.current);
        }}
        onMomentumScrollEnd={(e) => settle(offsetOf(e))}
      >
        {values.map((v, i) => (
          <WheelRow key={v} index={i} y={y} label={format(v)} selected={v === value} onPress={() => pick(i)} testID={testID ? `${testID}-${v}` : undefined} />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

function WheelRow({ index, y, label, selected, onPress, testID }: { index: number; y: SharedValue<number>; label: string; selected: boolean; onPress: () => void; testID?: string }) {
  const style = useAnimatedStyle(() => {
    const d = (index * ITEM - y.value) / ITEM;
    const a = Math.abs(d);
    return {
      opacity: interpolate(a, [0, 1, 2, 3], [1, 0.6, 0.3, 0.12], Extrapolation.CLAMP),
      transform: [{ perspective: 400 }, { rotateX: `${interpolate(d, [-3, 0, 3], [-50, 0, 50], Extrapolation.CLAMP)}deg` }, { scale: interpolate(a, [0, 2], [1, 0.92], Extrapolation.CLAMP) }],
    };
  });
  return (
    <Pressable onPress={onPress} testID={testID} accessible={false} style={styles.row}>
      <Animated.View style={style}>
        <T variant="subheading" style={[styles.label, { fontWeight: selected ? "600" : "400" }]}>
          {label}
        </T>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { height: ITEM * VISIBLE, overflow: "hidden" },
  band: { position: "absolute", left: 0, right: 0, top: PAD, height: ITEM, borderRadius: radius.md },
  content: { paddingVertical: PAD },
  row: { height: ITEM, alignItems: "center", justifyContent: "center" },
  label: { fontVariant: ["tabular-nums"] },
});
