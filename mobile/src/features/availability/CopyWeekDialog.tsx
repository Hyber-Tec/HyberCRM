import { type DateKey, addDays, formatDateKey } from "@shared/time";
import { Check } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";

export interface WeekChoice {
  /** First day of the week (the branch's week start). */
  start: DateKey;
  /** Open days in it the tutor can still change. */
  editable: number;
  /** Open days in it, changeable or not. */
  open: number;
  /** Days of the week before it that have times. */
  sourceDays: number;
}

/** "Oct 11 – 17", or "Oct 25 – Nov 1" across months. */
export function weekLabel(start: DateKey): string {
  const end = addDays(start, 6);
  return start.slice(0, 7) === end.slice(0, 7) ? `${formatDateKey(start, "monthDay")} – ${Number(end.slice(8))}` : `${formatDateKey(start, "monthDay")} – ${formatDateKey(end, "monthDay")}`;
}

/**
 * Copy last week (the website's tool): the previous week's times go into the chosen week, replacing what it had.
 * Closed and locked days are skipped and times follow each day's opening hours. The weeks offered are the coming
 * ones that still have days the tutor can change.
 */
export function CopyWeekDialog({ open, weeks, busy, onClose, onCopy }: { open: boolean; weeks: WeekChoice[]; busy: boolean; onClose: () => void; onCopy: (weekStart: DateKey) => void }) {
  const colors = useColors();
  const [picked, setPicked] = useState<DateKey | null>(null);
  const chosen = weeks.find((w) => w.start === picked) ?? weeks[0] ?? null;
  return (
    <Dialog
      open={open}
      onRequestClose={onClose}
      testID="copy-week-dialog"
      footer={
        <>
          <Button testID="copy-week-confirm" disabled={!chosen} busy={busy} onPress={() => chosen && onCopy(chosen.start)}>
            {chosen ? `Copy into ${weekLabel(chosen.start)}` : "Copy"}
          </Button>
          <Button variant="ghost" onPress={onClose} disabled={busy}>
            Cancel
          </Button>
        </>
      }
    >
      <T variant="heading">Copy last week</T>
      <T tone="muted">Copy the previous week’s availability into a week. That week’s availability is replaced. Closed and locked days are skipped, and times follow each day’s opening hours.</T>
      {weeks.length === 0 ? (
        <T tone="muted">There’s no week you can change yet.</T>
      ) : (
        <View style={[styles.list, { borderColor: colors.border }]}>
          {weeks.map((w, i) => {
            const on = w.start === chosen?.start;
            return (
              <Pressable
                key={w.start}
                testID={`copy-week-${w.start}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setPicked(w.start)}
                style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
              >
                <View style={styles.grow}>
                  <T variant="label">{weekLabel(w.start)}</T>
                  <T variant="small" tone={w.sourceDays ? "muted" : "warning"}>
                    {w.sourceDays
                      ? `From ${weekLabel(addDays(w.start, -7))} · ${w.sourceDays} day${w.sourceDays === 1 ? "" : "s"} with times`
                      : `${weekLabel(addDays(w.start, -7))} has no times: this clears the week`}
                  </T>
                  {w.editable < w.open ? (
                    <T variant="small" tone="muted">
                      {w.open - w.editable} locked day{w.open - w.editable === 1 ? "" : "s"} stay{w.open - w.editable === 1 ? "s" : ""} as {w.open - w.editable === 1 ? "it is" : "they are"}
                    </T>
                  ) : null}
                </View>
                <View style={[styles.radio, { borderColor: on ? colors.primary : colors.input, backgroundColor: on ? colors.primary : "transparent" }]}>
                  {on ? <Check size={13} color={colors.primaryForeground} strokeWidth={3} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md },
  grow: { flex: 1, gap: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
