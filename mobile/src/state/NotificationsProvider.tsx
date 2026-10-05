import { getInitialNotification, getMessaging, onMessage, onNotificationOpenedApp, type RemoteMessage } from "@react-native-firebase/messaging";
import { useSegments } from "expo-router";
import { useEffect, useEffectEvent, type ReactNode } from "react";
import { AppState } from "react-native";
import { markNotificationRead, useInbox } from "@/features/notifications/api";
import { setAppBadge } from "@/lib/notify";
import { onPushTokenChange, registerThisDevice } from "@/lib/push";
import { firstTap, openNotice, type PushOpen, pushOpenOf, setCurrentSegments, setPendingOpen, takePendingOpen } from "@/lib/targets";
import { toast } from "@/lib/toast";
import { useAccess } from "./AccessProvider";
import { useBranch } from "./BranchProvider";

/**
 * What the server tells the person, wherever they are in the app:
 * - this phone's push token, kept on their record (again when the app comes back to the front, and when Firebase
 *   replaces it), so session changes and announcements reach the phone with the app closed;
 * - a push that arrives while the app is open becomes a toast (tap it to open what it's about);
 * - tapping a notification opens its screen and marks it read, also when it started the app (once signed in and the
 *   center is open) and when it is about another of the person's centers (the app switches to it first);
 * - the app icon's badge is the unread inbox count.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { branchId } = useBranch();
  const access = useAccess();
  const inbox = useInbox();
  const segments = useSegments();

  useEffect(() => {
    setCurrentSegments(segments);
  }, [segments]);

  useEffect(() => {
    void registerThisDevice();
    const sub = AppState.addEventListener("change", (s) => s === "active" && void registerThisDevice());
    const off = onPushTokenChange(() => void registerThisDevice(true));
    return () => {
      sub.remove();
      off();
    };
  }, []);

  // The badge follows the inbox once it is known (not 0 while it loads), and goes when the person leaves the center.
  useEffect(() => {
    if (!inbox.loading && !inbox.error) void setAppBadge(inbox.unread);
  }, [inbox.loading, inbox.error, inbox.unread]);
  useEffect(() => () => void setAppBadge(0), []);

  /** Opens what a tapped notification is about, in its center. */
  const open = useEffectEvent((push: PushOpen) => {
    if (push.branchId && push.branchId !== branchId) {
      const there = access.memberships.some((m) => m.branchId === push.branchId && m.member.status === "active");
      if (!there) return;
      // The other center opens first; this provider comes back for it and opens the screen (takePendingOpen).
      setPendingOpen(push);
      access.choose(push.branchId);
      return;
    }
    if (push.notificationId) void markNotificationRead(branchId, push.notificationId);
    openNotice(push.type, push.link, push.refs);
  });

  /** A push that arrives while the app is open: a toast that opens it (naming the center when it is another one). */
  const arrived = useEffectEvent((msg: RemoteMessage) => {
    const push = pushOpenOf(msg.data);
    const elsewhere = push?.branchId && push.branchId !== branchId ? access.memberships.find((m) => m.branchId === push.branchId) : null;
    const center = elsewhere ? (elsewhere.profile?.name ?? elsewhere.branchId) : null;
    const body = msg.notification?.body;
    toast.info(msg.notification?.title ?? "New notification", {
      description: center ? [body, center].filter(Boolean).join(" · ") : body,
      duration: 7000,
      onPress: push ? () => open(push) : undefined,
    });
  });

  // A tap that came before this center was open (the app was starting, or switching centers for it).
  useEffect(() => {
    const push = takePendingOpen(branchId);
    if (push) open(push);
  }, [branchId]);

  useEffect(() => {
    const m = getMessaging();
    const onTap = (msg: RemoteMessage | null) => {
      if (!msg || !firstTap(msg.messageId)) return;
      const push = pushOpenOf(msg.data);
      if (push) open(push);
    };
    // The tap that started the app (Firebase keeps it until asked, so it waits through sign-in and choosing a center).
    getInitialNotification(m).then(onTap, () => undefined);
    const offOpened = onNotificationOpenedApp(m, onTap);
    // In front: the phone shows nothing by itself (lib/notify.ts), so the app says it.
    const offForeground = onMessage(m, (msg) => arrived(msg));
    return () => {
      offOpened();
      offForeground();
    };
  }, []);

  return children;
}
