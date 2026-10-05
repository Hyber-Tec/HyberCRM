import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ToastHost } from "@/components/ToastHost";
import { radius, space, useColors } from "@/theme";

/**
 * A card over the dimmed app, as the website's dialogs. Closing it is up to its buttons, which go in `footer`: they
 * stay in sight while what is above them scrolls when it does not fit.
 */
export function Dialog({ open, onRequestClose, children, footer, testID }: { open: boolean; onRequestClose?: () => void; children: ReactNode; footer?: ReactNode; testID?: string }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onRequestClose}>
      <KeyboardAvoidingView style={[styles.overlay, { backgroundColor: colors.overlay, paddingTop: Math.max(insets.top, space.xl), paddingBottom: Math.max(insets.bottom, space.xl) }]} behavior="padding">
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID={testID}>
          <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, !!footer && styles.aboveFooter]} keyboardShouldPersistTaps="handled" bounces={false}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
      <ToastHost />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", paddingHorizontal: space.xl },
  card: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, maxWidth: 440, maxHeight: "100%", width: "100%", alignSelf: "center", overflow: "hidden" },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { padding: space.xl, gap: space.md },
  aboveFooter: { paddingBottom: space.md },
  footer: { paddingHorizontal: space.xl, paddingBottom: space.xl, gap: space.md },
});
