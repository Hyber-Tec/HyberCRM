import { collection, query, where } from "@react-native-firebase/firestore";
import { router, useLocalSearchParams } from "expo-router";
import { CalendarDays, CircleAlert, CircleCheck, Clock, ExternalLink, NotebookPen, Sparkles, StickyNote, TriangleAlert, X } from "lucide-react-native";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { COL, ROOT } from "@shared/paths";
import { STUDENT_STATUS_LABELS, relativeDayLabel, studentLabel } from "@shared/people";
import { tutorConflictText } from "@shared/schedule/conflicts";
import { isFirstSession } from "@shared/schedule/firstSession";
import { SESSION_STATUS_LABELS } from "@shared/schedule/status";
import { canLog } from "@shared/sessions/logs";
import { formatInstant } from "@shared/time";
import type { Session } from "@shared/types";
import { Badge } from "@/components/Badge";
import { Button, useButtonForeground } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { ListRow, ListSection } from "@/components/List";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useSession, useStudent } from "@/features/data/hooks";
import { hasStarted, isEnded, isLive, useClock, useTutorSchedule } from "@/features/schedule/data";
import { duration, longDay, timeLeft, timeRange } from "@/features/schedule/format";
import { db } from "@/lib/firebase";
import { useQuery } from "@/lib/firestore";
import { openWebsite } from "@/lib/links";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors, useStatusColors } from "@/theme";

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A session, over the screen it was opened from (a sheet; loaded by ID, so links and notifications open it too): who
 * and what, when, the admin's note, why it isn't confirmed when it's in conflict, the student's basics with the
 * first-session notice, and the session log (write it, or view the submitted one). Tutors can't change sessions.
 */
