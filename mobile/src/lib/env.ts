import Constants from "expo-constants";
import { Platform } from "react-native";

const useEmulators = process.env.EXPO_PUBLIC_USE_EMULATORS === "true";
const emulatorHost = process.env.EXPO_PUBLIC_EMULATOR_HOST || "127.0.0.1";

/**
 * The website, for what the app leaves to it (the admin portal, a parent's reports): the live site, or against the
 * emulators the website's local server (`npm run dev:emulators`), where this phone reaches the computer.
 */
function webUrl(): string {
  if (process.env.EXPO_PUBLIC_WEB_URL) return process.env.EXPO_PUBLIC_WEB_URL.replace(/\/+$/, "");
  if (!useEmulators) return "https://hybercrm.com";
  return `http://${Platform.OS === "android" && emulatorHost === "127.0.0.1" ? "10.0.2.2" : emulatorHost}:5174`;
}
const extra = (Constants.expoConfig?.extra ?? {}) as { firebaseFiles?: { ios?: boolean; android?: boolean }; googleWebClientId?: string };

export const env = {
  /** Talk to the local Firebase emulators (the practice copy, see the README). */
  useEmulators,
  /**
   * Where this phone reaches the computer running the emulators. React Native Firebase sends the Android emulator's
   * 127.0.0.1 to the computer (10.0.2.2) by itself.
   */
  emulatorHost,
  /** The ports in firebase.json, as the website's emulator mode uses them. */
  emulatorPorts: { auth: 9099, functions: 5001, firestore: 8080 },
  region: "us-central1",
  /** The Firebase project's OAuth web client, which Google Sign-In needs for a token Firebase accepts (app.config.ts). */
  googleWebClientId: extra.googleWebClientId ?? "",
  webUrl: webUrl(),
  /** Whether this build carries the real project's Firebase file for this platform (app.config.ts). */
  firebaseConfigured: (Platform.OS === "ios" ? extra.firebaseFiles?.ios : extra.firebaseFiles?.android) === true,
  /** When this build was made, and from which commit (scripts/phone.mjs sets both; empty when Expo was run by hand). */
  builtAt: process.env.EXPO_PUBLIC_BUILT_AT || "",
  buildCommit: process.env.EXPO_PUBLIC_BUILD_COMMIT || "",
} as const;

/** What stops this build from working, if anything: a build without the project's Firebase file can only talk to the emulators. */
export const setupProblem: string | null =
  !env.useEmulators && !env.firebaseConfigured
    ? "This build has no Firebase configuration. Add the project's Firebase files to mobile/firebase/ (npm run phone:setup) and build again, or run it against the local emulators (see mobile/README.md)."
    : null;
