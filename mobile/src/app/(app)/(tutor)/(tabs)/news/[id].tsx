import { router, Stack, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Archive, ChevronRight, File, FileImage, FileSpreadsheet, FileText, FileX, MessageSquare, Paperclip, Pin, Tag } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { HtmlView } from "@/components/HtmlView";
import { ImageViewer } from "@/components/ImageViewer";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { markRead, type Post, useMyRead, usePost } from "@/features/news/api";
import { Comments } from "@/features/news/Comments";
import { formatBytes, fullDate, millisOf } from "@/features/news/format";
import { env } from "@/lib/env";
import { openUrl } from "@/lib/links";
import { inAppLink, openLink } from "@/lib/targets";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

/**
 * One announcement, loaded by its ID (the News list, a link, a push or the inbox open it): title, who posted it and
 * when, its text drawn natively, attachments (in the in-app browser) and comments. The first visit leaves a read
 * receipt, once.
 */
export default function PostScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const { branchId, actor } = useBranch();
  const post = usePost(id);
  const myRead = useMyRead(id);

  // The first open leaves a read receipt; the rules refuse a second, and this never tries one. (A push for another
  // post can reuse this screen with a new ID.)
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (!post.data || post.data.id !== id || myRead.loading || myRead.data || marked.current === id) return;
    marked.current = id;
    void markRead(branchId, actor, id);
  }, [post.data, myRead.loading, myRead.data, branchId, actor, id]);

  if (post.loading) return <PostSkeleton />;
  if (!post.data) return <NotFound />;
  return <PostView key={post.data.id} post={post.data} />;
}

