import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { radius, space, useColors } from "@/theme";

/** A bordered card, as the website's cards. With `onPress` it is a button that dims while pressed. */
export function Card({ children, style, onPress, testID, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string; accessibilityLabel?: string }) {
  const colors = useColors();
  const base = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }];
  if (onPress)
    return (
      <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [...base, pressed && { backgroundColor: colors.accent }, style]}>
        {children}
      </Pressable>
    );
  return (
    <View testID={testID} style={[...base, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
});
