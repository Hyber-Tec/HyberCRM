import { Check } from "lucide-react-native";
import { forwardRef } from "react";
import { ActivityIndicator, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { T } from "@/components/Text";
import { space, useColors } from "@/theme";

/**
 * A row of a ListSection that is its own text field, as the phone's Contacts: the label above, the value to type,
 * and "Saved" for a moment after it was saved (fields save when the person leaves them).
 */
export const EditableRow = forwardRef<TextInput, TextInputProps & { label: string; state?: "saving" | "saved" | null; divider?: boolean }>(function EditableRow(
  { label, state, divider, style, ...props },
  ref,
) {
  const colors = useColors();
  return (
    <View style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <View style={styles.head}>
        <T variant="small" tone="muted" style={styles.label}>
          {label}
        </T>
        {state === "saving" ? (
          <ActivityIndicator size="small" color={colors.mutedForeground} />
        ) : state === "saved" ? (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(400)} style={styles.saved} accessibilityLiveRegion="polite" accessibilityLabel={`${label} saved`}>
            <Check size={14} color={colors.success} strokeWidth={3} />
            <T variant="small" tone="success" style={styles.savedText}>
              Saved
            </T>
          </Animated.View>
        ) : null}
      </View>
      <TextInput ref={ref} placeholderTextColor={colors.mutedForeground} accessibilityLabel={label} {...props} style={[styles.input, { color: colors.foreground }, style]} />
    </View>
  );
});

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, gap: 2 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 18 },
  label: { fontWeight: "500" },
  saved: { flexDirection: "row", alignItems: "center", gap: 4 },
  savedText: { fontWeight: "600" },
  input: { fontSize: 16, paddingVertical: 6, minHeight: 34 },
});
