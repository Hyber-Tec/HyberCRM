import { CircleAlert, CircleCheck, Info } from "lucide-react-native";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast, type Toast } from "@/lib/toast";
import { radius, space, useColors } from "@/theme";

/**
 * The layers a toast can show on, bottom to top: the app, then each screen or dialog presented over it (a sheet, a
 * dialog), which the phone draws above everything before it, toasts included. Each layer has a ToastHost; the one
 * mounted last is on top and shows the toast.
 */
let layers: string[] = [];
const layerListeners = new Set<() => void>();
const topLayer = () => layers[layers.length - 1] ?? null;
const subscribeLayers = (listener: () => void) => {
  layerListeners.add(listener);
  return () => {
    layerListeners.delete(listener);
  };
};
const setLayers = (next: string[]) => {
  layers = next;
  layerListeners.forEach((l) => l());
};

/** Shows the newest toast under the status bar, on the topmost layer; tap it to close it (or to open what it's about). */
export function ToastHost() {
  const layer = useId();
  const onTop = useSyncExternalStore(subscribeLayers, topLayer) === layer;
  const [items, setItems] = useState<Toast[]>([]);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    setLayers([...layers, layer]);
    return () => setLayers(layers.filter((l) => l !== layer));
  }, [layer]);
  useEffect(() => toast.subscribe(setItems), []);
  const current = onTop ? items[0] : undefined;
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => toast.dismiss(current.id), current.duration);
    return () => clearTimeout(timer);
  }, [current]);
  if (!current) return null;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + space.sm, paddingHorizontal: space.md }]}>
      <ToastCard key={current.id} item={current} />
    </View>
  );
}

function ToastCard({ item }: { item: Toast }) {
  const colors = useColors();
  const Icon = item.kind === "error" ? CircleAlert : item.kind === "success" ? CircleCheck : Info;
  const tint = item.kind === "error" ? colors.destructive : item.kind === "success" ? colors.success : colors.mutedForeground;
  return (
    <Animated.View entering={FadeInUp.duration(180)} exiting={FadeOutUp.duration(150)}>
      <Pressable
        testID="toast"
        accessibilityRole="alert"
        onPress={() => {
          toast.dismiss(item.id);
          item.onPress?.();
        }}
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: "#000" }]}
      >
        <Icon size={20} color={tint} style={styles.icon} />
        <View style={styles.body}>
          <Text style={[styles.title, { color: colors.foreground }]}>{item.title}</Text>
          {item.description ? <Text style={[styles.description, { color: colors.mutedForeground }]}>{item.description}</Text> : null}
        </View>
        {item.action && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              toast.dismiss(item.id);
              item.action!.onPress();
            }}
            style={[styles.action, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: colors.primaryForeground, fontWeight: "600", fontSize: 14 }}>{item.action.label}</Text>
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  icon: { alignSelf: "flex-start", marginTop: 1 },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: "600" },
  description: { fontSize: 13 },
  action: { borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 7 },
});
