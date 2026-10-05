import { useEffect, useRef, type ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { space, useColors } from "@/theme";

/** The sign-in and account pages: one column in the middle, the keyboard kept out of the way. */
export function CenteredCard({ children, testID }: { children: ReactNode; testID?: string }) {
  const colors = useColors();
  // With the keyboard up, the end of the form (the button that sends what was typed) stays in sight.
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => scroll.current?.scrollToEnd({ animated: true }));
    return () => sub.remove();
  }, []);
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      {/* On both platforms: Android draws edge to edge, so the keyboard no longer resizes the window. */}
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <ScrollView ref={scroll} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" testID={testID}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: space.xl, gap: space.lg, maxWidth: 480, width: "100%", alignSelf: "center" },
});
