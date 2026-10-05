import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { T } from "@/components/Text";
import { space, useColors } from "@/theme";

/** A ListSection row with a switch at the right; the whole row flips it, as in the phone's Settings. */
export function SwitchRow({
  title,
  subtitle,
  value,
  onChange,
  disabled = false,
  divider = false,
  testID,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  /** Set by ListSection on every row after the first. */
  divider?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const flip = () => {
    if (disabled) return;
    void Haptics.selectionAsync().catch(() => undefined);
    onChange(!value);
  };
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled }}
      onPress={flip}
      style={({ pressed }) => [styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && !disabled && { backgroundColor: colors.accent }]}
    >
      <View style={styles.text}>
        <T variant="label" tone={disabled ? "muted" : "default"}>
          {title}
        </T>
        {subtitle ? (
          <T variant="small" tone="muted">
            {subtitle}
          </T>
        ) : null}
      </View>
      <Switch value={value} onValueChange={() => flip()} disabled={disabled} accessible={false} importantForAccessibility="no" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 52 },
  text: { flex: 1, gap: 2 },
});
