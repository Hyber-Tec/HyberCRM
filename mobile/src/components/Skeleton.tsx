import { useEffect } from "react";
import { type DimensionValue, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { radius, space, useColors } from "@/theme";

/** A gray block that gently pulses while data loads. */
export function Skeleton({ width = "100%", height = 16, rounded = radius.sm }: { width?: DimensionValue; height?: number; rounded?: number }) {
  const colors = useColors();
  const o = useSharedValue(0.55);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: rounded, backgroundColor: colors.secondary }, style]} />;
}

/** A few card-shaped skeletons, for a list that's loading. */
export function SkeletonCards({ count = 3, height = 76 }: { count?: number; height?: number }) {
  return (
    <View style={styles.cards}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} rounded={radius.lg} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ cards: { gap: space.md } });
