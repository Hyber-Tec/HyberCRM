# Publishing the phone app

How to get Hyber CRM onto people's phones through Apple and Google: TestFlight first, then a **public App Store listing** and a **public Google Play release**; what each step costs and how long it takes; what Apple and Google ask for that is not code (written for you in [docs/store/](store/)); how to put out updates afterwards with one command; and how to test push notifications from Firebase itself. Written so you can do it alone. Nothing in it needs Claude Code except where it says "ask Claude Code".

The app is listed **publicly** on both stores (the owner's permanent decision, 2026-10-04): anyone can find it, and it is useful to the tutors of any center that uses Hyber CRM. There is no unlisted or private route to take.

Start with [Where things stand](#where-things-stand-checked-on-2026-10-05) and [What Apple and Google will check](#what-apple-and-google-will-check): the first is your to-do list, the second explains the one real decision (Sign in with Apple).

## Where things stand (checked on 2026-10-05)

**Done:**
- **HyberTec LLC's Apple Developer account**: team `YSK7CHH56P`, an organization, paid. Xcode on this Mac signs for it (its Apple Development certificate is in the keychain), and `npm run iphone` puts the app on your iPhone with it.
- **Firebase**: the iPhone app (`1:196610922641:ios:c12cba96e87d19d1ba0730`) and the Android app (`1:196610922641:android:35ef79293b6f357aba0730`) are registered in the hyber-crm project, the Android one with the standard debug key's SHA-1 and SHA-256, so Google sign-in works in builds made on this Mac. Their files are in `mobile/firebase/` (`npm run phone:setup` downloads them again).
- **The app's identity**: Hyber CRM, `com.hybertec.hybercrm`, version 1.0.0 (`mobile/release.json` holds the version and the number of the last build uploaded). It declares only standard encryption, so App Store Connect asks no export question.
- **App Store Connect** (2026-10-05): the API key and its `appstore.json` are in `mobile/.publish/` (the key matches its Key ID; the folder is not in git), the app record exists (Hyber CRM, `com.hybertec.hybercrm`, SKU `hybercrm`), and the first build, **1.0.0 (build 2)**, is uploaded.
- **TestFlight for you** (2026-10-05): the internal group `HyberTec` (automatic distribution on) has you in it, and your iPhone runs 1.0.0 (2) from TestFlight. That build works until 2027-01-03; any newer upload starts its own 90 days.
- **Push notifications on iPhone** (2026-10-05): HyberTec's APNs key is in Firebase, and Firebase's test send to your iPhone went through. It is a **Topic Specific** key for `com.hybertec.hybercrm`, because the team already had the two Team Scoped keys Apple allows ([below](#push-notifications-on-iphone-the-apns-key)).
- **In the app, what the stores look for**: Profile → Settings → **Delete my account** (it asks for the password, or Google, then the server function `deleteMyAccount` deletes the account: Apple's guideline 5.1.1(v), Google's account deletion policy), a **Privacy policy** link and the **Version** line, in the same Settings.
- **The commands**: `npm run publish:iphone`, `npm run publish:android`, `npm run publish:screenshots`; and every text the stores ask for, in [docs/store/](store/).
- **The privacy policy**: `web/public/privacy.html`, online at https://hybercrm.com/privacy.
- **Demo Academy** runs by itself on the real Hyber CRM, with its demo logins (tutor, parent and student; the password is in your `HyberCRM_Demo_Accounts.md`). Apple's and Google's reviewers sign in as the demo tutor.
- **Delete my account** is on every screen an account can be stuck on, not only in Profile → Settings: No access yet, Waiting for approval, Confirm your email, the center chooser, a paused account and "coming to the app" (an invited parent or student never reaches Profile). Apple tests deletion with an account it creates itself, which no center has added.

**Left for you, in this order** (each is explained further down):
1. **Decide the sign-in question** (Sign in with Apple, guideline 4.8): [below](#sign-in-with-apple-guideline-48-the-honest-picture). The recommendation is to submit as it is and claim the exception; it costs nothing to try.
2. **Start the Google Play account now** ([part 4](#part-4-google-play-public), step 1): it costs $25 and Google's checks of HyberTec LLC can take days to weeks, so it should run while you do the Apple steps.
3. **TestFlight for tutors at a center** ([part 2](#part-2-testflight), step 6), when you want them to try it.
4. **Screenshots**: `npm run publish:screenshots` ([part 3](#part-3-the-app-store-public), step 2).
5. **The App Store submission** ([part 3](#part-3-the-app-store-public)), then **Google Play** ([part 4](#part-4-google-play-public)).

## What Apple and Google will check

### Deleting an account (Apple 5.1.1(v), Google's account deletion policy)

An app where people can create an account must let them delete it from inside the app; Google also wants a web page that says how. Ours: **Profile → Settings → Delete my account** in the app, and the policy's section https://hybercrm.com/privacy#delete for the web. Deleting removes the sign-in and the person's own profile and phones at once; the records a center keeps about its work (sessions, logs, pay, the audit log) stay with the center, which the rules allow when the privacy policy says so (it does).

Apple's reviewer will most likely create a new account with **Create an account** and look for the button there. Such an account belongs to no center, so it sees "No access yet" and never reaches Profile: the button must be on that screen too, and it is ([Where things stand](#where-things-stand-checked-on-2026-10-05)).

### Sign in with Apple (guideline 4.8): the honest picture

The app signs people in two ways: **Google**, and **an email with a password** (its own accounts). Apple's guideline 4.8 says an app that uses a third-party sign-in such as Google for the person's main account must also offer an equivalent one that collects no more than the name and email, **lets people keep their email address private**, and doesn't track them for advertising. In practice that means **Sign in with Apple**. An app's own email-and-password accounts don't count as the equivalent (people can't hide their email in them).

Apple lists exceptions. The one that fits Hyber CRM: *"Your app is an education, enterprise, or business app that requires the user to sign in with an existing education or enterprise account."* Nobody gets anything from Hyber CRM without an account their center made: a center adds a person's email address (a tutor, a parent, a student), only that address opens the center, and Google or a password are two ways of proving it is that address. Apple's rules read this way on 2026-10-04 (https://developer.apple.com/app-store/review/guidelines/#login-services); check the page again before submitting.

**The risk, honestly:** reviewers apply 4.8 unevenly. The app also has **Create an account**, which a reviewer may read as accounts made in the app rather than existing ones. If Apple disagrees, the cost is a rejection message and a round trip of one to three days, not the app.

**The two ways forward:**

1. **Claim the exception** (recommended first; costs nothing). The review notes already do it ([docs/store/review-notes.md](store/review-notes.md), "SIGN-IN"). If Apple still answers with 4.8, reply once from the same message with the text in the review notes ("If Apple answers with guideline 4.8"); if it holds, take way 2.
2. **Add Sign in with Apple** (two to three days of work for Claude Code). The catch: with Sign in with Apple a person may choose **Hide My Email**, and Hyber CRM then gets an address like `abcd1234@privaterelay.appleid.com` instead of the one the center invited. No center knows that address, so the person would see "No access yet". Even with **Share My Email**, the Apple ID's address is often not the one the center has (an iCloud address where the center has a Gmail one). So it needs one more step: after an Apple sign-in that no center knows, the app asks for the address the center invited, emails a code to it, and joins the two. Deleting an account that signed in with Apple must also cancel Hyber CRM's access to that Apple ID, which Firebase does with a "Sign in with Apple" key from HyberTec's developer account. Apple asks for it on iPhones only.

### The privacy policy, inside the app too

Both stores want the policy's address in their forms (https://hybercrm.com/privacy) **and** a link to it inside the app (Profile → Settings → Privacy policy, done). The page must be online before submitting (it is), and it must say what the app really does; [docs/store/privacy-policy.md](store/privacy-policy.md) does, and [docs/store/privacy-answers.md](store/privacy-answers.md) answers the stores' questionnaires the same way.

### Everything else they look at

- **A way in:** reviewers can't use an app that needs an account without one. They get Demo Academy's demo tutor and the notes say what to try.
- **People's posts (Apple 1.2):** comments on announcements are seen only inside one center, among people the center added, and the center's admins can delete any comment and take away anyone's access. The notes say so.
- **A business app on the public store:** Hyber CRM is a product any tutoring center can use (each center is a customer), not one company's internal tool, so a public listing fits. If a reviewer ever suggests otherwise (guideline 3.2), answer that: Hyber CRM is sold to tutoring centers, and the app serves the tutors of every center that uses it.

## The plan, and what it costs

**The plan:** TestFlight for you first, then for a few tutors at a real center (part 2); the App Store, public (part 3); Google Play's internal testing, then a public Production release (part 4); from then on, updates with one command per store (part 5).

| Stage | Money | Your time | Waiting |
| --- | --- | --- | --- |
| Apple Developer Program (HyberTec LLC) | $99 a year (paid; renews yearly) | – | – |
| APNs key into Firebase | – | 10 min | – |
| App Store Connect: API key, app record, first TestFlight build | – | 1 hour | Build processing 10–30 min |
| TestFlight for you (internal testers) | – | 15 min | Minutes |
| TestFlight for tutors at a center (external testers) | – | 15 min | Beta App Review, about a day per new version |
| Store texts, screenshots, privacy forms | – | 1–2 hours (texts are written; screenshots are a command) | – |
| App Review, first submission | – | 30 min | Usually 24–48 hours; a rejection adds a round trip of one to three days |
| Google Play organization account | $25 once | 30 min | Google's checks of HyberTec LLC: days, sometimes weeks |
| Google Play: app setup, first upload, first review | – | 2 hours | First review up to 7 days, sometimes longer for a new account |
| Every update afterwards | – | 5 min (one command) plus 2 min in each console | Apple 24–48 h, Google hours to days; TestFlight and Play internal testing: minutes |

Nothing costs money per release.

## Part 1: One-time setup on your Mac

1. **An App Store Connect API key**, so the publishing command can upload builds without you typing a password each time. Sign in at https://appstoreconnect.apple.com → **Users and Access** → **Integrations** → **App Store Connect API** → **Team Keys** → **+** (Generate API Key): name `Hyber CRM publishing`, access **App Manager** (enough for uploads) → Generate. Click **Download API Key** (once only: Apple never offers it again). Note the **Issuer ID** (top of the page) and the key's **Key ID**. The very first key on a team needs the **Account Holder** (you, for HyberTec LLC) to click **Request Access** on that page once.
   **Signing needs nothing more.** The command signs the App Store build through the Apple ID signed in to Xcode (**Xcode → Settings… → Accounts**, the same one `npm run iphone` uses): as HyberTec's Account Holder it may use Apple's cloud-managed App Store certificate, so there is no certificate to make or install. The key is used only to upload.
2. Put the key where the command looks: in Terminal (the HyberCRM folder),

   ```bash
   mkdir -p mobile/.publish
   mv ~/Downloads/AuthKey_*.p8 mobile/.publish/
   ```

   and create `mobile/.publish/appstore.json` (any text editor, such as TextEdit in plain-text mode; the folder is never in git):

   ```json
   { "keyId": "XXXXXXXXXX", "issuerId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "appleId": "" }
   ```

   **Leave `appleId` empty for now** (`""`): the app doesn't exist in App Store Connect until part 2 creates it, and the number is only assigned then. It is the app's own ten-digit number, not your Apple account. Back this folder up somewhere safe (a password manager): it is the only copy. A missing file stops the command with these same steps written out.
3. **Check the Mac can archive and sign the app:** `npm run publish:iphone -- --dry-run --no-bump`. It builds the App Store version without uploading it (10–20 minutes the first time) and ends with `✓ Ready to upload: mobile/.expo/publish/ios/… .ipa … Nothing was sent to Apple (--dry-run).` If it stops at the signing step, it says what to do; the logs are in `mobile/.expo/logs/publish-ios-*.log`.

## Part 2: TestFlight

1. **The app's identifier at Apple.** Your first `npm run iphone` registers `com.hybertec.hybercrm` in HyberTec's Apple account by itself, with what the app uses: push notifications, and Associated Domains (so passwords saved for hybercrm.com are offered in the app). If you haven't run it: https://developer.apple.com/account/resources/identifiers → **+** → **App IDs** → **App** → Description `Hyber CRM`, Bundle ID **Explicit** `com.hybertec.hybercrm`, tick **Push Notifications** and **Associated Domains** → Continue → Register.
2. **Create the app record** at https://appstoreconnect.apple.com → **Apps** → the blue **+** → **New App**: Platforms **iOS**; Name **Hyber CRM**; Primary Language **English (U.S.)**; Bundle ID **com.hybertec.hybercrm**; SKU **hybercrm**; User Access **Full Access** → **Create**. If Apple says the name is taken, use `Hyber CRM: Tutoring Centers` (the name under the icon on phones stays "Hyber CRM").
3. Click Hyber CRM → **App Information** (left column, under General) → **General Information** shows **Apple ID**, a ten-digit number. Put it into `mobile/.publish/appstore.json` as `"appleId": "6740123456"` (your number, in quotes).
4. **Upload the first build:** in Terminal, `npm run publish:iphone`. It raises the build number in `mobile/release.json`, gets the iPhone project ready, builds, signs and uploads (15–25 minutes; it says what it is doing at each `▸` step), and ends with `✓ Uploaded Hyber CRM 1.0.0 (build 2) to App Store Connect.` Then ask Claude Code to commit `mobile/release.json` (never skip this, or the next upload reuses the number and Apple refuses it). On the **TestFlight** tab the build says "Processing" for 10–30 minutes. **Apple does not always email when it is ready**: look at the TestFlight tab. An email titled "Action needed … has one or more issues" means Apple refused that build: give it to Claude Code, then upload again.
5. **You as a tester** (internal testing: no review, minutes): **TestFlight** tab → **+** next to **Internal Testing** → group name `HyberTec` → tick **Enable automatic distribution** → **Create** → **+** next to **Testers** → tick yourself → **Add**. On your iPhone, install **TestFlight** from the App Store, open Apple's invitation email → **View in TestFlight** → **Install**. (The TestFlight copy replaces the one `npm run iphone` installed: it is the same app.)
6. **Tutors at a center** (external testing): **TestFlight** → **+** next to **External Testing** → a group (`Centers`) → add testers by email, or turn on a **public link** to send them. The first build of each version goes through a short **Beta App Review** (about a day). Paste [docs/store/testflight-notes.md](store/testflight-notes.md) into the build's **What to Test** box. Each build works for 90 days; with automatic distribution, the next upload reaches testers by itself.

## Part 3: The App Store, public

Do this once the TestFlight build is the one you want to ship.

1. **Prerequisites:** [Where things stand](#where-things-stand-checked-on-2026-10-05), items 1 to 4.
2. **Screenshots:** in Terminal, `npm run publish:screenshots` (20–30 minutes; `-- --iphone` or `-- --android` for one store; see [docs/store/listing.md](store/listing.md), "Screenshots"). It starts the practice copy, makes a simulator and an emulator of its own ("Hyber CRM Screenshots", an iPhone Pro Max, and "HyberCRM_Screenshots", a Pixel 9), installs a store-style build on each, signs in as Demo Academy's demo tutor, opens the five tabs (Today, Schedule, Availability, News, Profile) and saves the pictures into `mobile/.publish/screenshots/ios/` (1320 × 2868, the 6.9-inch size App Store Connect requires) and `mobile/.publish/screenshots/android/` (with the 512 × 512 icon and 1024 × 500 feature graphic Google requires). Look at each: made-up names only, the right screens.
3. **The version page:** App Store Connect → Hyber CRM → **1.0 Prepare for Submission**:
   - **Screenshots:** drag the five files in under **iPhone 6.9" Display**, in order. (The app is iPhone-only, so no iPad set.)
   - **Promotional Text, Description, Keywords, Support URL, Marketing URL:** paste from [docs/store/listing.md](store/listing.md).
   - **Version:** `1.0.0`, to match the builds (if App Store Connect made it `1.0`, change it, or no build can be chosen). **Copyright:** `2026 HyberTec LLC`.
   - **Build:** click **+** and choose the TestFlight build.
   - **App Review Information:** Sign-in required → **Yes**; User name `tutor@demo.hybercrm.com`, Password: the demo password from `HyberCRM_Demo_Accounts.md`; your name, phone and email for Apple to reach you; **Notes:** paste the Apple notes from [docs/store/review-notes.md](store/review-notes.md).
   - **Version Release:** **Manually release this version**, so you choose the moment. Click **Save** (top right).
4. **App Information** (left menu): **Category** Business, secondary Education; **Content Rights**: no third-party content; **Age Rating**: answer the questions as they are (not made for kids; no chat; user-generated content: yes, comments on a center's announcements, seen only inside the center; no ads; everything else none) and accept the rating Apple works out; **Privacy Policy URL**: `https://hybercrm.com/privacy`.
5. **App Privacy** (left menu → Get Started): answer with [docs/store/privacy-answers.md](store/privacy-answers.md), item by item.
6. **Pricing and Availability:** Price **Free**; Availability: the **United States** (add other countries whenever centers there join; nothing else changes); App Distribution Methods: **Public**.
7. **Submit for Review** (top right; then **Add for Review** → **Submit to App Review**). Apple answers within 24–48 hours in most cases. A rejection comes as a message in App Store Connect quoting the guideline number; answer from the same message thread (many are settled by answering the reviewer's question). Give Claude Code the message to draft the reply or the fix.
8. **Release:** when approved, click **Release This Version**. Its App Store page is https://apps.apple.com/app/id followed by the app's Apple ID (the ten digits). Ask Claude Code to put the App Store and Google Play links on hybercrm.com, and send them to your centers.

## Part 4: Google Play, public

1. **The developer account** at https://play.google.com/console/signup, signed in with **goochoi913@gmail.com**: choose **An organization**. You need HyberTec LLC's legal name and address, its **D-U-N-S number** (the same one Apple checked when HyberTec enrolled; D&B's free D-U-N-S lookup on dnb.com finds it), a phone number, the website `https://hybercrm.com`, a contact email (`hybertecofficial@gmail.com`), and your ID when Google asks; pay **$25** once. The developer name people see on Google Play: **HyberTec LLC**. Google checks it all and emails; it can take from a day to a few weeks. An organization account doesn't need the "12 testers for 14 days" closed test Google asks of new personal accounts. Google shows the organization's name, address, email and phone on the store page.
2. **Create the app:** Play Console → **Create app**: App name **Hyber CRM**, default language **English (United States)**, **App**, **Free** → tick the declarations → **Create app**.
3. **Set up your app** (the Dashboard lists each form; the texts are in [docs/store/](store/)):
   - **Privacy policy:** `https://hybercrm.com/privacy`.
   - **App access:** "All or some functionality is restricted" → **Add instructions**: the demo tutor's email and password, and the instructions from [docs/store/review-notes.md](store/review-notes.md) ("Google Play: App access").
   - **Ads:** No. **Advertising ID:** No (the app has no ads or analytics; if the Play Console says the bundle declares the advertising ID, ask Claude Code to take that permission out).
   - **Content rating:** the questionnaire, answered as it is (no violence, sexual content, bad language, drugs or gambling; people can interact: yes, comments inside a center).
   - **Target audience:** 18 and over. (If your centers employ tutors under 18, add 16–17; when the parent and student portals come to the app, students can be children, and this answer changes with Google's rules for children's apps: ask Claude Code then.)
   - **News app:** No. **Government app:** No. **Financial features:** none. **Health:** none. **Data safety:** answer with [docs/store/privacy-answers.md](store/privacy-answers.md) (the Google section).
   - **Store listing** (Grow → Store presence → Main store listing): the short and full description from [docs/store/listing.md](store/listing.md); the app icon (`icon-512.png`), feature graphic (`feature-graphic-1024x500.png`) and the five phone screenshots from `mobile/.publish/screenshots/android/`; category **Business**; email `hybertecofficial@gmail.com`; website `https://hybercrm.com`.
4. **The first upload, by hand (once).** Google lets a command upload only to an app that already has a build, so the very first one goes through the Play Console:
   1. In Terminal: `npm run publish:android -- --dry-run`. The first time it makes Google Play's **upload key** (`mobile/.publish/upload.keystore`, with its password in `mobile/.publish/keystore.json`) and prints **"BACK BOTH FILES UP NOW"**: do it (a password manager, or the same safe place as the Apple key); without them no later update can be uploaded until Google resets the key (a form, a few days). It also prints the upload key's **SHA-1 and SHA-256**: keep them for step 5. It ends with `✓ Ready to upload: mobile/.expo/publish/android/HyberCRM-1.0.0-2.aab`.
   2. Play Console → **Test and release → Testing → Internal testing → Create new release**. If it asks about app signing, keep **Google Play App Signing** (Google holds the key that signs what phones install; you keep the upload key). Upload the `.aab` file from step 1 (in Finder: the HyberCRM folder → mobile → .expo → publish → android; press **⌘⇧.** to see folders starting with a dot), release notes `First release.` → **Next** → **Save** → roll it out to internal testing.
   3. **Testers** tab: create an email list (`HyberTec`) with your Google account → Save. Open the **opt-in link** it shows on your Android phone, accept, and install Hyber CRM from the Play Store. (A Play Store copy and an `npm run android` copy are signed differently: delete one before installing the other.)
   4. Ask Claude Code to commit `mobile/release.json`.
5. **Fingerprints in Firebase, for Google sign-in.** Firebase console → project **hyber-crm** → ⚙ **Project settings** → **Your apps** → the Android app (`com.hybertec.hybercrm`) → **Add fingerprint**, once for each: the upload key's SHA-1 and SHA-256 (step 4.1), and **Google's app signing key**'s SHA-1 and SHA-256 (Play Console → **Test and release → Setup → App signing** → "App signing key certificate"). Then run `npm run phone:setup`, which downloads the updated `google-services.json`, and the next build carries it. Without Google's fingerprints, Google sign-in fails in copies installed from Google Play (email and password still work).
6. **The service account** the command uploads with from now on: Google Cloud console (https://console.cloud.google.com), project **hyber-crm** → **IAM & Admin → Service Accounts → Create service account** (name `play-publisher`, no roles) → Done → open it → **Keys → Add key → Create new key → JSON**: save the downloaded file as `mobile/.publish/play-service-account.json`. Then Play Console → **Users and permissions → Invite new users** → the service account's email (it ends in `iam.gserviceaccount.com`) → **App permissions → Hyber CRM** → tick **Release apps to testing tracks** and **Release to production, exclude devices, and use Play App Signing** → **Invite user**.
7. **Every later upload is one command:** `npm run publish:android` (to Internal testing; `-- --track production` to Production, `-- --track closed` to Closed testing; `-- --draft` leaves the release as a draft for you to finish; `-- --dry-run` builds without uploading). Until the app's first public release, Google accepts only drafts: use `-- --draft` and finish each release in the Play Console.
8. **Production (public):** Play Console → **Test and release → Production → Countries / regions**: the United States (more whenever centers there join) → **Create new release** → **Add from library** (the bundle from internal testing) → release notes → **Next** → **Save** → **Publishing overview** → **Send changes for review**. Google's first review can take up to 7 days, sometimes longer for a new account; Google emails. Once approved, the app is on Google Play for everyone (turn on **Managed publishing** in Publishing overview first if you want to choose the moment).

## Part 5: Updates, with one command

**In short:** a release costs nothing and needs no file handled by hand. One command per store builds, signs and uploads; then two minutes in each console. Apple reviews it (usually 24 to 48 hours), Google too (hours to a few days), and phones update by themselves. Claude Code can run the commands for you; submitting and answering the stores' messages are yours.

### What one release is

1. Ask Claude Code for the change. The website and server parts go live when it deploys them, at once, for everyone.
2. In Terminal, in the HyberCRM folder with the newest code (`git pull`):

   ```bash
   npm run publish:iphone
   npm run publish:android -- --track production
   ```

   Each raises the **build number** in `mobile/release.json` (unique per upload, which the stores require), builds and uploads. Then ask Claude Code to commit `mobile/release.json` (it must be in git before the next release, or the numbers clash). Add `-- --version 1.1.0` to either when you want a new *version number*: Apple needs a higher version for every App Store release (build numbers alone are enough for TestFlight); Google doesn't care but shows it. Rule of thumb: a new version number per store release; a new build number per upload. `-- --no-bump` reuses the current number (only after a failed upload).
3. **Apple:** App Store Connect → Hyber CRM → **+** next to iOS App → the new version number → pick the build (after processing) → "What's New in This Version" (a line or two) → **Submit for Review**. TestFlight testers get every build without any of this. For a bug that badly breaks the app, ask for an **expedited review** at https://developer.apple.com/contact/app-store/?topic=expedite (say what is broken; Apple often grants it within hours).
4. **Google:** with `--track production` the release goes to Google's review by itself; after an upload to internal testing, promote it in the Play Console (Production → Create new release → Add from library).
5. **Phones update by themselves** (App Store and Play Store automatic updates), usually within a day; people can also update at once from the store. The app's Profile → Settings shows the version and build number they have.

### How people get updates

- **Changes to the website and the server reach everyone at once**, with no app update: most changes are of this kind (the schedule's rules, notifications' wording, the admin side).
- **A change to the phone app itself** goes out as a release (above).
- **iPhone:** automatic updates are on unless someone turned them off (Settings → App Store → **App Updates**). To update at once: App Store → the picture at top right → **Update** next to Hyber CRM. **Android:** Play Store → picture → **Manage apps & device** → Update. **TestFlight** installs new builds by itself while Automatic Updates is on for the app.
- **Someone who keeps an old version keeps working:** Claude Code keeps the server accepting the previous app version, because the server changes the day it is deployed and the app reaches people days later. If everyone must move to a new version one day, the app can be made to say "Please update Hyber CRM" with a button to the store; ask Claude Code when that day comes.

### What has to change for a release

- **Nothing by hand.** The build number is raised by the command; the version number only when you say. The Firebase files and the signing stay.
- **Screenshots** only if the screens changed in a way that matters. **The privacy policy** only if what the app collects changes (then `web/public/privacy.html`, docs/store/privacy-policy.md, Apple's App Privacy and Google's Data safety together).
- **A new permission** (camera, photos, location: none today) means new questions from both stores; Claude Code tells you when a change adds one.

## Push notifications on iPhone: the APNs key

Firebase sends the app's notifications to iPhones through Apple's push service (APNs), with a key from HyberTec's Apple account. Without it, iPhones get none (the in-app inbox still shows everything); Android needs nothing. 10 minutes, once.

1. Sign in at https://developer.apple.com/account (the Apple ID on HyberTec LLC's team; switch to **HyberTec LLC** at the top if the account shows another team) → **Certificates, Identifiers & Profiles** → **Keys** → the blue **+**.
2. **Key Name:** `Hyber CRM push`. Tick **Apple Push Notifications service (APNs)** → **Configure**: **Environment** Sandbox & Production, **Key Restriction** Team Scoped (All Topics) → **Save** → **Continue → Register**. If Apple answers that the team has "reached the maximum allowed number of team scoped Keys" (it allows two), choose **Topic Specific** and tick `com.hybertec.hybercrm` instead: HyberTec's key is one of these (2026-10-05). Don't revoke a key to make room unless you know nothing uses it: its app's notifications stop at once.
3. **Download** the `.p8` file (Apple offers it once only) and note the **Key ID** shown on the page. HyberTec's **Team ID** is `YSK7CHH56P`.
4. Firebase console → project **hyber-crm** → ⚙ **Project settings** → **Cloud Messaging** → **Apple app configuration** → the iOS app (`com.hybertec.hybercrm`) → **APNs Authentication Key** → **Upload**: the `.p8` file, the Key ID and the Team ID → **Upload**. If Firebase shows separate Development and Production places for it, upload the same key to both.
5. Keep the `.p8` with the other keys (a password manager). A Team Scoped key serves every app of HyberTec's; a Topic Specific one, like HyberTec's, serves only the apps ticked for it, so another app needs a key of its own.

Then test it: `npm run iphone`, sign in, allow notifications, and send a test as below.

## Testing notifications from Firebase itself

Firebase can send a notification straight to one phone, without our server: useful to prove that the phone, Apple's or Google's push service and the keys are fine when a notification from Hyber CRM does not arrive, and to try wording. It sends real pushes to real phones only (the practice copy has nothing to do with it).

1. On the phone, in the app: **Profile → Notifications → Push token**: tap it to copy it, and send it to yourself (Notes, Mail) so you can paste it on the Mac. It is long, and changes when the app is reinstalled.
2. Firebase console → project **hyber-crm** → left menu **Messaging** (under Run or Engage) → **Create your first campaign** (or **New campaign**) → **Firebase Notification messages** → Create.
3. **Notification title** and **Notification text** (anything, e.g. `Test from Firebase` / `If you read this, pushes work.`). Do **not** click Next: on the right, click **Send test message**.
4. Paste the token under **Add an FCM registration token** → **+** → tick it → **Test**. The phone shows it within seconds, app closed or open.
5. **Android only:** if nothing arrives, open **Additional options** in the same form and set **Android Notification Channel** to `sessions` (or `announcements`), the app's own channels, then test again.

The real thing, end to end: on hybercrm.com, as Demo Academy's admin, add or change a session for **Maya Thompson** that starts within the next 24 hours, or post an announcement to all tutors: the phone signed in as the demo tutor gets it ([docs/testing-guide.md](testing-guide.md), section 8). If Firebase's test arrives but Hyber CRM's doesn't, the fault is in our server or the token it has: ask Claude Code. If neither arrives on an iPhone, check the APNs key is in Firebase (above).

## What is prepared, and what only you can do

Prepared in [docs/store/](store/) (edit anything you like; words in ALL CAPS need your details):

- `listing.md`: App Store name, subtitle, promotional text, description, keywords; Google Play's short and full descriptions; the screenshots and the command that makes them.
- `review-notes.md`: the notes for Apple's reviewer (who the app is for, the demo tutor, what to try, the sign-in exception, deleting an account, notifications, comments), the reply if Apple answers with 4.8, and Google's App access instructions.
- `privacy-answers.md`: Apple's App Privacy answers and Google's Data safety answers, item by item.
- `privacy-policy.md`: the privacy policy, published at https://hybercrm.com/privacy (the website's `web/public/privacy.html`).
- `testflight-notes.md`: "What to Test" for TestFlight testers.

Only you can: make the keys and accounts (the App Store Connect key, the APNs key, the Google Play account and its service account), create the app records, pay the $25, submit, answer Apple's and Google's messages, and accept Apple's updated agreements when App Store Connect shows a banner (it refuses uploads until the Account Holder accepts).
