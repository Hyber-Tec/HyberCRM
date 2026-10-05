import type { SessionStatus } from "@shared/settings/defaults";
import { useColorScheme, type TextStyle } from "react-native";

/**
 * The website's palette (web/src/styles/theme.css: shadcn's neutral), in the phone's light and dark appearance, plus
 * the grouped background of a phone's own list screens. The appearance follows the phone unless the person picked
 * one in Profile → Settings (src/state/AppearanceProvider.tsx), which sets it for the whole app.
 */
const light = {
  background: "#ffffff",
  /** Behind grouped cards and lists, as the phone's own Settings. */
  grouped: "#f5f5f5",
  foreground: "#0a0a0a",
  card: "#ffffff",
  /** A quieter surface inside a card (an inset row, a chip). */
  cardMuted: "#fafafa",
  primary: "#171717",
  primaryForeground: "#fafafa",
  secondary: "#f5f5f5",
  muted: "#f5f5f5",
  mutedForeground: "#737373",
  /** A row while it's pressed. */
  accent: "#efefef",
  destructive: "#e7000b",
  destructiveTint: "#e7000b14",
  border: "#e5e5e5",
  input: "#e5e5e5",
  ring: "#a1a1a1",
  success: "#16a34a",
  successTint: "#16a34a17",
  warning: "#d97706",
  warningTint: "#f59e0b1f",
  info: "#2563eb",
  infoTint: "#2563eb14",
  overlay: "#00000066",
  /** The schedule's "now" line and today's mark. */
  now: "#ef4444",
};

const dark: typeof light = {
  background: "#0a0a0a",
  grouped: "#0a0a0a",
  foreground: "#fafafa",
  card: "#171717",
  cardMuted: "#1f1f1f",
  primary: "#e5e5e5",
  primaryForeground: "#171717",
  secondary: "#262626",
  muted: "#262626",
  mutedForeground: "#a1a1a1",
  accent: "#2a2a2a",
  destructive: "#ff6467",
  destructiveTint: "#ff646726",
  border: "#ffffff1a",
  input: "#ffffff26",
  ring: "#737373",
  success: "#4ade80",
  successTint: "#22c55e26",
  warning: "#fbbf24",
  warningTint: "#f59e0b29",
  info: "#60a5fa",
  infoTint: "#3b82f62e",
  overlay: "#000000a6",
  now: "#f87171",
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

export const useIsDark = (): boolean => useColorScheme() === "dark";

/**
 * Session status colors: the website's softer card colors (web/src/features/schedule/cardStyle.ts), and in dark mode
 * the same hues as tints. `bar` is the strong color (dots, the card's edge).
 */
const STATUS_LIGHT: Record<SessionStatus, { bg: string; border: string; bar: string; text: string }> = {
  pending: { bg: "#FEF9C3", border: "#FDE68A", bar: "#EAB308", text: "#854D0E" },
  confirmed: { bg: "#DCFCE7", border: "#BBF7D0", bar: "#22C55E", text: "#166534" },
  present: { bg: "#DBEAFE", border: "#BFDBFE", bar: "#3B82F6", text: "#1E40AF" },
  no_show: { bg: "#F4F4F5", border: "#E4E4E7", bar: "#A1A1AA", text: "#52525B" },
  canceled: { bg: "#FEE2E2", border: "#FECACA", bar: "#EF4444", text: "#991B1B" },
};

const STATUS_DARK: typeof STATUS_LIGHT = {
  pending: { bg: "#eab30824", border: "#eab30840", bar: "#EAB308", text: "#fde68a" },
  confirmed: { bg: "#22c55e24", border: "#22c55e40", bar: "#22C55E", text: "#bbf7d0" },
  present: { bg: "#3b82f62b", border: "#3b82f64d", bar: "#3B82F6", text: "#bfdbfe" },
  no_show: { bg: "#a1a1aa1f", border: "#a1a1aa38", bar: "#A1A1AA", text: "#d4d4d8" },
  canceled: { bg: "#ef444424", border: "#ef444440", bar: "#EF4444", text: "#fecaca" },
};

export function useStatusColors(): typeof STATUS_LIGHT {
  return useColorScheme() === "dark" ? STATUS_DARK : STATUS_LIGHT;
}

export const radius = { sm: 6, md: 10, lg: 14, xl: 20, full: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Type sizes: the phone's system font, at the website's weights. */
export const type = {
  display: { fontSize: 32, fontWeight: "700", letterSpacing: -0.6 },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.4 },
  heading: { fontSize: 20, fontWeight: "600", letterSpacing: -0.2 },
  subheading: { fontSize: 17, fontWeight: "600" },
  label: { fontSize: 15, fontWeight: "600" },
  body: { fontSize: 15, fontWeight: "400" },
  small: { fontSize: 13, fontWeight: "400" },
  tiny: { fontSize: 11, fontWeight: "500" },
  stat: { fontSize: 26, fontWeight: "600", fontVariant: ["tabular-nums"] },
} satisfies Record<string, TextStyle>;
