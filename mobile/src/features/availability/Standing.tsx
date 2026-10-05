import type { BranchSettings } from "@shared/settings/defaults";
import { type DateKey, formatDateKey } from "@shared/time";
import { CalendarCheck, CalendarClock, ChevronRight, CircleCheck, TriangleAlert } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";
import { daysInWords } from "./format";

/** The rule in words, from the branch's settings (the website's line under the page title). */
export function availabilityRule(a: BranchSettings["availability"], lockDays: number): string {
  const parts: string[] = [];
  if (a.leadTimeEnforcement !== "off") parts.push(`Set your availability at least ${a.leadTimeDays} days ahead.`);
  if (lockDays > 0) parts.push(`Changes within ${lockDays} days need an admin.`);
  return parts.length ? parts.join(" ") : "Past days can’t be changed.";
}

/**
 * The top of the Availability tab: how far ahead the tutor has given times, the open days in the lead time that
 * still need them (tap to set the first), and the branch's rule. A branch that doesn't ask for notice
 * (`asksNotice` false) gets neither the days nor "all set".
 */
export function AvailabilityStanding({
  today,
  setThrough,
  gaps,
  leadDays,
  asksNotice,
  rule,
  loading,
  onSetFirstGap,
}: {
  today: DateKey;
  setThrough: DateKey | null;
  gaps: DateKey[];
  leadDays: number;
  asksNotice: boolean;
  rule: string;
  loading: boolean;
  onSetFirstGap: () => void;
}) {
  const colors = useColors();
  const n = gaps.length;
  const through = setThrough ? formatDateKey(setThrough, setThrough.slice(0, 4) === today.slice(0, 4) ? "monthDay" : "medium") : null;
  const window = `the next ${daysInWords(leadDays)}`;
  return (
    <View style={styles.wrap} testID="availability-standing">
      {loading ? (
        <View style={styles.loading}>
          <Skeleton width="55%" height={16} />
          <Skeleton width="80%" height={13} />
        </View>
      ) : (
        <>
          <View style={styles.row}>
            {through ? <CalendarCheck size={16} color={colors.success} /> : <CalendarClock size={16} color={colors.mutedForeground} />}
            <T variant="label" style={styles.grow} testID="availability-set-through">
              {through ? `Set through ${through}` : "No times set ahead yet"}
            </T>
          </View>
          {n > 0 ? (
            <Pressable
              testID="availability-gaps"
              accessibilityRole="button"
              accessibilityHint="Opens the first of these days"
              onPress={onSetFirstGap}
              style={({ pressed }) => [styles.gaps, { backgroundColor: colors.warningTint }, pressed && { opacity: 0.7 }]}
            >
              <TriangleAlert size={15} color={colors.warning} />
              <T variant="small" style={[styles.grow, { color: colors.warning, fontWeight: "600" }]}>
                {n} open day{n === 1 ? "" : "s"} in {window} still need{n === 1 ? "s" : ""} times
              </T>
              <ChevronRight size={16} color={colors.warning} />
            </Pressable>
          ) : !asksNotice ? null : (
            <View style={[styles.gaps, { backgroundColor: colors.successTint }]} testID="availability-all-set">
              <CircleCheck size={15} color={colors.success} />
              <T variant="small" style={[styles.grow, { color: colors.success, fontWeight: "600" }]}>
                You’re all set for {window}.
              </T>
            </View>
          )}
        </>
      )}
      <T variant="small" tone="muted">
        {rule}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.md, gap: space.sm },
  loading: { gap: space.sm, paddingVertical: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  grow: { flex: 1 },
  gaps: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
});
