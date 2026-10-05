import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { T } from "@/components/Text";
import { radius, useColors } from "@/theme";

export type BadgeTone = "default" | "secondary" | "outline" | "success" | "warning" | "destructive" | "info";

/** A small rounded label, as the website's badges. `bg`/`fg` give it any color (session statuses). */
export function Badge({ children, tone = "secondary", bg, fg, icon, style }: { children: ReactNode; tone?: BadgeTone; bg?: string; fg?: string; icon?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  const palette: Record<BadgeTone, { bg: string; fg: string; border?: string }> = {
    default: { bg: colors.primary, fg: colors.primaryForeground },
    secondary: { bg: colors.secondary, fg: colors.foreground },
    outline: { bg: "transparent", fg: colors.foreground, border: colors.border },
    success: { bg: colors.successTint, fg: colors.success },
    warning: { bg: colors.warningTint, fg: colors.warning },
    destructive: { bg: colors.destructiveTint, fg: colors.destructive },
    info: { bg: colors.infoTint, fg: colors.info },
  };
  const p = palette[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg ?? p.bg, borderColor: p.border ?? "transparent" }, style]}>
      {icon}
      {typeof children === "string" || typeof children === "number" ? (
        <T variant="tiny" style={{ color: fg ?? p.fg, fontWeight: "600" }} numberOfLines={1}>
          {children}
        </T>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: StyleSheet.hairlineWidth },
});
