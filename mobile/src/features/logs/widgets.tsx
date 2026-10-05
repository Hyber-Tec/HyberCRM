import { FLAG_LABELS, type StudentFlag } from "@shared/sessions/logs";
import * as Haptics from "expo-haptics";
import { Check, Minus, Plus, Star, TriangleAlert, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { T } from "@/components/Text";
import { radius, space, useColors, useIsDark } from "@/theme";

/**
 * The session log's small controls, as the website's (web/src/features/sessions/widgets.tsx) at touch sizes:
 * one-tap chips, stars, a count stepper, the required mark, banners and badges in True Education's colors.
 */

const tap = () => void Haptics.selectionAsync().catch(() => undefined);

/** True Education's flag colors (bg, border, text), light and dark. */
export function useFlagColors(): Record<StudentFlag, { bg: string; border: string; fg: string }> {
  const dark = useIsDark();
  return dark
    ? {
        on_track: { bg: "#22c55e24", border: "#22c55e59", fg: "#86efac" },
        needs_attention: { bg: "#f59e0b24", border: "#f59e0b59", fg: "#fcd34d" },
        at_risk: { bg: "#ef444424", border: "#ef444459", fg: "#fca5a5" },
      }
    : {
        on_track: { bg: "#f0fdf4", border: "#86efac", fg: "#15803d" },
        needs_attention: { bg: "#fffbeb", border: "#fcd34d", fg: "#92400e" },
        at_risk: { bg: "#fef2f2", border: "#fca5a5", fg: "#991b1b" },
      };
}

export type BannerTone = "violet" | "info" | "warning" | "muted" | "success";

function useBannerColors(tone: BannerTone): { bg: string; border: string; fg: string } {
  const colors = useColors();
  const dark = useIsDark();
  switch (tone) {
    case "violet":
      return dark ? { bg: "#8b5cf62b", border: "#8b5cf64d", fg: "#c4b5fd" } : { bg: "#f5f3ff", border: "#ddd6fe", fg: "#5b21b6" };
    case "info":
      return dark ? { bg: colors.infoTint, border: "#3b82f64d", fg: "#93c5fd" } : { bg: "#eff6ff", border: "#bfdbfe", fg: "#1e40af" };
    case "warning":
      return dark ? { bg: colors.warningTint, border: "#f59e0b4d", fg: "#fcd34d" } : { bg: "#fffbeb", border: "#fcd34d", fg: "#92400e" };
    case "success":
      return dark ? { bg: colors.successTint, border: "#22c55e4d", fg: "#86efac" } : { bg: "#f0fdf4", border: "#bbf7d0", fg: "#166534" };
    default:
      return { bg: colors.card, border: colors.border, fg: colors.mutedForeground };
  }
}

/** A tinted notice with an icon (admin note, draft restored, editing a submitted log…). */
export function Banner({ tone, icon: Icon, children, action, testID }: { tone: BannerTone; icon: LucideIcon; children: ReactNode; action?: ReactNode; testID?: string }) {
  const c = useBannerColors(tone);
  return (
    <View style={[styles.banner, { backgroundColor: c.bg, borderColor: c.border }]} testID={testID}>
      <Icon size={17} color={c.fg} style={styles.bannerIcon} />
      <View style={styles.grow}>{typeof children === "string" ? <T variant="small" style={{ color: c.fg, lineHeight: 19 }}>{children}</T> : children}</View>
      {action}
    </View>
  );
}

/** Text inside a banner, in its color (for bold runs and links). */
export function BannerText({ tone, children, bold }: { tone: BannerTone; children: ReactNode; bold?: boolean }) {
  const c = useBannerColors(tone);
  return (
    <T variant="small" style={{ color: c.fg, lineHeight: 19, fontWeight: bold ? "600" : "400" }}>
      {children}
    </T>
  );
}

/** A problem in words, in red (True Education's error alert). */
export function ErrorBox({ text, testID = "log-error" }: { text: string; testID?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.banner, { backgroundColor: colors.destructiveTint, borderColor: colors.destructiveTint }]} accessibilityRole="alert" testID={testID}>
      <TriangleAlert size={17} color={colors.destructive} style={styles.bannerIcon} />
      <T variant="small" tone="destructive" style={[styles.grow, { lineHeight: 19 }]}>
        {text}
      </T>
    </View>
  );
}

/** A step's title and what it's for, with an optional control at the right (Polish notes). */
export function StepTitle({ title, text, right }: { title: string; text: string; right?: ReactNode }) {
  return (
    <View style={styles.stepTitle}>
      <View style={styles.grow}>
        <T variant="heading" accessibilityRole="header">
          {title}
        </T>
        <T variant="small" tone="muted">
          {text}
        </T>
      </View>
      {right}
    </View>
  );
}

