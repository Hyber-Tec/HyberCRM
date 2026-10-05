import * as Haptics from "expo-haptics";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { radius, space, useColors } from "@/theme";

/**
 * A row of filter pills that scrolls sideways (All · Unread · General · Updates), as the website's pills: the chosen
 * one is filled. A count shows after a label when given.
 */
export function FilterChips<V extends string>({
  value,
  options,
  onChange,
  inset = 0,
  testID,
}: {
  value: V;
  options: { value: V; label: string; count?: number; testID?: string }[];
  onChange: (value: V) => void;
  /** Space before the first pill and after the last, for a row that runs edge to edge. */
  inset?: number;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, { paddingHorizontal: inset }]}
      testID={testID}
      accessibilityRole="tablist"
      keyboardShouldPersistTaps="handled"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={o.testID}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.count ? `${o.label}, ${o.count}` : o.label}
            onPress={() => {
              if (on) return;
              void Haptics.selectionAsync().catch(() => undefined);
              onChange(o.value);
            }}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: on ? colors.primary : colors.card, borderColor: on ? colors.primary : colors.border },
              pressed && !on && { backgroundColor: colors.accent },
            ]}
          >
            <Text style={[styles.label, { color: on ? colors.primaryForeground : colors.foreground }]} numberOfLines={1}>
              {o.label}
              {o.count ? <Text style={{ color: on ? colors.primaryForeground : colors.mutedForeground, fontWeight: "500" }}>{`  ${o.count}`}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingVertical: 2 },
  chip: { borderRadius: radius.full, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 7 },
  label: { fontSize: 14, fontWeight: "600" },
});
