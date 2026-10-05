import * as Haptics from "expo-haptics";
import { CircleCheck, StickyNote, TriangleAlert } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { studentLabel } from "@shared/people";
import type { Conflict } from "@shared/schedule/conflicts";
import { SESSION_STATUS_LABELS } from "@shared/schedule/status";
import { Button } from "@/components/Button";
import { T } from "@/components/Text";
import type { LogState, SessionDoc } from "@/features/schedule/data";
import { clock } from "@/features/schedule/format";
import { StatusTag } from "@/features/schedule/SessionCard";
import { space, useColors, useStatusColors } from "@/theme";

/**
 * One of today's sessions, as a row of the day's list: start and end, the status color, who and what, and at the
 * right what matters now: "Now", the log (✓ or "Write log"), not confirmed, or the status.
 */
export function TodaySessionRow({
  session,
  conflicts,
  logState,
  live,
  ended,
  hour12,
  onPress,
  onWriteLog,
  divider = false,
}: {
  session: SessionDoc;
  conflicts: Conflict[];
  logState: LogState;
  live: boolean;
  ended: boolean;
  hour12: boolean;
  onPress: () => void;
  onWriteLog: () => void;
  /** Set by ListSection on every row after the first. */
  divider?: boolean;
}) {
  const colors = useColors();
  const statusColors = useStatusColors();
  const st = statusColors[session.status] ?? statusColors.pending;
  const canceled = session.status === "canceled";
  const inConflict = conflicts.length > 0;

  let right: ReactNode;
  if (canceled || session.status === "no_show") {
    right = (
      <T variant="small" tone="muted">
        {SESSION_STATUS_LABELS[session.status]}
      </T>
    );
  } else if (logState === "submitted") {
    right = (
      <View style={styles.logged}>
        <CircleCheck size={15} color={colors.info} />
        <T variant="small" style={{ color: colors.info, fontWeight: "600" }}>
          Logged
        </T>
      </View>
    );
  } else if (logState === "missing") {
    right = (
      <Button size="sm" variant="outline" onPress={onWriteLog} testID={`today-write-log-${session.id}`} accessibilityLabel={`Write the session log for ${session.studentName}`}>
        Write log
      </Button>
    );
  } else if (live) {
    right = <StatusTag status={session.status} live />;
  } else if (inConflict) {
    right = (
      <View style={styles.logged}>
        <TriangleAlert size={15} color={colors.destructive} />
        <T variant="small" style={{ color: colors.destructive, fontWeight: "600" }}>
          Not confirmed
        </T>
      </View>
    );
  } else if (ended) {
    right = (
      <T variant="small" tone="muted">
        Done
      </T>
    );
  } else {
    right = <StatusTag status={session.status} />;
  }

  return (
    <Pressable
      testID={`today-session-${session.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${clock(session.startMin, hour12)} to ${clock(session.endMin, hour12)}, ${session.studentName}${session.studentGrade ? `, grade ${session.studentGrade}` : ""}, ${session.subject || "no subject"}${live ? ", happening now" : ""}${inConflict ? ", not confirmed" : ""}${logState === "missing" ? ", session log missing" : logState === "submitted" ? ", session log submitted" : ""}${canceled ? ", canceled" : ""}`}
      accessibilityActions={logState === "missing" ? [{ name: "writeLog", label: "Write session log" }] : undefined}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === "writeLog" && onWriteLog()}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
    >
      <View style={[styles.time, canceled && styles.muted]}>
        <T variant="label" style={[styles.tabular, live && { color: colors.now }]} numberOfLines={1}>
          {clock(session.startMin, hour12)}
        </T>
        <T variant="small" tone="muted" style={styles.tabular} numberOfLines={1}>
          {clock(session.endMin, hour12)}
        </T>
      </View>
      <View style={[styles.bar, { backgroundColor: inConflict ? colors.destructive : live ? colors.now : st.bar }, canceled && styles.muted]} />
      <View style={[styles.main, canceled && styles.muted]}>
        <T variant="label" numberOfLines={1} style={canceled && styles.struck}>
          {studentLabel(session.studentName, session.studentGrade)}
        </T>
        <View style={styles.sub}>
          {session.note ? <StickyNote size={12} color={colors.info} /> : null}
          <T variant="small" tone="muted" numberOfLines={1} style={styles.grow}>
            {session.subject || "No subject"}
          </T>
        </View>
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 60 },
  time: { width: 72 },
  tabular: { fontVariant: ["tabular-nums"] },
  bar: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  main: { flex: 1, gap: 2 },
  sub: { flexDirection: "row", alignItems: "center", gap: 4 },
  grow: { flex: 1 },
  logged: { flexDirection: "row", alignItems: "center", gap: 4 },
  muted: { opacity: 0.5 },
  struck: { textDecorationLine: "line-through" },
});
