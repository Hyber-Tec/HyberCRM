import { announcementCategories } from "@shared/comms";
import { dateKeyOf, todayKey } from "@shared/time";
import { router, Stack } from "expo-router";
import { CloudOff, Megaphone, Pin, SearchX } from "lucide-react-native";
import { useMemo, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips } from "@/components/FilterChips";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useBranchNow } from "@/features/data/hooks";
import { type Post, refreshNews, useNews } from "@/features/news/api";
import { millisOf } from "@/features/news/format";
import { PostCard } from "@/features/news/PostCard";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

type Filter = "all" | "unread" | `cat:${string}`;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * News: the center's announcements for the tutor (everyone's and those addressed to them), pinned ones first, then
 * the newest. Search, filter by category or unread, pull to refresh; unread posts have a dot and count on the tab.
 */
export default function NewsScreen() {
  const colors = useColors();
  const { branchId, actor, settings, timezone, name } = useBranch();
  const { posts, readIds, unread, loading, error } = useNews();
  // Keeps "5 min ago" current while the list is open.
  const { now } = useBranchNow();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const categories = useMemo(() => announcementCategories(settings.announcements.defaultCategories, posts.map((p) => p.category || "General")), [settings.announcements.defaultCategories, posts]);

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayKey(timezone, now);
    const rows = posts
      .filter((p) => filter !== "unread" || !readIds.has(p.id))
      .filter((p) => !filter.startsWith("cat:") || (p.category || "General").toLowerCase() === filter.slice(4).toLowerCase())
      .filter((p) => !q || [p.title, p.contentText, p.authorName, p.category].some((v) => (v ?? "").toLowerCase().includes(q)));
    const isToday = (p: Post) => {
      const ms = millisOf(p.createdAt);
      return ms == null || dateKeyOf(ms, timezone) === today;
    };
    const rest = rows.filter((p) => !p.pinned);
    return [
      { key: "pinned", title: "Pinned", data: rows.filter((p) => p.pinned) },
      { key: "today", title: "Today", data: rest.filter(isToday) },
      { key: "earlier", title: "Earlier", data: rest.filter((p) => !isToday(p)) },
    ].filter((s) => s.data.length);
  }, [posts, readIds, filter, search, timezone, now]);

  const chips = useMemo(
    () => [
      { value: "all" as Filter, label: "All", testID: "news-filter-all" },
      { value: "unread" as Filter, label: "Unread", count: unread, testID: "news-filter-unread" },
      ...categories.map((c) => ({ value: `cat:${c}` as Filter, label: c, testID: `news-filter-${c.toLowerCase().replace(/\W+/g, "-")}` })),
    ],
    [categories, unread],
  );

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshNews(branchId, actor.email), pause(600)]);
    setRefreshing(false);
  };

  const searchOptions = useMemo(
    () => ({
      headerSearchBarOptions: {
        placeholder: "Search announcements",
        hideWhenScrolling: false,
        obscureBackground: false,
        placement: "stacked" as const,
        autoCapitalize: "none" as const,
        onChangeText: (e: { nativeEvent: { text: string } }) => setSearch(e.nativeEvent.text),
        onCancelButtonPress: () => setSearch(""),
      },
    }),
    [],
  );

  const filtered = filter !== "all" || search.trim() !== "";
  const empty = loading ? (
    <SkeletonCards count={3} height={132} />
  ) : error && !posts.length ? (
    <EmptyState icon={<CloudOff size={26} color={colors.mutedForeground} />} title="Couldn’t load the news" text="Check your connection, then pull down to try again." testID="news-error" />
  ) : filtered ? (
    <EmptyState
      icon={<SearchX size={26} color={colors.mutedForeground} />}
      title={search.trim() ? `No results for “${search.trim()}”` : filter === "unread" ? "You’re all caught up" : "No announcements in this view."}
      text={search.trim() ? "Try another word, or look in all announcements." : filter === "unread" ? "You’ve read every announcement." : undefined}
      action={
        filter !== "all" ? (
          <Button variant="outline" size="sm" onPress={() => setFilter("all")} testID="news-show-all">
            Show all
          </Button>
        ) : undefined
      }
      testID="news-empty-filtered"
    />
  ) : (
    <EmptyState icon={<Megaphone size={26} color={colors.mutedForeground} />} title="No announcements yet" text={`News from ${name} will appear here.`} testID="news-empty" />
  );

  return (
    <>
      <Stack.Screen options={searchOptions} />
      <SectionList
        testID="news-screen"
        sections={loading ? [] : sections}
        keyExtractor={(p) => p.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        initialNumToRender={12}
        style={{ backgroundColor: colors.grouped }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        ListHeaderComponent={posts.length || filtered ? <FilterChips value={filter} options={chips} onChange={setFilter} inset={space.lg} testID="news-filters" /> : null}
        ListHeaderComponentStyle={styles.header}
        ListEmptyComponent={empty}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHead} accessibilityRole="header">
            {section.key === "pinned" ? <Pin size={12} color={colors.mutedForeground} /> : null}
            <T variant="small" tone="muted" style={styles.sectionTitle}>
              {section.title.toUpperCase()}
            </T>
          </View>
        )}
        renderItem={({ item }) => <PostCard post={item} unread={!readIds.has(item.id)} timezone={timezone} now={now} onPress={() => router.push({ pathname: "/news/[id]", params: { id: item.id } })} />}
        ItemSeparatorComponent={Gap}
        SectionSeparatorComponent={SectionGap}
      />
    </>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

function SectionGap() {
  return <View style={styles.sectionGap} />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl * 2 },
  header: { marginHorizontal: -space.lg, paddingTop: space.sm, paddingBottom: space.xs },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.xs, paddingTop: space.md, paddingBottom: space.sm },
  sectionTitle: { fontWeight: "600", letterSpacing: 0.5 },
  gap: { height: space.md },
  sectionGap: { height: space.xs },
});
