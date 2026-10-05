import { Stack } from "expo-router";
import { largeHeader } from "@/lib/pageHeader";
import { useColors } from "@/theme";

/**
 * Availability is a calendar, so it keeps the standard small title (as the phone's Calendar does) and the plain
 * background behind its months; the rest follows the other tabs' header.
 */
export default function AvailabilityLayout() {
  const colors = useColors();
  return (
    <Stack screenOptions={largeHeader(colors)}>
      <Stack.Screen
        name="index"
        options={{
          title: "Availability",
          headerLargeTitle: false,
          headerStyle: { backgroundColor: colors.background },
          headerLargeStyle: { backgroundColor: colors.background },
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </Stack>
  );
}
