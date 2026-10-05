import type { LogContent, Material, SessionLog } from "@shared/sessions/logs";
import { topicKind } from "@shared/sessions/topics";
import { type DateKey, formatDateKey } from "@shared/time";
import { shortDay, timeRange } from "@/features/schedule/format";

/**
 * The session log form's words and small helpers, as the website's form has them (web/src/features/sessions/log/
 * LogForm.tsx, widgets.tsx, LogView.tsx): True Education's steps, placeholders and hints. The rules themselves
 * (validation, accuracy, suggested flag, matching earlier logs) come from @shared/sessions/logs.
 */

/** The six steps, with True Education's tab names (Title Case, as on the website). */
export const STEPS = ["Prepare", "Session Info", "Materials", "Notes", "Evaluation", "Review & Submit"] as const;

/** The steps that hold required fields (1 Session Info … 4 Evaluation), for the Review's "Go to …" links. */
export const STEP_NAMES: Record<1 | 2 | 3 | 4, string> = { 1: "Session Info", 2: "Materials", 3: "Notes", 4: "Evaluation" };

export const EMPTY_LOG: LogContent = {
  sessionType: "",
  topics: [],
  topicCovered: "",
  homeworkStatus: "",
  homeworkComments: "",
  materials: [],
  questionsAttempted: null,
  questionsWrong: null,
  lessonActivity: "",
  learningInsight: "",
  nextFocus: "",
  homeworkGiven: "",
  ratings: {},
  studentFlag: "",
};

/** The form's content from a saved log (a draft or a submitted one); anything missing starts empty. */
export function pickContent(log: Partial<SessionLog> | null): LogContent {
  if (!log) return EMPTY_LOG;
  const out = { ...EMPTY_LOG };
  for (const k of Object.keys(EMPTY_LOG) as (keyof LogContent)[]) {
    if (log[k] !== undefined && log[k] !== null) (out as Record<string, unknown>)[k] = log[k];
  }
  return out;
}

export type NoteKey = "lessonActivity" | "learningInsight" | "nextFocus" | "homeworkGiven";

/** The four notes are the session record: TE's guidance placeholders, tall boxes, and a soft nudge when very short. */
export const NOTES: { key: NoteKey; label: string; placeholder: string; minHeight: number; nudgeUnder: number; nudge: string }[] = [
  {
    key: "lessonActivity",
    label: "Lesson activity",
    placeholder:
      "What did you cover during the session? Include specific topics, exercises, and how the student engaged. Write as much detail as you need — this becomes the core session record.",
    minHeight: 240,
    nudgeUnder: 25,
    nudge: "Add a little more detail: topics, exercises and how the student engaged.",
  },
  {
    key: "learningInsight",
    label: "Learning insight",
    placeholder: "What did the student understand well? Where did they struggle? What patterns did you notice in their thinking or approach? Any breakthroughs or setbacks?",
    minHeight: 240,
    nudgeUnder: 25,
    nudge: "Say what clicked, what didn’t, and why.",
  },
  {
    key: "nextFocus",
    label: "Next focus",
    placeholder: "What should be prioritized in the next session? Include specific skills, topics, or strategies to revisit.",
    minHeight: 160,
    nudgeUnder: 8,
    nudge: "Name the skills or topics to revisit.",
  },
  {
    key: "homeworkGiven",
    label: "Homework given",
    placeholder: "What homework was assigned? Be specific about pages, problem numbers, tasks, or practice sets so the student and parent know exactly what to do.",
    minHeight: 160,
    nudgeUnder: 8,
    nudge: "Add pages, problem numbers or practice sets.",
  },
];

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** A risk alert that says there is no risk (True Education shows it green, any other amber). */
export function isNoRisk(text: string): boolean {
  return /^(no |none|no urgent)/i.test(text.trim());
}

/**
 * Recent topics of the same kind, not already chosen: free text from this subject's logs, SAT/ACT paths from any
 * (the website's suggestion, newest first, five at most).
 */
export function recentTopics(previous: readonly SessionLog[], sameLogs: readonly SessionLog[], c: LogContent): string[] {
  const kind = topicKind(c.sessionType);
  const out: string[] = [];
  for (const l of kind === "free" ? sameLogs : previous) {
    if (topicKind(l.sessionType) !== kind) continue;
    for (const t of kind === "free" ? [l.topicCovered] : (l.topics ?? [])) if (t?.trim() && !out.includes(t.trim())) out.push(t.trim());
    if (out.length >= 5) break;
  }
  return out.slice(0, 5).filter((t) => (kind === "free" ? t !== c.topicCovered.trim() : !c.topics.includes(t)));
}

/** Materials from this subject's last three logs that aren't on the list yet (eight at most). */
export function recentMaterials(sameLogs: readonly SessionLog[], current: readonly Material[]): Material[] {
  const out: Material[] = [];
  for (const l of sameLogs.slice(0, 3)) for (const m of l.materials ?? []) if (!out.some((x) => x.label === m.label && x.url === m.url)) out.push(m);
  return out.filter((m) => !current.some((x) => x.label === m.label && x.url === m.url)).slice(0, 8);
}

/** A material from what was typed: a pasted link becomes a link, anything else a named resource (True Education). */
export function materialFrom(value: string): Material | null {
  const v = value.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? { label: v, url: v, type: "link" } : { label: v, url: "", type: "text" };
}

/** "Thu, Oct 1" this year, "Oct 1, 2025" before: short enough for a phone's header. */
export function shortDate(dateKey: DateKey, today: DateKey): string {
  return dateKey.slice(0, 4) === today.slice(0, 4) ? shortDay(dateKey) : formatDateKey(dateKey, "medium");
}

/** The header's second line, in the schedule's words: "SAT Math · Thu, Oct 1 · 4:00 – 5:30 PM (1.5h)". */
export function sessionLine(s: { subject: string; dateKey: DateKey; startMin: number; endMin: number }, today: DateKey, hours: number, hour12 = true): string {
  return `${s.subject || "—"} · ${shortDate(s.dateKey, today)} · ${timeRange(s.startMin, s.endMin, hour12)} (${hours}h)`;
}
