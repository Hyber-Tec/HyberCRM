# Hyber CRM: the phone app

> **Being built since round 4 (2026-10-04).** One app, "Hyber CRM", for iPhone and Android, in [`mobile/`](../../mobile/README.md), set up the way the owner's ycaclock app is (one-command scripts, publishing guide, store templates). The **tutor portal** comes first; the admin, parent and student portals follow in later rounds. Decisions: [DECISIONS.md §8](DECISIONS.md). How to run it: [docs/running-the-apps.md](../running-the-apps.md); how to publish it (a **public** listing): [docs/publishing.md](../publishing.md).

## 1. Where things stand

| | True Education | Hyber web | Hyber app |
|---|---|---|---|
| Who | Tutors only (PWA) | Every role, every page; mobile-friendly | **Tutors now**; admins, parents and students see "Your portal is coming to the app" with a link to the website |
| Main job | Entering availability | Everything | Tutors: today's sessions, the week, availability, news, the session log, their profile and pay |
| Sign-in | Email or Google | Google (recommended) or email + password | The same accounts: Google or email + password |
| Push | FCM web push, tutors, opt-in | In-app inbox (bell) | FCM on both phones (APNs on iPhone), from the same inbox |

## 2. Principles

1. **One account, many branches, one role per branch.** Sign-in (Google, or an email + password whose address is confirmed) → the person's memberships (`branches/*/members/{email}`) → a chooser when there are several (remembered on the phone; Profile → Switch center) → the portal of their role.
2. **The server is the authority.** Firestore rules and Cloud Functions enforce every rule (availability lead time and lock, past-day lock, log submission, pay); the app mirrors them so people aren't surprised, but never relies on itself.
3. **Branch time zone everywhere.** Dates, "today", locks and notification texts come from the branch's zone through `shared/src/time.ts`, never the phone's (Hermes' `Intl` handles time zones on both platforms).
4. **Shared business logic.** The app imports `shared/` directly (`@shared/*`, Metro watches `../shared`): availability, conflicts, statuses, session logs, pay, settings, rules. A rule missing there is added there, for the website, the functions and the app at once.
5. **Everything loads by ID and is deep-linkable** (`hybercrm:///…`), so pushes, links and the back gesture always work.
6. **Audit log:** the app writes the same audit entries as the website, marked `via: "app"`.

## 3. Structure (Expo Router)

| Route | What |
|---|---|
| `sign-in`, `sign-up`, `forgot-password`, `verify-email` | Signed out, or a password account still to confirm its email (the screen checks by itself every few seconds and when the app comes back to the front) |
| `(app)/choose-branch`, `(app)/no-access` | Several centers; none yet (with any pending sign-up requests) |
| `(app)/(tutor)/(tabs)/…` | **Today · Schedule · Availability · News · Profile** (native tab bar; News shows the unread count) |
| `(app)/(tutor)/session/[id]` | A session (native sheet): student, time, note, conflict notice, log state and actions |
| `(app)/(tutor)/log/[id]`, `log-view/[id]` | The six-step session log (drafts, submit through `submitSessionLog`) and the read-only log |
| `(app)/(tutor)/notifications` | The inbox (grouped by day, swipe to delete, tap to open what it's about) |
| `(app)/(tutor)/availability-day` | A day's availability (native sheet) |
| `(app)/coming-soon` | Admin, parent and student portals, until they come to the app |

State lives in providers: `AuthProvider` (Firebase Auth), `AccessProvider` (memberships), `BranchProvider` (branch, settings, rules, member, staff, kept live), `AppearanceProvider` (system, light or dark), `NotificationsProvider` (push token, taps, foreground toasts, icon badge).

## 4. Deep links and notification targets

Inbox items carry a `link` below the branch (`tutor/schedule?date=…`, `tutor/announcements/{id}`) and `refs` (session, announcement, date). `shared/src/push.ts` (`appTargetOf`) turns them into app screens: an announcement opens its post, a session change opens the session (or the schedule at that date). Pushes carry the same data, plus the website's URL.

## 5. Push notifications

- **Devices:** `users/{uid}/devices/{installId}` = `{token, email, platform, appVersion, label, createdAt, updatedAt}`, written when the app opens (once a week if nothing changed, at once on a token change) and **deleted at sign-out**. The install id lives in the phone's secure storage.
- **Sending:** every inbox item the server creates (`functions/src/notify.ts`) is pushed to the recipient's devices, found by email (`functions/src/push.ts`). Items are created once (`create()`), so a retried trigger never pushes twice; tokens FCM rejects are removed.
- **What's sent:** the inbox's own title and body; iPhone badge = the person's unread inbox count; Android channels **Sessions** and **Announcements** (people can mute either in the phone's settings).
- **Preferences:** the four switches in Profile → Notifications (`staff.notificationPrefs`: announcements, new sessions, changes, cancellations) decide what reaches the inbox and so the phone.
- **In front:** no system banner; the app shows a toast that opens the target. **Taps** (also from a closed app) open the target.
- **Needs:** HyberTec's APNs key in Firebase for iPhones (docs/publishing.md); Android works with the project's `google-services.json`.

## 6. Availability on the phone

TE's main mobile job, kept and improved: a vertical, endlessly scrolling month calendar (the permanent month-scroller rule), closed days disabled, each day's times shown as small boxes, days inside the lock window locked and days inside the lead window still without times marked. A day opens a sheet with that date's hours, ranges, "Not available", and the website's warnings (lead time, lock, sessions that would be left uncovered). "Copy last week" and "Repeat weekly" as on the website. Writes are the website's (availability doc + audit entry), checked by the rules.

## 7. Session logs on the phone

The full six steps (owner, 2026-10-04), with the website's fields, validation and words (`shared/src/sessions/logs.ts`), drafts saved as the tutor types (and when the app goes to the background), submit only once the session has started, through the same `submitSessionLog` callable (hours, attendance and lifecycle stay consistent). A submitted log opens read-only with **Edit log** when allowed.

## 8. Accounts, security, versions

- **Sign-in:** Google (native Google Sign-In → Firebase credential) or email + password; new password accounts confirm their email first (Hyber's own email through `sendAccountEmail`, Firebase's as a fallback). Forgot password and change/add password are in the app.
- **Delete my account:** Profile → Settings (Apple guideline 5.1.1(v)); the `deleteMyAccount` callable removes the sign-in and personal profile; the centers' records stay.
- **Status:** the member doc is listened to; a paused access closes the app's portal at once ("Your access is paused").
- **Versions:** `mobile/release.json` holds the version and build number (the publishing command raises the build). A minimum-version check can come later through a platform document.

## 9. Kiosk (still a separate device app, later)

Unchanged from the plan: its own app, paired with a one-time code for a device-only token (`{kiosk, branchId, deviceId}`), calling the same `kioskIdentify`/`kioskPunch` functions the web kiosk uses.

## 10. Next rounds

1. **Admin portal in the app:** today's schedule (read-mostly), who's in the building, needs-you items, quick session status changes, people lookup with call/email.
2. **Parent and student portals:** upcoming sessions, shared progress reports, the student's calendar.
3. iPad layouts (the app is phones-only for now: `supportsTablet: false`).
