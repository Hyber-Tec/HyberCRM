import { getApp } from "@react-native-firebase/app";
import { connectAuthEmulator, getAuth } from "@react-native-firebase/auth";
import { connectFirestoreEmulator, getFirestore, initializeFirestore } from "@react-native-firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "@react-native-firebase/functions";
import { env } from "./env";

/**
 * The Firebase project, through the native SDKs (configured by the Google services files, see app.config.ts).
 * Firestore keeps its data on the phone, so the app opens straight from it and works offline for what was seen
 * before; against the emulators it does not, so data from the practice copy never mixes with the real project's.
 */
export const app = getApp();
export const auth = getAuth(app);
export const db = env.useEmulators ? initializeFirestore(app, { persistence: false }) : getFirestore(app);
export const functions = getFunctions(app, env.region);

if (env.useEmulators) {
  const host = env.emulatorHost;
  connectAuthEmulator(auth, `http://${host}:${env.emulatorPorts.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, env.emulatorPorts.firestore);
  connectFunctionsEmulator(functions, host, env.emulatorPorts.functions);
}
