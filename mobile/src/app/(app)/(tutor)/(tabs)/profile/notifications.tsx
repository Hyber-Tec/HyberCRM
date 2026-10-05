import type { NotificationPrefs } from "@shared/types";
import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { AppState, Linking, StyleSheet, View } from "react-native";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ListRow, ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { NOTIFICATION_PREFS, prefsOf, setNotificationPref } from "@/features/profile/api";
import { SwitchRow } from "@/features/profile/SwitchRow";
import { errorMessage } from "@/lib/api";
import { type PermissionState, notificationPermission, requestNotificationPermission } from "@/lib/notify";
import { currentPushToken, onPushTokenChange, registerThisDevice } from "@/lib/push";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { space } from "@/theme";

const PERMISSION_TEXT: Record<PermissionState, { badge: string; tone: "success" | "secondary" | "warning"; text: string }> = {
  granted: { badge: "On", tone: "success", text: "Alerts reach this phone, even when the app is closed." },
  prompt: { badge: "Off", tone: "secondary", text: "Turn them on to hear about session changes and news on this phone." },
  denied: { badge: "Blocked", tone: "warning", text: "Notifications are turned off for this app in your phone’s settings." },
  unsupported: { badge: "Unavailable", tone: "secondary", text: "This phone can’t show notifications." },
};

/** Allowed, but no token: a simulator or a personal-team build never gets one; a phone gets one once it's online. */
const NO_TOKEN = { badge: "Allowed", tone: "secondary" as const, text: "Allowed, but not reachable yet: check the connection." };

/**
 * Notifications (True Education's mobile Settings, made native): whether this phone may show them, with the right
 * way to turn them on, and the four switches that decide what reaches the inbox and the phone, saved at once.
 */
export default function NotificationSettingsScreen() {
  const { branchId, actor, staffId, staff, name, settings } = useBranch();
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<Partial<NotificationPrefs>>({});

  // The answer can change in the phone's Settings: read it again whenever the app comes back.
  useEffect(() => {
    const read = () => void notificationPermission().then(setPermission);
    read();
    const sub = AppState.addEventListener("change", (s) => s === "active" && read());
    return () => sub.remove();
  }, []);
  // The token can come after the permission (the phone's registration with Apple, a slow connection): ask again
  // whenever the app comes back, keep the last one through a failed try, and take a new one when Firebase replaces it.
  useEffect(() => {
    if (permission !== "granted") return;
    let live = true;
    const read = () => void currentPushToken().then((t) => live && setToken((last) => t ?? last ?? null));
    read();
    const sub = AppState.addEventListener("change", (s) => s === "active" && read());
    const off = onPushTokenChange((t) => live && setToken(t));
    return () => {
      live = false;
      sub.remove();
      off();
    };
  }, [permission]);

  const turnOn = async () => {
    setBusy(true);
    try {
      const p = await requestNotificationPermission();
      setPermission(p);
      if (p === "granted") {
        await registerThisDevice(true);
        toast.success("Notifications are on");
      }
    } finally {
      setBusy(false);
    }
  };

  const saved = prefsOf(staff);
  const prefs: NotificationPrefs = { ...saved, ...saving };
  const flip = async (key: keyof NotificationPrefs, on: boolean) => {
    if (!staffId) return;
    setSaving((s) => ({ ...s, [key]: on }));
    try {
      await setNotificationPref(branchId, actor, staffId, staff?.name || actor.name, saved, key, on);
    } catch (e) {
      toast.error("Couldn’t save that change", { description: errorMessage(e) });
    } finally {
      setSaving((s) => {
        const next = { ...s };
        delete next[key];
        return next;
      });
    }
  };

  // Allowed, but a simulator or a build without the push capability gets no token: say so rather than promise alerts.
  const noToken = permission === "granted" && token === null;
  const state = permission ? (noToken ? NO_TOKEN : PERMISSION_TEXT[permission]) : null;
  const hours = settings.notifications.sessionChangeWindowHours;

  return (
    <Screen testID="notification-settings-screen">
      <ListSection title="This phone">
        <ListRow
          title="Push notifications"
          subtitle={state?.text ?? " "}
          right={state ? <Badge tone={state.tone}>{state.badge}</Badge> : undefined}
          testID="push-permission"
        />
      </ListSection>
      {permission === "prompt" ? (
        <Button size="lg" busy={busy} onPress={() => void turnOn()} testID="push-turn-on">
          Turn on notifications
        </Button>
      ) : permission === "denied" ? (
        <View style={styles.gap}>
          <Button size="lg" variant="outline" onPress={() => void Linking.openSettings()} testID="push-open-settings">
            Open Settings
          </Button>
          <T variant="small" tone="muted" style={styles.hint}>
            In Settings, choose Notifications and allow them, then come back.
          </T>
        </View>
      ) : null}

      <ListSection
        title="Notify me about"
        footer={`These switches decide what reaches your inbox and your phone. Session alerts are sent for sessions starting within ${hours} hours of the change.`}
      >
        {NOTIFICATION_PREFS.map((p) => (
          <SwitchRow
            key={p.key}
            title={p.label}
            subtitle={p.key === "announcements" ? `New posts and updates from ${name}` : p.description}
            value={prefs[p.key]}
            onChange={(on) => void flip(p.key, on)}
            disabled={!staffId}
            testID={`pref-${p.key}`}
          />
        ))}
      </ListSection>

      {permission === "granted" && token ? (
        <ListSection title="Device" footer="For support: tap to copy this phone’s notification address.">
          <ListRow
            title="Push token"
            subtitle={`${token.slice(0, 24)}…`}
            onPress={() => {
              void Clipboard.setStringAsync(token).then(() => toast.success("Copied"));
            }}
            chevron={false}
            testID="push-token"
          />
        </ListSection>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.sm },
  hint: { paddingHorizontal: space.xs, textAlign: "center" },
});
