import { router } from "expo-router";
import { Bell, CalendarCheck, Coffee, UserRoundX } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { availabilityGaps } from "@shared/availability";
import { weekDays } from "@shared/time";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { ListSection } from "@/components/List";
import { Skeleton, SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useNews } from "@/features/news/api";
import { useInbox } from "@/features/notifications/api";
import { type SessionDoc, confirmWithServer, firstNameOf, isEnded, isLive, logStateOf, rangesOn, scheduleWindow, useClock, useTutorSchedule } from "@/features/schedule/data";
import { rangesText } from "@/features/schedule/DaySection";
import { longDay, plural, weekRange } from "@/features/schedule/format";
import { ClockChip } from "@/features/today/ClockChip";
import { clockStatus, conflictsAhead, greeting, logsToWrite, nextUp, sessionsOn, weekSummary } from "@/features/today/model";
import { NextUpCard } from "@/features/today/NextUpCard";
import { TodaySessionRow } from "@/features/today/TodaySessionRow";
import { TodoSection } from "@/features/today/TodoSection";
import { WeekCard } from "@/features/today/WeekCard";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

/**
 * The tutor's day at a glance (the app opens here): a greeting with the date and the bell, the time clock, the
 * session in progress or next up, today's sessions, what's left to do (sessions waiting for the admin, logs to write,
 * availability to set, unread news) and the week in numbers. Everything is live and in the branch's time zone.
 */
