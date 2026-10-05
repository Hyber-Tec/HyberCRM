import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useNews } from "@/features/news/api";
import { useColors } from "@/theme";

/**
 * The tutor's five tabs (owner, 2026-10-04): Today, Schedule, Availability, News and Profile. News carries the unread
 * count, as True Education's tab did. Android shows every tab's name (its default shows only the selected one) and the
 * same pictures as the iPhone: a sun, a calendar, a clock, a megaphone and a person.
 */
export default function TutorTabs() {
  const colors = useColors();
  const { unread } = useNews();
  return (
    <NativeTabs tintColor={colors.foreground} labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index" testID="tab-today">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "sun.max", selected: "sun.max.fill" }} md="light_mode" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="schedule" testID="tab-schedule">
        <NativeTabs.Trigger.Label>Schedule</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "calendar", selected: "calendar" }} md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="availability" testID="tab-availability">
        <NativeTabs.Trigger.Label>Availability</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "clock", selected: "clock.fill" }} md="schedule" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="news" testID="tab-news">
        <NativeTabs.Trigger.Label>News</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "megaphone", selected: "megaphone.fill" }} md="campaign" />
        {unread > 0 ? <NativeTabs.Trigger.Badge>{unread > 99 ? "99+" : String(unread)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" testID="tab-profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
