import { type LogContent, type StudentFlag, accuracy, averageRating, ratingKey, stepOfField } from "@shared/sessions/logs";
import { topicKind } from "@shared/sessions/topics";
import { ChevronRight, ExternalLink } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { T } from "@/components/Text";
import { openUrl } from "@/lib/links";
import { radius, space, useColors, useIsDark } from "@/theme";
import { NOTES, STEP_NAMES } from "./content";
import { ErrorBox, FlagBadge, InfoBlock, SectionCard, StarInput, StarRating, StepTitle, Tag } from "./widgets";

/**
 * Step 6: everything read back (True Education's four cards) with an Edit link on each, what's still missing with a
 * way to each step, and the submit error. On a phone the error sits at the top, next to what's missing.
 */
export function ReviewStep({ c, dims, missing, onGo, error, isSubmitted }: { c: LogContent; dims: string[]; missing: string[]; onGo: (step: number) => void; error: string | null; isSubmitted: boolean }) {
  const acc = accuracy(c.questionsAttempted, c.questionsWrong);
  const topics = topicKind(c.sessionType) === "free" ? (c.topicCovered.trim() ? [c.topicCovered.trim()] : []) : c.topics;
  const avg = averageRating(c.ratings);
  const colors = useColors();
  const edit = (s: number) => (
    <Button variant="ghost" size="sm" onPress={() => onGo(s)} accessibilityLabel={`Edit ${STEP_NAMES[s as 1 | 2 | 3 | 4]}`}>
      Edit
    </Button>
  );
  return (
    <View style={styles.gap} testID="log-review">
      <StepTitle title="Review & submit" text="Confirm everything looks correct before submitting." />
      {error ? <ErrorBox text={error} /> : null}
      {missing.length ? <MissingList missing={missing} onGo={onGo} isSubmitted={isSubmitted} /> : null}

      <SectionCard title="Session info" right={edit(1)}>
        <View style={styles.blocks}>
          <InfoBlock label="Session type">{c.sessionType || "—"}</InfoBlock>
          <InfoBlock label="Homework status">{c.homeworkStatus || "—"}</InfoBlock>
          <InfoBlock label="Questions attempted">{c.questionsAttempted ?? "—"}</InfoBlock>
          <InfoBlock label="Questions wrong">{c.questionsWrong ?? "—"}</InfoBlock>
          <InfoBlock label="Accuracy">{acc === null ? "—" : `${acc}%`}</InfoBlock>
          <InfoBlock label="Student flag">{c.studentFlag ? <FlagBadge flag={c.studentFlag as StudentFlag} /> : "—"}</InfoBlock>
          {c.homeworkComments.trim() ? (
            <InfoBlock label="Homework comments" wide>
              {c.homeworkComments}
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
      </SectionCard>

      {c.materials.length ? (
        <SectionCard title="Materials used" right={edit(2)}>
          <T variant="small" tone="muted">
            {c.materials.length} item{c.materials.length > 1 ? "s" : ""} selected
          </T>
          <MaterialList materials={c.materials} />
        </SectionCard>
      ) : null}

      <SectionCard title="Session notes" right={edit(3)}>
        {NOTES.map((n) => (
          <View key={n.key} style={styles.gapXs}>
            <T variant="small" tone="muted">
              {n.label}
            </T>
            <T style={styles.prose}>{c[n.key].trim() || "—"}</T>
          </View>
        ))}
      </SectionCard>

      <SectionCard title="Student evaluation" right={edit(4)}>
        <View style={styles.gapSm}>
          {dims.map((d) => {
            const v = c.ratings[ratingKey(d)] ?? 0;
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
          {avg !== null ? (
            <View style={[styles.avg, { borderTopColor: colors.border }]}>
              <T variant="small" tone="muted">
                Average
              </T>
              <StarRating value={avg} />
            </View>
          ) : null}
        </View>
      </SectionCard>
    </View>
  );
}

/** "Before you submit:" — what's missing, by step, each with a way there. */
function MissingList({ missing, onGo, isSubmitted }: { missing: string[]; onGo: (step: number) => void; isSubmitted: boolean }) {
  const dark = useIsDark();
  const c = dark ? { bg: "#f59e0b1f", border: "#f59e0b4d", fg: "#fcd34d" } : { bg: "#fffbeb", border: "#fde68a", fg: "#92400e" };
  return (
    <View style={[styles.missing, { backgroundColor: c.bg, borderColor: c.border }]} testID="review-missing">
      <T variant="label" style={{ color: c.fg }}>
        Before you {isSubmitted ? "update" : "submit"}:
      </T>
      {([1, 2, 3, 4] as const)
        .filter((s) => missing.some((m) => stepOfField(m) === s))
        .map((s) => (
          <Pressable
            key={s}
            accessibilityRole="button"
            accessibilityLabel={`Go to ${STEP_NAMES[s]}`}
            onPress={() => onGo(s)}
            style={({ pressed }) => [styles.missingRow, { borderTopColor: c.border, opacity: pressed ? 0.6 : 1 }]}
            testID={`review-go-${s + 1}`}
          >
            <View style={styles.grow}>
              <T variant="small" style={{ color: c.fg }}>
                {missing
                  .filter((m) => stepOfField(m) === s)
                  .map((m) => m.charAt(0) + m.slice(1).toLowerCase())
                  .join(", ")}
              </T>
              <T variant="small" style={{ color: c.fg, fontWeight: "600" }}>
                Go to {STEP_NAMES[s]}
              </T>
            </View>
            <ChevronRight size={18} color={c.fg} />
          </Pressable>
        ))}
    </View>
  );
}

/** Materials as a bulleted list; links open in the phone's browser. */
export function MaterialList({ materials }: { materials: LogContent["materials"] }) {
  const colors = useColors();
  return (
    <View style={styles.gapXs}>
      {materials.map((m) => (
        <View key={`${m.label}|${m.url}`} style={styles.material}>
          <View style={[styles.bullet, { backgroundColor: colors.mutedForeground }]} />
          {m.url ? (
            <Pressable accessibilityRole="link" onPress={() => void openUrl(m.url)} style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
              <T style={{ color: colors.info, flexShrink: 1 }} numberOfLines={2}>
                {m.label}
              </T>
              <ExternalLink size={14} color={colors.info} />
            </Pressable>
          ) : (
            <T style={styles.grow}>{m.label}</T>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.lg },
  gapSm: { gap: space.sm },
  gapXs: { gap: 4 },
  grow: { flex: 1, minWidth: 0 },
  blocks: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  prose: { lineHeight: 22 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  value: { width: 30, textAlign: "right", fontVariant: ["tabular-nums"] },
  avg: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  missing: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingTop: space.md, gap: space.xs, overflow: "hidden" },
  missingRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderTopWidth: StyleSheet.hairlineWidth, minHeight: 48 },
  link: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  material: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 26 },
  bullet: { width: 5, height: 5, borderRadius: 3 },
});
