import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { hours, plural } from "@/features/schedule/format";
import { radius, space, useColors } from "@/theme";
import type { WeekSummary } from "./model";

/** This week in three numbers: sessions (and how many are still to come), booked time, and logs written. */
export function WeekCard({ summary, range, onPress }: { summary: WeekSummary; range: string; onPress: () => void }) {
  const colors = useColors();
  const logs = summary.logsDue ? `${summary.logsDone}/${summary.logsDue}` : "—";
  const tiles: { value: string; label: string; note?: string; tone?: string }[] = [
    { value: String(summary.sessions), label: summary.sessions === 1 ? "session" : "sessions", note: summary.remaining ? `${summary.remaining} to go` : summary.sessions ? "all done" : undefined },
    { value: hours(summary.bookedMin).replace(" h", ""), label: "hours booked" },
    {
      value: logs,
      label: "logs written",
      note: summary.logsDue > summary.logsDone ? `${summary.logsDue - summary.logsDone} to write` : undefined,
      tone: summary.logsDue > summary.logsDone ? colors.warning : undefined,
    },
  ];
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <T variant="small" tone="muted" style={styles.title}>
          THIS WEEK
        </T>
        <T variant="small" tone="muted" style={styles.range}>
          {range}
        </T>
      </View>
      <Pressable
        testID="today-week"
        accessibilityRole="button"
        accessibilityLabel={`This week: ${plural(summary.sessions, "session")}, ${hours(summary.bookedMin)} booked, ${summary.logsDone} of ${summary.logsDue} session logs written. Opens your schedule.`}
        onPress={() => {
          void Haptics.selectionAsync().catch(() => undefined);
          onPress();
        }}
        style={({ pressed }) => [styles.card, { backgroundColor: pressed ? colors.accent : colors.card, borderColor: colors.border }]}
      >
        {tiles.map((t, i) => (
          <View key={t.label} style={[styles.tile, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}>
            <T variant="stat">{t.value}</T>
            <T variant="small" tone="muted">
              {t.label}
            </T>
            {t.note ? (
              <T variant="tiny" style={{ color: t.tone ?? colors.mutedForeground, fontWeight: "600" }}>
                {t.note}
              </T>
            ) : null}
          </View>
        ))}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: { flexDirection: "row", alignItems: "baseline", paddingHorizontal: space.xs },
  title: { flex: 1, fontWeight: "600", letterSpacing: 0.5 },
  range: { fontWeight: "600" },
  card: { flexDirection: "row", borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingVertical: space.lg },
  tile: { flex: 1, paddingHorizontal: space.lg, gap: 2 },
});
