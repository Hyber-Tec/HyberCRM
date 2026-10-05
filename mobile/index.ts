import { isRunningInExpoGo } from "expo";

// The app needs its own build: Expo Go has none of its native parts (Firebase, Google sign-in, push), and would
// stop at the first import with a screen of errors. There it shows what to open instead, and loads nothing else;
// everywhere else, the app (Expo Router's entry).
/* eslint-disable @typescript-eslint/no-require-imports -- one of the two, chosen at launch, and only that one loaded */
if (isRunningInExpoGo()) require("./src/ExpoGoNotice");
else {
  // Before the app, as a push may start it in the background (src/lib/pushBackground.ts).
  require("./src/lib/pushBackground");
  require("expo-router/entry");
}
