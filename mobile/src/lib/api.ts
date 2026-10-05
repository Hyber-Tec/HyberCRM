import { HttpsError, httpsCallable } from "@react-native-firebase/functions";
import { functions } from "./firebase";

/** A Cloud Function the website also calls (functions/src), with its answer typed. */
export function callable<In, Out>(name: string): (data: In) => Promise<Out> {
  const fn = httpsCallable<In, Out>(functions, name);
  return async (data: In) => (await fn(data)).data;
}

/**
 * The codes a Cloud Function throws with a sentence written for people ("Sign in first.", "You can only log your own
 * sessions."). React Native Firebase gives a callable's code bare ("failed-precondition"), the website's SDK with
 * "functions/"; Firestore's and Auth's own errors ("firestore/…", "auth/…") never qualify.
 */
const SPOKEN_CODES = new Set(["invalid-argument", "failed-precondition", "not-found", "already-exists", "permission-denied", "unauthenticated", "resource-exhausted", "out-of-range", "aborted"]);

/** An error in words a person can act on. Functions send their own message; everything else gets a generic line. */
export function errorMessage(e: unknown, fallback = "Something went wrong. Try again."): string {
  if (e && typeof e === "object") {
    const code = "code" in e ? String((e as { code: unknown }).code) : "";
    const message = "message" in e ? String((e as { message: unknown }).message ?? "") : "";
    const fromFunction = e instanceof HttpsError || code.startsWith("functions/");
    if (fromFunction && message && SPOKEN_CODES.has(code.replace(/^functions\//, "")) && !/INTERNAL/.test(message)) return message.replace(/^\[[^\]]+\]\s*/, "");
    if (/network|unavailable|deadline-exceeded/i.test(code) || /network/i.test(message)) return "No connection. Check your internet and try again.";
    if (/permission-denied/.test(code)) return "You don’t have access to do that.";
  }
  return fallback;
}
