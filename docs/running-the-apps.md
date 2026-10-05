# Running the apps

How to open the Hyber CRM phone app in the iPhone Simulator and the Android emulator, put the newest version on your real iPhone and your Samsung (or any Android) phone over the cable, tell which version a device has, and get past a build that fails. Written for someone who has never done mobile development and remembers nothing from last time: every command is written out, and every step that only a person can do (unlock a phone, tap Trust) says so.

The website needs none of this: Claude Code deploys it (`npm run deploy:hosting`), and you open it at https://hybercrm.com.

## Before anything else: the three things to know

1. **There are two copies of Hyber CRM.** The **real one** is hybercrm.com and its data: real centers, real people, real notifications. The **practice copy** is a whole Hyber CRM running only on this Mac (Firebase's emulators) with **Demo Academy**, a made-up center filled in as of the day it starts: tutors, students and sessions around today. Nothing you do there reaches anyone, and it forgets everything when it stops. Real phones only ever use the real one (they can't reach a copy that lives on your Mac). Simulators can use either.
2. **A simulator is a phone in a window on your Mac.** Apple's is called the *iPhone Simulator*; Android's is called the *emulator*. Both run the real phone software, so the app looks and behaves as on a phone, with a few limits listed further down (no push notifications on the iPhone Simulator).
3. **Every command is typed in Terminal, in the HyberCRM folder.** Press **⌘ Space**, type `Terminal`, press **Return**. Then type this and press Return:

   ```bash
   cd ~/Documents/Projects/HyberCRM
   ```

   You do that once per Terminal window. Everything below assumes you are there. The easiest way of all is to ask Claude Code in that folder ("put the app on my iPhone", "open the Android emulator", "stop the app"): it runs the same commands.

## The demo logins

Demo Academy has three people who sign in with an email and a password, for trying the app as they would:

| Who | Email | In Demo Academy |
| --- | --- | --- |
| Tutor | `tutor@demo.hybercrm.com` | Maya Thompson |
| Parent | `parent@demo.hybercrm.com` | Ava Patel's parent |
| Student | `student@demo.hybercrm.com` | Ava Patel |

The password is in **`HyberCRM_Demo_Accounts.md`** in the HyberCRM folder (on this Mac only: it is never in git, because the repository is public). The phone app is the **tutor's** for now: the parent and the student see a screen saying their part comes to the app later, with a button to the website.

The practice copy always has these logins. **The real Hyber CRM has them once they are made there:** `npx tsx scripts/demo-accounts.ts` (it reads the password from the same file; or ask Claude Code "make the demo logins on the real Hyber CRM"). Everything the demo tutor does on the real Hyber CRM stays inside Demo Academy, the made-up center, so it is the safe account to try the app with on your phones.

## The commands

| Command | What it does |
| --- | --- |
| `npm run iphone` | Builds the app and puts it on **your iPhone**, plugged into the Mac with its cable. The real Hyber CRM. |
| `npm run android` | The same for **your Android phone**, plugged in with its cable. The real Hyber CRM. |
| `npm run iphone:sim` | Opens the **iPhone Simulator** with the app on the **practice copy**. |
| `npm run android:sim` | Opens the **Android emulator** with the app on the **practice copy**. |
| `npm run iphone:sim:live` | The iPhone Simulator on the **real** Hyber CRM. |
| `npm run android:sim:live` | The Android emulator on the **real** Hyber CRM. |
| `npm run phone:test` | Runs the app's automatic test flows on the simulator a `:sim` command has open (see [docs/testing-guide.md](testing-guide.md)). |
| `npm run phone:setup` | Gets a Mac ready and lists what is left for you to do by hand. For a new computer, or when something is missing. |

