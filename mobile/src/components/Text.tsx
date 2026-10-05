import { Text as RNText, type TextProps } from "react-native";
import { type, useColors, type Colors } from "@/theme";

type Variant = keyof typeof type;
export type Tone = "default" | "muted" | "destructive" | "success" | "warning" | "info" | "inverse";

export const toneColor = (colors: Colors, tone: Tone): string =>
  tone === "muted"
    ? colors.mutedForeground
    : tone === "destructive"
      ? colors.destructive
      : tone === "success"
        ? colors.success
        : tone === "warning"
          ? colors.warning
          : tone === "info"
            ? colors.info
            : tone === "inverse"
              ? colors.primaryForeground
              : colors.foreground;

/** Text in one of the app's type sizes and tones. */
export function T({ variant = "body", tone = "default", style, ...props }: TextProps & { variant?: Variant; tone?: Tone }) {
  const colors = useColors();
  return <RNText {...props} style={[type[variant], { color: toneColor(colors, tone) }, style]} />;
}
