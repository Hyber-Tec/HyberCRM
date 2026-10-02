# Hyber CRM: mobile app (future): concepts, rules and flows

> **Not being built now.** This document records what the future iOS/Android app needs, so the knowledge isn't lost and today's architecture keeps the path open. The source material is the True Education PWA ([doc 10](../true-education/10-tutor-portal-and-pwa.md), especially §13) and the Hyber plan ([PLAN.md](PLAN.md)).

## 1. Where things stand

| | True Education today | Hyber v1 (web) | Future native app |
|---|---|---|---|
| Who | Tutors only | Tutors (mobile-friendly portal + installable PWA) | **All roles**: tutor, admin, parent, student |
| How | Same website; narrower than 768 px switches to a mobile shell with bottom tabs | Same approach, but the tabs are real routes (reload and back work) | One native app per platform, shared by every branch and role |
| Main job | Entering **availability** | Same | Same for tutors; daily operations for admins; visibility for families |
| Push | FCM web push, tutor-only, opt-in from Profile | FCM web push, per-device tokens, all toggles honored | FCM (APNs on iOS), platform channels |

TE's mobile tabs (icons only): **News** (announcements) · **Ideas** (suggestions) · **Availability** · **Schedule** · **Profile** (account details, subjects, work-hour requests, payroll history, notification settings, logout). A floating bell opens the notification history.

## 2. Principles the native app must keep

1. **One account, many branches, role per branch.** Google sign-in → list of memberships (`branches/*/members/{email}`) → branch chooser if there is more than one. Super admin is a separate mode. The role decides the navigation.
2. **The server is the authority.** Every rule that the TE PWA checked in the browser (availability lead time and lock, one block per day, capacity, past-day lock, pay) is enforced by Firestore rules or Cloud Functions in Hyber. So a native client (or an offline queue) can't bypass it, and it doesn't need to re-implement it to be correct.
3. **Branch time zone everywhere.** Dates, "today", locks and push texts use the branch's time zone, never the phone's (PLAN §7).
4. **Shared business logic.** The pure-JS `shared/` package (time math, lane layout, status vocabulary, rounding, availability rules, recurrence, notification types) is what a React Native app would import directly. With another native stack, `shared/` is the reference implementation and its unit tests are the spec.
5. **Everything is deep-linkable and loads by ID.** No `localStorage` hand-offs between screens (TE's session-log form breaks when opened directly; Hyber's doesn't).

## 3. Feature map by role (proposal for the native app)

| Role | Must-have | Nice-to-have |
|---|---|---|
| Tutor | Availability (month calendar + day sheet), My schedule (week list, day timeline on tablets), Announcements + comments, Notification inbox + push, Profile and subjects, Payroll history, Work-hour requests | Session log on the phone (TE: desktop only); clock in/out if the branch enables web/app clock-in |
| Admin | Today's schedule (Day view, read-mostly), live "on the clock now", Missing & Needs Attention (missing logs, auto clock-outs, pending hour requests), announcements, student and employee lookup with call/email | Quick status changes (confirm, cancel, no-show) with the same notifications as the web |
| Parent | Upcoming sessions for linked children, submitted session summaries (parent-visible fields only), shared progress reports, announcements addressed to parents | Requests (reschedule, cancel), payments later |
| Student | Own schedule, homework assigned (from session logs), announcements | — |

The parent and student scope depends on the owner's answer to **Q6** in [QUESTIONS.md](QUESTIONS.md).

## 4. Deep links

Universal links / App Links on the Hyber domain; the same paths work on the web.

| Target | Path |
|---|---|
| Branch home | `/{branchId}/{portal}/home` (portal: `admin`, `tutor`, `parent`, `student`) |
| Announcement | `/{branchId}/{admin\|tutor}/announcements/{id}` |
| Schedule at a date | `/{branchId}/tutor/schedule?date=YYYY-MM-DD` (tutor) · `/{branchId}/admin/schedule/day/YYYY-MM-DD` (admin) |
| Availability | `/{branchId}/tutor/availability` |
| Notification inbox | The bell menu (no page); each item links to its target |
| Session log (form) | `/{branchId}/session-log/{sessionId}` |
| Session log (read-only) | `/{branchId}/session-log/{sessionId}/view` |
| Progress report | `/{branchId}/progress-report/{id}` |
| Student | `/{branchId}/{admin\|tutor}/students/{id}[/{tab}]` |

Every target screen loads its record by ID and checks permission. If the signed-in user isn't a member of that branch, it shows "No access". Tabs and sub-pages are real routes, so Android back, iOS swipe-back and web reload behave correctly (TE's mobile tabs live in memory only).

## 5. Push notifications

- **Tokens:**
  - One doc per device: `users/{uid}/devices/{deviceId}` = `{token, platform: ios|android|web, appVersion, createdAt, lastSeenAt}`.
  - Refreshed on token rotation and **deleted on logout** (TE never deleted tokens).
  - Tokens that FCM reports invalid are pruned.
