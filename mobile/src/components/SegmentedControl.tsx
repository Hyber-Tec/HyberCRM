import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { radius, useColors, useIsDark } from "@/theme";

/** A few mutually exclusive choices in a row (Day / Week, All / Unread). Each choice's test id is `{testID}-{value}`. */
export function SegmentedControl<V extends string>({ value, options, onChange, testID }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; testID?: string }) {
  const colors = useColors();
  const dark = useIsDark();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.secondary }]} testID={testID} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={testID ? `${testID}-${o.value}` : undefined}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              void Haptics.selectionAsync().catch(() => undefined);
              onChange(o.value);
            }}
            style={[styles.item, on && [styles.on, { backgroundColor: dark ? colors.accent : colors.card }]]}
          >
            <T variant="small" style={{ fontWeight: on ? "600" : "500", color: on ? colors.foreground : colors.mutedForeground }}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", borderRadius: radius.md, padding: 3 },
  item: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 7, borderRadius: radius.sm + 1 },
  on: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
});
