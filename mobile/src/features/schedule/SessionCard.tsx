import * as Haptics from "expo-haptics";
import { ChevronRight, CircleAlert, CircleCheck, StickyNote, TriangleAlert } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { studentLabel } from "@shared/people";
import { type Conflict, tutorConflictText } from "@shared/schedule/conflicts";
import { SESSION_STATUS_LABELS } from "@shared/schedule/status";
import { T } from "@/components/Text";
import { radius, space, useColors, useStatusColors } from "@/theme";
import type { LogState, SessionDoc } from "./data";
import { clock, duration } from "./format";

/**
 * A session on the tutor's schedule, in its status color (the website's softer card colors): the time, "Name (grade)",
 * the subject, and the marks that matter on a phone, where nothing can be hovered: the admin's note, why it isn't
 * confirmed (in conflict), and the session log (✓ submitted, or a button to write the missing one).
 */
export function SessionCard({
  session,
  conflicts,
  logState,
  live,
  hour12,
  onPress,
  onWriteLog,
}: {
  session: SessionDoc;
  conflicts: Conflict[];
  logState: LogState;
  /** Happening right now. */
  live: boolean;
  hour12: boolean;
  onPress: () => void;
  onWriteLog: () => void;
}) {
  const colors = useColors();
  const statusColors = useStatusColors();
  const st = statusColors[session.status] ?? statusColors.pending;
  const canceled = session.status === "canceled";
  const why = tutorConflictText(conflicts);
  const label = studentLabel(session.studentName, session.studentGrade);
  const spoken = [
    session.studentName,
    session.studentGrade ? `grade ${session.studentGrade}` : null,
    session.subject || "no subject",
    `${clock(session.startMin, hour12)} to ${clock(session.endMin, hour12)}`,
    live ? "happening now" : SESSION_STATUS_LABELS[session.status],
    session.note ? "has a note" : null,
    why ? "not confirmed, waiting for the admin" : null,
    logState === "submitted" ? "session log submitted" : logState === "missing" ? "session log missing" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      testID={`session-card-${session.id}`}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the session"
      // The "Write" button inside isn't reachable on its own with VoiceOver: it's an action of the card.
      accessibilityActions={logState === "missing" ? [{ name: "writeLog", label: "Write session log" }] : undefined}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === "writeLog" && onWriteLog()}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: st.bg,
          borderColor: why ? colors.destructive : st.border,
          borderStyle: why ? "dashed" : "solid",
          borderWidth: why ? 1.5 : StyleSheet.hairlineWidth * 2,
          opacity: canceled ? 0.6 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={styles.top}>
        <View style={styles.time}>
          <T variant="label" style={styles.tabular} numberOfLines={1}>
            {clock(session.startMin, hour12)}
          </T>
          <T variant="small" style={[styles.tabular, { color: st.text }]} numberOfLines={1}>
            {clock(session.endMin, hour12)}
          </T>
        </View>
        <View style={[styles.bar, { backgroundColor: why ? colors.destructive : st.bar }]} />
        <View style={styles.main}>
          <View style={styles.nameRow}>
            <T variant="label" numberOfLines={1} style={[styles.grow, canceled && styles.struck]}>
              {label}
            </T>
            <StatusTag status={session.status} live={live} />
          </View>
          <View style={styles.subRow}>
            <T variant="small" numberOfLines={1} style={[styles.grow, { color: st.text }]}>
              {session.subject || "No subject"} · {duration(session.endMin - session.startMin)}
            </T>
            {logState === "submitted" ? (
              <View style={styles.logged} testID={`session-logged-${session.id}`}>
                <CircleCheck size={13} color={colors.info} />
                <T variant="tiny" style={{ color: colors.info, fontWeight: "600" }}>
                  Logged
                </T>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {session.note || why || logState === "missing" ? (
        <View style={[styles.extras, { borderTopColor: st.border }]}>
          {why ? (
            <Line icon={<TriangleAlert size={14} color={colors.destructive} />} testID={`session-conflict-${session.id}`}>
              <T variant="small" style={{ color: colors.destructive }}>
                <T variant="small" style={[styles.bold, { color: colors.destructive }]}>
                  Not confirmed.{" "}
                </T>
                {why}
              </T>
            </Line>
          ) : null}
          {session.note ? (
            <Line icon={<StickyNote size={14} color={colors.info} />}>
              <T variant="small" numberOfLines={2}>
                {session.note}
              </T>
            </Line>
          ) : null}
          {logState === "missing" ? (
            <Pressable
              testID={`session-write-log-${session.id}`}
              accessibilityRole="button"
              accessibilityLabel="Please write your session log."
              accessibilityHint="Opens the session log"
              hitSlop={6}
              onPress={() => {
                void Haptics.selectionAsync().catch(() => undefined);
                onWriteLog();
              }}
              style={({ pressed }) => [styles.logButton, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Line icon={<CircleAlert size={14} color={colors.destructive} />} grow>
                <T variant="small" style={[styles.bold, { color: colors.destructive }]}>
                  Please write your session log.
                </T>
              </Line>
              <View style={styles.write}>
                <T variant="small" style={styles.bold}>
                  Write
                </T>
                <ChevronRight size={14} color={colors.foreground} />
              </View>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/** The status at a card's corner: a dot and the word, or "Now" while it's happening. */
export function StatusTag({ status, live }: { status: SessionDoc["status"]; live?: boolean }) {
  const colors = useColors();
  const st = useStatusColors()[status];
  const color = live ? colors.now : st.text;
  return (
    <View style={styles.tag}>
      <View style={[styles.dot, { backgroundColor: live ? colors.now : st.bar }]} />
      <T variant="tiny" style={{ color, fontWeight: "600" }}>
        {live ? "Now" : SESSION_STATUS_LABELS[status]}
      </T>
    </View>
  );
}

function Line({ icon, children, testID, grow }: { icon: ReactNode; children: ReactNode; testID?: string; grow?: boolean }) {
  return (
    <View style={[styles.line, grow && styles.grow]} testID={testID}>
      <View style={styles.lineIcon}>{icon}</View>
      <View style={styles.grow}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, paddingVertical: space.md, paddingHorizontal: space.md, gap: space.sm },
  top: { flexDirection: "row", alignItems: "stretch", gap: space.md },
  time: { width: 70, justifyContent: "center" },
  tabular: { fontVariant: ["tabular-nums"] },
  bar: { width: 3, borderRadius: 2 },
  main: { flex: 1, gap: 2, justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  subRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  logged: { flexDirection: "row", alignItems: "center", gap: 3 },
  grow: { flex: 1 },
  struck: { textDecorationLine: "line-through" },
  tag: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  extras: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm, gap: 6 },
  line: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  lineIcon: { paddingTop: 1 },
  bold: { fontWeight: "600" },
  logButton: { flexDirection: "row", alignItems: "center", gap: space.sm },
  write: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: "auto" },
});
