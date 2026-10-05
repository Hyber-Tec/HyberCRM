import type { NativeStackNavigationOptions } from "expo-router";
import type { Colors } from "@/theme";

/**
 * A tab's header, as the phone's own apps: a large title that shrinks into the bar as the page scrolls, on the
 * grouped background. Sub-pages (Profile → Account) use the standard small title.
 */
export function largeHeader(colors: Colors): NativeStackNavigationOptions {
  return {
    headerLargeTitle: true,
    headerLargeTitleShadowVisible: false,
    headerShadowVisible: false,
    headerTransparent: false,
    headerStyle: { backgroundColor: colors.grouped },
    headerLargeStyle: { backgroundColor: colors.grouped },
    headerTintColor: colors.foreground,
    headerBackButtonDisplayMode: "minimal",
    contentStyle: { backgroundColor: colors.grouped },
  };
}
