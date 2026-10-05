import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { useColors } from "@/theme";

/** "Maya Thompson" → "MT". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}

/** A round picture, or the person's initials on a tint. */
export function Avatar({ name, url, size = 40, color }: { name: string; url?: string | null; size?: number; color?: string | null }) {
  const colors = useColors();
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (url) return <Image source={{ uri: url }} style={[style, { backgroundColor: colors.secondary }]} contentFit="cover" accessibilityLabel={name} />;
  return (
    <View style={[style, styles.center, { backgroundColor: color ? `${color}26` : colors.secondary }]} accessibilityLabel={name}>
      <T style={{ fontSize: size * 0.38, fontWeight: "600", color: color ?? colors.foreground }}>{initials(name)}</T>
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: "center", justifyContent: "center" } });
