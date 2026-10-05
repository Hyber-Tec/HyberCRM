import { EmailAuthProvider, GoogleAuthProvider, reauthenticateWithCredential } from "@react-native-firebase/auth";
import { arrayRemove, arrayUnion, serverTimestamp, writeBatch } from "@react-native-firebase/firestore";
import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from "@react-native-google-signin/google-signin";
import { COL } from "@shared/paths";
import type { AuditChange, NotificationPrefs, Staff } from "@shared/types";
import { branchDoc } from "@/features/data/hooks";
import { callable } from "@/lib/api";
import { addAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { auth, db } from "@/lib/firebase";
import type { Actor } from "@/state/BranchProvider";

/**
 * The tutor's own record, as the website's tutor pages write it (web/src/features/tutor, employees/api.ts): only the
 * fields the rules let a tutor change (phone, date of birth, address, subjects, notification switches), each change
 * with an audit entry in the same batch (category "people").
 */

export type MyDetails = Pick<Staff, "phone" | "dob" | "address">;

const DETAIL_LABELS: Record<keyof MyDetails, string> = { phone: "Phone", dob: "Date of birth", address: "Address" };

/** Saves the details that changed (the website's Profile form), with the website's audit entry for a profile change. */
export async function saveMyDetails(branchId: string, actor: Actor, staffId: string, staffName: string, before: MyDetails, patch: Partial<MyDetails>): Promise<boolean> {
  const changes: AuditChange[] = [];
  const update: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof MyDetails)[]) {
    const from = before[key] ?? (key === "dob" ? null : "");
    const to = patch[key] ?? (key === "dob" ? null : "");
    if (from === to) continue;
    update[key] = to;
    changes.push({ field: key, label: DETAIL_LABELS[key], from, to });
  }
  if (!changes.length) return false;
  const batch = writeBatch(db);
  batch.update(branchDoc(branchId, COL.staff, staffId), { ...update, updatedAt: serverTimestamp(), updatedBy: actor.email });
  addAudit(batch, branchId, actor, {
    action: "staff.update",
    category: "people",
    entityType: "staff",
    entityId: staffId,
    summary: `Updated ${staffName}’s profile`,
    tutorId: staffId,
    tutorName: staffName,
    changes,
  });
  await batch.commit();
  return true;
}

/** Qualifies or unqualifies the tutor for a subject (the website's setQualification: staff.subjectIds only). */
export async function setMySubject(branchId: string, actor: Actor, staffId: string, staffName: string, subject: { id: string; name: string }, on: boolean) {
  const batch = writeBatch(db);
  batch.update(branchDoc(branchId, COL.staff, staffId), {
    subjectIds: on ? arrayUnion(subject.id) : arrayRemove(subject.id),
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  });
  addAudit(batch, branchId, actor, {
    action: "staff.subjects",
    category: "people",
    entityType: "staff",
    entityId: staffId,
    tutorId: staffId,
    tutorName: staffName,
    summary: `${on ? "Added" : "Removed"} ${subject.name} ${on ? "to" : "from"} ${staffName}’s subjects`,
  });
  await batch.commit();
}

/** The four notification switches; a missing one counts as on (as the server reads them). */
export const NOTIFICATION_PREFS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: "announcements", label: "Announcements", description: "New posts and updates from your center" },
  { key: "sessionCreated", label: "Confirmed sessions", description: "When a session assigned to you is confirmed" },
  { key: "sessionChanged", label: "Session changes", description: "When a session’s day, time, subject or tutor changes, or it’s marked No Show" },
  { key: "sessionCanceled", label: "Cancellations", description: "When a confirmed session is canceled, removed or restored" },
];

export function prefsOf(staff: Pick<Staff, "notificationPrefs"> | null | undefined): NotificationPrefs {
  const p = staff?.notificationPrefs;
  return { announcements: p?.announcements !== false, sessionCreated: p?.sessionCreated !== false, sessionChanged: p?.sessionChanged !== false, sessionCanceled: p?.sessionCanceled !== false };
}

/** Turns one notification switch on or off, saved at once. */
export async function setNotificationPref(branchId: string, actor: Actor, staffId: string, staffName: string, current: NotificationPrefs, key: keyof NotificationPrefs, on: boolean) {
  const label = NOTIFICATION_PREFS.find((p) => p.key === key)?.label ?? key;
  const batch = writeBatch(db);
  batch.update(branchDoc(branchId, COL.staff, staffId), { notificationPrefs: { ...current, [key]: on }, updatedAt: serverTimestamp(), updatedBy: actor.email });
  addAudit(batch, branchId, actor, {
    action: "staff.notifications",
    category: "people",
    entityType: "staff",
    entityId: staffId,
    tutorId: staffId,
    tutorName: staffName,
    summary: `${staffName} turned ${on ? "on" : "off"} ${label.toLowerCase()} notifications`,
    changes: [{ field: `notificationPrefs.${key}`, label: `${label} notifications`, from: current[key], to: on }],
  });
  await batch.commit();
}

/**
 * Confirms who it is just before deleting the account (the server wants a sign-in within the last 10 minutes):
 * the password for a password account, Google's account picker for a Google one. False when the person closed it.
 */
export async function confirmIdentity(how: { password: string } | "google"): Promise<boolean> {
  const user = auth.currentUser;
  if (!user?.email) throw Object.assign(new Error("Sign in first."), { code: "auth/no-current-user" });
  if (how !== "google") {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, how.password));
    return true;
  }
  GoogleSignin.configure({ webClientId: env.googleWebClientId });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn({ loginHint: user.email });
    if (!isSuccessResponse(response)) return false;
    if (!response.data.idToken) throw new Error("Google did not send a sign-in token. Try again.");
    await reauthenticateWithCredential(user, GoogleAuthProvider.credential(response.data.idToken));
    return true;
  } catch (e) {
    if (isErrorWithCode(e) && (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS)) return false;
    throw e;
  }
}

/** Deletes the sign-in and the personal profile on the server (the centers' records stay, as the privacy policy says). */
export const deleteMyAccount = callable<Record<string, never>, { ok: boolean }>("deleteMyAccount");
