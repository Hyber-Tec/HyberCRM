# Hyber CRM phone app

The iPhone and Android app for Hyber CRM, built with [Expo](https://expo.dev) (SDK 57) and React Native, the way ycaclock's app is. For now it is the **tutor's portal**: five tabs, **Today, Schedule, Availability, News and Profile**, with session logs and push notifications. Owners, admins, parents and students who sign in see a screen saying their portal comes to the app later, with a button to the website. It uses the same Firebase project (`hyber-crm`), the same Cloud Functions and the same security rules as the website, and the business logic in `../shared`.

How to run it, step by step, is in [docs/running-the-apps.md](../docs/running-the-apps.md); publishing to the stores is [docs/publishing.md](../docs/publishing.md); what to check is [docs/testing-guide.md](../docs/testing-guide.md). Rules for changing the code: [AGENTS.md](AGENTS.md).

## What it does

- **Signing in**, as on the website: **Google** (the recommended way) or an **email and a password** (create an account, confirm the email, reset a forgotten password). A password account reaches nothing until its email is confirmed, because the rules trust confirmed emails only.
- **Which center.** The person's centers come from the member records keyed by their email (`branches/*/members/{email}`): one opens directly, several offer a choice, none shows "No access yet" (or "Waiting for approval" for a sign-up request). The platform's Super Admin sees "Platform account", which points to the website. Paused access says so, with the center's name.
- **The tutor's five tabs** and the screens that open over them: a session (a sheet), its session log (the form, and the submitted log), the notifications inbox, and a day's availability. Times and "today" are always the center's time zone, through `@shared/time`.
- **Notifications** from the server, with the app closed too (see [Push notifications](#push-notifications)), the inbox behind the bell, the number on the iPhone's icon, and a message inside the app for one that arrives while it is open.
- **Delete my account** (Profile → Settings), through the website's `deleteMyAccount` function: the sign-in and the person's own profile and phones go at once; the center's records about its work stay with the center (the privacy policy, https://hybercrm.com/privacy).
- **Which build this is:** the version and build number (`release.json`, which the publishing command counts up), and when and from which commit it was built (`EXPO_PUBLIC_BUILT_AT`, `EXPO_PUBLIC_BUILD_COMMIT`, which `scripts/phone.mjs` sets; `src/lib/env.ts`).
- **The audit log:** every availability, schedule, people, pay and settings change the app makes adds an entry in the same batch, with `via: "app"` (`src/lib/audit.ts`), as the website does.

## Running it

The app needs a **development build**: a version of the app with its native parts (Firebase, Google sign-in, notifications) compiled in, installed once on each simulator or phone. Expo Go can't run it: opened there, it says so and which app to open instead.

**The quickest way**, from the repository root (every step in [docs/running-the-apps.md](../docs/running-the-apps.md)):

- `npm run iphone` or `npm run android` builds a Release build of the real app for the phone plugged into the Mac and installs it. An iPhone's is signed by **HyberTec LLC's team (`YSK7CHH56P`)**, always: the Apple ID on this Mac also belongs to another company's team and has a personal team, which never sign Hyber CRM.
- `npm run iphone:sim` or `npm run android:sim` does all of the steps below by itself, on simulators of their own: the practice copy (the emulators, Demo Academy as of today, the demo logins, today's `firestore.rules`), the practice website (http://127.0.0.1:5174), a build when something native changed, and the development server on port 8081. `npm run iphone:sim:live` and `npm run android:sim:live` do the same on the real project (port 8082).
- `npm run phone:test` runs the Maestro flows ([Checks](#checks)) on a simulator a practice copy runs on.

Those commands choose the practice copy or the real project themselves, so a `.env.local` used with them must not set `EXPO_PUBLIC_USE_EMULATORS`: in a development build, Expo gives the app that file's values over the command's (`.env.example` says the same).

### By hand, against the local emulators

1. Start the emulators from the repository root (Java 21, as `scripts/e2e.sh` uses):

   ```bash
   npm run emulators
   ```

2. In another window, fill them with Demo Academy and its demo logins (the password comes from `HyberCRM_Demo_Accounts.md` or `DEMO_PASSWORD`):

   ```bash
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/seed.ts
   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/demo-accounts.ts
   ```

3. Install the app's packages, then build and install the development build (the first time, and again whenever a package with native code changes; Xcode for iOS, Android Studio with an emulator for Android). Which copy the app talks to is said on the command line, not in a `.env` file:

   ```bash
   cd mobile
   npm install
   EXPO_PUBLIC_USE_EMULATORS=true npx expo run:ios        # iPhone Simulator
   EXPO_PUBLIC_USE_EMULATORS=true npx expo run:android    # Android emulator
   ```

4. From then on, start the app with `EXPO_PUBLIC_USE_EMULATORS=true npx expo start` and open Hyber CRM on the simulator (or press `i` or `a`).
5. The website on the emulators, where the app's links lead on the practice copy: `npm run dev:emulators` (http://127.0.0.1:5174; Google sign-in there is the emulator's stand-in page).

Sign in with the demo tutor (`tutor@demo.hybercrm.com`); there is no Google sign-in against the emulators. The iPhone Simulator reaches the emulators at 127.0.0.1; on the Android emulator React Native Firebase turns 127.0.0.1 into 10.0.2.2 (the Mac) by itself. Against the emulators Firestore keeps no copy on the phone (`src/lib/firebase.ts`), so the practice copy's data never mixes with the real project's.

A development build's developer menu never opens by itself and has no floating button (`app.config.ts`): shake the device (⌃⌘Z in the iPhone Simulator, ⌘M on the Android emulator) or press `m` where the development server runs. On the iPhone Simulator, opening the development server's link may ask "Open in “Hyber CRM”?" (click Open); `maestro/dev-connect.yaml` handles it. After restarting the emulators, sign out, then close and reopen the app: a phone still signed in holds an account they no longer know.

### On a real phone, against the local emulators

Rarely needed (phones use the real Hyber CRM), and possible: the phone and the Mac on the same Wi-Fi; `EXPO_PUBLIC_EMULATOR_HOST` in `mobile/.env.local` set to the Mac's address (`ipconfig getifaddr en0`); the emulators listening on the network (`"host": "0.0.0.0"` for auth, firestore, functions and storage in a copy of `firebase.json`, run with `firebase --config <copy> emulators:start …`); then `EXPO_PUBLIC_USE_EMULATORS=true APPLE_TEAM_ID=YSK7CHH56P npx expo run:ios --device` (or `run:android --device` with USB debugging on).

### Against the real project

- The Firebase project has the app registered: the iOS app and the Android app `com.hybertec.hybercrm`, the Android one with the SHA-1 and SHA-256 of the standard debug key that every `expo prebuild` project signs its builds with. Google Play's upload key and app signing key still need adding when the first store build comes ([docs/publishing.md](../docs/publishing.md), part 4).
- Their files, `GoogleService-Info.plist` and `google-services.json`, go in `mobile/firebase/` (git-ignored); `npm run phone:setup` downloads them with the Firebase CLI. EAS builds would get them from the file environment variables `GOOGLE_SERVICES_PLIST` and `GOOGLE_SERVICES_JSON`.
- Google sign-in needs the project's web client, which `app.config.ts` reads from `google-services.json` (`client_type` 3; `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` overrides it), and on iPhone the reversed client id from `GoogleService-Info.plist`, its return address.
- A build without the project's Firebase files uses the placeholders in `firebase/emulator/`, which hold no keys and only work against the emulators; such a build says so on its first screen.

## Push notifications

- **The server** (`functions/src/notify.ts`, `functions/src/push.ts`) writes each notification to the center's inbox (`branches/{b}/notifications`), honoring the tutor's switches (`staff.notificationPrefs`), and pushes it through Firebase Cloud Messaging to the recipient's phones: `users/{uid}/devices/{deviceId}`, found by email. The iPhone's badge is the recipient's unread count; Android shows each on its channel, `sessions` or `announcements` (`shared/src/push.ts`). Tokens the push service rejects are removed.
- **The app** keeps this phone's token on the signed-in person's record only while notifications are allowed and someone is signed in (`src/lib/push.ts`): it is written again when the app comes to the front or Firebase replaces it, and removed at sign-out. Tapping a notification opens its screen, also from a cold start (`src/state/NotificationsProvider.tsx`, `src/lib/targets.ts`, `appTargetOf` in `shared/src/push.ts`); one that arrives with the app open becomes a message in the app instead of a banner (`src/lib/notify.ts`). Profile → Notifications shows the token, for a test message from the Firebase console.
- **Android** works with `google-services.json`, on a phone or an emulator with Google Play.
- **iPhone** needs two things: HyberTec's **APNs key** uploaded to Firebase (Project settings → Cloud Messaging → Apple app configuration; **not done yet**, steps in [docs/publishing.md](../docs/publishing.md#push-notifications-on-iphone-the-apns-key)), and a build signed by HyberTec's team, which `npm run iphone` and the store builds are. The iPhone Simulator gets no pushes; a build signed by a free personal team (`APPLE_PERSONAL_TEAM=1`, never used for Hyber CRM) would have no push capability at all.

## Checks

```bash
npm run typecheck    # the app, with the shared code it uses
npm run lint
```

`maestro/` holds [Maestro](https://maestro.dev) flows that drive the app on the iPhone Simulator or the Android emulator, against the practice copy:

- `dev-connect.yaml` (development builds): opens the development server on `PORT` from Expo's launcher, accepts "Open in “Hyber CRM”?", and puts away the developer menu.
- `sign-in.yaml`: signs in with `EMAIL` and `PASSWORD` (the demo tutor) and waits for Today.
- `today.yaml`, `schedule.yaml`, `availability.yaml`, `news.yaml`, `profile.yaml`: each tab and the screens that open from it (a session's sheet, a day's availability, a post with its comments, the profile's pages); they change only the practice copy's demo data (their first lines say what).
- `inbox.yaml`: the notifications inbox, opened as the bell does: an announcement opened from it, a session item (any kind: "Time Changed", "New Session"…) swiped away, the rest marked read (it needs both kinds in the demo tutor's inbox: post an announcement with "Notify", and add, move or change a session of Maya's within 24 hours).
- `session-log.yaml`: a session log filled in step by step, submitted, read back and edited, and the submit refused for a session that hasn't started (it needs `SESSION`, an ended session of the demo tutor without a log, and `FUTURE`, one that hasn't started).
- `screenshots/tab.yaml`: opens the tab `TAB` for the stores' screenshots (`npm run publish:screenshots`).
- `steps/`: steps the flows run, not tests of their own: `tab.yaml` opens a tab (`TAB` and its name `LABEL`), `back.yaml` goes back a page.

**iPhone and Android:** every flow runs on both. The differences live in `steps/`: on Android Maestro can't see the native tab bar's test ids, so a tab is tapped by its name on the tab bar (Material's label view, since a screen can show the same word), and the header's back button is Android's own "Navigate up", so `back.yaml` presses the system back there (iOS taps `BackButton`). A new flow opens tabs and goes back through these steps.

The simplest way: with `npm run iphone:sim` (or `android:sim`) running in one window, run `npm run phone:test` in another. It signs the app out, runs `dev-connect.yaml` and `sign-in.yaml`, then every other flow in `maestro/` (or those named: `npm run phone:test -- news`), each starting from the signed-in app, with `PORT`, `EMAIL` and `PASSWORD` given to it, plus any `NAME=value` on the command line (`npm run phone:test -- session-log SESSION=… FUTURE=…`). A flow that uses a value nobody gave is skipped, with the line that runs it; the flows have no values of their own for these, since those would win over the command line. A new flow goes in `maestro/`, starts from the signed-in app, says in its first lines what it needs, and finds things by their `testID` (screens and key controls have one, AGENTS.md). By hand:

```bash
maestro --device <id> test -e PORT=8081 maestro/dev-connect.yaml
maestro --device <id> test -e EMAIL=tutor@demo.hybercrm.com -e PASSWORD='…' maestro/sign-in.yaml
```

(`maestro list-devices`, or `xcrun simctl list devices booted`, gives the id.)

## How it is put together

```
app.config.ts          native configuration: ids, version and build (release.json), Firebase files, plugins (the iOS 27
                       scene life cycle, no developer-menu introduction, Google Play's upload key, plain HTTP to the
                       emulators in Release builds)
metro.config.js        builds ../shared into the app (imported as @shared/...)
firebase/emulator/     keyless Firebase files for builds that only talk to the emulators
src/app/               screens (Expo Router). Signed out: sign-in, sign-up, forgot-password, verify-email; signed in:
                       (app)/, which picks the center and the portal of the person's one role
  (app)/(tutor)/       the tutor portal: (tabs) Today · Schedule · Availability · News · Profile, and the screens that
                       open over them (session/[id], log/[id], log-view/[id], notifications, availability-day)
  (app)/coming-soon    owners, admins, parents and students: their portal comes to the app later
src/state/             Auth, Access (the centers), Branch (the center's settings, rules, time zone, member, staff),
                       Appearance and Notifications providers
src/features/<area>/   each area's data hooks and components
src/components/        the shared building blocks, in the website's neutral look, light and dark
src/lib/               Firebase, Firestore hooks, callables, audit, push, notifications, links, device, env
src/theme/             colors, spacing and type sizes
maestro/               the test flows (above)
```

`ios/` and `android/` are made from `app.config.ts` by `npx expo prebuild` (`scripts/phone.mjs` does it when something native changed: the packages, `app.config.ts`, `release.json`, the Firebase files, the upload key, the icons). They are git-ignored and never edited by hand. `scripts/publish.mjs` builds the stores' versions from the same project; `eas.json` is there for Expo's cloud builds, which the commands don't use.
