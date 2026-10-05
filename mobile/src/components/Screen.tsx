import { useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { space, useColors } from "@/theme";

/**
 * A tab's or a page's scrolling body, under the native header (which blurs what scrolls beneath it). On the grouped
 * background by default, as the phone's own list screens. `onRefresh`: pull to refresh.
 */
export function Screen({
  children,
  grouped = true,
  onRefresh,
  contentStyle,
  testID,
  footer,
}: {
  children: ReactNode;
  grouped?: boolean;
  onRefresh?: () => Promise<unknown> | void;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
  /** Pinned under the scrolling content (a form's buttons). */
  footer?: ReactNode;
}) {
  const colors = useColors();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <View style={[styles.fill, { backgroundColor: grouped ? colors.grouped : colors.background }]}>
      <ScrollView
        style={styles.fill}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, contentStyle]}
        testID={testID}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                try {
                  await onRefresh();
                } finally {
                  setRefreshing(false);
                }
              }}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
});
