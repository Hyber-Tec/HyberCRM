import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { radius, useColors } from "@/theme";

/** A round icon button (a header's bell, a sheet's close), with an optional count badge. */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  badge,
  size = 40,
  filled = false,
  testID,
}: {
  icon: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  badge?: number;
  size?: number;
  filled?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${accessibilityLabel}, ${badge} unread` : accessibilityLabel}
      hitSlop={6}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size, backgroundColor: filled ? colors.secondary : "transparent", opacity: pressed ? 0.6 : 1 },
      ]}
    >
      {icon}
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.destructive, borderColor: colors.background }]}>
          <T variant="tiny" style={styles.badgeText}>
            {badge > 99 ? "99+" : badge}
          </T>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", borderRadius: radius.full },
  badge: { position: "absolute", top: 2, right: 0, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  badgeText: { color: "#ffffff", fontSize: 10, fontWeight: "700" },
});
