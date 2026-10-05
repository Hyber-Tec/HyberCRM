import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteDoc, doc, serverTimestamp, setDoc } from "@react-native-firebase/firestore";
import { deleteToken, getMessaging, getToken, isDeviceRegisteredForRemoteMessages, onTokenRefresh, registerDeviceForRemoteMessages } from "@react-native-firebase/messaging";
import { ROOT, USER_COL } from "@shared/paths";
import { Platform } from "react-native";
import { appVersion, deviceLabel, getDeviceId } from "./device";
import { auth, db } from "./firebase";
import { notificationPermission } from "./notify";

/**
 * Push notifications from the server (functions/src/push.ts), through Firebase Cloud Messaging on both phones. This
 * install's token is kept in `users/{uid}/devices/{deviceId}` with the signed-in email, which is how the server finds
 * a person's phones; it is removed when the app signs out, so a shared phone gets nothing more for the last person.
 */

/** What this phone stored, for whom, and when: written again only when it changed, or once a week. */
const STORED_KEY = "hybercrm.pushDevice";
const REWRITE_AFTER_MS = 7 * 86_400_000;

interface Stored {
  uid: string;
  token: string;
  savedAt: number;
}

const within = <T,>(promise: Promise<T>, ms: number): Promise<T | null> => Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

async function readStored(): Promise<Stored | null> {
  try {
    const raw = await AsyncStorage.getItem(STORED_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

/**
 * This phone's token, or null when this build cannot receive pushes: an iPhone build signed by a personal Apple team
 * has no push capability, and the iPhone Simulator gets none. Profile → Notifications shows it for tests.
 */
export async function currentPushToken(): Promise<string | null> {
  const m = getMessaging();
  try {
    if (Platform.OS === "ios" && !isDeviceRegisteredForRemoteMessages(m)) await within(registerDeviceForRemoteMessages(m), 10_000);
    return (await within(getToken(m), 15_000)) || null;
  } catch {
    return null;
  }
}

async function save(uid: string, email: string, token: string): Promise<void> {
  const id = await getDeviceId();
  await setDoc(
    doc(db, ROOT.users, uid, USER_COL.devices, id),
    { token, email, platform: Platform.OS === "ios" ? "ios" : "android", appVersion: appVersion(), label: deviceLabel(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true },
  );
  await AsyncStorage.setItem(STORED_KEY, JSON.stringify({ uid, token, savedAt: Date.now() } satisfies Stored)).catch(() => undefined);
}

/** Puts this phone's token on the signed-in person's record, when notifications are allowed and this build can get them. */
export async function registerThisDevice(force = false): Promise<void> {
  const user = auth.currentUser;
  if (!user?.email || !user.emailVerified) return;
  if ((await notificationPermission()) !== "granted") return;
  const stored = await readStored();
  // Someone else was signed in on this phone before: theirs goes first (it would have gone at their sign-out).
  if (stored && stored.uid !== user.uid) await forget(stored);
  const token = await currentPushToken();
  if (!token) return;
  if (!force && stored?.uid === user.uid && stored.token === token && Date.now() - stored.savedAt < REWRITE_AFTER_MS) return;
  await save(user.uid, user.email.toLowerCase(), token).catch(() => undefined);
}

/** Calls `listener` with this phone's new token when Firebase replaces it. */
export const onPushTokenChange = (listener: (token: string) => void): (() => void) => onTokenRefresh(getMessaging(), listener);

async function forget(stored: Stored): Promise<void> {
  const id = await getDeviceId();
  await deleteDoc(doc(db, ROOT.users, stored.uid, USER_COL.devices, id)).catch(() => undefined);
  await AsyncStorage.removeItem(STORED_KEY).catch(() => undefined);
  // A new token next time, so nothing sent to the old one reaches this phone.
  await deleteToken(getMessaging()).catch(() => undefined);
}

/**
 * This phone stops getting the signed-in person's notifications (at sign-out). Gives up after a few seconds, so
 * signing out never waits on it.
 */
export async function forgetThisDevice(): Promise<void> {
  const work = (async () => {
    const stored = await readStored();
    if (stored) await forget(stored);
  })().catch(() => undefined);
  await within(work, 3000);
}
