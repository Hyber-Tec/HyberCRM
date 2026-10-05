import {
  FLAG_LABELS,
  type LogContent,
  type SessionLog,
  type StudentFlag,
  accuracy,
  allMissing,
  ratingKey,
  sameSubject,
  matchingLog,
  stepOfField,
  submitError,
  suggestFlag,
  topicString,
} from "@shared/sessions/logs";
import { topicKind } from "@shared/sessions/topics";
import { billedHours } from "@shared/schedule/hours";
import { dateKeyOf, formatInstant, formatMinutes } from "@shared/time";
import type { Session, Student } from "@shared/types";
import { router, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Check, ChevronDown, ChevronLeft, CircleCheck, Clock, ExternalLink, Info, PenLine, Plus, Sparkles, Undo2, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, useButtonForeground } from "@/components/Button";
import { confirmAsync } from "@/components/Confirm";
import { Field } from "@/components/Field";
import { T } from "@/components/Text";
import { useBranchNow } from "@/features/data/hooks";
import { openUrl } from "@/lib/links";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import { NOTES, type NoteKey, materialFrom, pickContent, recentMaterials, recentTopics, sessionLine, wordCount } from "./content";
import { type ConferenceNoteContext, polishNotes, submitErrorText, submitSessionLog, usePreviousLogs, writeDraft } from "./data";
import { LogHeader } from "./LogHeader";
import { PrepareStep } from "./PrepareStep";
import { ReviewStep } from "./ReviewStep";
import { StepBar } from "./StepBar";
import { TopicPicker } from "./TopicPicker";
import { useDraftAutosave } from "./useDraftAutosave";
import { useKeyboard } from "./useKeyboard";
import { Banner, BannerText, ChipGroup, CountStepper, ErrorBox, FieldLabel, SectionCard, StarInput, StepTitle, SuggestionChip, Suggestions, useFlagColors } from "./widgets";

type WithId<T> = T & { id: string };

/**
 * The session log form on a phone (the website's LogForm): True Education's six steps, fields, wording and
 * validation, one step per page with Back and Next kept above the keyboard. A new log or a draft saves as the tutor
 * types; a submitted log being edited saves only when it's updated. Submitting happens on the server.
 *
 * Leaving (the close button, Android's back) saves the draft first; unsaved edits to a submitted log are confirmed.
 */
