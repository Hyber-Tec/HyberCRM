import { PASSWORD_STRENGTH_LABELS, passwordStrength } from "@shared/auth";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Logo } from "@/components/Logo";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";

/** The top of every sign-in screen: the mark, a title and a line under it. */
export function AuthHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <View style={styles.head}>
      <Logo size={56} />
      <T variant="title" style={styles.center}>
        {title}
      </T>
      {subtitle ? (
        typeof subtitle === "string" ? (
          <T tone="muted" style={styles.center}>
            {subtitle}
          </T>
        ) : (
          subtitle
        )
      ) : null}
    </View>
  );
}

/** "or" between Google and the email form. */
export function OrDivider({ label = "or" }: { label?: string }) {
  const colors = useColors();
  return (
    <View style={styles.divider}>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
      <T variant="small" tone="muted">
        {label}
      </T>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
    </View>
  );
}

const STRENGTH = ["#d4d4d4", "#ef4444", "#f59e0b", "#10b981", "#059669"];

/** Four bars and a word under a new password. */
export function StrengthMeter({ password }: { password: string }) {
  const colors = useColors();
  if (!password) return null;
  const s = passwordStrength(password);
  return (
    <View style={styles.meter} accessibilityLabel={`Password strength: ${PASSWORD_STRENGTH_LABELS[s]}`}>
      <View style={styles.bars}>
        {[1, 2, 3, 4].map((n) => (
          <View key={n} style={[styles.bar, { backgroundColor: n <= s ? STRENGTH[s] : colors.secondary }]} />
        ))}
      </View>
      <T variant="tiny" tone="muted" style={styles.meterLabel}>
        {PASSWORD_STRENGTH_LABELS[s]}
      </T>
    </View>
  );
}

/** A tinted box with an error in words. */
export function ErrorBox({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.error, { backgroundColor: colors.destructiveTint }]} accessibilityRole="alert">
      <T variant="small" tone="destructive">
        {children}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center", gap: space.sm, marginBottom: space.md },
  center: { textAlign: "center" },
  divider: { flexDirection: "row", alignItems: "center", gap: space.md, marginVertical: space.xs },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  meter: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: -space.xs },
  bars: { flex: 1, flexDirection: "row", gap: 4 },
  bar: { flex: 1, height: 4, borderRadius: radius.full },
  meterLabel: { width: 64, textAlign: "right" },
  error: { borderRadius: radius.md, padding: space.md },
});
