import { SESSION_STATUS_LABELS } from "@shared/schedule/status";
import { billedHours } from "@shared/schedule/hours";
import { canLog } from "@shared/sessions/logs";
import { formatInstant } from "@shared/time";
import * as Haptics from "expo-haptics";
import { router, useNavigation } from "expo-router";
import { Check, FilePen, FileX, Pencil, Trash2 } from "lucide-react-native";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { ToastHost } from "@/components/ToastHost";
import { useBranchNow, useSession, useStudent } from "@/features/data/hooks";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import { sessionLine } from "./content";
import { useConferenceNote, useSessionLog } from "./data";
import { LogForm } from "./LogForm";
import { LogHeader } from "./LogHeader";
import { LogView } from "./LogView";
import { Banner, BannerText } from "./widgets";

/**
 * A session's log, loaded by the session's ID (the website's SessionLogPage), for both routes:
 * - `log/[id]` (full screen) is writing it: the form for a new log or a draft, and for a submitted log the same form
 *   as an explicit edit (reached through "Edit log"), when the branch allows edits. Otherwise the log, read-only.
 * - `log-view/[id]` (a sheet, `readOnly`) is reading it, with "Edit log" (or "Continue the log") when allowed,
 *   which opens the form over it and comes back to it.
 * Another tutor's log reads from its own copy (when the branch lets tutors read every log). Canceled and No Show
 * sessions, deleted sessions and missing ones say so in words.
 */
export function LogScreen({ sessionId, readOnly = false }: { sessionId: string; readOnly?: boolean }) {
  const { settings, staffId, timezone } = useBranch();
  const { today } = useBranchNow();
  const colors = useColors();
  const navigation = useNavigation();
  const logState = useSessionLog(sessionId || null);
  const log = logState.data;
  const othersLog = !!log && !!staffId && log.tutorId !== staffId;
  // The read-only sheet waits for the log first: another tutor's session can't be read (their log can, when allowed).
  const sessionPath = !sessionId || (readOnly && (logState.loading || othersLog)) ? null : sessionId;
  const sessionState = useSession(sessionPath);
  const liveSession = sessionState.data;
  const session = liveSession && !liveSession.isDeleted ? liveSession : null;
  const student = useStudent(readOnly ? null : (session?.studentId ?? null)).data;
  const isOwnTutor = !!staffId && !!session && session.tutorId === staffId;
  const note = useConferenceNote(isOwnTutor && !readOnly ? sessionId : null);
  // While a submit runs, the form stays even though the log turns "submitted" under it.
  const [hold, setHold] = useState(false);
  const [success, setSuccess] = useState<{ updated: boolean; usedHours: number } | null>(null);

  const leave = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace("/");
  }, [navigation]);
  const openLog = useCallback((id: string) => router.push({ pathname: "/log-view/[id]", params: { id } }), []);

  const loading = logState.loading || (!!sessionPath && sessionState.loading);
  const submitted = log?.status === "submitted";
  const loggable = !!session && (submitted || canLog(session.status, settings.sessionLogs.allowForStatuses));
  const mayWrite = isOwnTutor;
  const mayEdit = mayWrite && loggable && (!submitted || settings.sessionLogs.allowEditAfterSubmit);
  const sheet = readOnly;
  // A draft form becomes an edit if the log is submitted elsewhere meanwhile (not by its own submit, held above).
  const wantedKey = submitted ? "edit" : "write";
  const [formKey, setFormKey] = useState(wantedKey);
  if (!hold && !success && wantedKey !== formKey) setFormKey(wantedKey);

  let body: ReactNode;
  if (success) {
    const snap = session ?? log;
    body = (
      <SuccessView
        updated={success.updated}
        title={snap?.studentName ?? ""}
        line={snap ? sessionLine(snap, today, success.usedHours, settings.general.timeFormat !== "24h") : ""}
        usedHours={success.usedHours}
        onDone={leave}
      />
    );
  } else if (!sessionId || loading) {
    body = <LoadingView sheet={sheet} onClose={leave} />;
  } else if (logState.error && !session) {
    body = <MessageView sheet={sheet} onClose={leave} icon={FileX} title="Session log not available" text="It may have been deleted, or you don’t have access to it." />;
  } else if (session && (hold || (mayEdit && !readOnly))) {
    body = (
      <LogForm
        key={formKey}
        session={session}
        student={student}
        existing={log}
        conferenceNote={note}
        onSubmitting={setHold}
        onSubmitted={(r) => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
          setHold(false);
          setSuccess(r);
        }}
        onOpenLog={openLog}
      />
    );
  } else if (log && (submitted || readOnly || !mayWrite)) {
    const savedAt = (log.updatedAt as { toDate?: () => Date } | undefined)?.toDate?.();
    const editLabel = submitted ? "Edit log" : "Continue the log";
    const edit = () => router.push({ pathname: "/log/[id]", params: { id: log.sessionId || log.id } });
    body = (
      <View style={styles.fill} testID="log-view">
        <LogHeader
          title={log.studentName}
          line={sessionLine(log, today, log.usedHours || billedHours(log.endMin - log.startMin, settings.students.hourRounding), settings.general.timeFormat !== "24h")}
          status={submitted ? "submitted" : "draft"}
          onClose={leave}
          sheet={sheet}
        />
        <ScrollView style={styles.fill} contentContainerStyle={styles.viewScroll}>
          <Animated.View entering={FadeIn.duration(160)} style={styles.gap}>
            {liveSession?.isDeleted ? (
              <Banner tone="muted" icon={Trash2}>
                This session was deleted from the schedule.
              </Banner>
            ) : null}
            {!submitted ? (
              <Banner tone="warning" icon={FilePen} testID="log-draft">
                <BannerText tone="warning">
                  <BannerText tone="warning" bold>
                    Draft — not submitted yet.
                  </BannerText>
                  {savedAt ? ` Last saved ${formatInstant(savedAt, timezone)}.` : ""}
                </BannerText>
              </Banner>
            ) : null}
            <LogView log={log} />
          </Animated.View>
        </ScrollView>
        {mayEdit && readOnly ? (
          <Footer>
            <Button icon={submitted ? <Pencil size={18} color={colors.primaryForeground} /> : <FilePen size={18} color={colors.primaryForeground} />} onPress={edit} testID="log-edit">
              {editLabel}
            </Button>
          </Footer>
        ) : null}
      </View>
    );
  } else if (liveSession?.isDeleted) {
    body = <MessageView sheet={sheet} onClose={leave} icon={Trash2} title="This session was deleted" text="It was removed from the schedule, so it can’t take a session log." />;
  } else if (!session) {
    body = <MessageView sheet={sheet} onClose={leave} icon={FileX} title="Session not found" text="It may have been deleted, or you don’t have access to it." />;
  } else if (!mayWrite) {
    body = <MessageView sheet={sheet} onClose={leave} icon={FileX} title="No log yet" text="The tutor hasn’t written a log for this session." />;
  } else if (!loggable) {
    body = (
      <MessageView
        sheet={sheet}
        onClose={leave}
        icon={FileX}
        title="This session can’t be logged"
        text={`${SESSION_STATUS_LABELS[session.status]} sessions don’t take a session log. If the student attended, ask an admin to change the status first.`}
        testID="log-not-loggable"
      />
    );
  } else {
    // The read-only sheet, nothing written yet.
    body = (
      <MessageView
        sheet={sheet}
        onClose={leave}
        icon={FilePen}
        title="No log yet"
        text="You haven’t written a log for this session."
        action={
          <Button onPress={() => router.replace({ pathname: "/log/[id]", params: { id: session.id } })} testID="log-write">
            Write the log
          </Button>
        }
      />
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.grouped }]}>
      {body}
      <ToastHost />
    </View>
  );
}

