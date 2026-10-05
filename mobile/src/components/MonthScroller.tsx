import { type DateKey, type Weekday, WEEKDAYS, WEEKDAY_SHORT, addDays, addMonths, endOfMonth, formatDateKey, orderedWeekdays, startOfMonth, weekdayIndex } from "@shared/time";
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { FlatList, StyleSheet, View, type LayoutChangeEvent, type ViewToken } from "react-native";
import { T } from "@/components/Text";
import { space, useColors } from "@/theme";

/**
 * Months stacked vertically and scrolled like the iOS Calendar app (permanent rule: every month calendar scrolls
 * vertically, never a static month with ‹ › arrows), as the website's MonthScroller. It opens on the anchor's month,
 * with earlier months above it; later months are added as the end comes near. Each month shows only its own days,
 * starting on the branch's week start. Only the months near the screen are drawn, so a long list stays smooth.
 */

export interface MonthScrollerHandle {
  /** Brings a date's month to the top (adding the months up to it first when they aren't there yet). */
  scrollToDate: (date: DateKey, opts?: { animated?: boolean }) => void;
}

export interface MonthScrollerProps {
  /** The month (any date in it) shown at the top when the calendar opens. */
  anchor: DateKey;
  weekStartsOn: Weekday;
  /** One day cell's content; the scroller draws the cell box and its lines. */
  renderDay: (date: DateKey, size: { width: number; height: number }) => ReactNode;
  /** Height of a week row. */
  rowHeight: number;
  /** What a month shows, as a string: a month is drawn again only when its signature changes. */
  monthSignature?: (month: DateKey) => string;
  /** Months above the anchor's (default 12) and below it at first (default 12; more are added while scrolling). */
  monthsBefore?: number;
  monthsAfter?: number;
  /** How far back (a far jump only) and ahead the calendar goes at most, in months (defaults 120 and 60). */
  maxMonthsBefore?: number;
  maxMonthsAfter?: number;
  /** `full`: bordered cells (availability). `compact`: small days without lines (date pickers). */
  variant?: "full" | "compact";
  /** First and last day of the months on screen, for loading their data. */
  onVisibleRangeChange?: (from: DateKey, to: DateKey) => void;
  /** Month title; defaults to "October 2026" with the year muted. */
  monthTitle?: (month: DateKey) => ReactNode;
  /** Space at each side of the grid. */
  inset?: number;
  testID?: string;
}

const STEP = 6;
const TITLE_HEIGHT = { full: 52, compact: 36 } as const;
const MONTH_GAP = { full: 12, compact: 8 } as const;

/** Weeks a month spans, from its first day's weekday. */
function weeksIn(month: DateKey, weekStartsOn: Weekday): number {
  const lead = (weekdayIndex(month) - WEEKDAYS.indexOf(weekStartsOn) + 7) % 7;
  const days = Number(endOfMonth(month).slice(8));
  return Math.ceil((lead + days) / 7);
}

/** Whole months from `a` to `b` (both first-of-month keys). */
const monthsBetween = (a: DateKey, b: DateKey) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

export const MonthScroller = forwardRef<MonthScrollerHandle, MonthScrollerProps>(function MonthScroller(
  {
    anchor,
    weekStartsOn,
    renderDay,
    rowHeight,
    monthSignature,
    monthsBefore = 12,
    monthsAfter = 12,
    maxMonthsBefore = 120,
    maxMonthsAfter = 60,
    variant = "full",
    onVisibleRangeChange,
    monthTitle,
    inset = space.sm,
    testID,
  },
  ref,
) {
  const list = useRef<FlatList<DateKey>>(null);
  // Fixed once open: a new day (or month) at midnight doesn't shift the months under the person's finger.
  const [base] = useState(() => startOfMonth(anchor));
  const [initialIndex] = useState(monthsBefore);
  const [before, setBefore] = useState(monthsBefore);
  const [after, setAfter] = useState(monthsAfter);
  const [width, setWidth] = useState(0);
  const months = useMemo(() => Array.from({ length: before + 1 + after }, (_, i) => addMonths(base, i - before)), [base, before, after]);

  const titleHeight = TITLE_HEIGHT[variant];
  const gap = MONTH_GAP[variant];
  const heights = useMemo(() => months.map((m) => titleHeight + weeksIn(m, weekStartsOn) * rowHeight + gap), [months, titleHeight, weekStartsOn, rowHeight, gap]);
  const offsets = useMemo(() => {
    const out: number[] = [];
    let y = 0;
    for (const h of heights) {
      out.push(y);
      y += h;
    }
    return out;
  }, [heights]);

  // A far jump adds the months up to the target first, then lands once they exist.
  const pending = useRef<{ month: DateKey; animated: boolean } | null>(null);
  const scrollToDate = useCallback(
    (date: DateKey, opts?: { animated?: boolean }) => {
      const target = startOfMonth(date);
      const animated = opts?.animated ?? true;
      const index = months.indexOf(target);
      if (index >= 0) {
        list.current?.scrollToOffset({ offset: offsets[index], animated });
        return;
      }
      const delta = monthsBetween(base, target);
      if (delta > maxMonthsAfter || -delta > maxMonthsBefore) return;
      pending.current = { month: target, animated };
      if (delta > 0) setAfter((a) => Math.max(a, Math.min(maxMonthsAfter, delta + 2)));
      else setBefore((b) => Math.max(b, Math.min(maxMonthsBefore, -delta + 2)));
    },
    [months, offsets, base, maxMonthsAfter, maxMonthsBefore],
  );
  useImperativeHandle(ref, () => ({ scrollToDate }), [scrollToDate]);

  useEffect(() => {
    const p = pending.current;
    const index = p ? months.indexOf(p.month) : -1;
    if (!p || index < 0) return;
    pending.current = null;
    list.current?.scrollToOffset({ offset: offsets[index], animated: p.animated });
  }, [months, offsets]);

  // The months on screen, reported through a stable callback (FlatList keeps the first one it gets).
  const report = useRef(onVisibleRangeChange);
  useEffect(() => {
    report.current = onVisibleRangeChange;
  });
  const lastRange = useRef("");
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: ViewToken<DateKey>[] }) => {
    const keys = viewableItems.map((v) => v.item).sort();
    if (!keys.length) return;
    const range = `${keys[0]}|${keys[keys.length - 1]}`;
    if (range === lastRange.current) return;
    lastRange.current = range;
    report.current?.(keys[0], endOfMonth(keys[keys.length - 1]));
  });

  const cellWidth = width ? (width - inset * 2) / 7 : 0;

  return (
    <View style={styles.fill} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <FlatList
          ref={list}
          testID={testID}
          data={months}
          keyExtractor={(m) => m}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: heights[index], offset: offsets[index], index })}
          renderItem={({ item }) => (
            <MonthBlock
              month={item}
              weekStartsOn={weekStartsOn}
              cellWidth={cellWidth}
              rowHeight={rowHeight}
              titleHeight={titleHeight}
              gap={gap}
              inset={inset}
              variant={variant}
              signature={monthSignature ? monthSignature(item) : ""}
              renderDay={renderDay}
              title={monthTitle?.(item)}
            />
          )}
          extraData={monthSignature}
          onEndReached={() => setAfter((a) => Math.min(maxMonthsAfter, a + STEP))}
          onEndReachedThreshold={1.5}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={VIEWABILITY}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={5}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
        />
      ) : null}
    </View>
  );
});