export default function SessionSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { branchId, staffId, settings, timezone } = useBranch();
  const colors = useColors();
  const statusColors = useStatusColors();
  const clock = useClock();
  const { today, nowMin } = clock;
  const hour12 = settings.general.timeFormat !== "24h";
  const { data: session, loading } = useSession(id ?? null);
  const { data: student } = useStudent(session?.studentId ?? null);
  // That day's schedule: what the conflict check needs (hours, availability, the tutor's other sessions).
  const day = session?.dateKey ?? today;
  const context = useTutorSchedule(day, day, clock);
  // The first-session notice needs the tutor's other sessions with a student who has no history yet.
  const askFirst = !!session && !!staffId && !!student && settings.schedule.alerts.firstSession && !student.lastSessionDate && !(student.totalSessionHours > 0);
  const withStudent = useQuery<Session>(askFirst && session ? `first-${branchId}-${staffId}-${session.studentId}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.sessions), where("tutorId", "==", staffId), where("studentId", "==", session?.studentId ?? "")),
  );
  const primaryFg = useButtonForeground("default");
  const outlineFg = useButtonForeground("outline");

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (loading) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="session-sheet">
        <View style={styles.content}>
          <Skeleton width="60%" height={28} />
          <Skeleton width="35%" height={18} />
          <Skeleton height={96} rounded={radius.lg} />
          <Skeleton height={64} rounded={radius.lg} />
        </View>
      </View>
    );
  }
  if (!session) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="session-sheet">
        <EmptyState
          icon={<CalendarDays size={26} color={colors.mutedForeground} />}
          title="This session isn’t available"
          text="It may have been deleted or given to another tutor."
          action={
            <Button variant="outline" onPress={close} testID="session-close">
              Close
            </Button>
          }
        />
      </View>
    );
  }

  const st = statusColors[session.status] ?? statusColors.pending;
  const conflicts = context.conflictsOf(session.id);
  const why = tutorConflictText(conflicts);
  const live = isLive(session, today, nowMin);
  const ended = isEnded(session, today, nowMin);
  const started = hasStarted(session, today, nowMin);
  const submitted = session.logStatus === "submitted";
  const loggable = canLog(session.status, settings.sessionLogs.allowForStatuses);
  const first = !!student && askFirst && !withStudent.loading && isFirstSession(session, student, withStudent.data);
  const submittedAt = (session.logSubmittedAt as { toDate?: () => Date } | null)?.toDate?.();
  const label = studentLabel(session.studentName, session.studentGrade);

  return (
    <ScrollView style={[styles.fill, { backgroundColor: colors.grouped }]} contentContainerStyle={styles.content} testID="session-sheet">
      <View style={styles.head}>
        <View style={styles.grow}>
          <T variant="title" accessibilityRole="header" testID="session-student">
            {label}
          </T>
          <T tone="muted">{session.subject || "No subject"}</T>
        </View>
        <View style={[styles.round, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <IconButton testID="session-close" icon={<X size={18} color={colors.foreground} />} accessibilityLabel="Close" onPress={close} size={32} />
        </View>
      </View>

      <View style={styles.badges}>
        <Badge bg={st.bg} fg={st.text} icon={<View style={[styles.dot, { backgroundColor: st.bar }]} />}>
          {SESSION_STATUS_LABELS[session.status]}
        </Badge>
        {live ? <Badge bg={colors.destructiveTint} fg={colors.now}>Happening now</Badge> : null}
        {session.isDeleted ? <Badge tone="destructive">In the Trash</Badge> : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="session-when">
        <Line icon={<CalendarDays size={16} color={colors.mutedForeground} />}>
          <T variant="label">
            {sentence(relativeDayLabel(session.dateKey, today))} · {longDay(session.dateKey)}
          </T>
        </Line>
        <Line icon={<Clock size={16} color={colors.mutedForeground} />}>
          <T>
            {timeRange(session.startMin, session.endMin, hour12)} · {duration(session.endMin - session.startMin)}
            {live ? <T style={{ color: colors.now, fontWeight: "600" }}> · {timeLeft(session.endMin - nowMin)}</T> : null}
          </T>
        </Line>
      </View>

      {session.isDeleted ? (
        <Notice tone="destructive" icon={<TriangleAlert size={18} color={colors.destructive} />} title="This session was deleted" testID="session-deleted">
          An admin moved it to the Trash. It no longer takes place.
        </Notice>
      ) : why ? (
        <Notice tone="destructive" icon={<TriangleAlert size={18} color={colors.destructive} />} title="Not confirmed" testID="session-conflict">
          {why}
        </Notice>
      ) : null}
      {first ? (
        <Notice tone="success" icon={<Sparkles size={18} color={colors.success} />} title="First session" testID="session-first">
          This student is attending a first session.
        </Notice>
      ) : null}

      {session.note ? (
        <ListSection title="Note from the admin">
          <ListRow icon={<StickyNote size={18} color={colors.info} />} title={<T selectable>{session.note}</T>} testID="session-note" />
        </ListSection>
      ) : null}

      <ListSection title="Session log" testID="session-log">
        {submitted ? (
          <ListRow
            icon={<CircleCheck size={18} color={colors.info} />}
            title="Session log submitted"
            subtitle={submittedAt ? formatInstant(submittedAt, timezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : undefined}
            testID="session-log-submitted"
          />
        ) : loggable && !session.isDeleted ? (
          <View style={styles.logBox}>
            {ended ? (
              <View style={styles.inline}>
                <CircleAlert size={16} color={colors.destructive} />
                <T variant="small" style={{ color: colors.destructive, fontWeight: "600" }}>
                  Please write your session log.
                </T>
              </View>
            ) : session.logStatus === "draft" ? (
              <T variant="small" tone="muted">
                You have a draft saved.
              </T>
            ) : null}
            {/* The main action once the session has started; before that, there for those who prepare ahead. */}
            <Button
              variant={started ? "default" : "outline"}
              icon={<NotebookPen size={18} color={started ? primaryFg : outlineFg} />}
              onPress={() => router.push(`/log/${session.id}`)}
              testID="session-write-log"
            >
              {session.logStatus === "draft" ? "Continue session log" : "Write session log"}
            </Button>
            {!started ? (
              <T variant="small" tone="muted">
                You can start it now; it can be submitted once the session has started.
              </T>
            ) : null}
          </View>
        ) : (
          <ListRow title={<T tone="muted">{`${SESSION_STATUS_LABELS[session.status]} sessions don’t take a session log.`}</T>} />
        )}
      </ListSection>
      {submitted ? (
        <View style={styles.buttons}>
          <Button variant="outline" style={styles.grow} onPress={() => router.push(`/log-view/${session.id}`)} testID="session-view-log">
            View log
          </Button>
          {settings.sessionLogs.allowEditAfterSubmit ? (
            <Button variant="outline" style={styles.grow} onPress={() => router.push(`/log/${session.id}`)} testID="session-edit-log">
              Edit log
            </Button>
          ) : null}
        </View>
      ) : null}

      <ListSection title="Student" testID="session-student-info">
        <ListRow title="School" right={student?.school || "—"} />
        <ListRow title="Grade" right={student?.grade || session.studentGrade || "—"} />
        <ListRow title="Total hours" right={student ? `${Math.round((student.totalSessionHours ?? 0) * 10) / 10} h` : "—"} />
        {student ? <ListRow title="Status" right={STUDENT_STATUS_LABELS[student.status] ?? "—"} /> : null}
        {student?.learningNote ? <ListRow title="Learning note" subtitle={<T selectable>{student.learningNote}</T>} /> : null}
        <ListRow
          icon={<ExternalLink size={18} color={colors.foreground} />}
          title="Full profile"
          subtitle="Opens on the website"
          onPress={() => void openWebsite(`/${branchId}/tutor/students/${session.studentId}`)}
          testID="session-student-profile"
        />
      </ListSection>

      <T variant="small" tone="muted" style={styles.footer}>
        Only an admin can change, move or cancel this session. If something’s wrong, let them know.
      </T>
    </ScrollView>
  );
}

function Line({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.line}>
      <View style={styles.lineIcon}>{icon}</View>
      <View style={styles.grow}>{children}</View>
    </View>
  );
}

function Notice({ tone, icon, title, children, testID }: { tone: "destructive" | "success"; icon: ReactNode; title: string; children: ReactNode; testID?: string }) {
  const colors = useColors();
  const bg = tone === "destructive" ? colors.destructiveTint : colors.successTint;
  const fg = tone === "destructive" ? colors.destructive : colors.success;
  return (
    <View style={[styles.notice, { backgroundColor: bg, borderColor: fg }]} testID={testID} accessibilityRole="alert">
      {icon}
      <View style={styles.grow}>
        <T variant="label" style={{ color: fg }}>
          {title}
        </T>
        <T variant="small">{children}</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.xl, paddingTop: space.xl + space.sm, gap: space.lg, paddingBottom: space.xxl * 2 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  round: { borderRadius: radius.full, borderWidth: StyleSheet.hairlineWidth },
  grow: { flex: 1 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: -space.sm },
  dot: { width: 7, height: 7, borderRadius: 4 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.md },
  line: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  lineIcon: { paddingTop: 2 },
  notice: { flexDirection: "row", gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  logBox: { padding: space.lg, gap: space.md },
  inline: { flexDirection: "row", alignItems: "center", gap: 6 },
  buttons: { flexDirection: "row", gap: space.md, marginTop: -space.sm },
  footer: { textAlign: "center", paddingHorizontal: space.lg },
});