/** The bar at the bottom of the read-only log (Edit log). */
function Footer({ children }: { children: ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, space.md) }]}>{children}</View>;
}

function LoadingView({ sheet, onClose }: { sheet: boolean; onClose: () => void }) {
  return (
    <View style={styles.fill} accessibilityLabel="Loading session log" testID="log-loading">
      <LogHeader title="" line="" status={null} onClose={onClose} sheet={sheet} />
      <View style={styles.viewScroll}>
        <Skeleton width="55%" height={22} />
        <Skeleton height={90} rounded={radius.lg} />
        <Skeleton height={160} rounded={radius.lg} />
        <Skeleton height={120} rounded={radius.lg} />
      </View>
    </View>
  );
}

function MessageView({
  sheet,
  onClose,
  icon: Icon,
  title,
  text,
  action,
  testID = "log-message",
}: {
  sheet: boolean;
  onClose: () => void;
  icon: typeof FileX;
  title: string;
  text: string;
  action?: ReactNode;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.fill} testID={testID}>
      <LogHeader title="Session log" line="" status={null} onClose={onClose} sheet={sheet} />
      <EmptyState
        icon={<Icon size={26} color={colors.mutedForeground} />}
        title={title}
        text={text}
        action={
          <View style={styles.actions}>
            {action}
            <Button variant="outline" onPress={onClose}>
              Close
            </Button>
          </View>
        }
      />
    </View>
  );
}

/** Submitted: a moment to see it went through, then back to where the tutor came from. */
function SuccessView({ updated, title, line, usedHours, onDone }: { updated: boolean; title: string; line: string; usedHours: number; onDone: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const done = useRef(false);
  // The screen keeps updating under this view (the log, the session): the timer starts once.
  const onDoneRef = useRef(onDone);
  useLayoutEffect(() => {
    onDoneRef.current = onDone;
  });
  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    onDoneRef.current();
  }, []);
  useEffect(() => {
    const t = setTimeout(finish, 1800);
    return () => clearTimeout(t);
  }, [finish]);
  return (
    <View style={[styles.success, { paddingTop: insets.top, paddingBottom: insets.bottom + space.xl, backgroundColor: colors.background }]} testID="log-success" accessibilityLiveRegion="polite">
      <View style={styles.successBody}>
        <Animated.View entering={ZoomIn.springify().damping(14)} style={[styles.check, { backgroundColor: colors.successTint }]}>
          <Check size={44} color={colors.success} strokeWidth={3} />
        </Animated.View>
        <Animated.View entering={FadeIn.delay(120).duration(200)} style={styles.successText}>
          <T variant="title" style={styles.center}>
            {updated ? "Session log updated" : "Session log submitted"}
          </T>
          <T tone="muted" style={styles.center}>
            {title}
          </T>
          <T variant="small" tone="muted" style={styles.center}>
            {line}
          </T>
          <T variant="small" tone="success" style={[styles.center, styles.bold]}>
            {`Present · ${usedHours} h billed`}
          </T>
        </Animated.View>
      </View>
      <Button size="lg" onPress={finish} style={styles.successButton} testID="log-success-done">
        Done
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  gap: { gap: space.lg },
  center: { textAlign: "center" },
  bold: { fontWeight: "600" },
  viewScroll: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, paddingTop: space.md },
  actions: { gap: space.sm, minWidth: 220 },
  success: { flex: 1, paddingHorizontal: space.xl },
  successBody: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.xl },
  successText: { alignItems: "center", gap: space.sm },
  check: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  successButton: { alignSelf: "stretch" },
});