const VIEWABILITY = { itemVisiblePercentThreshold: 1 };

/** The weekday letters above the months, in the branch's week order, lined up with the day columns. */
export function WeekdayHeader({ weekStartsOn, inset = space.sm }: { weekStartsOn: Weekday; inset?: number }) {
  const colors = useColors();
  return (
    <View style={[styles.weekdays, { paddingHorizontal: inset, borderBottomColor: colors.border }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {orderedWeekdays(weekStartsOn).map((d) => (
        <T key={d} variant="tiny" tone="muted" style={styles.weekday}>
          {WEEKDAY_SHORT[d].toUpperCase()}
        </T>
      ))}
    </View>
  );
}

interface MonthBlockProps {
  month: DateKey;
  weekStartsOn: Weekday;
  cellWidth: number;
  rowHeight: number;
  titleHeight: number;
  gap: number;
  inset: number;
  variant: "full" | "compact";
  signature: string;
  renderDay: MonthScrollerProps["renderDay"];
  title?: ReactNode;
}

/** One month: its title, then its weeks; with `full`, lines around the month's own days only (the website's "staircase"). */
const MonthBlock = memo(
  function MonthBlock({ month, weekStartsOn, cellWidth, rowHeight, titleHeight, gap, inset, variant, renderDay, title }: MonthBlockProps) {
    const colors = useColors();
    const lead = (weekdayIndex(month) - WEEKDAYS.indexOf(weekStartsOn) + 7) % 7;
    const days = Number(endOfMonth(month).slice(8));
    const cells: (DateKey | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => addDays(month, i))];
    while (cells.length % 7) cells.push(null);
    const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
    const full = variant === "full";
    const line = StyleSheet.hairlineWidth;
    return (
      <View style={{ paddingHorizontal: inset, paddingBottom: gap }} testID={`month-${month.slice(0, 7)}`}>
        <View style={[styles.title, { height: titleHeight }]} accessibilityRole="header">
          {title ?? <MonthTitle month={month} compact={!full} />}
        </View>
        {weeks.map((week, w) => (
          <View key={w} style={styles.week}>
            {week.map((d, i) => {
              if (!d) return <View key={i} style={{ width: cellWidth, height: rowHeight }} />;
              const above = w > 0 && weeks[w - 1][i] !== null;
              const left = i > 0 && week[i - 1] !== null;
              return (
                <View
                  key={d}
                  style={[
                    { width: cellWidth, height: rowHeight },
                    full && { borderColor: colors.border, borderRightWidth: line, borderBottomWidth: line, borderTopWidth: above ? 0 : line, borderLeftWidth: left ? 0 : line },
                  ]}
                >
                  {renderDay(d, { width: cellWidth, height: rowHeight })}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  },
  (a, b) =>
    a.month === b.month &&
    a.signature === b.signature &&
    a.cellWidth === b.cellWidth &&
    a.rowHeight === b.rowHeight &&
    a.weekStartsOn === b.weekStartsOn &&
    a.variant === b.variant &&
    a.inset === b.inset &&
    // Without a signature the month follows every render.
    a.signature !== "",
);

/** "October 2026", the year muted. */
export function MonthTitle({ month, compact = false }: { month: DateKey; compact?: boolean }) {
  const [name, year] = formatDateKey(month, "monthYear").split(" ");
  return (
    <T variant={compact ? "label" : "heading"}>
      {name} <T variant={compact ? "label" : "heading"} tone="muted" style={styles.year}>
        {year}
      </T>
    </T>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { justifyContent: "flex-end", paddingBottom: space.sm, paddingHorizontal: space.xs },
  week: { flexDirection: "row" },
  weekdays: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  weekday: { flex: 1, textAlign: "center", fontWeight: "600", letterSpacing: 0.4 },
  year: { fontWeight: "400" },
});
