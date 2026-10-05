import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Logo } from "@/components/Logo";
import { T } from "@/components/Text";
import { space, useColors } from "@/theme";

/** The launch screen's mark, with what the app is waiting for: it takes over from the splash screen without a jump. */
export function Loading({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="loading" accessibilityLabel={label}>
      <Logo size={96} />
      <View style={styles.row}>
        <ActivityIndicator color={colors.mutedForeground} />
        <T tone="muted">{label}</T>
      </View>
    </View>
  );
}

/** A spinner in the middle of a screen's content. */
export function Spinner({ label }: { label?: string }) {
  const colors = useColors();
  return (
    <View style={styles.spinner} accessibilityLabel={label ?? "Loading"}>
      <ActivityIndicator color={colors.mutedForeground} />
      {label ? <T tone="muted">{label}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.xl },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, position: "absolute", bottom: "18%" },
  spinner: { paddingVertical: space.xxl, alignItems: "center", gap: space.sm },
});
