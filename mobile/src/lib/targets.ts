import { APP_URL } from "@shared/brand";
import { type AppTarget, appTargetOf } from "@shared/push";
import { type Href, router } from "expo-router";
import { env } from "./env";

export type TargetRefs = { sessionId?: string | null; announcementId?: string | null; dateKey?: string | null };

/**
 * Where the app is (Expo Router's segments), kept current by NotificationsProvider: a tap that comes while a screen is
 * open over the tabs (the inbox, a session sheet, a log) closes it first.
 */
let segments: readonly string[] = [];
export function setCurrentSegments(next: readonly string[]): void {
  segments = next;
}

const overTabs = () => segments.includes("(tutor)") && !segments.includes("(tabs)");

function hrefOf(target: AppTarget): Href {
  switch (target.screen) {
    case "announcement":
      return { pathname: "/news/[id]", params: { id: target.announcementId } };
    case "announcements":
      return "/news";
    case "schedule":
      if (target.sessionId) return { pathname: "/session/[id]", params: { id: target.sessionId } };
      return { pathname: "/schedule", params: target.dateKey ? { date: target.dateKey } : {} };
    default:
      return "/";
  }
}

/**
 * Opens the screen an inbox item or a push is about (shared/src/push.ts `appTargetOf`), in its tab, with the tab's
 * first screen under it (back from a post goes to the News list). `push` opens it over the current one even when it
 * is the same kind of screen (a link from one post to another).
 */
export function openTarget(target: AppTarget, { push = false }: { push?: boolean } = {}): void {
  const href = hrefOf(target);
  if (overTabs()) {
    // Close what is open over the tabs and go there in one step, rather than opening the tabs again on top of it.
    router.dismissTo(href, { withAnchor: true });
  } else if (push) {
    router.push(href, { withAnchor: true });
  } else {
    router.navigate(href, { withAnchor: true });
  }
}

export function openLink(link: string, refs?: TargetRefs, options?: { push?: boolean }): void {
  openTarget(appTargetOf(link, refs), options);
}

/** Kinds of notice about a session that is no longer the tutor's (deleted, or given to someone else). */
const SESSION_GONE = new Set(["session_deleted", "session_reassigned_out"]);

/**
 * Opens what an inbox item or a push is about: the post, the session (its sheet), or, for a session that is no longer
 * the tutor's, its day in the schedule.
 */
export function openNotice(type: string, link: string, refs?: TargetRefs): void {
  openLink(link, SESSION_GONE.has(type) ? { ...refs, sessionId: null } : refs);
}

/**
 * A link to this center's tutor pages on the website (`https://hybercrm.com/demo-academy/tutor/announcements/abc`), as
 * an in-app link (`tutor/announcements/abc`) the app can open itself; null for any other address.
 */
export function inAppLink(url: string, branchId: string): string | null {
  const m = /^(https?:\/\/[^/?#]+)(\/[^?#]*)?(\?[^#]*)?/i.exec(url.trim());
  if (!m) return null;
  const origin = m[1].toLowerCase();
  if (origin !== APP_URL && origin !== env.webUrl.toLowerCase()) return null;
  const parts = (m[2] ?? "").split("/").filter(Boolean);
  if (parts[0] !== branchId || parts[1] !== "tutor" || !["announcements", "schedule"].includes(parts[2] ?? "")) return null;
  return `${parts.slice(1).join("/")}${m[3] ?? ""}`;
}

// ------------------------------------------------------------------------------------------- taps on pushes

/** What a tapped push asks for, from its data (all strings, shared/src/push.ts `PushData`). */
export interface PushOpen {
  type: string;
  branchId: string | null;
  notificationId: string | null;
  link: string;
  refs: TargetRefs;
}

export function pushOpenOf(data: Record<string, unknown> | undefined | null): PushOpen | null {
  if (!data) return null;
  const s = (key: string) => (typeof data[key] === "string" && data[key] ? (data[key] as string) : null);
  if (!s("link") && !s("announcementId") && !s("sessionId") && !s("dateKey")) return null;
  return {
    type: s("type") ?? "",
    branchId: s("branchId"),
    notificationId: s("notificationId"),
    link: s("link") ?? "",
    refs: { sessionId: s("sessionId"), announcementId: s("announcementId"), dateKey: s("dateKey") },
  };
}

/** Pushes already acted on (Firebase hands the last tapped one out again when asked for the one that opened the app). */
const handled = new Set<string>();

/** True the first time a push is seen, so each tap opens its screen once. */
export function firstTap(messageId: string | null | undefined): boolean {
  if (!messageId) return true;
  if (handled.has(messageId)) return false;
  handled.add(messageId);
  return true;
}

/** A tap for another center, waiting until the app has switched to it. */
let pending: PushOpen | null = null;

export function setPendingOpen(open: PushOpen | null): void {
  pending = open;
}

/** The waiting tap for this center, if there is one (taken once). */
export function takePendingOpen(branchId: string): PushOpen | null {
  if (!pending || (pending.branchId && pending.branchId !== branchId)) return null;
  const open = pending;
  pending = null;
  return open;
}