/** A card with a title row (the website's CardHeader) and its fields. */
export function SectionCard({ title, required, description, right, children, style, testID }: { title?: string; required?: boolean; description?: string; right?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]} testID={testID}>
      {title ? (
        <View style={styles.cardHead}>
          <View style={styles.grow}>
            <T variant="subheading" accessibilityRole="header">
              {title}
              {required ? <RequiredMark /> : null}
            </T>
            {description ? (
              <T variant="small" tone="muted">
                {description}
              </T>
            ) : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Red required marker (True Education's `*`), read as "required". */
export function RequiredMark() {
  const colors = useColors();
  return (
    <T style={{ color: colors.destructive }} accessibilityLabel="required">
      {" *"}
    </T>
  );
}

/** A field's label, with the required mark, a muted hint after it, and anything at its side (a tag). */
export function FieldLabel({ children, required, hint, right }: { children: ReactNode; required?: boolean; hint?: string; right?: ReactNode }) {
  return (
    <View style={styles.labelRow}>
      <T variant="label" style={styles.shrink}>
        {children}
        {required ? <RequiredMark /> : null}
        {hint ? (
          <T variant="small" tone="muted">
            {` ${hint}`}
          </T>
        ) : null}
      </T>
      {right}
    </View>
  );
}

/** One-tap choice among a few options (session type, homework status): radio buttons shown as chips. */
export function ChipGroup({
  value,
  options,
  onChange,
  label,
  testIDPrefix,
  disabled,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  label: string;
  testIDPrefix?: string;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: on, disabled }}
            disabled={disabled}
            testID={testIDPrefix ? `${testIDPrefix}-${slug(o.value)}` : undefined}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={({ pressed }) => [
              styles.chip,
              on ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.input },
              pressed && !on && { backgroundColor: colors.accent },
            ]}
          >
            {on ? <Check size={15} color={colors.primaryForeground} strokeWidth={2.5} /> : null}
            <T style={{ fontSize: 15, fontWeight: on ? "600" : "500", color: on ? colors.primaryForeground : colors.foreground }}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A suggestion from earlier logs: one tap adds it (recent topics, materials used recently). */
export function SuggestionChip({ label, onPress, prefix, testID }: { label: string; onPress: () => void; prefix?: string; testID?: string }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${prefix === "+" ? "Add " : "Use "}${label}`}
      testID={testID}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.suggestion, { borderColor: colors.border, backgroundColor: pressed ? colors.accent : colors.cardMuted }]}
    >
      <T variant="small" numberOfLines={1} style={styles.shrink}>
        {prefix ? `${prefix} ` : ""}
        {label}
      </T>
    </Pressable>
  );
}

/** A row of suggestion chips under a small muted title ("Recent topics:"). */
export function Suggestions({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.suggestions}>
      <T variant="small" tone="muted">
        {title}
      </T>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

/** Five stars for a 1–5 rating; tap a star to set it. Read-only without `onChange`. */
export function StarInput({ value, onChange, label, size = 30, testIDPrefix }: { value: number; onChange?: (v: number) => void; label: string; size?: number; testIDPrefix?: string }) {
  const dark = useIsDark();
  const off = dark ? "#525252" : "#d4d4d4";
  const on = "#fbbf24";
  if (!onChange)
    return (
      <View style={styles.starsRead} accessibilityLabel={`${label}: ${value ? `${value} out of 5` : "not rated"}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} size={size} color={n <= value ? on : off} fill={n <= value ? on : "transparent"} />
        ))}
      </View>
    );
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${n} out of 5`}
          accessibilityState={{ selected: n === value }}
          testID={testIDPrefix ? `${testIDPrefix}-${n}` : undefined}
          hitSlop={{ top: 6, bottom: 6 }}
          onPress={() => {
            tap();
            onChange(n);
          }}
          style={({ pressed }) => [styles.star, { width: size + 9, height: size + 12 }, pressed && { transform: [{ scale: 0.88 }] }]}
        >
          <Star size={size} color={n <= value ? on : off} fill={n <= value ? on : "transparent"} strokeWidth={1.8} />
        </Pressable>
      ))}
    </View>
  );
}

/** Small read-only stars filled to an average (4.2), with the number. */
export function StarRating({ value, size = 13 }: { value: number | null; size?: number }) {
  const dark = useIsDark();
  if (value === null)
    return (
      <T variant="small" tone="muted">
        —
      </T>
    );
  const row = (color: string, fill: string) => (
    <View style={styles.starsRead}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} color={color} fill={fill} />
      ))}
    </View>
  );
  return (
    <View style={styles.ratingRow} accessibilityLabel={`Average rating ${value.toFixed(1)} out of 5`}>
      <View>
        {row(dark ? "#525252" : "#d4d4d4", "transparent")}
        <View style={[styles.starsFill, { width: `${(value / 5) * 100}%` }]}>{row("#fbbf24", "#fbbf24")}</View>
      </View>
      <T variant="small" style={styles.tabular}>
        {value.toFixed(1)}
      </T>
    </View>
  );
}

/** A count with − and + around a number field (questions attempted and wrong). */
export function CountStepper({ value, onChange, label, invalid, onFocus, testID }: { value: number | null; onChange: (v: number | null) => void; label: string; invalid?: boolean; onFocus?: () => void; testID?: string }) {
  const colors = useColors();
  const step = (d: number) => {
    tap();
    onChange(Math.max(0, Math.min(9999, (value ?? 0) + d)));
  };
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Fewer ${label.toLowerCase()}`}
        disabled={!value}
        onPress={() => step(-1)}
        style={({ pressed }) => [styles.stepBtn, { borderColor: colors.input, backgroundColor: pressed ? colors.accent : colors.card, opacity: value ? 1 : 0.45 }]}
        testID={testID ? `${testID}-minus` : undefined}
      >
        <Minus size={18} color={colors.foreground} />
      </Pressable>
      <TextInput
        value={value === null ? "" : String(value)}
        onChangeText={(t) => {
          const d = t.replace(/[^\d]/g, "");
          onChange(d === "" ? null : Math.min(9999, Number(d)));
        }}
        keyboardType="number-pad"
        returnKeyType="done"
        placeholder="0"
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={label}
        selectTextOnFocus
        onFocus={onFocus}
        maxLength={4}
        style={[styles.count, { color: colors.foreground, borderColor: invalid ? colors.destructive : colors.input, backgroundColor: colors.card }]}
        testID={testID}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`More ${label.toLowerCase()}`}
        onPress={() => step(1)}
        style={({ pressed }) => [styles.stepBtn, { borderColor: colors.input, backgroundColor: pressed ? colors.accent : colors.card }]}
        testID={testID ? `${testID}-plus` : undefined}
      >
        <Plus size={18} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

