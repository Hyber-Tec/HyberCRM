import { STUDENT_STATUS_LABELS } from "@shared/people";
import { type SessionLog, averageRating, matchingLog } from "@shared/sessions/logs";
import { formatDateKey } from "@shared/time";
import type { Session, Student } from "@shared/types";
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, Flag, MessageSquareText, Sparkles, User } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { IconButton } from "@/components/IconButton";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { openWebsite } from "@/lib/links";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import { isNoRisk } from "./content";
import type { ConferenceNoteContext } from "./data";
import { Banner, BannerText, FlagBadge, SectionCard, StarRating, StepTitle, useFlagColors } from "./widgets";

type Log = SessionLog & { id: string };

const PAGE = 6;

/**
 * Step 1: what to know before writing (read-only), as on the website: the admin's note, the student, the plan the
 * last session left (same subject first) and the student's recent sessions, six at a time; a row previews that log
 * in the card above, its ↗ opens the whole log.
 */
export function PrepareStep({
  session,
  student,
  logs,
  loading,
  note,
  onOpenLog,
  onReveal,
}: {
  session: Session & { id: string };
  student: (Student & { id: string }) | null;
  logs: Log[];
  loading: boolean;
  note: ConferenceNoteContext | null;
  onOpenLog: (sessionId: string) => void;
  /** Scrolls the step to a view (the preview card, after a row was picked). */
  onReveal: (view: View | null) => void;
}) {
  const { branchId } = useBranch();
  const colors = useColors();
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [noteOpen, setNoteOpen] = useState(false);
  const previewRef = useRef<View>(null);
  const current = useMemo(() => logs.find((l) => l.id === selected) ?? matchingLog(logs, session), [logs, selected, session]);
  const pages = Math.max(1, Math.ceil(logs.length / PAGE));
  const shown = logs.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <View style={styles.gap}>
      <StepTitle title="Session preparation" text="Review what happened last session and key context before you begin." />

      {session.note ? (
        <Banner tone="warning" icon={Flag} testID="prep-admin-note">
          <BannerText tone="warning">
            <BannerText tone="warning" bold>
              Admin note:
            </BannerText>{" "}
            {session.note}
          </BannerText>
        </Banner>
      ) : null}

      {student ? (
        <SectionCard testID="prep-student">
          <View style={styles.studentHead}>
            <User size={18} color={colors.mutedForeground} />
            <T variant="label" style={styles.grow} numberOfLines={1}>
              {student.name || session.studentName}
            </T>
          </View>
          <View style={styles.facts}>
            <Fact label="School" value={student.school || "—"} />
            <Fact label="Grade" value={student.grade || "—"} />
            <Fact label="Total hours" value={(student.totalSessionHours ?? 0).toFixed(1)} />
            <Fact label="Status" value={STUDENT_STATUS_LABELS[student.status] ?? student.status} />
          </View>
          {student.learningNote ? (
            <T variant="small">
              <T variant="small" tone="muted">
                Learning notes:{" "}
              </T>
              {student.learningNote}
            </T>
          ) : null}
          <View style={styles.links}>
            {note ? (
              <Button variant="outline" size="sm" icon={<MessageSquareText size={16} color={colors.foreground} />} onPress={() => setNoteOpen(true)} testID="prep-parent-note">
                {`View parent note (${formatDateKey(note.date, "medium")})`}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              icon={<ExternalLink size={16} color={colors.foreground} />}
              onPress={() => void openWebsite(`/${branchId}/tutor/students/${session.studentId}/info`)}
              accessibilityLabel="Full profile, opens the website"
            >
              Full profile
            </Button>
          </View>
        </SectionCard>
      ) : null}

      <View ref={previewRef} collapsable={false}>
        <SectionCard
          title="From last session"
          right={<Sparkles size={18} color={colors.mutedForeground} />}
          testID="prep-last-session"
        >
          {loading ? (
            <View style={styles.gapSm}>
              <Skeleton width="60%" height={18} />
              <Skeleton height={72} rounded={radius.md} />
            </View>
          ) : current ? (
            <View style={styles.gapMd}>
              <View style={styles.pills}>
                <Pill>{formatDateKey(current.dateKey, "medium")}</Pill>
                <Pill>{current.subject || current.sessionType}</Pill>
                <FlagBadge flag={current.studentFlag} />
              </View>
              {current.topicCovered ? (
                <T variant="small">
                  <T variant="small" tone="muted">
                    Topic covered:{" "}
                  </T>
                  {current.topicCovered}
                </T>
              ) : null}
              <AiCards log={current} />
              {current.nextFocus ? (
                <T variant="small">
                  <T variant="small" tone="muted">
                    Tutor’s next focus note:{" "}
                  </T>
                  {current.nextFocus}
                </T>
              ) : null}
              <Button variant="outline" size="sm" icon={<ExternalLink size={16} color={colors.foreground} />} onPress={() => onOpenLog(current.sessionId || current.id)} testID="prep-view-full-log">
                View full log
              </Button>
            </View>
          ) : (
            <View style={styles.empty}>
              <BookOpen size={20} color={colors.mutedForeground} />
              <T variant="small" tone="muted" style={styles.center}>
                No previous session log found for this student.
              </T>
            </View>
          )}
        </SectionCard>
      </View>

      {logs.length > 0 ? (
        <View style={[styles.list, { backgroundColor: colors.card, borderColor: colors.border }]} testID="prep-recent">
          <View style={styles.listHead}>
            <View style={styles.grow}>
              <T variant="subheading">Recent sessions</T>
              <T variant="small" tone="muted">
                Select a session to preview it above
              </T>
            </View>
            {pages > 1 ? (
              <View style={styles.pager}>
                <IconButton icon={<ChevronLeft size={20} color={page === 0 ? colors.border : colors.foreground} />} onPress={() => page > 0 && setPage(page - 1)} accessibilityLabel="Previous page" size={36} />
                <T variant="small" style={styles.tabular}>
                  {page + 1} / {pages}
                </T>
                <IconButton icon={<ChevronRight size={20} color={page >= pages - 1 ? colors.border : colors.foreground} />} onPress={() => page < pages - 1 && setPage(page + 1)} accessibilityLabel="Next page" size={36} />
              </View>
            ) : null}
          </View>
          {shown.map((l) => {
            const on = current?.id === l.id;
            return (
              <Pressable
                key={l.id}
                accessibilityRole="button"
                accessibilityLabel={`${formatDateKey(l.dateKey, "medium")}, ${l.tutorName}, ${l.subject || l.sessionType}. Preview it above`}
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setSelected(l.id);
                  onReveal(previewRef.current);
                }}
                style={({ pressed }) => [
                  styles.row,
                  { borderTopColor: colors.border },
                  on && { backgroundColor: colors.infoTint },
                  pressed && !on && { backgroundColor: colors.accent },
                ]}
              >
                {on ? <View style={[styles.bar, { backgroundColor: colors.info }]} /> : null}
                <View style={styles.grow}>
                  <View style={styles.rowTop}>
                    <T variant="label" style={styles.tabular}>
                      {formatDateKey(l.dateKey, "medium")}
                    </T>
                    <StarRating value={averageRating(l.ratings)} />
                  </View>
                  <T variant="small" tone="muted" numberOfLines={1}>
                    {l.tutorName} · {l.subject || l.sessionType}
                  </T>
                  {l.topicCovered ? (
                    <T variant="small" numberOfLines={1}>
                      {l.topicCovered}
                    </T>
                  ) : null}
                </View>
                <IconButton icon={<ExternalLink size={18} color={colors.mutedForeground} />} onPress={() => onOpenLog(l.sessionId || l.id)} accessibilityLabel="Open full session log" size={40} />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Dialog
        open={noteOpen}
        onRequestClose={() => setNoteOpen(false)}
        footer={
          <Button variant="outline" onPress={() => setNoteOpen(false)}>
            Close
          </Button>
        }
      >
        <T variant="heading">Parent conference — {note ? formatDateKey(note.date, "medium") : ""}</T>
        <T style={styles.prose} selectable>
          {note?.text || "No content."}
        </T>
        {note?.authorName ? (
          <T variant="small" tone="muted">
            Written by {note.authorName}
          </T>
        ) : null}
      </Dialog>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <T variant="tiny" tone="muted">
        {label}
      </T>
      <T numberOfLines={2}>{value}</T>
    </View>
  );
}

function Pill({ children }: { children: string }) {
  const colors = useColors();
  return (
    <View style={[styles.pill, { borderColor: colors.border }]}>
      <T variant="tiny" style={{ fontWeight: "600" }}>
        {children}
      </T>
    </View>
  );
}

/** The earlier log's AI notes: next plan (highlighted), summary, homework, risk; empty ones hidden. */
export function AiCards({ log }: { log: SessionLog }) {
  const colors = useColors();
  const flag = useFlagColors();
  const ai = log.ai;
  if (!ai) return null;
  const cards = [
    { title: "Next session plan", text: ai.nextSessionPlan, accent: true, risk: false },
    { title: "Session summary", text: ai.sessionSummary, accent: false, risk: false },
    { title: "Homework assigned", text: ai.homeworkAssigned, accent: false, risk: false },
    { title: "Risk alert", text: ai.riskAlert, accent: false, risk: true },
  ].filter((c) => c.text?.trim());
  if (!cards.length) return null;
  return (
    <View style={styles.gapSm}>
      {cards.map((c) => {
        const tone = c.risk ? (isNoRisk(c.text) ? flag.on_track : flag.needs_attention) : null;
        return (
          <View
            key={c.title}
            style={[
              styles.ai,
              { borderColor: tone?.border ?? colors.border, backgroundColor: tone?.bg ?? colors.card },
              c.accent && { borderLeftWidth: 3, borderLeftColor: colors.foreground },
            ]}
          >
            <T variant="tiny" tone="muted" style={styles.aiTitle}>
              {c.title}
            </T>
            <T variant="small" style={styles.prose} selectable>
              {c.text}
            </T>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.lg },
  gapMd: { gap: space.md },
  gapSm: { gap: space.sm },
  grow: { flex: 1, minWidth: 0 },
  center: { textAlign: "center" },
  tabular: { fontVariant: ["tabular-nums"] },
  studentHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  facts: { flexDirection: "row", flexWrap: "wrap", rowGap: space.md },
  fact: { width: "50%", paddingRight: space.sm, gap: 2 },
  links: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pills: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  pill: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: space.lg },
  ai: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.md, gap: 4 },
  aiTitle: { fontWeight: "600" },
  prose: { lineHeight: 21 },
  list: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  listHead: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  pager: { flexDirection: "row", alignItems: "center", gap: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: space.lg, paddingRight: space.sm, paddingVertical: space.sm, borderTopWidth: StyleSheet.hairlineWidth, minHeight: 64 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  bar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
});
