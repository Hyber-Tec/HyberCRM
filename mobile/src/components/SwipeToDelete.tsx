import * as Haptics from "expo-haptics";
import { Trash2 } from "lucide-react-native";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { PanResponder, type PanResponderGestureState, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useColors } from "@/theme";

/** How wide the Delete button is once the row stays open. */
const ACTION = 88;
/** Past this share of the row's width, letting go deletes at once (the phone's own lists do the same). */
const LONG_SWIPE = 0.55;
const SPRING = { damping: 26, stiffness: 260, mass: 0.9 };

/** Only one row stays open at a time: opening one closes the last. */
let openRow: { token: object; close: () => void } | null = null;

/** Closes whichever row was left open (a list calls it when it starts scrolling). */
export function closeSwipedRow(): void {
  openRow?.close();
  openRow = null;
}

function rowOpened(token: object, close: () => void): void {
  if (openRow && openRow.token !== token) openRow.close();
  openRow = { token, close };
}

function rowGone(token: object): void {
  if (openRow?.token === token) openRow = null;
}

/** A drag that is mostly sideways (and not a tap): the row's, not the list's. */
const sideways = (g: PanResponderGestureState) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4;

/**
 * A row that swipes left to show Delete, as the phone's own lists: a short swipe leaves the button showing (tap it to
 * delete), a long one deletes at once, and the row folds away. Tapping an open row closes it. Screen readers get
 * Delete as an action of the row.
 *
 * Built on React Native's own touch handling rather than the gesture library, so it also works on screens presented
 * over the app (the notifications inbox), where the library's gestures don't reach.
 */
export function SwipeToDelete({
  children,
  onPress,
  onDelete,
  accessibilityLabel,
  deleteLabel = "Delete",
  style,
  testID,
}: {
  children: ReactNode;
  onPress?: () => void;
  onDelete: () => void;
  accessibilityLabel?: string;
  deleteLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const colors = useColors();
  const x = useSharedValue(0);
  const rowHeight = useSharedValue(0);
  /** -1 while the row has its own height; the folding height once it is being deleted. */
  const folding = useSharedValue(-1);
  const [open, setOpen] = useState(false);
  const [token] = useState(() => ({}));
  const width = useRef(0);
  const drag = useRef({ start: 0, armed: false });

  const close = () => {
    x.value = withSpring(0, SPRING);
    setOpen(false);
  };
  const removed = () => {
    rowGone(token);
    onDelete();
  };
  /** Slides the row out, folds it away, then deletes. */
  const deleteNow = () => {
    x.value = withTiming(-Math.max(width.current, ACTION), { duration: 180 }, (done) => {
      if (!done) return;
      folding.value = rowHeight.value;
      folding.value = withTiming(0, { duration: 180 }, (finished) => {
        if (finished) scheduleOnRN(removed);
      });
    });
  };
  /** Where a drag ends up when let go: deleted (a long or fast swipe), open on Delete, or closed. */
  const settle = (dx: number, vx: number, mayDelete: boolean) => {
    const at = Math.min(0, drag.current.start + dx);
    const armed = drag.current.armed;
    drag.current.armed = false;
    if (mayDelete && (armed || (vx < -1.2 && at < -ACTION))) {
      deleteNow();
    } else if (at < -ACTION / 2 || (vx < -0.4 && at < 0)) {
      x.value = withSpring(-ACTION, SPRING);
      rowOpened(token, close);
      setOpen(true);
    } else {
      close();
    }
  };

  // The responder is made once; it reaches the latest render's functions through this ref.
  const latest = useRef({ settle, x });
  useEffect(() => {
    latest.current = { settle, x };
  });
  useEffect(() => () => rowGone(token), [token]);

  // The refs are read only inside the responder's callbacks (touch events), never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      // A tap stays with the row's button; a sideways drag is taken from it.
      onMoveShouldSetPanResponderCapture: (_, g) => sideways(g),
      onMoveShouldSetPanResponder: (_, g) => sideways(g),
      onPanResponderGrant: () => {
        drag.current.start = latest.current.x.value;
        drag.current.armed = false;
      },
      onPanResponderMove: (_, g) => {
        const next = Math.max(-width.current, Math.min(0, drag.current.start + g.dx));
        latest.current.x.value = next;
        const long = next < -width.current * LONG_SWIPE;
        if (long !== drag.current.armed) {
          drag.current.armed = long;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        }
      },
      onPanResponderRelease: (_, g) => latest.current.settle(g.dx, g.vx, true),
      onPanResponderTerminate: (_, g) => latest.current.settle(g.dx, 0, false),
      // Once the row moves, the list doesn't take the drag back (and doesn't scroll meanwhile).
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
  );

  const rowStyle = useAnimatedStyle(() => (folding.value >= 0 ? { height: folding.value, opacity: interpolate(folding.value, [0, rowHeight.value || 1], [0, 1]) } : {}));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const actionStyle = useAnimatedStyle(() => ({ width: Math.max(ACTION, -x.value) }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: interpolate(-x.value, [0, ACTION * 0.6, ACTION], [0, 0.4, 1], "clamp") }));

  return (
    // The whole row takes sideways drags, also one that starts on the Delete button of an open row.
    <Animated.View
      style={[styles.clip, rowStyle, style]}
      {...responder.panHandlers}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width;
        if (folding.get() < 0) rowHeight.set(e.nativeEvent.layout.height);
      }}
    >
      {/* Behind a closed row the button is out of reach, so screen readers skip it (the row has Delete as an action). */}
      <Animated.View
        style={[styles.action, { backgroundColor: colors.destructive }, actionStyle]}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? "auto" : "no-hide-descendants"}
      >
        <Pressable onPress={deleteNow} accessibilityRole="button" accessibilityLabel={deleteLabel} testID={testID ? `${testID}-delete` : undefined} style={styles.actionButton}>
          <Animated.View style={[styles.actionLabel, labelStyle]}>
            <Trash2 size={18} color="#ffffff" />
            <Text style={styles.actionText}>{deleteLabel}</Text>
          </Animated.View>
        </Pressable>
      </Animated.View>
      <Animated.View style={contentStyle}>
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityActions={[{ name: "delete", label: deleteLabel }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "delete") deleteNow();
          }}
          onPress={() => (open ? close() : onPress?.())}
          style={({ pressed }) => [{ backgroundColor: pressed && !open ? colors.accent : colors.card }]}
        >
          {children}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  action: { position: "absolute", top: 0, bottom: 0, right: 0 },
  actionButton: { flex: 1, alignItems: "center", justifyContent: "center" },
  actionLabel: { alignItems: "center", gap: 2, width: ACTION },
  actionText: { color: "#ffffff", fontSize: 13, fontWeight: "600" },
});
