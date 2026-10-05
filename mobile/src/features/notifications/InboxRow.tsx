import { notificationMeta } from "@shared/comms";
import { formatInstantTime } from "@shared/time";
import { ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { SwipeToDelete } from "@/components/SwipeToDelete";
import { T } from "@/components/Text";
import { millisOf } from "@/features/news/format";
import { space, useColors, useIsDark } from "@/theme";
import type { InboxItem } from "./api";

/** One inbox item: its kind (colored dot and label), time, title and text; bold and marked while unread. */
export const InboxRow = memo(function InboxRow({ item, timezone, divider, onOpen, onDelete }: { item: InboxItem; timezone: string; divider: boolean; onOpen: () => void; onDelete: () => void }) {
  const colors = useColors();
  const dark = useIsDark();
  const meta = notificationMeta(item.type);
  const ms = millisOf(item.createdAt);
  const time = ms == null ? "Now" : formatInstantTime(ms, timezone);
  const unread = !item.readAt;
  // The kinds' colors are the website's; in dark mode they're lifted a little so they read on the dark card.
  const tint = dark ? lighten(meta.color) : meta.color;
  return (
    <SwipeToDelete
      testID={`inbox-item-${item.id}`}
      onPress={onOpen}
      onDelete={onDelete}
      accessibilityLabel={`${unread ? "Unread. " : ""}${meta.label}, ${time}. ${item.title}. ${item.body}`}
    >
      <View style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
        <View style={[styles.dot, { backgroundColor: tint }]} />
        <View style={styles.body}>
          <View style={styles.top}>
            <T variant="small" numberOfLines={1} style={[styles.kind, { color: tint }]}>
              {meta.label}
            </T>
            <T variant="small" style={[styles.time, { color: unread ? colors.info : colors.mutedForeground }]}>
              {time}
            </T>
            {unread ? <View style={[styles.unread, { backgroundColor: colors.info }]} testID={`inbox-item-${item.id}-unread`} /> : null}
          </View>
          <T variant="label" numberOfLines={2} style={unread ? styles.titleUnread : styles.titleRead}>
            {item.title}
          </T>
          {item.body ? (
            <T variant="small" tone="muted" numberOfLines={3} style={styles.text}>
              {item.body}
            </T>
          ) : null}
        </View>
        {item.link ? <ChevronRight size={16} color={colors.mutedForeground} style={styles.chevron} /> : null}
      </View>
    </SwipeToDelete>
  );
});

/** A kind's color mixed halfway to white, for dark mode. */
function lighten(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.35);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingLeft: space.lg, paddingRight: space.md, paddingVertical: space.md },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  body: { flex: 1, gap: 2 },
  top: { flexDirection: "row", alignItems: "center", gap: 6 },
  kind: { flex: 1, fontWeight: "600" },
  time: { fontVariant: ["tabular-nums"] },
  unread: { width: 8, height: 8, borderRadius: 4 },
  titleUnread: { fontWeight: "700" },
  titleRead: { fontWeight: "500" },
  text: { lineHeight: 18 },
  chevron: { alignSelf: "center" },
});
