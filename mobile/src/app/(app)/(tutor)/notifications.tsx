import { dateKeyOf, todayKey } from "@shared/time";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Bell, CheckCheck, CloudOff, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Platform, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { closeSwipedRow } from "@/components/SwipeToDelete";
import { T } from "@/components/Text";
import { ToastHost } from "@/components/ToastHost";
import { dayLabel, millisOf } from "@/features/news/format";
import { deleteNotification, type InboxItem, markAllNotificationsRead, markNotificationRead, refreshInbox, useInbox } from "@/features/notifications/api";
import { InboxRow } from "@/features/notifications/InboxRow";
import { openNotice } from "@/lib/targets";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The notifications inbox, over the app (the bell on Today opens it): session changes and announcements for the
 * tutor, newest first, by day in the branch's zone. Tap one to open what it's about; swipe left to delete (a long
 * swipe deletes at once); "Mark all as read" clears the unread marks and the badge.
 */
export default function InboxScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { branchId, actor, timezone, settings } = useBranch();
  const { data, loading, error } = useInbox();
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [marking, setMarking] = useState(false);

  const items = useMemo(() => data.filter((n) => !gone.has(n.id)), [data, gone]);
  const unread = items.filter((n) => !n.readAt).length;
  const sections = useMemo(() => {
    const today = todayKey(timezone);
    const byDay = new Map<string, InboxItem[]>();
    for (const n of items) {
      const ms = millisOf(n.createdAt);
      const day = ms == null ? today : dateKeyOf(ms, timezone);
      byDay.set(day, [...(byDay.get(day) ?? []), n]);
    }
    return [...byDay.entries()].map(([day, list]) => ({ key: day, title: dayLabel(day, today), data: list }));
  }, [items, timezone]);

  const open = (n: InboxItem) => {
    if (!n.readAt) void markNotificationRead(branchId, n.id);
    // Closes the inbox and opens the post, the session or the schedule's day (lib/targets.ts).
    if (n.link || n.refs?.announcementId || n.refs?.sessionId || n.refs?.dateKey) openNotice(n.type, n.link, n.refs);
  };

  const remove = (n: InboxItem) => {
    setGone((s) => new Set(s).add(n.id));
    deleteNotification(branchId, n.id).catch(() => {
      setGone((s) => {
        const next = new Set(s);
        next.delete(n.id);
        return next;
      });
      toast.error("Couldn’t delete the notification.");
    });
  };

  const markAll = async () => {
    setMarking(true);
    try {
      await markAllNotificationsRead(branchId, items);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (e) {
      toast.error("Couldn’t mark them as read.", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setMarking(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshInbox(branchId, actor.email), pause(600)]);
    setRefreshing(false);
  };

  const days = settings.notifications.retentionDays;
  return (
    // A screen presented over the app has its own native view tree, so the rows' swipes need their own gesture root.
    <GestureHandlerRootView style={[styles.fill, { backgroundColor: colors.grouped }]}>
      {/* The inbox's own bar (the stack presents this screen without one): title and close, then the unread count
          and "Mark all as read". On iPhone it's a sheet below the status bar; on Android it covers the screen. */}
      <View style={[styles.bar, { borderBottomColor: colors.border }, Platform.OS === "android" && { paddingTop: insets.top + space.md }]}>
        <View style={styles.barRow}>
          <T variant="title" style={styles.barTitle} accessibilityRole="header" numberOfLines={1}>
            Notifications
          </T>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="inbox-close"
            style={({ pressed }) => [styles.close, { backgroundColor: colors.secondary }, pressed && styles.pressed]}
          >
            <X size={18} color={colors.foreground} strokeWidth={2.4} />
          </Pressable>
        </View>
        <View style={[styles.barRow, styles.summary]}>
          <T variant="small" tone="muted" testID="inbox-unread-count">
            {loading ? " " : unread ? `${unread} unread` : items.length ? "All caught up" : " "}
          </T>
          {unread ? (
            <T variant="small" tone="muted" aria-hidden>
              ·
            </T>
          ) : null}
          {unread ? (
            <Pressable
              onPress={() => void markAll()}
              disabled={marking}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Mark all as read"
              accessibilityState={{ disabled: marking }}
              testID="inbox-mark-all"
              style={({ pressed }) => [styles.markAll, (pressed || marking) && styles.pressed]}
            >
              <CheckCheck size={15} color={colors.info} />
              <Text style={[styles.markAllText, { color: colors.info }]}>Mark all as read</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <SectionList
        testID="inbox-screen"
        sections={sections}
        keyExtractor={(n) => n.id}
        contentInsetAdjustmentBehavior="automatic"
        stickySectionHeadersEnabled={false}
        initialNumToRender={40}
        contentContainerStyle={styles.content}
        onScrollBeginDrag={closeSwipedRow}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        renderSectionHeader={({ section }) => (
          <T variant="small" tone="muted" style={styles.sectionTitle} accessibilityRole="header">
            {section.title.toUpperCase()}
          </T>
        )}
        renderItem={({ item, index, section }) => (
          <View
            style={[
              styles.cell,
              { backgroundColor: colors.card, borderColor: colors.border },
              index === 0 && styles.first,
              index === section.data.length - 1 && styles.last,
            ]}
          >
            <InboxRow item={item} timezone={timezone} divider={index > 0} onOpen={() => open(item)} onDelete={() => remove(item)} />
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <InboxSkeleton />
          ) : error ? (
            <EmptyState icon={<CloudOff size={26} color={colors.mutedForeground} />} title="Couldn’t load notifications" text="Please try again." testID="inbox-error" />
          ) : (
            <EmptyState
              icon={<Bell size={26} color={colors.mutedForeground} />}
              title="No notifications yet"
              text="Session and announcement alerts will appear here once they arrive."
              testID="inbox-empty"
            />
          )
        }
        ListFooterComponent={
          items.length ? (
            <T variant="small" tone="muted" style={styles.footer}>
              {`Swipe left on a notification to delete it. Notifications are cleared after ${days} ${days === 1 ? "day" : "days"}.`}
            </T>
          ) : null
        }
      />
      {/* This screen is drawn over the app, so toasts need their own layer here (components/ToastHost.tsx). */}
      <ToastHost />
    </GestureHandlerRootView>
  );
}

function InboxSkeleton() {
  const colors = useColors();
  return (
    <View style={[styles.cell, styles.first, styles.last, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityLabel="Loading notifications">
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.skeletonRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          <Skeleton width={8} height={8} rounded={4} />
          <View style={styles.skeletonText}>
            <Skeleton width="35%" height={12} />
            <Skeleton width="70%" height={15} />
            <Skeleton width="90%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xxl * 2 },
  sectionTitle: { fontWeight: "600", letterSpacing: 0.5, paddingHorizontal: space.xs, paddingTop: space.lg, paddingBottom: space.sm },
  cell: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  first: { borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  last: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  footer: { textAlign: "center", paddingHorizontal: space.xl, paddingTop: space.xl },
  bar: { paddingHorizontal: space.lg, paddingTop: space.lg + 2, paddingBottom: space.sm, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  barRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 30 },
  barTitle: { flex: 1, fontSize: 26, lineHeight: 32 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  summary: { gap: space.sm },
  markAll: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 30 },
  markAllText: { fontSize: 13, fontWeight: "600" },
  pressed: { opacity: 0.5 },
  skeletonRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md, padding: space.lg },
  skeletonText: { flex: 1, gap: 6 },
});
