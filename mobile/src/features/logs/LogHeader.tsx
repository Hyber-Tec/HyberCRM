import { X } from "lucide-react-native";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "@/components/IconButton";
import { T } from "@/components/Text";
import { space, useColors, useIsDark } from "@/theme";

export type LogHeaderStatus = "draft" | "submitted" | "editing" | null;

/**
 * The log's header (the website's LogHeader on a phone): close at the left, the student with the log's state, and
 * the session under it (subject · date · time and billed hours). `sheet`: shown in an iPhone page sheet, which sits
 * below the status bar by itself.
 */
export function LogHeader({ title, line, status, onClose, closeLabel = "Close", sheet = false, right }: { title: string; line: string; status: LogHeaderStatus; onClose: () => void; closeLabel?: string; sheet?: boolean; right?: ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const top = sheet && Platform.OS === "ios" ? space.sm : insets.top;
  return (
    <View style={[styles.wrap, { paddingTop: top + space.xs, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
      <IconButton icon={<X size={22} color={colors.foreground} />} onPress={onClose} accessibilityLabel={closeLabel} filled testID="log-close" />
      <View style={styles.middle}>
        <View style={styles.titleRow}>
          <T variant="subheading" numberOfLines={1} style={styles.title} testID="log-student">
            {title || "—"}
          </T>
          <StatusChip status={status} />
        </View>
        {line ? (
          <T variant="small" tone="muted" numberOfLines={2} style={styles.line}>
            {line}
          </T>
        ) : null}
      </View>
      {right ?? <View style={styles.balance} />}
    </View>
  );
}

const CHIP = { draft: "Draft", submitted: "Submitted", editing: "Editing" } as const;

/** Draft (gray), Submitted (green), Editing (blue), as the website's header chip. */
export function StatusChip({ status }: { status: LogHeaderStatus }) {
  const colors = useColors();
  const dark = useIsDark();
  if (!status) return null;
  const c =
    status === "submitted"
      ? dark
        ? { bg: "#10b98126", fg: "#6ee7b7" }
        : { bg: "#ecfdf5", fg: "#047857" }
      : status === "editing"
        ? dark
          ? { bg: "#0ea5e926", fg: "#7dd3fc" }
          : { bg: "#f0f9ff", fg: "#0369a1" }
        : { bg: colors.secondary, fg: colors.mutedForeground };
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]} testID={`log-status-${status}`}>
      <T variant="tiny" style={{ color: c.fg, fontWeight: "600" }}>
        {CHIP[status]}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  middle: { flex: 1, minWidth: 0, gap: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { flexShrink: 1 },
  line: { fontVariant: ["tabular-nums"] },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  balance: { width: 4 },
});
