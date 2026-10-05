import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { CenteredCard } from "@/components/CenteredCard";
import { Loading } from "@/components/Loading";
import { Logo } from "@/components/Logo";
import { T } from "@/components/Text";
import { ToastHost } from "@/components/ToastHost";
import { setupProblem } from "@/lib/env";
import "@/lib/notify";
import { AppearanceProvider } from "@/state/AppearanceProvider";
import { AuthProvider, useAuth } from "@/state/AuthProvider";
import { useColors, useIsDark } from "@/theme";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return (
    <AppearanceProvider>
      <Themed />
    </AppearanceProvider>
  );
}

function Themed() {
  const colors = useColors();
  const dark = useIsDark();
  const base = dark ? DarkTheme : DefaultTheme;
  const theme: Theme = {
    ...base,
    colors: { ...base.colors, background: colors.background, card: colors.background, text: colors.foreground, border: colors.border, primary: colors.foreground },
  };
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemeProvider value={theme}>
        {/* An iPhone's status bar follows the appearance by itself; Android's icons need one. */}
        {Platform.OS === "android" && <StatusBar style={dark ? "light" : "dark"} />}
        {setupProblem ? (
          <SetupProblem />
        ) : (
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        )}
        <ToastHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

type Gate = "loading" | "signed-out" | "verify" | "app";

/** Where the person belongs: signed out, a password account still to confirm its email, or the app. */
function RootNavigator() {
  const auth = useAuth();
  const gate: Gate = auth.loading ? "loading" : !auth.user ? "signed-out" : auth.needsVerification ? "verify" : "app";
  // Our own loading screen looks like the launch screen, so it can take over from it at once.
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  if (gate === "loading") return <Loading label="Signing you in" />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={gate === "signed-out"}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="forgot-password" options={{ animation: "slide_from_right" }} />
      </Stack.Protected>
      <Stack.Protected guard={gate === "verify"}>
        <Stack.Screen name="verify-email" />
      </Stack.Protected>
      <Stack.Protected guard={gate === "app"}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

function SetupProblem() {
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  return (
    <CenteredCard testID="setup-problem">
      <Logo size={56} />
      <T variant="heading">This build can&apos;t connect</T>
      <T tone="muted">{setupProblem}</T>
    </CenteredCard>
  );
}