Each command first checks and does whatever is needed (the app's packages, the Firebase files, a new build when something in the app changed, for the simulators the practice copy itself), then opens the app. **The first build takes 10 to 20 minutes**; after that a phone gets a new version in a few minutes and a simulator opens in about a minute. The command prints a line starting with **✓** when the app is open or installed, and says in plain words what is wrong when something is.

Two options can be added after `--`:

- `npm run iphone:sim -- --fresh` fills Demo Academy again (as of today) and signs the app out first, as on a new install.
- `npm run iphone -- --rebuild` (or any other command) builds the app again from scratch, for when a build is broken. It takes as long as the first time.

For a phone, the command finishes by itself once the app is installed. For a simulator, **leave the Terminal window open** while you use the app: it feeds the app its code. When you are done, click in that window and press **Ctrl+C**: it stops the practice copy too, when this window started it (one started elsewhere, by another window or by Claude Code, keeps running and is shared). The simulator window stays open; close it or leave it.

## The iPhone Simulator

1. Run:

   ```bash
   npm run iphone:sim
   ```

   The first time it makes a simulator called **Hyber CRM Practice** (an iPhone 17 on the newest iOS), starts the practice copy, builds the app and opens it. Later runs take about a minute. Wait for the line `✓ Hyber CRM is open on the simulator "Hyber CRM Practice", on the practice copy (Demo Academy, on this Mac).`
2. If the simulator asks **"Open in “Hyber CRM”?"**, click **Open**. A simulator's copy also has a developer menu (Reload, and tools Claude Code uses), which never opens by itself: **⌃⌘Z** in the iPhone Simulator (**⌘M** in the Android emulator), or press **m** in the Terminal window, opens it. Your phones and the stores never have it.
3. **Sign in** with the demo tutor: `tutor@demo.hybercrm.com` and the password from `HyberCRM_Demo_Accounts.md`. There is no Google sign-in on the practice copy.
4. Useful keys: **⌘S** takes a screenshot (saved on the Desktop). **⇧⌘H** is the Home button. **⇧⌘A** switches between light and dark. If typing does not reach the iPhone: menu bar **I/O → Keyboard → Connect Hardware Keyboard**.
5. **Stop:** click in the Terminal window and press **Ctrl+C**.

The same on the real Hyber CRM: `npm run iphone:sim:live` makes a second simulator, **Hyber CRM Live**, where you sign in with Google or an email and a password, and everything is real.

## The Android emulator

1. Run:

   ```bash
   npm run android:sim
   ```

   The first time it makes an emulator called **HyberCRM_Practice** (a Pixel 9 on Android 16 with Google Play), builds the app and opens it. Wait for the `✓ Hyber CRM is open on …` line. If the emulator's window stays black for more than a couple of minutes, close it and run the command again.
2. **Sign in** with the demo tutor, as on the iPhone Simulator.
3. The strip beside the phone has Back, Home and Recent apps, and **⋯** for more (rotate, take a screenshot).
4. **Stop:** **Ctrl+C** in the Terminal window. The emulator stays open; close its window when you like.

`npm run android:sim:live` is the same on the real Hyber CRM (emulator **HyberCRM_Live**). The Android emulator has Google Play, so on the real Hyber CRM it gets push notifications like a phone.

## The practice website: acting as the center

While a `:sim` command runs on the practice copy, the website runs on it too, at **http://127.0.0.1:5174** (open it in Chrome, and type the numbers rather than `localhost`, which another program on this Mac may answer). That is where you play Demo Academy's admin, to make the changes the tutor app should see: add a session for Maya Thompson, post an announcement.

1. Open http://127.0.0.1:5174 and click **Continue with Google**. On the practice copy a stand-in Google page opens instead of Google's: **Add new account**, type `goochoi913@gmail.com` (the Super Admin there) and a name, then **Sign in with Google.com**.
2. You land on the Platform page: open **Demo Academy**, and you are in its admin portal.
3. Or sign in with the demo parent or student and the demo password, to see the website as them.

The app's own links to the website (on the practice copy) open this one too.

## Your real iPhone

`npm run iphone` puts the **real Hyber CRM** on the iPhone plugged into the Mac, as a finished app: it runs on its own afterwards, with no cable and no Mac, until you install a newer version. It is signed by **HyberTec LLC's** Apple Developer team, so **an install keeps opening for a year**; the command prints the exact day it stops. Before that day, plug in and run the command again: a new year. Push notifications reach it once HyberTec's push key is in Firebase ([docs/publishing.md](publishing.md#push-notifications-on-iphone-the-apns-key), not done yet).

### The first time on a new iPhone (or a new Mac)

Step 1 is done once per Mac; 2 and 3 once per iPhone. **This Mac and your iPhone are ready** (checked 2026-10-04: Xcode signs for HyberTec LLC, and your iPhone is paired with Developer Mode on, from ycaclock): skip to [Every time](#every-time).

1. **Xcode signs for HyberTec LLC.** In Xcode: **Xcode → Settings… → Accounts**. If the Apple ID that is on HyberTec LLC's team is not listed, click **+**, choose **Apple Account**, **Continue**, sign in. Click the Apple ID, then the **HyberTec LLC** line, then **Manage Certificates… → + → Apple Development → Done**. Your Apple ID also belongs to Young Corporation of America's team and has a personal team: the command always picks HyberTec LLC for Hyber CRM, and never the others.
2. **On the iPhone, turn on Developer Mode:** Settings → Privacy & Security → **Developer Mode** (at the very bottom) → on → **Restart** → after the restart, **Turn On**.
3. **Plug the iPhone into the Mac** with its cable and **unlock it**. If it asks "Trust This Computer?", tap **Trust** and enter the passcode. Keep it unlocked while the command runs.

The first `npm run iphone` also registers the iPhone with HyberTec LLC's team and creates the app's identity (`com.hybertec.hybercrm`) in HyberTec's Apple account, by itself.

### Every time

1. Plug the iPhone in, unlock it, leave it unlocked.
2. Run:

   ```bash
   npm run iphone
   ```

   It says what it is doing step by step (`▸ …`), builds only what changed (a few minutes; 10 to 20 the first time), installs the app, opens it, and ends with `✓ Hyber CRM is on <your iPhone>, and runs without the Mac.` plus the day this install stops opening. Unplug.
3. On the phone: **sign in** with the demo tutor (or your own account at a center). Allow notifications when the app asks.

## Your real Android phone

`npm run android` does the same for an Android phone plugged in with its cable. An Android phone keeps the app for good (no yearly reinstall, no Apple account), and push notifications work.

### The first time on a new Android phone (a Samsung)

1. On the phone: **Settings → About phone → Software information**, tap **Build number** seven times. The phone asks for your PIN, then says "Developer mode has been turned on". (On other Android phones, Build number is right under About phone.)
2. Back in **Settings**, at the very bottom: **Developer options → USB debugging: on**. (On other phones: Settings → System → Developer options.)
3. Plug the phone into the Mac. On the phone, "Allow USB debugging?": tick **Always allow from this computer**, tap **Allow**. If the phone asks what the USB connection is for, choose **Transferring files** or **Charging only**; either works.

### Every time

1. Plug the phone in and unlock it.
2. Run:

   ```bash
   npm run android
   ```

   It ends with `✓ Hyber CRM is on <your phone>, and runs without the Mac.` Unplug.
3. On the phone: sign in; allow notifications when the app asks.

If it says the phone has Hyber CRM "signed differently" (a copy from Google Play, or from before the Google Play upload key existed), delete Hyber CRM from the phone once and run the command again.

## Which version is on a device

- **The phone app:** the app's **Profile → Settings → Version** shows the version and the build number (`mobile/release.json`, which every store release raises) and, for a copy built on this Mac, from which commit and when it was built (seven characters such as `f716af7`; in Terminal, `git log -1 --format=%h` shows the one your folder is on).
- **A simulator:** the same. A simulator's app also reloads by itself when the code changes while the command runs, so it is always the code in your folder.

## When a build fails

The commands say in plain words what is wrong when they know it, and what to do. Otherwise, in this order:

1. **Run the same command again.** A download that failed halfway is the most common cause.
2. **Read the last lines** the command printed. "No iPhone is plugged in", "Developer Mode is off", "needs Java 21" and the like say exactly what to do.
3. **Ask Claude Code**, for example "npm run iphone fails, please fix it". It reads the full logs, which are in `mobile/.expo/logs/`.
4. **Build from scratch:** `npm run iphone -- --rebuild` (or the command that failed, with `-- --rebuild`).
5. **After Xcode updated itself** (the App Store updates it): open Xcode once, let it install what it asks for, then run the command again.

| What you see | What to do |
| --- | --- |
| Hyber CRM on the iPhone no longer opens, about a year after it was installed | Expected: plug in and run `npm run iphone`. |
| "Xcode can't sign for HyberTec LLC" | Step 1 of [The first time on a new iPhone](#the-first-time-on-a-new-iphone-or-a-new-mac), then run it again. |
| "No iPhone is plugged in" although it is | Unlock the phone, use a data cable (some charge-only cables carry no data), tap **Trust** if it asks. |
| "Untrusted Developer" when opening the app | On the iPhone: Settings → General → VPN & Device Management → **HyberTec LLC** → **Trust**. |
| The app says "Something went wrong" or keeps loading after the practice copy was stopped and started | In the app: sign out (Profile), close the app (swipe it away) and open it again. Or `npm run iphone:sim -- --fresh`. |
| A red screen with an error in the app | A mistake in the app's code. Take a screenshot (⌘S in the Simulator, or the phone's own) and give it to Claude Code. |
| "Port 8081 … is taken by another program" | Another Terminal window already runs a development server. Press Ctrl+C there, or close that program. |
| "Port 8080 (or 9099, 5001, 9199) … is taken" | An old practice copy is still running somewhere: press Ctrl+C in its window. If you don't know where: ask Claude Code. |
| "The practice copy didn't start" | Run it again. If it still fails: "the practice copy won't start" to Claude Code. |
| "The demo logins' password isn't on this Mac" | Put `HyberCRM_Demo_Accounts.md` back in the HyberCRM folder (from your backup), with its `Password:` line. |
| The Android emulator stays black, or "didn't finish starting" | Close its window and run the command again. If that does not help: Android Studio → **Device Manager** → the **⋮** next to HyberCRM_Practice → **Wipe Data**. |
| The Android phone is not found | On the phone, Developer options → USB debugging on; unplug and plug in again; tap **Allow** on the phone. |
| "signed differently" when installing on the Android phone | Delete Hyber CRM from the phone, then run `npm run android` again. |

## What a simulator cannot do

- **No push notifications on the iPhone Simulator** (Apple's push service does not deliver ours to simulators). The app's notification inbox (the bell) still shows everything. The Android emulator, which has Google Play, does get pushes on the real Hyber CRM. Real phones both do.
- **The practice copy sends no pushes you can count on** either: its notifications show in the app's inbox. Test pushes on the real Hyber CRM ([docs/testing-guide.md](testing-guide.md), section 8).
- **No Google sign-in on the practice copy**: it has no Google. Sign in there with the demo logins.
- No camera, no real phone calls, no Face ID. The app uses none of these.

## A brand new Mac, from scratch

What this Mac has (checked 2026-10-04: macOS 27, Xcode with iOS 27 and iOS 26.4 simulators, Node 24, Android Studio with the Android 16 image, Java 17 and 21, CocoaPods, Maestro, the Firebase CLI 15 signed in as goochoi913@gmail.com, Homebrew), and what a new one needs again, in this order. Each is a download and a few clicks; allow an afternoon, mostly waiting.

1. **Xcode**, from the Mac App Store (sign in with your Apple ID; it is large). Open it once, click **Agree**, and let it install its extra parts. In Terminal afterwards: `sudo xcode-select -s /Applications/Xcode.app` (it asks for your Mac password).
2. **Homebrew**, from https://brew.sh: copy the one line it shows into Terminal and press Return (it asks for your Mac password and takes a few minutes).
3. **Node.js**, the "LTS" version from https://nodejs.org (a normal installer).
4. **Android Studio**, from https://developer.android.com/studio (only for Android): drag it into Applications, open it once, choose the **Standard** setup and let it download.
5. **The Firebase CLI:** in Terminal, `npm install -g firebase-tools`, then `firebase login` (it opens the browser: sign in with **goochoi913@gmail.com**). It lets the setup download the app's Firebase files and runs the practice copy.
6. **The repository:** in Terminal, `cd ~/Documents/Projects && git clone https://github.com/Hyber-Tec/HyberCRM.git`, then `cd HyberCRM`. Copy from the old Mac the files that are never in git: **`web/.env.local`** (the website's settings), **`HyberCRM_Demo_Accounts.md`** (the demo password), **`functions/.secret.local`** (the server's secrets for the practice copy), and, only for publishing, the folder **`mobile/.publish/`**. Then `npm install`.
7. **`npm run phone:setup`.** It installs the rest by itself (packages, CocoaPods, Java 17 and 21, the Android phone image and the emulators), downloads the app's Firebase files into `mobile/firebase/`, and ends with a numbered list of anything left for you to do by hand, with the exact steps. For the test flows it also wants **Maestro**: `curl -Ls "https://get.maestro.mobile.dev" | bash`.
8. **For your iPhone:** step 1 of [The first time on a new iPhone](#the-first-time-on-a-new-iphone-or-a-new-mac) (sign Xcode in to HyberTec LLC and make the certificate). The phone itself is already set up.

If the Firebase CLI cannot be used, the two Firebase files can be downloaded by hand: [Firebase console](https://console.firebase.google.com/project/hyber-crm/settings/general) → **Your apps** → the iOS app (`com.hybertec.hybercrm`) → **GoogleService-Info.plist**, and the Android app → **google-services.json**. Save both in `mobile/firebase/`.

## Where things are

| | |
| --- | --- |
| `mobile/` | The app's code. How it is built: [mobile/README.md](../mobile/README.md). |
| `scripts/phone.mjs` | The commands above. `scripts/publish.mjs`: the publishing commands ([docs/publishing.md](publishing.md)). |
| `mobile/release.json` | The version and build number the app shows and the stores get. |
| `mobile/firebase/GoogleService-Info.plist`, `mobile/firebase/google-services.json` | The hyber-crm project's Firebase settings for the iPhone and Android apps. Never in git; `npm run phone:setup` downloads them (again, when they changed in the Firebase console). |
| `mobile/.expo/logs/` | What the practice copy, its website, the emulator and the phone builds printed, for when something goes wrong. |
| `mobile/ios/`, `mobile/android/` | The native projects, made by the commands from `mobile/app.config.ts`. Never edited by hand, never in git. |
| `HyberCRM_Demo_Accounts.md` | The demo logins and their password. On this Mac only. |
