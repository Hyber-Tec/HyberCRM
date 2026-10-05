import { Stack } from "expo-router";
import { largeHeader } from "@/lib/pageHeader";
import { useColors } from "@/theme";

/** A post opened from a push or a link still has the News list under it, so back always leads there. */
export const unstable_settings = { anchor: "index" };

export default function NewsLayout() {
  const colors = useColors();
  return (
    <Stack screenOptions={largeHeader(colors)}>
      <Stack.Screen name="index" options={{ title: "News" }} />
      {/* A post reads on the plain page background, as an article does. */}
      <Stack.Screen
        name="[id]"
        options={{
          title: "",
          headerLargeTitle: false,
          headerStyle: { backgroundColor: colors.background },
          headerLargeStyle: { backgroundColor: colors.background },
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </Stack>
  );
}
