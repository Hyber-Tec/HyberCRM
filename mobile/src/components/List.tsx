import { ChevronRight } from "lucide-react-native";
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";

/**
 * A group of rows under a small title, as in the phone's own Settings. `detail` sits at the right of the title (a
 * count, a total); `footer` below the group.
 */
export function ListSection({ title, detail, footer, children, testID }: { title?: string; detail?: ReactNode; footer?: ReactNode; children: ReactNode; testID?: string }) {
  const colors = useColors();
  const rows = Children.toArray(children).filter(isValidElement) as ReactElement<{ divider?: boolean }>[];
  return (
    <View style={styles.section} testID={testID}>
      {(title || detail) && (
        <View style={styles.head}>
          <T variant="small" tone="muted" style={styles.title}>
            {title?.toUpperCase()}
          </T>
          {typeof detail === "string" ? (
            <T variant="small" tone="muted" style={styles.detail}>
              {detail}
            </T>
          ) : (
            detail
          )}
        </View>
      )}
      <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card }]}>{rows.map((row, i) => (i === 0 ? row : cloneElement(row, { divider: true })))}</View>
      {typeof footer === "string" ? (
        <T variant="small" tone="muted" style={styles.footer}>
          {footer}
        </T>
      ) : (
        footer
      )}
    </View>
  );
}

/**
 * One row: an optional icon, a title with a line or two under it, and something at the right. With `onPress` it is
 * a button, and shows a chevron unless `chevron` says otherwise.
 */
export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  onLongPress,
  chevron = !!onPress,
  divider = false,
  destructive = false,
  testID,
  accessibilityLabel,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  /** Set by ListSection on every row after the first. */
  divider?: boolean;
  destructive?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const content = (
    <>
      {icon}
      <View style={styles.grow}>
        {typeof title === "string" ? (
          <T variant="label" tone={destructive ? "destructive" : "default"} numberOfLines={1}>
            {title}
          </T>
        ) : (
          title
        )}
        {typeof subtitle === "string" ? (
          <T variant="small" tone="muted" numberOfLines={2}>
            {subtitle}
          </T>
        ) : (
          subtitle
        )}
      </View>
      {typeof right === "string" ? (
        <T variant="body" tone="muted">
          {right}
        </T>
      ) : (
        right
      )}
      {chevron && <ChevronRight size={16} color={colors.mutedForeground} />}
    </>
  );
  const line = divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border };
  if (!onPress && !onLongPress)
    return (
      <View style={[styles.row, line]} testID={testID} accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, line, pressed && { backgroundColor: colors.accent }]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

/** A square tinted tile for a row's icon, as the phone's Settings. */
export function RowIcon({ children, color }: { children: ReactNode; color?: string }) {
  const colors = useColors();
  return <View style={[styles.rowIcon, { backgroundColor: color ?? colors.secondary }]}>{children}</View>;
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  head: { flexDirection: "row", alignItems: "baseline", paddingHorizontal: space.xs },
  title: { flex: 1, fontWeight: "600", letterSpacing: 0.5 },
  detail: { fontWeight: "600", fontVariant: ["tabular-nums"] },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 52 },
  footer: { paddingHorizontal: space.xs },
  grow: { flex: 1, gap: 2 },
  rowIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});