function PostView({ post }: { post: Post }) {
  const colors = useColors();
  const { branchId, timezone } = useBranch();
  const headerHeight = useHeaderHeight();
  const scroll = useRef<ScrollView>(null);
  const [image, setImage] = useState<{ uri: string; alt: string } | null>(null);
  const [titleBottom, setTitleBottom] = useState(0);
  const [commentsY, setCommentsY] = useState(0);
  const [titleInBar, setTitleInBar] = useState(false);
  const composing = useRef(false);

  // While a comment is being written, the box stays in sight above the keyboard.
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      if (composing.current) scroll.current?.scrollToEnd({ animated: true });
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      composing.current = false;
    });
    return () => {
      sub.remove();
      hide.remove();
    };
  }, []);

  /** Links to this center's pages on the website open here; other web pages in the in-app browser. */
  const openPostLink = (url: string) => {
    const link = inAppLink(url, branchId);
    if (link) return openLink(link, undefined, { push: true });
    if (/^(mailto|tel):/i.test(url)) return void Linking.openURL(url).catch(() => undefined);
    void openUrl(url);
  };

  const comments = post.commentCount ?? 0;
  const files = post.attachments ?? [];
  return (
    <>
      <Stack.Screen options={{ title: titleInBar ? post.title : "" }} />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "android" ? "padding" : undefined} keyboardVerticalOffset={headerHeight}>
        <ScrollView
          ref={scroll}
          testID="post-screen"
          style={[styles.fill, { backgroundColor: colors.background }]}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={32}
          onScroll={(e) => {
            const past = titleBottom > 0 && e.nativeEvent.contentOffset.y + e.nativeEvent.contentInset.top > titleBottom;
            if (past !== titleInBar) setTitleInBar(past);
          }}
        >
          <View style={styles.badges}>
            {post.pinned ? (
              <Badge tone="warning" icon={<Pin size={12} color={colors.warning} fill={colors.warning} />}>
                Pinned
              </Badge>
            ) : null}
            {post.archived ? (
              <Badge tone="outline" icon={<Archive size={12} color={colors.foreground} />}>
                Archived
              </Badge>
            ) : null}
            <Badge icon={<Tag size={12} color={colors.foreground} />}>{post.category || "General"}</Badge>
          </View>

          <T variant="title" style={styles.title} accessibilityRole="header" onLayout={(e) => setTitleBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)} testID="post-title" selectable>
            {post.title || "(Untitled)"}
          </T>

          <View style={styles.byline}>
            <Avatar name={post.authorName || "Admin"} size={36} />
            <View style={styles.grow}>
              <T variant="label" numberOfLines={1}>
                {post.authorName || "Admin"}
              </T>
              <T variant="small" tone="muted">
                {fullDate(millisOf(post.createdAt), timezone)}
              </T>
            </View>
            <Pressable
              onPress={() => scroll.current?.scrollTo({ y: Math.max(0, commentsY - space.lg), animated: true })}
              accessibilityRole="button"
              accessibilityLabel={`${comments} ${comments === 1 ? "comment" : "comments"}, go to comments`}
              hitSlop={8}
              testID="post-comment-count"
              style={({ pressed }) => [styles.countButton, { backgroundColor: colors.secondary, opacity: pressed ? 0.6 : 1 }]}
            >
              <MessageSquare size={15} color={colors.foreground} />
              <T variant="small" style={styles.countText}>
                {comments}
              </T>
            </Pressable>
          </View>

          <View style={[styles.rule, { backgroundColor: colors.border }]} />

          {post.contentHtml?.trim() ? (
            <HtmlView html={post.contentHtml} onLinkPress={openPostLink} onImagePress={(uri, alt) => setImage({ uri, alt })} linkBase={env.webUrl} testID="post-body" />
          ) : (
            <T tone="muted">{post.contentText || "This announcement has no text."}</T>
          )}

          {files.length ? (
            <View style={styles.section} testID="post-attachments">
              <T variant="small" tone="muted" style={styles.sectionTitle}>
                {`ATTACHMENTS · ${files.length}`}
              </T>
              <View style={[styles.files, { borderColor: colors.border, backgroundColor: colors.card }]}>
                {files.map((f, i) => (
                  <Pressable
                    key={f.path || f.url}
                    onPress={() => void openUrl(f.url)}
                    accessibilityRole="button"
                    accessibilityLabel={`${f.name}, ${formatBytes(f.size)}, open`}
                    testID={`attachment-${i}`}
                    style={({ pressed }) => [styles.file, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
                  >
                    <View style={[styles.fileIcon, { backgroundColor: colors.secondary }]}>
                      <FileIcon type={f.contentType} name={f.name} />
                    </View>
                    <View style={styles.grow}>
                      <T variant="label" numberOfLines={1}>
                        {f.name}
                      </T>
                      <T variant="small" tone="muted">
                        {[kindOf(f.contentType, f.name), formatBytes(f.size)].filter(Boolean).join(" · ")}
                      </T>
                    </View>
                    <ChevronRight size={16} color={colors.mutedForeground} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={[styles.rule, { backgroundColor: colors.border }]} onLayout={(e) => setCommentsY(e.nativeEvent.layout.y)} />

          <Comments
            post={post}
            onComposerFocus={() => {
              composing.current = true;
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      <ImageViewer image={image} onClose={() => setImage(null)} />
    </>
  );
}

function FileIcon({ type, name }: { type: string; name: string }) {
  const colors = useColors();
  const props = { size: 18, color: colors.foreground };
  const kind = kindOf(type, name);
  if (kind === "Image") return <FileImage {...props} />;
  if (kind === "PDF" || kind === "Document" || kind === "Text") return <FileText {...props} />;
  if (kind === "Spreadsheet") return <FileSpreadsheet {...props} />;
  return kind ? <File {...props} /> : <Paperclip {...props} />;
}

/** "PDF", "Image", "Spreadsheet"… from the file's type (or its name). */
function kindOf(type: string, name: string): string {
  const t = (type || "").toLowerCase();
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (t === "application/pdf" || ext === "pdf") return "PDF";
  if (t.startsWith("image/")) return "Image";
  if (/sheet|excel|csv/.test(t) || ["xls", "xlsx", "csv", "numbers"].includes(ext)) return "Spreadsheet";
  if (/presentation|powerpoint/.test(t) || ["ppt", "pptx", "key"].includes(ext)) return "Slides";
  if (/word|document|rtf/.test(t) || ["doc", "docx", "pages", "rtf"].includes(ext)) return "Document";
  if (t.startsWith("text/")) return "Text";
  if (t.startsWith("video/")) return "Video";
  if (t.startsWith("audio/")) return "Audio";
  if (/zip|compressed/.test(t)) return "Archive";
  return "File";
}

function PostSkeleton() {
  const colors = useColors();
  return (
    <View style={[styles.fill, styles.content, { backgroundColor: colors.background }]} testID="post-loading" accessibilityLabel="Loading the announcement">
      <Skeleton width={90} height={20} rounded={radius.full} />
      <Skeleton width="85%" height={28} />
      <Skeleton width="55%" height={28} />
      <View style={styles.byline}>
        <Skeleton width={36} height={36} rounded={18} />
        <View style={styles.grow}>
          <Skeleton width="40%" height={14} />
          <Skeleton width="30%" height={12} />
        </View>
      </View>
      <View style={[styles.rule, { backgroundColor: colors.border }]} />
      {["100%", "96%", "88%", "100%", "70%"].map((w, i) => (
        <Skeleton key={i} width={w as `${number}%`} height={14} />
      ))}
    </View>
  );
}

function NotFound() {
  const colors = useColors();
  return (
    <View style={[styles.fill, styles.center, { backgroundColor: colors.background }]} testID="post-not-found">
      <EmptyState
        icon={<FileX size={26} color={colors.mutedForeground} />}
        title="Announcement not found"
        text="It may have been deleted, or it isn’t addressed to you."
        action={
          <Button variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace("/news"))}>
            Back to News
          </Button>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { justifyContent: "center" },
  content: { paddingHorizontal: space.xl - 4, paddingTop: space.lg, paddingBottom: space.xxl * 2, gap: space.lg },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  title: { fontSize: 26, lineHeight: 32, marginTop: -space.xs },
  byline: { flexDirection: "row", alignItems: "center", gap: space.md },
  grow: { flex: 1, gap: 2 },
  countButton: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.full, paddingHorizontal: 11, paddingVertical: 6 },
  countText: { fontWeight: "600", fontVariant: ["tabular-nums"] },
  rule: { height: StyleSheet.hairlineWidth },
  section: { gap: space.sm },
  sectionTitle: { fontWeight: "600", letterSpacing: 0.5, paddingHorizontal: space.xs },
  files: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  file: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md },
  fileIcon: { width: 36, height: 36, borderRadius: radius.sm + 2, alignItems: "center", justifyContent: "center" },
});
