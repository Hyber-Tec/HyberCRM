import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { radius, useColors, useIsDark } from "@/theme";

export type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
type Size = "default" | "lg" | "sm";

/**
 * The website's buttons (web/src/components/ui/button.tsx) at touch sizes: primary, outline, secondary, ghost, the
 * destructive one in its tinted red, and a text link.
 */
export function Button({
  children,
  icon,
  onPress,
  variant = "default",
  size = "default",
  disabled = false,
  busy = false,
  style,
  testID,
  accessibilityLabel,
}: {
  children?: ReactNode;
  icon?: ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: Size;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const dark = useIsDark();
  const bg: Record<ButtonVariant, string> = {
    default: colors.primary,
    outline: dark ? colors.card : colors.background,
    secondary: colors.secondary,
    ghost: "transparent",
    destructive: colors.destructiveTint,
    link: "transparent",
  };
  const fg = buttonForeground(colors, variant);
  const height = size === "lg" ? 52 : size === "sm" ? 36 : 46;
  const off = disabled || busy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        variant === "link"
          ? { height: undefined, paddingHorizontal: 0, paddingVertical: 4 }
          : { height, paddingHorizontal: size === "sm" ? 12 : 18 },
        {
          backgroundColor: bg[variant],
          borderColor: variant === "outline" ? colors.border : "transparent",
          opacity: off ? 0.5 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : icon ? <View>{icon}</View> : null}
      {children !== undefined && children !== null && (
        <Text
          numberOfLines={1}
          style={{ color: fg, fontSize: size === "sm" ? 14 : 16, fontWeight: variant === "link" ? "500" : "600", textDecorationLine: variant === "link" ? "underline" : "none" }}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}

export function buttonForeground(colors: ReturnType<typeof useColors>, variant: ButtonVariant): string {
  return variant === "default" ? colors.primaryForeground : variant === "destructive" ? colors.destructive : colors.foreground;
}

/** The colour a button's icon should take, for icons passed to `Button`. */
export function useButtonForeground(variant: ButtonVariant): string {
  return buttonForeground(useColors(), variant);
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
