import { ANNOUNCEMENT_COMMENT_MAX } from "@shared/comms";
import * as Haptics from "expo-haptics";
import { ArrowUp, MessageSquareOff, Trash2 } from "lucide-react-native";
import { forwardRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useBranchNow } from "@/features/data/hooks";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import { addComment, type Comment, deleteComment, type Post, useComments } from "./api";
import { millisOf, relativeTime } from "./format";

/** Show how much room is left once a comment gets this close to the limit. */
const WARN_AT = ANNOUNCEMENT_COMMENT_MAX - 200;

/**
 * A post's comments, oldest first, with who wrote each (and their role) and when; the person can delete their own.
 * Below them, a box to add one when the post allows comments.
 */
export const Comments = forwardRef<TextInput, { post: Post; onComposerFocus?: () => void }>(function Comments({ post, onComposerFocus }, inputRef) {
  const colors = useColors();
  const { branchId, actor, role, timezone } = useBranch();
  const { data: comments, loading } = useComments(post.id);
  const { now } = useBranchNow();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Comment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const left = ANNOUNCEMENT_COMMENT_MAX - text.length;
  const canSend = !!text.trim() && !busy;

  async function send() {
    if (!canSend) return;
    setBusy(true);
    try {
      await addComment(branchId, actor, role, post.id, text);
      setText("");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch {
      toast.error("Could not post the comment.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setDeleting(true);
    try {
      await deleteComment(branchId, post.id, removing.id);
      setRemoving(null);
    } catch {
      toast.error("Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <View style={styles.wrap} testID="comments">
      <View style={styles.head}>
        <T variant="subheading">Comments</T>
        {comments.length ? <Badge>{String(comments.length)}</Badge> : null}
      </View>

      {loading ? (
        <View style={styles.list}>
          {[0, 1].map((i) => (
            <View key={i} style={styles.row}>
              <Skeleton width={32} height={32} rounded={16} />
              <View style={styles.grow}>
                <Skeleton width="40%" height={13} />
                <Skeleton width="85%" height={13} />
              </View>
            </View>
          ))}
        </View>
      ) : comments.length ? (
        <View style={styles.list}>
          {comments.map((c) => (
            <CommentRow key={c.id} comment={c} mine={c.authorKey === actor.email} timezone={timezone} now={now} onDelete={() => setRemoving(c)} />
          ))}
        </View>
      ) : post.commentsEnabled ? (
        <T tone="muted" testID="comments-empty">
          No comments yet. Be the first to start the discussion!
        </T>
      ) : null}

      {post.commentsEnabled ? (
        <View style={styles.composerWrap}>
          <View style={[styles.composer, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <TextInput
              ref={inputRef}
              testID="comment-input"
              value={text}
              onChangeText={setText}
              placeholder="Write a comment…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={ANNOUNCEMENT_COMMENT_MAX}
              editable={!busy}
              onFocus={onComposerFocus}
              accessibilityLabel="Write a comment"
              style={[styles.input, { color: colors.foreground }]}
            />
            <Pressable
              testID="comment-send"
              accessibilityRole="button"
              accessibilityLabel="Post comment"
              accessibilityState={{ disabled: !canSend, busy }}
              disabled={!canSend}
              onPress={() => void send()}
              hitSlop={6}
              style={({ pressed }) => [styles.send, { backgroundColor: canSend ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              {busy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <ArrowUp size={18} color={canSend ? colors.primaryForeground : colors.mutedForeground} strokeWidth={2.5} />}
            </Pressable>
          </View>
          {text.length >= WARN_AT ? (
            <T variant="small" tone={left <= 0 ? "destructive" : "muted"} style={styles.counter} testID="comment-counter">
              {left <= 0 ? `That’s the limit (${ANNOUNCEMENT_COMMENT_MAX.toLocaleString("en-US")} characters).` : `${left.toLocaleString("en-US")} characters left`}
            </T>
          ) : null}
        </View>
      ) : (
        <View style={styles.off} testID="comments-off">
          <MessageSquareOff size={16} color={colors.mutedForeground} />
          <T tone="muted" variant="small">
            Comments are turned off for this post.
          </T>
        </View>
      )}

      <Dialog
        open={removing !== null}
        onRequestClose={() => setRemoving(null)}
        testID="delete-comment-dialog"
        footer={
          <>
            <Button variant="destructive" busy={deleting} onPress={() => void remove()} testID="delete-comment-confirm">
              Delete
            </Button>
            <Button variant="outline" onPress={() => setRemoving(null)} disabled={deleting}>
              Cancel
            </Button>
          </>
        }
      >
        <T variant="heading">Delete this comment?</T>
        <T tone="muted">It can’t be undone.</T>
      </Dialog>
    </View>
  );
});

function CommentRow({ comment, mine, timezone, now, onDelete }: { comment: Comment; mine: boolean; timezone: string; now: number; onDelete: () => void }) {
  const colors = useColors();
  const name = comment.authorName || "Someone";
  const admin = comment.authorRole === "admin" || comment.authorRole === "owner";
  const when = relativeTime(millisOf(comment.createdAt), timezone, now);
  return (
    <Pressable
      testID={`comment-${comment.id}`}
      onLongPress={mine ? onDelete : undefined}
      delayLongPress={400}
      accessible
      accessibilityLabel={`${name}${mine ? " (you)" : ""}, ${admin ? "Admin" : "Tutor"}, ${when}: ${comment.text}`}
      accessibilityActions={mine ? [{ name: "delete", label: "Delete comment" }] : undefined}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === "delete" && onDelete()}
      style={styles.row}
    >
      <Avatar name={name} size={32} />
      <View style={styles.grow}>
        <View style={styles.byline}>
          <T variant="label" numberOfLines={1} style={styles.name}>
            {name}
            {mine ? <T variant="small" tone="muted">{"  (you)"}</T> : null}
          </T>
          {admin ? (
            <Badge tone="outline" style={styles.role}>
              Admin
            </Badge>
          ) : (
            <T variant="small" tone="muted">
              Tutor
            </T>
          )}
          <T variant="small" tone="muted" numberOfLines={1} style={styles.when}>
            · {when}
          </T>
          {mine ? (
            <Pressable onPress={onDelete} hitSlop={10} accessibilityRole="button" accessibilityLabel="Delete comment" testID={`comment-${comment.id}-delete`} style={({ pressed }) => [styles.trash, pressed && { opacity: 0.5 }]}>
              <Trash2 size={15} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        <T selectable style={styles.text}>
          {comment.text}
        </T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  list: { gap: space.lg },
  row: { flexDirection: "row", gap: space.md },
  grow: { flex: 1, gap: 3 },
  byline: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1 },
  role: { paddingVertical: 1 },
  when: { flexShrink: 0 },
  trash: { marginLeft: "auto", padding: 2 },
  text: { lineHeight: 21 },
  composerWrap: { gap: 6, marginTop: space.xs },
  composer: { flexDirection: "row", alignItems: "flex-end", borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, paddingLeft: space.md, paddingRight: 6, paddingVertical: 6, gap: space.sm },
  input: { flex: 1, fontSize: 16, lineHeight: 21, maxHeight: 140, paddingTop: 7, paddingBottom: 7 },
  send: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  counter: { paddingHorizontal: space.sm },
  off: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
