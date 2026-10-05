import { type PayPeriod, periodId } from "@shared/pay/periods";
import { type DateKey, type Weekday, formatDateKey } from "@shared/time";
import { CalendarRange, Check, ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { DatePickerDialog } from "@/components/DatePickerDialog";
import { Dialog } from "@/components/Dialog";
import { ListRow, ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";

export interface RangeValue {
  from: DateKey;
  to: DateKey;
  /** Set when the range is exactly a pay period. */
  period: PayPeriod | null;
}

/** "Sep 27 – Oct 10, 2026" (the website's period label). */
export function periodLabel(p: { start: DateKey; end: DateKey }): string {
  return `${formatDateKey(p.start, "monthDay")} – ${formatDateKey(p.end, "medium")}`;
}

/**
 * The website's PeriodPicker for a phone: the branch's pay periods (the current one first) or a custom range whose
 * dates come from the vertical month picker.
 */
export function PeriodPicker({
  value,
  periods,
  today,
  weekStartsOn,
  onChange,
}: {
  value: RangeValue;
  /** Newest first; the first is the current period. */
  periods: PayPeriod[];
  today: DateKey;
  weekStartsOn: Weekday;
  onChange: (v: RangeValue) => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const current = periods[0];
  const selected = value.period ? periodId(value.period) : "custom";
  return (
    <View style={styles.wrap}>
      <Pressable
        testID="period-picker"
        accessibilityRole="button"
        accessibilityLabel={`Pay period: ${value.period ? periodLabel(value.period) : "custom range"}. Change`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
      >
        <CalendarRange size={18} color={colors.mutedForeground} />
        <View style={styles.grow}>
          <T variant="small" tone="muted">
            {value.period ? (current && periodId(value.period) === periodId(current) ? "Current pay period" : "Pay period") : "Custom range"}
          </T>
          <T variant="label">{value.period ? periodLabel(value.period) : periodLabel({ start: value.from, end: value.to })}</T>
        </View>
        <ChevronDown size={18} color={colors.mutedForeground} />
      </Pressable>

      {!value.period ? (
        <ListSection>
          <ListRow title="From" right={formatDateKey(value.from, "medium")} onPress={() => setPicking("from")} testID="range-from" />
          <ListRow title="To" right={formatDateKey(value.to, "medium")} onPress={() => setPicking("to")} testID="range-to" />
        </ListSection>
      ) : null}

      <Dialog open={open} onRequestClose={() => setOpen(false)} testID="period-dialog" footer={<Button variant="ghost" onPress={() => setOpen(false)}>Cancel</Button>}>
        <T variant="heading">Pay period</T>
        <View>
          {[...periods.map((p) => ({ id: periodId(p), label: periodLabel(p), hint: p === current ? "Current" : null, p })), { id: "custom", label: "Custom range…", hint: null, p: null }].map((o, i) => {
            const on = o.id === selected;
            return (
              <Pressable
                key={o.id}
                testID={`period-${o.id}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setOpen(false);
                  if (o.p) onChange({ from: o.p.start, to: o.p.end, period: o.p });
                  else onChange({ ...value, period: null });
                }}
                style={({ pressed }) => [styles.option, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
              >
                <T variant="label" style={styles.grow}>
                  {o.label}
                </T>
                {o.hint ? (
                  <T variant="small" tone="muted">
                    {o.hint}
                  </T>
                ) : null}
                {on ? <Check size={18} color={colors.foreground} /> : <View style={styles.checkSpace} />}
              </Pressable>
            );
          })}
        </View>
      </Dialog>

      <DatePickerDialog
        open={picking !== null}
        title={picking === "from" ? "From" : "To"}
        value={picking === "from" ? value.from : value.to}
        today={today}
        weekStartsOn={weekStartsOn}
        min={picking === "to" ? value.from : null}
        max={picking === "from" ? value.to : null}
        onClose={() => setPicking(null)}
        onPick={(d) => {
          onChange(picking === "from" ? { ...value, from: d, period: null } : { ...value, to: d, period: null });
          setPicking(null);
        }}
        testID="range-picker"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  trigger: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, paddingVertical: space.md },
  grow: { flex: 1 },
  option: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.md, paddingHorizontal: space.xs },
  checkSpace: { width: 18 },
});