/** The student flag as a colored label (True Education's badge). */
export function FlagBadge({ flag }: { flag: StudentFlag | "" | null | undefined }) {
  const palette = useFlagColors();
  if (!flag)
    return (
      <T variant="small" tone="muted">
        —
      </T>
    );
  const c = palette[flag];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <T variant="tiny" style={{ color: c.fg, fontWeight: "600" }}>
        {FLAG_LABELS[flag]}
      </T>
    </View>
  );
}

/** Homework status as a colored label: done green, partly amber, not done red. */
export function HomeworkBadge({ status }: { status: string }) {
  const palette = useFlagColors();
  const colors = useColors();
  if (!status)
    return (
      <T variant="small" tone="muted">
        —
      </T>
    );
  const s = status.toLowerCase();
  const c = s === "completed" ? palette.on_track : s.includes("partial") ? palette.needs_attention : s === "not done" ? palette.at_risk : { bg: colors.secondary, border: colors.border, fg: colors.mutedForeground };
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <T variant="tiny" style={{ color: c.fg, fontWeight: "600" }}>
        {status}
      </T>
    </View>
  );
}

/** A small labelled value in a tinted box (the Review step and the view's session info). */
export function InfoBlock({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.block, wide ? styles.blockWide : styles.blockHalf, { backgroundColor: colors.cardMuted, borderColor: colors.border }]}>
      <T variant="tiny" tone="muted">
        {label}
      </T>
      {typeof children === "string" || typeof children === "number" ? <T style={styles.blockValue}>{children}</T> : children}
    </View>
  );
}

/** A soft tag (a topic). */
export function Tag({ children, onRemove }: { children: string; onRemove?: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.tag, { backgroundColor: colors.secondary }]}>
      <T variant="small" style={styles.shrink}>
        {children}
      </T>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${children}`} hitSlop={10} onPress={onRemove} style={styles.tagX}>
          <T variant="small" tone="muted" style={{ fontWeight: "700" }}>
            ×
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  banner: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10 },
  bannerIcon: { marginTop: 1 },
  stepTitle: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.lg },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: -space.xs, minHeight: 28 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 42, paddingHorizontal: 15, borderRadius: radius.full, borderWidth: 1 },
  suggestion: { maxWidth: "100%", borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 8 },
  suggestions: { gap: 6 },
  stars: { flexDirection: "row", alignItems: "center" },
  star: { alignItems: "center", justifyContent: "center" },
  starsRead: { flexDirection: "row", gap: 2 },
  starsFill: { position: "absolute", left: 0, top: 0, bottom: 0, overflow: "hidden" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tabular: { fontVariant: ["tabular-nums"] },
  stepper: { flexDirection: "row", alignItems: "center", gap: space.sm },
  stepBtn: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  count: { width: 72, height: 44, borderRadius: radius.md, borderWidth: 1, textAlign: "center", fontSize: 18, fontWeight: "600", fontVariant: ["tabular-nums"], paddingVertical: 0 },
  badge: { alignSelf: "flex-start", borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  block: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, gap: 3 },
  blockHalf: { flexBasis: "47%", flexGrow: 1 },
  blockWide: { flexBasis: "100%" },
  blockValue: { fontSize: 15, fontWeight: "500" },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.md, paddingLeft: 10, paddingRight: 10, paddingVertical: 6, maxWidth: "100%" },
  tagX: { paddingLeft: 2 },
});