export function LogForm({
  session,
  student,
  existing,
  conferenceNote,
  onSubmitting,
  onSubmitted,
  onOpenLog,
}: {
  session: WithId<Session>;
  student: WithId<Student> | null;
  existing: WithId<SessionLog> | null;
  conferenceNote: ConferenceNoteContext | null;
  onSubmitting: (busy: boolean) => void;
  onSubmitted: (r: { updated: boolean; usedHours: number }) => void;
  onOpenLog: (sessionId: string) => void;
}) {
  const { branchId, settings, actor, timezone } = useBranch();
  const { today } = useBranchNow();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const keyboard = useKeyboard();
  const dims = settings.sessionLogs.ratingDimensions;
  const aiOn = settings.sessionLogs.ai.enabled;
  // Fixed for this form: a log submitted while it's open (by this form) must not turn it into an edit.
  const [isSubmitted] = useState(existing?.status === "submitted");
  const { logs: previous, loading: previousLoading } = usePreviousLogs(session);
  const last = useMemo(() => matchingLog(previous, session), [previous, session]);
  // The type, free-text topics and materials are suggested from earlier logs in the same subject only.
  const sameLogs = useMemo(() => previous.filter((l) => sameSubject(l, session)), [previous, session]);

  const [step, setStep] = useState(0);
  const [c, setC] = useState<LogContent>(() => pickContent(existing));
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [undo, setUndo] = useState<Record<NoteKey, string> | null>(null);
  const [draftBanner, setDraftBanner] = useState(existing?.status === "draft");
  const [typeSuggested, setTypeSuggested] = useState(false);
  const [viewport, setViewport] = useState(600);

  const write = useCallback((content: LogContent) => writeDraft(branchId, session, content, actor.email), [branchId, session, actor.email]);
  const autosave = useDraftAutosave({ enabled: !isSubmitted, content: c, intervalSeconds: settings.sessionLogs.autosaveSeconds, write });

  // Before the session starts the log saves as a draft only; the notice goes when it starts.
  const startsAt = (session.startAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
  const [notStarted, setNotStarted] = useState(() => startsAt > Date.now());
  useEffect(() => {
    if (!notStarted) return;
    const t = setTimeout(() => setNotStarted(false), Math.min(Math.max(0, startsAt - Date.now()), 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [notStarted, startsAt]);

  // Preselect the session type of the last log in the same subject, once (tagged; the tutor can change it).
  const lastSame = sameLogs[0];
  const [suggestDone, setSuggestDone] = useState(!!existing);
  if (!suggestDone && !previousLoading) {
    setSuggestDone(true);
    if (lastSame && !c.sessionType && settings.sessionLogs.sessionTypes.includes(lastSame.sessionType)) {
      setC({ ...c, sessionType: lastSame.sessionType });
      setTypeSuggested(true);
    }
  }

  const set = <K extends keyof LogContent>(k: K, v: LogContent[K]) => {
    autosave.markDirty();
    setError(null);
    if (k === "sessionType") setTypeSuggested(false);
    if (NOTES.some((n) => n.key === k)) setUndo(null);
    setC((x) => ({ ...x, [k]: v }));
  };

  const missing = useMemo(() => allMissing(c, dims), [c, dims]);
  const missingSteps = useMemo(() => new Set<number>(missing.map(stepOfField)), [missing]);
  const done = [true, ...[1, 2, 3, 4].map((s) => !missingSteps.has(s)), missing.length === 0];
  const flagged = useMemo(() => (tried ? missingSteps : new Set<number>()), [tried, missingSteps]);

  // ------------------------------------------------------------------ scrolling
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const scrollToView = useCallback((view: View | null, offset: number) => {
    const content = contentRef.current;
    if (!view || !content) return;
    view.measureLayout(
      content,
      (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - offset), animated: true }),
      () => undefined,
    );
  }, []);
  /** A focused field: once the keyboard is up, scroll it to the top of the space left above it. */
  const revealField = useCallback((view: View | null, offset: number = space.md) => keyboard.whenShown(() => scrollToView(view, offset)), [keyboard, scrollToView]);

  function go(next: number) {
    Keyboard.dismiss();
    void autosave.saveNow();
    setStep(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  // ------------------------------------------------------------------ leaving
  const leaving = useRef(false);
  /** What leaving takes: a draft is saved first; unsaved edits to a submitted log are confirmed. True to go. */
  const readyToLeave = useCallback(async (): Promise<boolean> => {
    if (submitting) return false;
    if (isSubmitted) {
      if (!autosave.isDirty()) return true;
      return confirmAsync({ title: "Discard unsaved changes?", message: "Your changes to this log won’t be saved.", confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true });
    }
    if (!autosave.isDirty()) return true;
    setClosing(true);
    // Offline the draft waits on the phone and goes out later: don't hold the tutor here for it.
    const saved = await Promise.race([autosave.saveNow(), new Promise<"later">((r) => setTimeout(() => r("later"), 5000))]);
    setClosing(false);
    if (saved === true) return true;
    if (saved === "later") {
      toast.info("Your draft will finish saving when you’re back online.");
      return true;
    }
    return confirmAsync({
      title: "Your draft isn’t saved",
      message: "Your latest changes couldn’t be saved. Leave anyway and lose them?",
      confirmLabel: "Leave without saving",
      cancelLabel: "Stay",
      destructive: true,
    });
  }, [submitting, isSubmitted, autosave]);

  // The close button and Android's back both come here (the screen can't be swiped away).
  usePreventRemove(true, ({ data }) => {
    if (leaving.current) return navigation.dispatch(data.action);
    void readyToLeave().then((ok) => {
      if (!ok) return;
      leaving.current = true;
      navigation.dispatch(data.action);
    });
  });
  function close() {
    Keyboard.dismiss();
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace("/");
  }

  // ------------------------------------------------------------------ submit, polish
  async function submit() {
    Keyboard.dismiss();
    setTried(true);
    // Before the session starts nothing can be submitted, complete or not: say that first (what's still missing
    // is listed on this step anyway).
    if (notStarted) {
      void autosave.saveNow();
      setError(`You can submit this log once the session starts at ${formatMinutes(session.startMin)}. Your draft is saved.`);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const invalid = submitError(c, dims);
    if (invalid) {
      setError(invalid);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setSubmitting(true);
    onSubmitting(true);
    // Pending draft saves stop here: the submit carries the content itself.
    const wasDirty = autosave.take();
    try {
      const res = await submitSessionLog({ branchId, sessionId: session.id, content: c });
      leaving.current = true;
      onSubmitted({ updated: isSubmitted, usedHours: res.usedHours ?? billedHours(session.endMin - session.startMin, settings.students.hourRounding) });
    } catch (e) {
      autosave.restore(wasDirty);
      setError(submitErrorText(e));
      setSubmitting(false);
      onSubmitting(false);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }

  async function polish() {
    Keyboard.dismiss();
    setPolishing(true);
    const before = Object.fromEntries(NOTES.map((n) => [n.key, c[n.key]])) as Record<NoteKey, string>;
    try {
      const res = await polishNotes({
        branchId,
        mode: "polish",
        payload: { ...before, subject: session.subject, topicCovered: topicString(c.sessionType, c.topics, c.topicCovered) },
      });
      const next = Object.fromEntries(NOTES.map((n) => [n.key, res[n.key]?.trim() ? (res[n.key] as string) : before[n.key]])) as Record<NoteKey, string>;
      if (NOTES.every((n) => next[n.key] === before[n.key])) {
        // Without AI the server hands the notes back as they were.
        if (res.provider === "local_fallback") toast.info("AI isn’t available right now.", { description: "Your notes are unchanged." });
        else toast.info("Nothing to polish right now.");
        return;
      }
      autosave.markDirty();
      setC((x) => ({ ...x, ...next }));
      setUndo(before);
    } catch {
      toast.info("AI isn’t available right now.", { description: "Your notes are unchanged. Try again later." });
    } finally {
      setPolishing(false);
    }
  }

  // ------------------------------------------------------------------ suggestions
  const kind = topicKind(c.sessionType);
  const shownTopics = useMemo(() => recentTopics(previous, sameLogs, c), [previous, sameLogs, c]);
  const shownMaterials = useMemo(() => recentMaterials(sameLogs, c.materials), [sameLogs, c.materials]);
  const withCurrent = (list: string[], v: string) => (v && !list.includes(v) ? [...list, v] : list).map((t) => ({ value: t, label: t }));
  const lastHomework = last ? last.homeworkGiven || last.ai?.homeworkAssigned : "";
  const lastPlan = last ? last.ai?.nextSessionPlan || last.nextFocus : "";

  const hours = isSubmitted && existing?.usedHours ? existing.usedHours : billedHours(session.endMin - session.startMin, settings.students.hourRounding);
  // "4:12 PM" today, "Oct 2, 4:12 PM" an earlier day (in the branch's zone).
  const savedWhen = (at: Date | number) =>
    formatInstant(at, timezone, dateKeyOf(at, timezone) === today ? { timeStyle: "short" } : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const lastSaved = (existing?.updatedAt as { toDate?: () => Date } | undefined)?.toDate?.();
  const saveText = closing
    ? "Saving…"
    : isSubmitted
      ? "Changes save when you update the log."
      : autosave.save.state === "saving"
        ? "Saving…"
        : autosave.save.state === "waiting"
          ? "Waiting for a connection…"
          : autosave.save.state === "saved" && autosave.save.at
            ? `Draft saved · ${savedWhen(autosave.save.at)}`
            : autosave.save.state === "error"
              ? "Couldn’t save the draft — retrying"
              : lastSaved
                ? `Draft saved · ${savedWhen(lastSaved)}`
                : "";
  const noteMax = Math.max(140, viewport - 48);

  return (
    <KeyboardAvoidingView style={[styles.fill, { backgroundColor: colors.grouped }]} behavior="padding" testID="log-form">
      <LogHeader
        title={session.studentName}
        line={sessionLine(session, today, hours, settings.general.timeFormat !== "24h")}
        status={isSubmitted ? "editing" : existing?.status === "draft" || autosave.save.state === "saved" ? "draft" : null}
        onClose={close}
        closeLabel={isSubmitted ? "Cancel editing" : "Close"}
      />
      {/* While typing, the steps make room for the text (they're back as soon as the keyboard goes). */}
      <StepBar step={step} done={done} flagged={flagged} onSelect={go} hidden={keyboard.visible} />
      <ScrollView
        ref={scrollRef}
        style={styles.fill}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        onLayout={(e) => setViewport(e.nativeEvent.layout.height)}
        testID={`log-page-${step + 1}`}
      >
        <View ref={contentRef} collapsable={false} style={styles.content}>
          {isSubmitted ? (
            <Banner tone="muted" icon={PenLine}>
              You’re editing a submitted log. Submitting again updates it and the student’s hours.
            </Banner>
          ) : null}
          {draftBanner && step < 5 ? (
            <Banner
              tone="info"
              icon={CircleCheck}
              testID="log-draft-restored"
              action={
                <Pressable accessibilityRole="button" onPress={() => setDraftBanner(false)} hitSlop={10}>
                  <BannerText tone="info" bold>
                    Dismiss
                  </BannerText>
                </Pressable>
              }
            >
              {`Draft restored${lastSaved ? ` — last saved ${formatInstant(lastSaved, timezone)}` : ""}. Your previous progress has been recovered.`}
            </Banner>
          ) : null}
          {notStarted && !isSubmitted ? (
            <Banner tone="warning" icon={Clock} testID="log-not-started">
              {`This session starts at ${formatMinutes(session.startMin)}. You can write the log now; it saves as a draft, and you can submit it once the session has started.`}
            </Banner>
          ) : null}
          {error && step < 5 ? <ErrorBox text={error} /> : null}

          <Animated.View key={step} entering={FadeIn.duration(160)} style={styles.step}>
            {step === 0 ? (
              <PrepareStep session={session} student={student} logs={previous} loading={previousLoading} note={conferenceNote} onOpenLog={onOpenLog} onReveal={(v) => scrollToView(v, space.md)} />
            ) : null}

            {step === 1 ? (
              <>
                <StepTitle title="Session info" text="Set the session type, topic, and homework review." />
                <SectionCard title="Session setup">
                  <View style={styles.field}>
                    <FieldLabel required right={typeSuggested ? <SmallTag>From last session</SmallTag> : null}>
                      Session type
                    </FieldLabel>
                    <ChipGroup
                      label="Session type"
                      value={c.sessionType}
                      options={withCurrent(settings.sessionLogs.sessionTypes, c.sessionType)}
                      testIDPrefix="log-type"
                      onChange={(v) => {
                        if (v === c.sessionType) return;
                        // A new type starts its topics over (True Education).
                        autosave.markDirty();
                        setError(null);
                        setTypeSuggested(false);
                        setC((x) => ({ ...x, sessionType: v, topics: [], topicCovered: topicKind(v) === "free" && topicKind(x.sessionType) === "free" ? x.topicCovered : "" }));
                      }}
                    />
                  </View>
                  <View style={styles.field}>
                    <FieldLabel required hint={kind !== "free" ? "— select one or more" : undefined}>
                      Topic covered
                    </FieldLabel>
                    {kind === "free" ? (
                      <FocusField
                        value={c.topicCovered}
                        onChangeText={(v) => set("topicCovered", v)}
                        placeholder="e.g., Linear equations, Comma usage"
                        accessibilityLabel="Topic covered"
                        returnKeyType="done"
                        onReveal={revealField}
                        onBlur={() => void autosave.saveNow()}
                        testID="log-topic"
                      />
                    ) : (
                      <TopicPicker sessionType={c.sessionType} value={c.topics} onChange={(v) => set("topics", v)} />
                    )}
                    {shownTopics.length && c.sessionType ? (
                      <Suggestions title="Recent topics:">
                        {shownTopics.map((t) => (
                          <SuggestionChip key={t} label={t} onPress={() => (kind === "free" ? set("topicCovered", t) : set("topics", [...c.topics, t]))} />
                        ))}
                      </Suggestions>
                    ) : null}
                  </View>
                </SectionCard>
                <SectionCard title="Homework review">
                  <View style={styles.field}>
                    <FieldLabel required>Homework status</FieldLabel>
                    {lastHomework ? (
                      <T variant="small" tone="muted">
                        <T variant="small" tone="muted" style={styles.bold}>
                          Homework given last session:
                        </T>{" "}
                        {lastHomework}
                      </T>
                    ) : null}
                    <ChipGroup
                      label="Homework status"
                      value={c.homeworkStatus}
                      options={withCurrent(settings.sessionLogs.homeworkStatuses, c.homeworkStatus)}
                      onChange={(v) => set("homeworkStatus", v)}
                      testIDPrefix="log-homework"
                    />
                  </View>
                  <View style={styles.field}>
                    <FieldLabel>Homework comments</FieldLabel>
                    <FocusField
                      value={c.homeworkComments}
                      onChangeText={(v) => set("homeworkComments", v)}
                      placeholder="Notes on completion or quality"
                      accessibilityLabel="Homework comments"
                      returnKeyType="done"
                      onReveal={revealField}
                      onBlur={() => void autosave.saveNow()}
                      testID="log-homework-comments"
                    />
                  </View>
                </SectionCard>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <StepTitle title="Materials & metrics" text="Log what materials were used and how the student performed." />
                <SectionCard title="Material used" required>
                  {c.materials.length ? (
                    <View style={[styles.materials, { borderColor: colors.border }]}>
                      {c.materials.map((m, i) => (
                        <View key={`${m.label}|${m.url}`} style={[styles.materialRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                          {m.url ? (
                            <Pressable accessibilityRole="link" onPress={() => void openUrl(m.url)} style={styles.materialLink}>
                              <T style={{ color: colors.info, flexShrink: 1 }} numberOfLines={2}>
                                {m.label}
                              </T>
                              <ExternalLink size={14} color={colors.info} />
                            </Pressable>
                          ) : (
                            <T style={styles.grow} numberOfLines={2}>
                              {m.label}
                            </T>
                          )}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${m.label}`}
                            hitSlop={8}
                            onPress={() => set("materials", c.materials.filter((_, j) => j !== i))}
                            style={({ pressed }) => [styles.remove, pressed && { backgroundColor: colors.accent }]}
                          >
                            <X size={18} color={colors.mutedForeground} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <T variant="small" tone="muted">
                      No materials added yet. Type a resource name or paste a link below and tap Add.
                    </T>
                  )}
                  <MaterialInput
                    onReveal={revealField}
                    onAdd={(m) => {
                      if (!c.materials.some((x) => x.label === m.label && x.url === m.url)) set("materials", [...c.materials, m]);
                    }}
                  />
                  {shownMaterials.length ? (
                    <Suggestions title="Used recently:">
                      {shownMaterials.map((m) => (
                        <SuggestionChip key={`${m.label}|${m.url}`} prefix="+" label={m.label} onPress={() => set("materials", [...c.materials, m])} />
                      ))}
                    </Suggestions>
                  ) : null}
                </SectionCard>
                <SectionCard title="Performance metrics">
                  <MetricRow label="Questions attempted" value={c.questionsAttempted} onChange={(v) => set("questionsAttempted", v)} onReveal={revealField} testID="log-attempted" />
                  <MetricRow
                    label="Questions wrong"
                    value={c.questionsWrong}
                    onChange={(v) => set("questionsWrong", v)}
                    invalid={c.questionsWrong != null && c.questionsAttempted != null && c.questionsWrong > c.questionsAttempted}
                    onReveal={revealField}
                    testID="log-wrong"
                  />
                  {c.questionsWrong != null && c.questionsAttempted != null && c.questionsWrong > c.questionsAttempted ? (
                    <T variant="small" tone="destructive">
                      Can’t be more than questions attempted.
                    </T>
                  ) : null}
                  <Accuracy value={accuracy(c.questionsAttempted, c.questionsWrong)} />
                </SectionCard>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <StepTitle title="Session notes" text="Document what happened, what was learned, and what comes next." />
                <View style={[styles.notesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.notesIntro}>
                    <View style={[styles.infoBox, { backgroundColor: colors.secondary }]}>
                      <Info size={15} color={colors.mutedForeground} style={styles.infoIcon} />
                      <T variant="small" tone="muted" style={styles.grow}>
                        These four answers are the session record. Admins read them, and they feed progress reports for parents.
                      </T>
                    </View>
                    {lastPlan ? <LastPlan text={lastPlan} /> : null}
                  </View>
                  {NOTES.map((n) => (
                    <NoteField
                      key={n.key}
                      label={n.label}
                      placeholder={n.placeholder}
                      value={c[n.key]}
                      onChange={(v) => set(n.key, v)}
                      onBlur={() => void autosave.saveNow()}
                      onReveal={revealField}
                      editable={!polishing}
                      minHeight={Math.min(n.minHeight, noteMax)}
                      maxHeight={noteMax}
                      nudge={wordCount(c[n.key]) > 0 && wordCount(c[n.key]) < n.nudgeUnder ? n.nudge : null}
                      testID={`log-note-${n.key}`}
                    />
                  ))}
                </View>
                {aiOn ? (
                  <View style={styles.polish}>
                    <T variant="small" tone="muted">
                      Polish uses AI to improve grammar and clarity while preserving all your details.
                    </T>
                    {undo ? (
                      <Button
                        variant="outline"
                        icon={<Undo2 size={18} color={colors.foreground} />}
                        onPress={() => {
                          autosave.markDirty();
                          setC((x) => ({ ...x, ...undo }));
                          setUndo(null);
                        }}
                        testID="log-undo-polish"
                      >
                        Undo polish
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        icon={polishing ? <ActivityIndicator color={colors.foreground} /> : <Sparkles size={18} color={colors.foreground} />}
                        disabled={polishing || submitting || NOTES.every((n) => !c[n.key].trim())}
                        onPress={() => void polish()}
                        testID="log-polish"
                      >
                        {polishing ? "Polishing…" : "Polish notes"}
                      </Button>
                    )}
                  </View>
                ) : null}
              </>
            ) : null}

            {step === 4 ? (
              <>
                <StepTitle title="Student evaluation" text="Rate the student’s performance and flag their current status." />
                <SectionCard title="Performance ratings" required>
                  <View>
                    {dims.map((d, i) => (
                      <View key={d} style={[styles.ratingRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                        <FieldLabel required>{d}</FieldLabel>
                        <StarInput label={d} value={c.ratings[ratingKey(d)] ?? 0} onChange={(v) => set("ratings", { ...c.ratings, [ratingKey(d)]: v })} testIDPrefix={`log-rating-${ratingKey(d)}`} />
                      </View>
                    ))}
                  </View>
                </SectionCard>
                <SectionCard title="Student flag" required description="Summarize the student’s overall status this session.">
                  <FlagChoice value={c.studentFlag} options={settings.sessionLogs.studentFlags} onChange={(f) => set("studentFlag", f)} />
                  {suggestFlag(c.ratings) && !c.studentFlag ? (
                    <T variant="small" tone="muted" testID="log-flag-suggestion">
                      Suggested from the ratings: {FLAG_LABELS[suggestFlag(c.ratings)!]}
                    </T>
                  ) : null}
                </SectionCard>
              </>
            ) : null}

            {step === 5 ? <ReviewStep c={c} dims={dims} missing={missing} onGo={go} error={error} isSubmitted={isSubmitted} /> : null}
          </Animated.View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: keyboard.visible ? space.sm : Math.max(insets.bottom, space.md) }]}>
        {saveText ? (
          <View style={styles.status}>
            {autosave.save.state === "saved" && !closing ? <Check size={13} color={colors.success} strokeWidth={3} /> : null}
            <T variant="small" tone={autosave.save.state === "error" && !isSubmitted ? "destructive" : "muted"} numberOfLines={1} testID="draft-status">
              {saveText}
            </T>
          </View>
        ) : null}
        <View style={styles.buttons}>
          {step > 0 ? (
            <Button variant="outline" onPress={() => go(step - 1)} icon={<ChevronLeft size={18} color={colors.foreground} />} style={styles.back} testID="log-back">
              Back
            </Button>
          ) : null}
          {step < 5 ? (
            <Button onPress={() => go(step + 1)} style={styles.next} testID="log-next">
              Next
            </Button>
          ) : (
            <Button onPress={() => void submit()} busy={submitting} style={styles.next} testID="log-submit" icon={<CircleCheck size={18} color={colors.primaryForeground} />}>
              {isSubmitted ? "Update log" : "Submit log"}
            </Button>
          )}
        </View>
      </View>

      {submitting ? (
        <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.overlay }]} accessibilityRole="progressbar" accessibilityLabel="Saving session log" testID="log-submitting">
          <View style={[styles.overlayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator size="large" color={colors.foreground} />
            <T variant="subheading">Saving session log</T>
            {aiOn ? (
              <T variant="small" tone="muted" style={styles.center}>
                Generating AI notes. Don’t close the app.
              </T>
            ) : null}
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** A small muted tag next to a label ("From last session"). */
function SmallTag({ children }: { children: string }) {
  const colors = useColors();
  return (
    <View style={[styles.smallTag, { backgroundColor: colors.secondary }]}>
      <T variant="tiny" tone="muted">
        {children}
      </T>
    </View>
  );
}

/** A one-line field that scrolls itself into view above the keyboard. */
function FocusField({ onReveal, ...props }: React.ComponentProps<typeof Field> & { onReveal: (v: View | null, offset?: number) => void }) {
  const ref = useRef<View>(null);
  return (
    <View ref={ref} collapsable={false}>
      <Field
        {...props}
        onFocus={(e) => {
          onReveal(ref.current, 120);
          props.onFocus?.(e);
        }}
      />
    </View>
  );
}

/** Add a material: a pasted link becomes a link, anything else a named resource (True Education). */
function MaterialInput({ onAdd, onReveal }: { onAdd: (m: NonNullable<ReturnType<typeof materialFrom>>) => void; onReveal: (v: View | null, offset?: number) => void }) {
  const [value, setValue] = useState("");
  const ref = useRef<View>(null);
  const plusColor = useButtonForeground("outline");
  const add = () => {
    const m = materialFrom(value);
    if (!m) return;
    onAdd(m);
    setValue("");
  };
  return (
    <View ref={ref} collapsable={false} style={styles.addRow}>
      <View style={styles.grow}>
        <Field
          value={value}
          onChangeText={setValue}
          placeholder="Resource name or link"
          accessibilityLabel="Add material"
          autoCapitalize="sentences"
          returnKeyType="done"
          submitBehavior="submit"
          // Done adds what was typed and stays for the next one; on an empty field it puts the keyboard away.
          onSubmitEditing={() => (value.trim() ? add() : Keyboard.dismiss())}
          onFocus={() => onReveal(ref.current, 160)}
          testID="log-material-input"
        />
      </View>
      <Button variant="outline" icon={<Plus size={18} color={plusColor} />} disabled={!value.trim()} onPress={add} testID="log-material-add">
        Add
      </Button>
    </View>
  );
}

/** A count's row: its label, and the stepper, which scrolls the row into view above the number pad. */
function MetricRow({
  label,
  value,
  onChange,
  invalid,
  onReveal,
  testID,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  invalid?: boolean;
  onReveal: (v: View | null, offset?: number) => void;
  testID: string;
}) {
  const ref = useRef<View>(null);
  return (
    <View ref={ref} collapsable={false} style={styles.metric}>
      <View style={styles.grow}>
        <FieldLabel required>{label}</FieldLabel>
      </View>
      <CountStepper label={label} value={value} onChange={onChange} invalid={invalid} onFocus={() => onReveal(ref.current, 140)} testID={testID} />
    </View>
  );
}

function Accuracy({ value }: { value: number | null }) {
  const colors = useColors();
  return (
    <View style={styles.accuracy} accessibilityLabel={`Accuracy ${value === null ? "not known yet" : `${value} percent`}`}>
      <View style={styles.accuracyHead}>
        <T variant="label">Accuracy</T>
        <T variant="stat" testID="log-accuracy">
          {value === null ? "—" : `${value}%`}
        </T>
      </View>
      <View style={[styles.track, { backgroundColor: colors.secondary }]}>
        <View style={[styles.trackFill, { backgroundColor: colors.foreground, width: `${value ?? 0}%` }]} />
      </View>
    </View>
  );
}

/** One of the four notes: a tall box that grows with the text, its word count and a soft nudge when very short. */
function NoteField({
  label,
  placeholder,
  value,
  onChange,
  onBlur,
  onReveal,
  editable,
  minHeight,
  maxHeight,
  nudge,
  testID,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  onReveal: (v: View | null, offset?: number) => void;
  editable: boolean;
  minHeight: number;
  maxHeight: number;
  nudge: string | null;
  testID: string;
}) {
  const colors = useColors();
  const ref = useRef<View>(null);
  const [focused, setFocused] = useState(false);
  const words = wordCount(value);
  return (
    <View ref={ref} collapsable={false} style={styles.note}>
      <FieldLabel required>{label}</FieldLabel>
      <TextInput
        multiline
        value={value}
        onChangeText={onChange}
        onFocus={() => {
          setFocused(true);
          onReveal(ref.current, space.sm);
        }}
        onBlur={() => {
          setFocused(false);
          onBlur();
        }}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={label}
        autoCapitalize="sentences"
        textAlignVertical="top"
        scrollEnabled
        style={[
          styles.noteInput,
          { minHeight, maxHeight, color: colors.foreground, backgroundColor: colors.card, borderColor: focused ? colors.ring : colors.input, opacity: editable ? 1 : 0.6 },
        ]}
        testID={testID}
      />
      <View style={styles.noteFoot}>
        <PenLine size={12} color={colors.mutedForeground} />
        <T variant="tiny" tone="muted" style={styles.grow}>
          Write in full sentences
        </T>
        <T variant="tiny" tone="muted" style={styles.tabular}>
          {words} word{words === 1 ? "" : "s"}
        </T>
      </View>
      {nudge ? (
        <T variant="small" tone="muted">
          {nudge}
        </T>
      ) : null}
    </View>
  );
}

/** Last session's plan, folded: helps the tutor write against it (read-only). */
function LastPlan({ text }: { text: string }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.lastPlan}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.lastPlanHead} hitSlop={6} testID="log-last-plan">
        <ChevronDown size={16} color={colors.mutedForeground} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
        <T variant="small" tone="muted" style={styles.bold}>
          Last session’s plan
        </T>
      </Pressable>
      {open ? (
        <View style={[styles.lastPlanBody, { borderLeftColor: colors.foreground, backgroundColor: colors.cardMuted }]}>
          <T variant="small" style={styles.prose} selectable>
            {text}
          </T>
        </View>
      ) : null}
    </View>
  );
}

/** The three flags as large toggles in True Education's colors; the chosen one shows a check. */
function FlagChoice({ value, options, onChange }: { value: string; options: { key: string; label: string }[]; onChange: (f: StudentFlag) => void }) {
  const colors = useColors();
  const palette = useFlagColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Student flag" style={styles.flags}>
      {options.map((f) => {
        const on = value === f.key;
        const p = palette[f.key as StudentFlag] ?? { bg: colors.secondary, border: colors.border, fg: colors.foreground };
        return (
          <Pressable
            key={f.key}
            accessibilityRole="radio"
            accessibilityLabel={f.label}
            accessibilityState={{ checked: on }}
            onPress={() => onChange(f.key as StudentFlag)}
            testID={`log-flag-${f.key}`}
            style={({ pressed }) => [
              styles.flag,
              on ? { backgroundColor: p.bg, borderColor: p.border, borderWidth: 1.5 } : { backgroundColor: pressed ? colors.accent : colors.card, borderColor: colors.input },
            ]}
          >
            {on ? <CircleCheck size={18} color={p.fg} /> : <View style={[styles.flagDot, { backgroundColor: p.border }]} />}
            <T style={{ fontSize: 16, fontWeight: on ? "600" : "500", color: on ? p.fg : colors.foreground }}>{f.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  center: { textAlign: "center" },
  bold: { fontWeight: "600" },
  tabular: { fontVariant: ["tabular-nums"] },
  prose: { lineHeight: 21 },
  scroll: { flexGrow: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  step: { gap: space.lg },
  field: { gap: space.sm },
  smallTag: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  materials: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md },
  materialRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: space.md, paddingRight: 4, minHeight: 48 },
  materialLink: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: space.sm },
  remove: { width: 40, height: 40, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  addRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  metric: { flexDirection: "row", alignItems: "center", gap: space.md },
  accuracy: { gap: space.sm },
  accuracyHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  trackFill: { height: "100%", borderRadius: 3 },
  infoBox: { flexDirection: "row", gap: space.sm, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10 },
  infoIcon: { marginTop: 2 },
  notesCard: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.xl },
  notesIntro: { gap: space.sm },
  note: { gap: space.sm },
  noteInput: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.md, fontSize: 16, lineHeight: 23 },
  noteFoot: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: -2 },
  polish: { gap: space.sm },
  lastPlan: { gap: space.sm },
  lastPlanHead: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 32 },
  lastPlanBody: { borderLeftWidth: 3, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  ratingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, paddingVertical: 6 },
  flags: { gap: space.sm },
  flag: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1 },
  flagDot: { width: 12, height: 12, borderRadius: 6, marginHorizontal: 3 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  status: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 18 },
  buttons: { flexDirection: "row", gap: space.sm },
  back: { flex: 1 },
  next: { flex: 2 },
  overlay: { alignItems: "center", justifyContent: "center", padding: space.xl },
  overlayCard: { alignItems: "center", gap: space.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.xl, paddingHorizontal: space.xl, paddingVertical: space.xl, maxWidth: 320 },
});
