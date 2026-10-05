import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";

/** Nothing to show: an icon in a soft circle, what's missing, and what to do about it. */
export function EmptyState({ icon, title, text, action, testID }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode; testID?: string }) {
  const colors = useColors();
  return (
    <View style={styles.wrap} testID={testID}>
      {icon ? <View style={[styles.icon, { backgroundColor: colors.secondary }]}>{icon}</View> : null}
      <T variant="subheading" style={styles.center}>
        {title}
      </T>
      {text ? (
        <T tone="muted" style={styles.center}>
          {text}
        </T>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: space.xxl, paddingHorizontal: space.xl, gap: space.sm },
  icon: { width: 56, height: 56, borderRadius: radius.full, alignItems: "center", justifyContent: "center", marginBottom: space.sm },
  center: { textAlign: "center" },
  action: { marginTop: space.md },
});
