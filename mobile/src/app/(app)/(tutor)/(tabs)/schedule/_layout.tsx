import { Stack } from "expo-router";
import { largeHeader } from "@/lib/pageHeader";
import { useColors } from "@/theme";

/** The Schedule tab: a standard title, so the week strip under it stays in place while the days scroll. */
export default function ScheduleLayout() {
  const colors = useColors();
  return (
    <Stack screenOptions={largeHeader(colors)}>
      <Stack.Screen name="index" options={{ title: "Schedule", headerLargeTitle: false }} />
    </Stack>
  );
}
