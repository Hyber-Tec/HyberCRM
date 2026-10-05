import { recentPeriods } from "@shared/pay/periods";
import { type PricedSegment, formatMoney, totals } from "@shared/pay/segment";
import { priceShifts } from "@shared/pay/shifts";
import { type DateKey, addDays, formatDateKey, formatInstantTime } from "@shared/time";
import { Wallet } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useBranchNow, useMyCompensation, useMySessions, useMyShifts } from "@/features/data/hooks";
import { PeriodPicker, type RangeValue } from "@/features/profile/PeriodPicker";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

/**
 * Payroll history (the website's tutor Payroll): the tutor's clocked shifts in a pay period or a range, priced by the
 * shared pay engine with the branch's pay model on each date: teaching time is time inside sessions with a submitted
 * log, the rest of a shift is admin time. Totals on top, then each day with its segments; an open shift says when
 * the tutor clocked in.
 */
export default function PayrollScreen() {
  const colors = useColors();
  const { settings, rules, timezone, staff } = useBranch();
  const { today } = useBranchNow();
  const { type, anchorDate } = settings.payroll.payPeriod;
  const periods = useMemo(() => recentPeriods(today, type, anchorDate, 12), [today, type, anchorDate]);
  const [range, setRange] = useState<RangeValue>(() => ({ from: periods[0].start, to: periods[0].end, period: periods[0] }));

  const shifts = useMyShifts(range.from, range.to);
  // Sessions a day either side, for shifts that run past midnight.
  const sessions = useMySessions(addDays(range.from, -1), addDays(range.to, 1));
  const comp = useMyCompensation();
  const priced = useMemo(
    () => priceShifts({ shifts: shifts.data, sessions: sessions.data, settings, rules, ratesFor: () => ({ rates: comp.data?.rates ?? { teaching: 0, admin: 0 }, role: staff?.role }) }),
    [shifts.data, sessions.data, settings, rules, comp.data, staff?.role],
  );
  const t = totals(priced.flatMap((p) => p.segments));
  const loading = shifts.loading || sessions.loading || comp.loading;
  const decimals = settings.payroll.hoursDecimals;

  // Newest day first; a day's shifts in the order they happened.
  const days = useMemo(() => {
    const byDay = new Map<DateKey, typeof priced>();
    for (const p of priced) byDay.set(p.shift.dateKey, [...(byDay.get(p.shift.dateKey) ?? []), p]);
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [priced]);

  return (
    <Screen testID="payroll-screen">
      <T tone="muted" style={styles.intro}>
        Your recorded hours and pay. Teaching time is time inside sessions with a submitted log.
      </T>
      <PeriodPicker value={range} periods={periods} today={today} weekStartsOn={settings.general.weekStartsOn} onChange={setRange} />

      <View style={styles.tiles}>
        {[
          { label: "Teaching", v: t.teaching, id: "teaching" },
          { label: "Admin", v: t.admin, id: "admin" },
          { label: "Total", v: t.total, id: "total" },
        ].map((x) => (
          <Card key={x.id} style={styles.tile} testID={`payroll-total-${x.id}`}>
            <T variant="tiny" tone="muted" style={styles.tileLabel}>
              {x.label.toUpperCase()}
            </T>
            <T style={styles.tilePay} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {loading ? "—" : formatMoney(x.v.pay)}
            </T>
            <T variant="small" tone="muted" style={styles.nums}>
              {loading ? " " : `${x.v.hours.toFixed(decimals)} h`}
            </T>
          </Card>
        ))}
      </View>

      {loading ? (
        <SkeletonCards count={3} height={96} />
      ) : days.length === 0 ? (
        <EmptyState icon={<Wallet size={26} color={colors.mutedForeground} />} title="No records found for this range." text="Clock in at the kiosk and your time shows here." testID="payroll-empty" />
      ) : (
        days.map(([day, list]) => {
          const dayTotal = totals(list.flatMap((p) => p.segments));
          return (
            <ListSection key={day} title={formatDateKey(day, "weekdayMedium")} detail={list.some((p) => p.open) ? undefined : formatMoney(dayTotal.total.pay)} testID={`payroll-day-${day}`}>
              {list.flatMap((p) =>
                p.open
                  ? [<OpenShiftRow key={p.shift.id} at={formatInstantTime(p.shift.clockInAt.toDate(), timezone)} />]
                  : p.segments.map((s, i) => <SegmentRow key={`${p.shift.id}-${i}`} s={s} timezone={timezone} decimals={decimals} />),
              )}
            </ListSection>
          );
        })
      )}
    </Screen>
  );
}

function SegmentRow({ s, timezone, decimals, divider }: { s: PricedSegment; timezone: string; decimals: number; divider?: boolean }) {
  const colors = useColors();
  const teaching = s.type === "teaching";
  return (
    <View style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} accessible accessibilityLabel={`${teaching ? "Teaching" : "Admin"}, ${formatInstantTime(s.startMs, timezone)} to ${formatInstantTime(s.endMs, timezone)}, ${s.hours} hours, ${s.unpaid ? "not paid" : formatMoney(s.pay)}`}>
      <View style={styles.grow}>
        <View style={styles.line}>
          <Badge tone={teaching ? "success" : "info"}>{teaching ? "Teaching" : "Admin"}</Badge>
          <T variant="label" style={styles.nums}>
            {formatInstantTime(s.startMs, timezone)} – {formatInstantTime(s.endMs, timezone)}
          </T>
        </View>
        <T variant="small" tone="muted" style={styles.nums}>
          {s.hours.toFixed(decimals)} h × {s.unpaid ? "not paid" : `${formatMoney(s.rate)}/h`}
        </T>
      </View>
      <T variant="label" tone={s.unpaid ? "muted" : "default"} style={styles.nums}>
        {formatMoney(s.pay)}
      </T>
    </View>
  );
}

function OpenShiftRow({ at, divider }: { at: string; divider?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <View style={[styles.dot, { backgroundColor: colors.success }]} />
      <T tone="muted" style={styles.grow}>
        Clocked in at {at}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: space.xs },
  tiles: { flexDirection: "row", gap: space.sm },
  tile: { flex: 1, padding: space.md, gap: 2 },
  tileLabel: { fontWeight: "600", letterSpacing: 0.5 },
  tilePay: { fontSize: 19, fontWeight: "600", fontVariant: ["tabular-nums"] },
  nums: { fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 },
  grow: { flex: 1, gap: 4 },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
