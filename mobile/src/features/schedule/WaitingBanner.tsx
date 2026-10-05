import { TriangleAlert } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";

/**
 * Sessions in conflict, as the tutor reads them (DECISIONS §5, the website's words): they may not happen as booked,
 * and the admin decides. `scope` says which sessions are counted ("this week").
 */
export function WaitingBanner({ count, scope }: { count: number; scope?: string }) {
  const colors = useColors();
  if (count <= 0) return null;
  const many = count > 1;
  return (
    <View testID="schedule-conflicts" style={[styles.box, { backgroundColor: colors.destructiveTint, borderColor: colors.destructive }]} accessibilityRole="alert">
      <TriangleAlert size={18} color={colors.destructive} />
      <View style={styles.grow}>
        <T variant="label" style={{ color: colors.destructive }}>
          {many ? `${count} of your sessions` : "One of your sessions"}
          {scope ? ` ${scope}` : ""} {many ? "are" : "is"} waiting for the admin.
        </T>
        <T variant="small">
          {many ? "They’re" : "It’s"} marked in red because something changed since booking (for example your availability). The admin will move, reassign or cancel{" "}
          {many ? "them" : "it"}; until then, don’t count on {many ? "them" : "it"}.
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  grow: { flex: 1, gap: 2 },
});
