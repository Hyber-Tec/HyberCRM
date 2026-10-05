import { ACT_TOPICS, SAT_PSAT_TOPICS, topicKind } from "@shared/sessions/topics";
import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, useButtonForeground } from "@/components/Button";
import { T } from "@/components/Text";
import { space } from "@/theme";
import { ChipGroup, Tag } from "./widgets";

/**
 * Topics for SAT, PSAT and ACT sessions (True Education's multi-topic selector): the chosen topics as tags, then the
 * taxonomy level by level as chips (SAT/PSAT: Section › Domain › Skill; ACT: Subject › Category). Partial paths may
 * be added ("Math", "Math > Algebra"); each level is one tap, and Add puts the path on the list.
 */
export function TopicPicker({ sessionType, value, onChange }: { sessionType: string; value: string[]; onChange: (v: string[]) => void }) {
  const kind = topicKind(sessionType);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [c, setC] = useState("");
  const addColor = useButtonForeground("outline");
  const path = [a, b, c].filter(Boolean).join(" > ");
  const add = () => {
    if (path && !value.includes(path)) onChange([...value, path]);
    setA("");
    setB("");
    setC("");
  };
  const level1 = kind === "sat" ? Object.keys(SAT_PSAT_TOPICS) : Object.keys(ACT_TOPICS);
  const level2 = kind === "sat" ? (a ? Object.keys(SAT_PSAT_TOPICS[a] ?? {}) : []) : a ? (ACT_TOPICS[a] ?? []) : [];
  const level3 = kind === "sat" && a && b ? (SAT_PSAT_TOPICS[a]?.[b] ?? []) : [];
  const opts = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
  // Tapping the chosen chip again steps back up a level.
  const pick = (current: string, set: (v: string) => void, reset: () => void) => (v: string) => {
    set(v === current ? "" : v);
    reset();
  };

  return (
    <View style={styles.wrap} testID="log-topic-picker">
      {value.length ? (
        <View style={styles.tags}>
          {value.map((t) => (
            <Tag key={t} onRemove={() => onChange(value.filter((x) => x !== t))}>
              {t}
            </Tag>
          ))}
        </View>
      ) : null}
      <Level title={kind === "sat" ? "Section" : "Subject"}>
        <ChipGroup label={kind === "sat" ? "Section" : "Subject"} value={a} options={opts(level1)} onChange={pick(a, setA, () => (setB(""), setC("")))} testIDPrefix="log-topic-a" />
      </Level>
      {level2.length ? (
        <Level title={kind === "sat" ? "Domain" : "Category"}>
          <ChipGroup label={kind === "sat" ? "Domain" : "Category"} value={b} options={opts(level2)} onChange={pick(b, setB, () => setC(""))} testIDPrefix="log-topic-b" />
        </Level>
      ) : null}
      {level3.length ? (
        <Level title="Skill">
          <ChipGroup label="Skill" value={c} options={opts(level3)} onChange={pick(c, setC, () => undefined)} testIDPrefix="log-topic-c" />
        </Level>
      ) : null}
      {a ? (
        <Button variant="outline" icon={<Plus size={18} color={addColor} />} onPress={add} disabled={value.includes(path)} testID="log-topic-add" accessibilityLabel={`Add topic ${path}`}>
          {value.includes(path) ? "Already added" : "Add topic"}
        </Button>
      ) : null}
    </View>
  );
}

function Level({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.level}>
      <T variant="tiny" tone="muted" style={styles.levelTitle}>
        {title.toUpperCase()}
      </T>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  level: { gap: 6 },
  levelTitle: { letterSpacing: 0.5 },
});
