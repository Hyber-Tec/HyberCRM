import { type SessionLog, accuracy, averageRating, ratingKey } from "@shared/sessions/logs";
import { formatInstant } from "@shared/time";
import { Sparkles, User } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import { isNoRisk } from "./content";
import { MaterialList } from "./ReviewStep";
import { Banner, BannerText, FlagBadge, HomeworkBadge, InfoBlock, SectionCard, StarInput, StarRating, Tag, useFlagColors } from "./widgets";

type Stamp = { toDate?: () => Date } | null | undefined;
const toDate = (t: unknown) => ((t as Stamp)?.toDate ? (t as { toDate: () => Date }).toDate() : null);

/**
 * A log, read-only, from its own copy (so another tutor's log reads the same, and a deleted session's log still
 * opens), as the website's LogView: the record, who entered it, the AI overview, the session info, the notes with
 * their line breaks and every rating.
 */
export function LogView({ log }: { log: SessionLog & { id: string } }) {
  const { settings, timezone } = useBranch();
  const colors = useColors();
  const when = (t: unknown) => {
    const d = toDate(t);
    return d ? formatInstant(d, timezone) : null;
  };
  const submitted = toDate(log.submittedAt);
  const ended = toDate(log.endAt);
  const lateHours = submitted && ended ? Math.round(((submitted.getTime() - ended.getTime()) / 3_600_000) * 10) / 10 : null;
  const avg = averageRating(log.ratings);
  const acc = log.accuracyPercent ?? accuracy(log.questionsAttempted, log.questionsWrong);
  const topics = log.topics?.length ? log.topics : log.topicCovered ? log.topicCovered.split("; ") : [];
  const ai = log.ai;

  return (
    <View style={styles.gap} testID="log-view-body">
      <View style={[styles.record, { backgroundColor: colors.card, borderColor: colors.border }]} testID="log-record">
        <Row label="Status" text={false}>
          <View style={[styles.status, { backgroundColor: log.status === "submitted" ? colors.primary : colors.secondary }]}>
            <T variant="tiny" style={{ fontWeight: "600", color: log.status === "submitted" ? colors.primaryForeground : colors.foreground }}>
              {log.status === "submitted" ? "Submitted" : "Draft"}
            </T>
          </View>
        </Row>
        <Row label="Tutor">{log.tutorName || "—"}</Row>
        {submitted ? (
          <Row label="Submitted">
            {`${when(log.submittedAt)} by ${log.enteredBy?.name || log.tutorName}`}
            {lateHours !== null && lateHours > 0 ? <T tone="muted">{` · ${lateHours} h after the session ended`}</T> : null}
          </Row>
        ) : null}
        {log.enteredByAdmin ? <Row label="Entered by admin">{`${log.enteredByAdmin.name} on behalf of ${log.tutorName}`}</Row> : null}
        {log.lastEditedBy ? (
          <Row label="Last edited">
            {`${when(log.lastEditedBy.at) ?? ""} by ${log.lastEditedBy.name}`}
            {log.editCount ? <T tone="muted">{` · ${log.editCount} edit${log.editCount > 1 ? "s" : ""}`}</T> : null}
          </Row>
        ) : null}
        <Row label="Billed hours">{log.usedHours ? `${log.usedHours} h` : "—"}</Row>
        <Row label="Session type" last>
          {log.sessionType || "—"}
        </Row>
      </View>

      {log.enteredByAdmin ? (
        <Banner tone="violet" icon={User}>
          <BannerText tone="violet">
            {`Entered by admin ${log.enteredByAdmin.name} on behalf of `}
            <BannerText tone="violet" bold>
              {log.tutorName}
            </BannerText>
            . The log stays credited to the tutor.
          </BannerText>
        </Banner>
      ) : null}

      {ai && (ai.sessionSummary || ai.nextSessionPlan || ai.homeworkAssigned || ai.riskAlert) ? (
        <SectionCard
          title="AI overview"
          right={
            <View style={styles.aiHead}>
              {ai.provider === "local_fallback" ? (
                <View style={[styles.outlineBadge, { borderColor: colors.border }]}>
                  <T variant="tiny">Auto summary</T>
                </View>
              ) : null}
              <Sparkles size={18} color={colors.mutedForeground} />
            </View>
          }
          testID="log-ai"
        >
          {ai.sessionSummary ? (
            <View style={[styles.hero, { backgroundColor: colors.secondary }]}>
              <T variant="tiny" tone="muted" style={styles.bold}>
                Session summary
              </T>
              <T style={styles.prose} selectable>
                {ai.sessionSummary}
              </T>
            </View>
          ) : null}
          {ai.nextSessionPlan ? <AiBlock title="Next session plan" text={ai.nextSessionPlan} accent /> : null}
          {ai.homeworkAssigned ? <AiBlock title="Homework assigned" text={ai.homeworkAssigned} /> : null}
          {ai.riskAlert ? <AiBlock title="Risk alert" text={ai.riskAlert} risk /> : null}
        </SectionCard>
      ) : null}

      <SectionCard title="Session info">
        <View style={styles.blocks}>
          <InfoBlock label="Session type">{log.sessionType || "—"}</InfoBlock>
          <InfoBlock label="Homework status">{log.homeworkStatus ? <HomeworkBadge status={log.homeworkStatus} /> : "—"}</InfoBlock>
          <InfoBlock label="Student flag">{log.studentFlag ? <FlagBadge flag={log.studentFlag} /> : "—"}</InfoBlock>
          <InfoBlock label="Questions attempted">{log.questionsAttempted ?? "—"}</InfoBlock>
          <InfoBlock label="Questions wrong">{log.questionsWrong ?? "—"}</InfoBlock>
          <InfoBlock label="Accuracy">{acc === null || acc === undefined ? "—" : `${acc}%`}</InfoBlock>
          {log.homeworkComments ? (
            <InfoBlock label="Homework comments" wide>
              {log.homeworkComments}
            </InfoBlock>
          ) : null}
        </View>
        {topics.length ? (
          <View style={styles.gapSm}>
            <T variant="small" tone="muted">
              {topics.length > 1 ? "Topics covered" : "Topic covered"}
            </T>
            <View style={styles.tags}>
              {topics.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </View>
          </View>
        ) : null}
        {log.materials?.length ? (
          <View style={styles.gapSm}>
            <T variant="small" tone="muted">
              {`Materials used · ${log.materials.length} item${log.materials.length > 1 ? "s" : ""}`}
            </T>
            <MaterialList materials={log.materials} />
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title="Session notes">
        {(
          [
            ["Lesson activity", log.lessonActivity],
            ["Learning insight", log.learningInsight],
            ["Next focus", log.nextFocus],
            ["Homework given", log.homeworkGiven],
          ] as const
        ).map(([label, text]) => (
          <View key={label} style={styles.gapXs}>
            <T variant="small" tone="muted" style={styles.bold}>
              {label}
            </T>
            <T style={styles.prose} selectable>
              {text?.trim() ? text : "—"}
            </T>
          </View>
        ))}
      </SectionCard>

      <SectionCard title="Student evaluation">
        <View style={styles.gapSm}>
          {settings.sessionLogs.ratingDimensions.map((d) => {
            const v = log.ratings?.[ratingKey(d)] ?? 0;
            return (
              <View key={d} style={styles.ratingRow}>
                <T style={styles.grow}>{d}</T>
                <StarInput value={v} label={d} size={18} />
                <T variant="small" tone="muted" style={styles.value}>
                  {v ? `${v}/5` : "—/5"}
                </T>
              </View>
            );
          })}
          <View style={[styles.avg, { borderTopColor: colors.border }]}>
            <T variant="label">Average</T>
            <StarRating value={avg} />
          </View>
        </View>
      </SectionCard>
    </View>
  );
}

function Row({ label, children, last, text = true }: { label: string; children: ReactNode; last?: boolean; text?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <T variant="small" tone="muted" style={styles.rowLabel}>
        {label}
      </T>
      <View style={styles.grow}>{text ? <T>{children}</T> : children}</View>
    </View>
  );
}

function AiBlock({ title, text, accent, risk }: { title: string; text: string; accent?: boolean; risk?: boolean }) {
  const colors = useColors();
  const flag = useFlagColors();
  const tone = risk ? (isNoRisk(text) ? flag.on_track : flag.needs_attention) : null;
  return (
    <View style={[styles.ai, { borderColor: tone?.border ?? colors.border, backgroundColor: tone?.bg ?? colors.card }, accent && { borderLeftWidth: 3, borderLeftColor: colors.foreground }]}>
      <T variant="tiny" tone="muted" style={styles.bold}>
        {title}
      </T>
      <T variant="small" style={styles.prose} selectable>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.lg },
  gapSm: { gap: space.sm },
  gapXs: { gap: 4 },
  grow: { flex: 1, minWidth: 0 },
  bold: { fontWeight: "600" },
  prose: { lineHeight: 22 },
  record: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg },
  row: { flexDirection: "row", gap: space.md, paddingVertical: space.md },
  rowLabel: { width: 104, paddingTop: 1 },
  status: { alignSelf: "flex-start", borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  aiHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  outlineBadge: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  hero: { borderRadius: radius.lg, padding: space.lg, gap: 4 },
  ai: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.md, gap: 4 },
  blocks: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  value: { width: 30, textAlign: "right", fontVariant: ["tabular-nums"] },
  avg: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
});
