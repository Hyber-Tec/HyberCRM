import { Stack } from "expo-router";
import { largeHeader } from "@/lib/pageHeader";
import { useColors } from "@/theme";

export default function ProfileLayout() {
  const colors = useColors();
  const sub = { headerLargeTitle: false } as const;
  return (
    <Stack screenOptions={largeHeader(colors)}>
      <Stack.Screen name="index" options={{ title: "Profile" }} />
      <Stack.Screen name="account" options={{ ...sub, title: "Account details" }} />
      <Stack.Screen name="subjects/index" options={{ ...sub, title: "My subjects" }} />
      <Stack.Screen name="subjects/[category]" options={{ ...sub, title: "Subjects" }} />
      <Stack.Screen name="payroll" options={{ ...sub, title: "Payroll history" }} />
      <Stack.Screen name="notifications" options={{ ...sub, title: "Notifications" }} />
      <Stack.Screen name="settings" options={{ ...sub, title: "Settings" }} />
      <Stack.Screen name="password" options={{ ...sub, title: "Password" }} />
      <Stack.Screen name="delete-account" options={{ ...sub, title: "Delete my account" }} />
    </Stack>
  );
}
