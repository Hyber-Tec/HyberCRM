import { stripHtmlToText } from "@shared/comms";
import { Image } from "expo-image";
import { MessageSquare, Paperclip, Pin } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Badge } from "@/components/Badge";
import { safeImageSrc } from "@/components/html";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";
import { millisOf, relativeTime } from "./format";
import type { Post } from "./api";

/** The first picture in a post, for the card's thumbnail. */
function firstImage(html: string): string | null {
  const m = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(html ?? "");
  return m ? safeImageSrc(m[1] ?? m[2]) : null;
}

/**
 * One post in the News list: category, date (in the branch's zone) and author, the title with an unread dot, a few
 * lines of its text, a thumbnail of its first picture, and how many comments and files it has.
 */
export const PostCard = memo(function PostCard({ post, unread, timezone, now, onPress }: { post: Post; unread: boolean; timezone: string; now: number; onPress: () => void }) {
  const colors = useColors();
  const when = relativeTime(millisOf(post.createdAt), timezone, now);
  const preview = (post.contentText || stripHtmlToText(post.contentHtml ?? "")).trim();
  const thumb = firstImage(post.contentHtml);
  const comments = post.commentCount ?? 0;
  const files = post.attachments?.length ?? 0;
  const category = post.category || "General";
  const author = post.authorName || "Admin";
  const label = [
    unread ? "Unread" : null,
    post.pinned ? "Pinned" : null,
    post.title || "Untitled",
    `${category}, ${when}, by ${author}`,
    comments ? `${comments} ${comments === 1 ? "comment" : "comments"}` : null,
    files ? `${files} ${files === 1 ? "attachment" : "attachments"}` : null,
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <Pressable
      testID={`post-${post.id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the announcement"
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: pressed ? colors.accent : colors.card, borderColor: colors.border }]}
    >
      <View style={styles.meta}>
        {post.pinned ? <Pin size={13} color={colors.warning} fill={colors.warning} /> : null}
        <Badge>{category}</Badge>
        <T variant="small" tone="muted" numberOfLines={1} style={styles.when}>
          {when}
        </T>
      </View>
      <View style={styles.body}>
        <View style={styles.text}>
          <View style={styles.titleRow}>
            {unread ? <View style={[styles.dot, { backgroundColor: colors.info }]} testID={`post-${post.id}-unread`} /> : null}
            <T variant="subheading" numberOfLines={2} style={[styles.title, unread && styles.unreadTitle]}>
              {post.title || "(Untitled)"}
            </T>
          </View>
          {preview ? (
            <T tone="muted" numberOfLines={thumb ? 2 : 3} style={styles.preview}>
              {preview}
            </T>
          ) : null}
        </View>
        {thumb ? <Image source={{ uri: thumb }} style={[styles.thumb, { backgroundColor: colors.secondary, borderColor: colors.border }]} contentFit="cover" transition={150} /> : null}
      </View>
      <View style={styles.footer}>
        <T variant="small" tone="muted" numberOfLines={1} style={styles.author}>
          {author}
        </T>
        {comments ? (
          <View style={styles.count}>
            <MessageSquare size={14} color={colors.mutedForeground} />
            <T variant="small" tone="muted">
              {comments}
            </T>
          </View>
        ) : null}
        {files ? (
          <View style={styles.count}>
            <Paperclip size={14} color={colors.mutedForeground} />
            <T variant="small" tone="muted">
              {files}
            </T>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, paddingVertical: space.md + 2, gap: space.sm },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  when: { flex: 1, textAlign: "right", fontVariant: ["tabular-nums"] },
  body: { flexDirection: "row", gap: space.md },
  text: { flex: 1, gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 7 },
  title: { flex: 1, lineHeight: 22 },
  unreadTitle: { fontWeight: "700" },
  preview: { lineHeight: 21 },
  thumb: { width: 64, height: 64, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignSelf: "center" },
  footer: { flexDirection: "row", alignItems: "center", gap: space.md },
  author: { flex: 1 },
  count: { flexDirection: "row", alignItems: "center", gap: 4 },
});