export default function TodayScreen() {
  const { branchId, staffId, staff, actor, settings, timezone, name, logoUrl, accentColor } = useBranch();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const hour12 = settings.general.timeFormat !== "24h";
  const allowed = settings.sessionLogs.allowForStatuses;
  const inbox = useInbox();
  const news = useNews();

  const { today, nowMin, now } = useClock();
  const win = scheduleWindow(today, settings.general.weekStartsOn);
  const data = useTutorSchedule(win.from, win.to, { today, nowMin, now });

  const todays = sessionsOn(data.sessions, today);
  const next = nextUp(data.sessions, today, nowMin);
  const logs = logsToWrite(data.sessions, today, nowMin, allowed, settings.home.missingLogLookbackDays);
  const waiting = conflictsAhead(data.sessions, data.conflicts, today);
  const availabilityDays = data.availabilityLoading
    ? []
    : availabilityGaps({ today, timeZone: timezone, settings, hoursOf: data.hoursOf, rangesOn: (d) => data.availability.get(d)?.ranges, now: new Date(now) });
  const week = weekDays(today, settings.general.weekStartsOn);
  const summary = weekSummary(data.sessions, week, today, nowMin, allowed);
  const clock = clockStatus(data.shifts, todays, today, nowMin);
  const newestUnread = news.posts.find((p) => !news.readIds.has(p.id))?.title ?? null;
  const hours = data.hoursOf(today);
  const todayRanges = rangesOn(data.availability.get(today), hours);

  const open = (s: SessionDoc) => router.push({ pathname: "/session/[id]", params: { id: s.id } });
  const writeLog = (s: SessionDoc) => router.push(`/log/${s.id}`);
  const refresh = async () => {
    if (!staffId) return;
    const [ok] = await Promise.all([confirmWithServer(branchId, staffId, win.from, win.to), new Promise((r) => setTimeout(r, 500))]);
    if (!ok) toast.error("You’re offline", { description: "This is what was saved on this phone. It updates by itself once you’re back online." });
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.grow}>
        <View style={styles.branch}>
          {logoUrl ? <Avatar name={name} url={logoUrl} size={18} color={accentColor} /> : null}
          <T variant="small" tone="muted" style={styles.branchName} numberOfLines={1}>
            {name.toUpperCase()}
          </T>
        </View>
        <T variant="title" testID="today-greeting" accessibilityRole="header">
          {greeting(nowMin)}
          {staffId ? `, ${firstNameOf(staff, actor.name)}` : ""}
        </T>
        <T tone="muted" testID="today-date">
          {longDay(today)}
        </T>
      </View>
      <View style={[styles.round, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <IconButton testID="today-bell" icon={<Bell size={21} color={colors.foreground} />} accessibilityLabel="Notifications" badge={inbox.unread} onPress={() => router.push("/notifications")} />
      </View>
    </View>
  );

  const contentStyle = Platform.OS === "android" ? { paddingTop: insets.top + space.lg } : undefined;

  if (!staffId) {
    return (
      <TodayScroll contentStyle={contentStyle}>
        {header}
        <EmptyState icon={<UserRoundX size={26} color={colors.mutedForeground} />} title="No employee record yet" text="Your employee record isn’t linked yet. Ask an admin." />
      </TodayScroll>
    );
  }

  const heroFirst = next && next.kind !== "later";
  const hero = next ? <NextUpCard next={next} today={today} nowMin={nowMin} hour12={hour12} conflicts={data.conflictsOf(next.session.id)} onOpen={() => open(next.session)} /> : null;
  const active = todays.filter((s) => s.status !== "canceled");
  const allDone = active.length > 0 && active.every((s) => isEnded(s, today, nowMin));

  return (
    <TodayScroll onRefresh={refresh} contentStyle={contentStyle}>
      {header}
      {clock ? <ClockChip status={clock} today={today} hour12={hour12} /> : null}

      {data.loading ? (
        <View style={styles.loading} testID="today-loading">
          <Skeleton height={168} rounded={radius.xl} />
          <SkeletonCards count={3} height={60} />
        </View>
      ) : data.error ? (
        <Card>
          <T variant="label">Couldn’t load your sessions</T>
          <T variant="small" tone="muted">
            Check your connection, then pull down to try again.
          </T>
        </Card>
      ) : (
        <>
          {heroFirst ? hero : null}
          {todays.length ? (
            <ListSection title="Today" detail={allDone ? "All done" : plural(active.length, "session")} testID="today-sessions">
              {todays.map((s) => (
                <TodaySessionRow
                  key={s.id}
                  session={s}
                  conflicts={data.conflictsOf(s.id)}
                  logState={logStateOf(s, today, nowMin, allowed)}
                  live={isLive(s, today, nowMin)}
                  ended={isEnded(s, today, nowMin)}
                  hour12={hour12}
                  onPress={() => open(s)}
                  onWriteLog={() => writeLog(s)}
                />
              ))}
            </ListSection>
          ) : (
            <Card style={styles.dayOff} testID="today-free">
              <View style={[styles.dayOffIcon, { backgroundColor: colors.secondary }]}>
                {hours.isOpen ? <CalendarCheck size={20} color={colors.mutedForeground} /> : <Coffee size={20} color={colors.mutedForeground} />}
              </View>
              <View style={styles.grow}>
                <T variant="label">{hours.isOpen ? "No sessions today" : "Day off"}</T>
                <T variant="small" tone="muted">
                  {!hours.isOpen
                    ? "The center is closed today."
                    : todayRanges.length
                      ? `You’re available ${rangesText(todayRanges, hour12)}, but nothing is booked.`
                      : "Nothing is booked for you today."}
                </T>
              </View>
            </Card>
          )}
          {heroFirst ? null : hero}
          <TodoSection
            conflicts={waiting}
            logs={logs}
            availabilityDays={availabilityDays}
            leadDays={settings.availability.leadTimeDays}
            unread={news.unread}
            newestUnread={newestUnread}
            today={today}
            hour12={hour12}
            onOpenSession={open}
            onWriteLog={writeLog}
            onAvailability={() => router.navigate("/availability")}
            onNews={() => router.navigate("/news")}
          />
          <WeekCard summary={summary} range={weekRange(week[0], week[6])} onPress={() => router.navigate("/schedule")} />
        </>
      )}
    </TodayScroll>
  );
}

/**
 * Today's scrolling page, on the grouped background as the other tabs' pages (components/Screen.tsx), with pull to
 * refresh. It is the screen's root view so that tapping the Today tab again scrolls back to the top, as the phone's
 * own apps do (the native tabs look for a scroll view at the root; Today has no header stack around it).
 */
function TodayScroll({ children, onRefresh, contentStyle }: { children: ReactNode; onRefresh?: () => Promise<void>; contentStyle?: { paddingTop: number } }) {
  const colors = useColors();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <ScrollView
      testID="today-screen"
      style={[styles.fill, { backgroundColor: colors.grouped }]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, contentStyle]}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await onRefresh();
              } finally {
                setRefreshing(false);
              }
            }}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  round: { borderRadius: radius.full, borderWidth: StyleSheet.hairlineWidth },
  grow: { flex: 1 },
  branch: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  branchName: { fontWeight: "600", letterSpacing: 0.5, flexShrink: 1 },
  loading: { gap: space.lg },
  dayOff: { flexDirection: "row", alignItems: "center", gap: space.md },
  dayOffIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
