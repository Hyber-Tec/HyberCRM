import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NotificationsProvider } from "@/state/NotificationsProvider";
import { useColors } from "@/theme";

/**
 * The tutor portal: five tabs, and the screens that open over them (a session, its log, the notifications inbox, a
 * day's availability). Notifications are live everywhere in it.
 */
export default function TutorLayout() {
  const colors = useColors();
  return (
    <NotificationsProvider>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
        // A screen the phone presents over the app (a sheet, a modal) is outside the root's gesture handling: each gets
        // its own root, so swipes and other gestures work in it too.
        screenLayout={({ route, children }) => (route.name === "(tabs)" ? children : <GestureHandlerRootView style={{ flex: 1 }}>{children}</GestureHandlerRootView>)}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="session/[id]"
          options={{ presentation: "formSheet", sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 24, contentStyle: { backgroundColor: colors.background } }}
        />
        <Stack.Screen name="availability-day" options={{ presentation: "formSheet", sheetAllowedDetents: "fitToContents", sheetGrabberVisible: true, sheetCornerRadius: 24, contentStyle: { backgroundColor: colors.background } }} />
        <Stack.Screen name="notifications" options={{ presentation: "modal" }} />
        <Stack.Screen name="log/[id]" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
        <Stack.Screen name="log-view/[id]" options={{ presentation: "modal" }} />
      </Stack>
    </NotificationsProvider>
  );
}
