import * as Haptics from "expo-haptics";
import { CalendarDays, Clock, StickyNote, TriangleAlert } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { studentLabel } from "@shared/people";
import { type Conflict, tutorConflictText } from "@shared/schedule/conflicts";
import { type DateKey, diffDays } from "@shared/time";
import { T } from "@/components/Text";
import { dayWords } from "@/features/schedule/DaySection";
import { clock, duration, listWords, monthDay, shortDay, startsIn, timeLeft, timeRange } from "@/features/schedule/format";
import { StatusTag } from "@/features/schedule/SessionCard";
import { radius, space, useColors, useStatusColors } from "@/theme";
import type { NextUp } from "./model";

/**
 * Today's hero: the session in progress (how far along, when it ends), or the next one with a live countdown, or, once
 * today is done, the first session of the next day that has one. Tapping it opens the session.
 */
export function NextUpCard({
  next,
  today,
  nowMin,
  hour12,
  conflicts,
  onOpen,
}: {
  next: NextUp;
  today: DateKey;
  nowMin: number;
  hour12: boolean;
  conflicts: Conflict[];
  onOpen: () => void;
}) {
  const colors = useColors();
  const statusColors = useStatusColors();
  const s = next.session;
  const st = statusColors[s.status] ?? statusColors.pending;
  const why = tutorConflictText(conflicts);
  const total = Math.max(1, s.endMin - s.startMin);
  const done = Math.min(1, Math.max(0, (nowMin - s.startMin) / total));
  const words = dayWords(s.dateKey, today);
  const days = diffDays(today, s.dateKey);

  const eyebrow =
    next.kind === "live" ? "Now" : next.kind === "next" ? `Next · ${startsIn(s.startMin - nowMin)}` : `Next session · ${words.relative || days < 7 ? words.primary : monthDay(s.dateKey)}`;
  const corner = next.kind === "live" ? `ends ${clock(s.endMin, hour12)}` : next.kind === "next" ? clock(s.startMin, hour12) : days > 1 ? `in ${days} days` : "";
  const others = next.also.map((o) => studentLabel(o.studentName, o.studentGrade));

  return (
    <Pressable
      testID="today-next"
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}. ${s.studentName}${s.studentGrade ? `, grade ${s.studentGrade}` : ""}, ${s.subject || "no subject"}, ${timeRange(s.startMin, s.endMin, hour12)}${next.kind === "live" ? `, ${timeLeft(s.endMin - nowMin)}` : ""}${why ? ". Not confirmed." : ""}`}
      accessibilityHint="Opens the session"
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onOpen();
      }}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: why ? colors.destructive : colors.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.accent, { backgroundColor: next.kind === "live" ? colors.now : why ? colors.destructive : st.bar }]} />
      <View style={styles.body}>
        <View style={styles.eyebrow}>
          {next.kind === "live" ? (
            <View style={[styles.liveDot, { backgroundColor: colors.now }]} />
          ) : next.kind === "next" ? (
            <Clock size={14} color={colors.mutedForeground} />
          ) : (
            <CalendarDays size={14} color={colors.mutedForeground} />
          )}
          <T variant="small" style={[styles.eyebrowText, { color: next.kind === "live" ? colors.now : colors.mutedForeground }]} testID="today-next-when">
            {eyebrow}
          </T>
          <T variant="small" tone="muted" style={styles.tabular}>
            {corner}
          </T>
        </View>

        <View style={styles.nameRow}>
          <T variant="heading" numberOfLines={1} style={styles.grow}>
            {studentLabel(s.studentName, s.studentGrade)}
          </T>
          {next.kind !== "live" ? <StatusTag status={s.status} /> : null}
        </View>
        <T tone="muted" numberOfLines={1}>
          {s.subject || "No subject"} · {duration(total)}
        </T>

        {next.kind === "live" ? (
          <View style={styles.progressWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={[styles.track, { backgroundColor: colors.secondary }]}>
              <View style={[styles.fill, { width: `${done * 100}%`, backgroundColor: colors.now }]} />
            </View>
            <View style={styles.progressLabels}>
              <T variant="small" tone="muted" style={styles.tabular}>
                {clock(s.startMin, hour12)}
              </T>
              <T variant="small" style={styles.left}>
                {timeLeft(s.endMin - nowMin)}
              </T>
              <T variant="small" tone="muted" style={styles.tabular}>
                {clock(s.endMin, hour12)}
              </T>
            </View>
          </View>
        ) : (
          <View style={styles.line}>
            <Clock size={14} color={colors.mutedForeground} />
            <T variant="small" tone="muted" style={styles.tabular}>
              {next.kind === "later" ? `${shortDay(s.dateKey)} · ` : ""}
              {timeRange(s.startMin, s.endMin, hour12)}
            </T>
          </View>
        )}

        {why ? (
          <View style={styles.line}>
            <TriangleAlert size={14} color={colors.destructive} />
            <T variant="small" style={[styles.grow, { color: colors.destructive }]}>
              <T variant="small" style={[styles.bold, { color: colors.destructive }]}>
                Not confirmed.{" "}
              </T>
              {why}
            </T>
          </View>
        ) : null}
        {s.note ? (
          <View style={styles.line}>
            <StickyNote size={14} color={colors.info} />
            <T variant="small" numberOfLines={2} style={styles.grow}>
              {s.note}
            </T>
          </View>
        ) : null}
        {others.length ? (
          <T variant="small" tone="muted" numberOfLines={2}>
            {next.kind === "live" ? "Also now: " : `Also at ${clock(s.startMin, hour12)}: `}
            {listWords(others)}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  accent: { width: 4 },
  body: { flex: 1, padding: space.lg, gap: 6 },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  eyebrowText: { flex: 1, fontWeight: "700", letterSpacing: 0.2 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  grow: { flex: 1 },
  tabular: { fontVariant: ["tabular-nums"] },
  progressWrap: { gap: 6, marginTop: space.sm },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  progressLabels: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  left: { fontWeight: "600", fontVariant: ["tabular-nums"] },
  line: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 2 },
  bold: { fontWeight: "600" },
});
