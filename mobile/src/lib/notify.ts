import { PUSH_CHANNELS } from "@shared/push";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type PermissionState = "granted" | "prompt" | "denied" | "unsupported";

/** A notification the server pushed, rather than one the phone made. */
export const isPush = (trigger: Notifications.NotificationTrigger | null | undefined): boolean => !!trigger && "type" in trigger && trigger.type === "push";

// While Hyber CRM is open, a push from the server isn't shown as a banner: the app says the same in a toast (the
// inbox listener, src/state/NotificationsProvider.tsx), which can open what it's about.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const show = !isPush(n.request.trigger);
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
  },
});

if (Platform.OS === "android") {
  // The channels a push names (shared/src/push.ts); people can mute either in the phone's settings.
  for (const c of Object.values(PUSH_CHANNELS)) {
    void Notifications.setNotificationChannelAsync(c.id, { name: c.name, description: c.description, importance: Notifications.AndroidImportance.HIGH, lightColor: "#171717" }).catch(() => undefined);
  }
}

/** The phone's answer for notifications. */
export async function notificationPermission(): Promise<PermissionState> {
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted ? "granted" : p.canAskAgain ? "prompt" : "denied";
  } catch {
    return "unsupported";
  }
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  try {
    const p = await Notifications.requestPermissionsAsync();
    return p.granted ? "granted" : p.canAskAgain ? "prompt" : "denied";
  } catch {
    return "unsupported";
  }
}

/** The number on the app's icon (iPhone; most Android launchers show a dot). */
export async function setAppBadge(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(Math.max(0, count)).catch(() => undefined);
}