- **Recipients:** notifications target a **member** of a branch (email key). The function looks up the member's `uid`, then that user's devices. A person in two branches receives both branches' notifications, each labeled with the branch name.
- **Payload contract:** `{type, branchId, title, body, url, sessionId?, announcementId?, dateKey?}`.
  - `url` is the deep link (§4).
  - `dateKey` is in the branch time zone.
  - Native apps route from `data`; web needs a same-origin URL.
- **Types** (TE's 11, shared constants):
  - announcement new / updated
  - session confirmed / canceled / restored / reassigned in / reassigned out / no-show / date changed / time changed / subject changed
- **Preferences:**
  - Per-type toggles on `staff.notificationPrefs`, all honored, including announcements (TE ignored that toggle).
  - On Android, map them to notification channels.
- **Foreground:** show an in-app toast and update the bell count (TE shows nothing).
- **Inbox:** server-side `branches/{b}/notifications` (14-day retention, swipe to delete). The read state is kept on the server, so badges match across devices.
- **App badge:** one formula, computed in one place. TE counts unread announcements only; the open question is whether to add unread session notifications.

## 6. Availability on the phone (the main mobile use case)

**UI (from TE):**
- A continuous month calendar with infinite scroll into past and future months.
- Closed days are disabled, days with availability are filled, and today is marked.
- Tapping a day opens a bottom sheet with start and end pickers and the actions **Set / Edit**, **Remove**, **Cancel**.
- "Remove" marks the day explicitly unavailable (a soft delete). It doesn't delete the record, because the admin schedule relies on the "explicitly unavailable" meaning.

**Rules (branch settings, enforced by the server):**
- One record per tutor per date (`availability/{staffId}_{dateKey}`), with up to `maxRangesPerDay` ranges (default 1).
- Times within the day's open hours; minimum block 30 min; picker step 30 min.
- **Lead time** (default 14 days) with enforcement `notice` / `warn` / `block`.
- **Lock window** (default 7 days): blocks starting inside it can't be edited, deleted or moved by the tutor. Admins can change them.
- Closed days (from the branch default week or day configs) can't hold availability.

**Offline:** native Firestore SDKs cache and queue writes offline. Queued availability edits are re-validated by the rules when they sync, using **server time**, so a phone with a wrong clock can't bypass the lock. The app should show "pending sync" on queued edits and explain rejections.

## 7. Schedule on the phone

- **TE today:** a read-only weekly list of the tutor's own sessions. Swipe between weeks, "Today" button, past days hidden in the current week, a bottom sheet with the session note, conference note, notices, and ✓/⚠ log status.
- **Native app:**
  - Keep the list.
  - Add availability shading and clock status for parity with desktop.
  - Offer the desktop day timeline on tablets.
  - Status colors and icons are the shared tokens (BRANCH_SETTINGS "Fixed design tokens").

## 8. Session logs on the phone

TE allows session logs only on desktop. Hyber's web form works on phones: the tutor taps a session in the phone schedule (which shows TE's check / triangle log indicators) and the six steps open in one column. The native app should do the same:
- Use the same steps, fields and validation (`shared/src/sessions/logs.ts`).
- Drafts save to the server as the tutor types (the rules allow only the log's own fields).
- Submit goes through the same `submitSessionLog` callable, so hours, lifecycle and attendance stay consistent. It refuses before the session starts.

## 9. Kiosk (a separate device app)

The future kiosk is its own app (TE's is Flutter), not part of the role app:
- **Pairing:** an admin creates a one-time pairing code. The device exchanges it for a **device token** with claims `{kiosk: true, branchId, deviceId}`. It is never an admin account (TE's kiosk ran as an admin).
- **Clocking:** `verifyPin`, `clockIn` and `clockOut` are Cloud Functions with hashed PINs, lockout, server time, one open shift per employee, and the shared pay-segmentation engine.
- **Branding:** the device shows the branch name, logo and colors from the branch doc.
- **Offline:** decide deliberately. Either require connectivity, or use a signed offline queue that the server re-validates.

## 10. Auth, security, versions

- **Sign-in:** Google Sign-In (native SDK) → Firebase Auth credential. No passwords.
- **Status checks:** on every launch and resume, re-read the member doc. If it is suspended, show the blocked screen.
- **Rules carried over:** members read only their own data; queries are always under one branch; tutor writes are restricted by allow-lists.
- **Versions:** a `minSupportedVersion` setting (Remote Config or a platform doc) shows a blocking update screen on native apps; the web shows the update banner (TE polls `meta.json`).

## 11. What the web build does now to keep this path open

- [x] Business logic in `shared/` (pure JS, unit-tested), not in React components.
- [x] Every rule enforced by Firestore rules or Cloud Functions, not only in the UI.
- [x] Routes load records by ID; no `localStorage` hand-offs; branch ID in every URL.
- [x] Branch time zone stored on the branch; dates as `dateKey` + minutes.
- [x] Per-device push tokens, per-member notifications with a server-side inbox and read state.
- [x] Mutations with side effects (clock, session-log submit, lifecycle) as callables that any client can call.
- [x] Status vocabulary, notification types and design tokens defined once.
