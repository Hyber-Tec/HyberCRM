# Testing guide

A lab sheet for checking that the Hyber CRM phone app (the tutor's app) does what it is supposed to do, on your iPhone and your Samsung, signed in as Demo Academy's demo tutor. Work through it before a release, or only the parts that cover what changed (the table at the end says which). Each item says what to do, what should happen, and what it means when it does not. Nothing here needs you to read code.

## How to read this sheet

- **Where an item is checked:**
  - **[Real phone]**: your iPhone or Android phone, with the app installed by `npm run iphone` or `npm run android` ([docs/running-the-apps.md](running-the-apps.md)): the real Hyber CRM. Most items, since the phones are what you are testing.
  - **[Simulator]**: the iPhone Simulator or the Android emulator on the practice copy (`npm run iphone:sim`, `npm run android:sim`). Nothing you do there is real; good for trying things freely.
  - **[Website]**: Chrome on the Mac, where you act as Demo Academy's admin: https://hybercrm.com, signed in with your Google account → **Platform** → **Demo Academy**. On the practice copy, the practice website at http://127.0.0.1:5174 instead.
- **iPhone and Android** differ in a few places; those items say **iPhone:** and **Android:** separately.
- **Tick boxes** are for you: copy the sheet, or print it, once per test session, and note the app's version (Profile → Settings) at the top.
- **The automatic tests come first** (section 0): they cover signing in in minutes and never get tired.
- **If a tab still says it's coming** (the app was being finished when this sheet was written), skip its section and write that down.

### Accounts and data you need

- **The demo tutor**, Maya Thompson: `tutor@demo.hybercrm.com`, with the password in `HyberCRM_Demo_Accounts.md`. On the real Hyber CRM it exists once `npx tsx scripts/demo-accounts.ts` has run (once; or ask Claude Code). On the practice copy it is always there.
- **You, as the center:** on the website, Demo Academy's admin side, to add and change Maya's sessions and post announcements. That is how you make things happen for the phone.
- **Today has sessions** while Demo Academy's sample lasts: it covers two weeks before to three weeks after the day it was filled. If Today is empty on a weekday, fill it again: `npm run seed` for the real Hyber CRM (or ask Claude Code), `npm run iphone:sim -- --fresh` for the practice copy.
- **Demo Academy keeps New York time.** The app's "today" and every time it shows are New York's, wherever the phone is. Keep that in mind in the evening.
- **For deleting an account (section 9):** an address of your own that you don't mind using for a test (for example yourname+hybertest@gmail.com, which reaches your Gmail).

## 0. The automatic tests

| | Do | Expect | If not |
| --- | --- | --- | --- |
| ☐ 0.1 [Simulator] | With `npm run iphone:sim` running in one Terminal window, run `npm run phone:test` in another (about 5 minutes). Then the same with `npm run android:sim`. | It signs the app out, connects it to the window's development server, signs in as the demo tutor, runs every flow in `mobile/maestro`, and ends with `✓ Signing in and all … test flows passed.` A flow that needs something only you can give (such as `session-log.yaml`, which needs two sessions' ids) is skipped, with the line to run it. | A red flow names what it couldn't find; give the output to Claude Code. `inbox.yaml` fails when the demo tutor's inbox has no session item or no announcement: on the practice website, change one of Maya's sessions in the next 24 hours (or post an announcement with "Notify"), then run it again. |
| ☐ 0.2 [Mac] | With **no practice copy running** (they start their own emulators on the same ports): `npm test`, then `npm run test:rules`, then `npm run e2e` (about 10 minutes). | All green. They check the shared rules (time zones, availability, pay, logs), who may read and write what, and every portal of the website. | A red test means a rule changed; stop and ask Claude Code. |

## 1. Signing in and out

| | Do | Expect | If not |
| --- | --- | --- | --- |
| ☐ 1.1 [Real phone] | Open the app signed out. Sign in with the demo tutor's email and password. | Today, as Maya Thompson at Demo Academy. | "No access yet": the demo logins aren't on the real Hyber CRM yet (above). |
| ☐ 1.2 [Real phone] | Sign out (Profile), then sign in with the wrong password. | A plain message that the email or password is wrong; no crash. | |
| ☐ 1.3 [Real phone] | **Forgot password?** with your own address (demo addresses never receive email). | "Check your email"; an email from Hyber CRM (hybertecofficial@gmail.com) with a link that sets a new password. | Nothing after a few minutes: look in Spam, then ask Claude Code. |
| ☐ 1.4 [Real phone] | **Continue with Google** with your own Google account. | "Platform account": your account runs Hyber CRM itself, the platform tools are on the website, and **Use another account**. | |
| ☐ 1.5 [Real phone] | **Create an account** with an address no center has added. | "Confirm your email", and the email arrives. After you open its link: "No access yet", with the address. (Delete it afterwards: 9.5.) | |
| ☐ 1.6 [Simulator] | The practice copy's sign-in screen. | No Google button, and a line saying it is the practice copy. The demo tutor signs in. | |
| ☐ 1.7 [Website, then Real phone] | Demo Academy → Access Control: pause Maya's access while the app is open on the phone. Then give it back. | The phone shows that access to Demo Academy is paused; once given back, the app returns by itself. | |
| ☐ 1.8 [Real phone] | Sign out, close the app (swipe it away), open it again. | The sign-in screen. The phone no longer gets the demo tutor's notifications (8.10). | |

## 2. Today

| | Do | Expect | If not |
| --- | --- | --- | --- |
| ☐ 2.1 [Real phone] | The **Today** tab on a weekday. | The day's sessions in order, each with its time, student, subject and status, in New York time. | Empty all week: Demo Academy's sample has run out (above). |
| ☐ 2.2 [Real phone] | A session that has ended today with no log. | Marked as needing its session log. | |
| ☐ 2.3 [Website, then Real phone] | Add a session for Maya later today. | It appears on Today within seconds, without touching the phone. | Only after reopening the app: the live update is broken. |

## 3. Schedule

| | Do | Expect | If not |
| --- | --- | --- | --- |
| ☐ 3.1 [Real phone] | The **Schedule** tab. Go to the next week and back. | Maya's sessions for each day, the week's days in order; the same as the website's schedule for her. | A session in the wrong day or hour: time-zone bug, tell Claude Code with the session. |
| ☐ 3.2 [Real phone] | Tap a session. | A sheet with the student (and grade), subject, time, status and the center's note, and the session log: **Write** for one that has started without a log, **View** for one with a log. | |
| ☐ 3.3 [Real phone] | A canceled or No Show session. | No session log offered. | |
| ☐ 3.4 [Website, then Real phone] | Move one of Maya's sessions to another time. | The new time shows on the phone within seconds. | |

## 4. Session logs

| | Do | Expect | If not |
| --- | --- | --- | --- |
| ☐ 4.1 [Real phone] | A session that has started today with no log → **Write**. | The session log form, as on the website: its steps (Prepare, Session Info, Materials, Notes, Evaluation, Review & Submit), with Next and Back. | |
| ☐ 4.2 [Real phone] | Type some notes, close the form, open it again. | The draft is kept. | Typing lost: the draft saving is broken. |
| ☐ 4.3 [Real phone] | Go to Review & Submit with a required field empty. | It lists what is missing, with a way to each step; nothing is submitted. | |
| ☐ 4.4 [Real phone, then Website] | Fill everything and **Submit**. | The session shows its log as submitted. On the website: the log in Demo Academy's Session Log list, the session Present. | |
| ☐ 4.5 [Real phone] | Open the submitted log. | It reads like the website's: the notes with their line breaks, the ratings; **Edit** when the center allows tutors to edit. | |
| ☐ 4.6 [Real phone] | A session that hasn't started yet. | A draft can be kept, but not submitted. | |
| ☐ 4.7 [Real phone] | If the form offers AI help (the center's AI setting). | It is called **AI**, never by a company's or a model's name. | Any such name: tell Claude Code (a permanent rule). |

## 5. Availability

| | Do | Expect | If not |
| --- | --- | --- | --- |
| ☐ 5.1 [Real phone] | The **Availability** tab. | Months that scroll up and down like the iPhone's Calendar (no ‹ › arrows); days with availability filled; days the center is closed greyed out; today marked. | Arrows, or a single month: a permanent rule broken. |
| ☐ 5.2 [Real phone, then Website] | A day three or more weeks ahead → set 3:00 PM to 7:00 PM → save. | The day shows it. On the website, Maya is available then (schedule, employee calendar), and Demo Academy's audit log has the change, made by Maya. | |
| ☐ 5.3 [Real phone] | A day 8 to 13 days ahead. | It saves, with a reminder that availability should be set at least 14 days ahead (the center's rule). | |
| ☐ 5.4 [Real phone] | A day in the coming 7 days. | Locked: the app says so before you try to save, and nothing changes. | It lets you save, or saves then fails with an error: tell Claude Code. |
| ☐ 5.5 [Real phone, then Website] | **Remove** a day's availability. | The day shows as unavailable; so does the website. | |
| ☐ 5.6 [Real phone] | A day the center is closed. | It can't be set. | |

## 6. News

| | Do | Expect | If not |
| --- | --- | --- | --- |
| ☐ 6.1 [Real phone] | The **News** tab. | The center's announcements, pinned ones first, unread ones marked; the tab's badge is the number unread. | |
| ☐ 6.2 [Real phone, then Website] | Open an unread one. | It is marked read and the badge goes down. On the website, the announcement's read receipts list Maya. | |
| ☐ 6.3 [Real phone, then Website] | Write a comment; delete it again. | It shows at once, and on the website; then it is gone from both. | |
| ☐ 6.4 [Website, then Real phone] | Post an announcement to all tutors. | It appears in News within seconds, with the badge (and a notification: 8.5). | |

## 7. Profile

| | Do | Expect | If not |
| --- | --- | --- | --- |
| ☐ 7.1 [Real phone] | The **Profile** tab. | Maya's name, email and center; Account details, My subjects, Payroll history, Notifications, Settings; **Sign out** at the bottom. | |
| ☐ 7.2 [Real phone] | **Account details**, **My subjects**. | As the center has them on the website (Demo Academy → Employees → Maya). | Different: tell Claude Code which. |
| ☐ 7.3 [Real phone, then Website] | **Payroll history**. | The same hours and pay as the website's tutor Payroll page for Maya. | Different numbers: a pay bug; stop and tell Claude Code. |
| ☐ 7.4 [Real phone] | **Notifications**. | Whether notifications are on (with a way to turn them on), a switch per kind (new sessions, changes, cancellations, announcements), and this phone's **Push token**, copied with a tap (for Firebase's test message). | |
| ☐ 7.5 [Real phone] | **Settings**. | The look (System, light or dark), how the account signs in (Google, password), **Privacy policy** (opens https://hybercrm.com/privacy), **Version** (the version and build, and for a copy built on this Mac the commit and when), and **Delete my account**. | The privacy page doesn't open: the website isn't deployed with it yet ([docs/publishing.md](publishing.md), to-do 2). |

## 8. Notifications

The server sends one when a session starting **within the next 24 hours** is added, moved, re-timed, reassigned, canceled or marked No Show, and when an announcement is posted. Further away, nothing is sent (by design). **iPhone:** pushes need HyberTec's APNs key in Firebase ([docs/publishing.md](publishing.md#push-notifications-on-iphone-the-apns-key)): until then, check them on the Samsung.

| | Do | Expect | If not |
| --- | --- | --- | --- |
| ☐ 8.1 [Real phone] | Signed in as the demo tutor, allow notifications when the app asks (or turn them on in Profile → Notifications). | Allowed. | |
| ☐ 8.2 [Website, then Real phone] | App closed, phone locked. On the website, add a session for Maya starting within 24 hours, and confirm it. | Within seconds: "Session Confirmed", with the student and the time. Tapping it opens the app on that session's day. | Nothing: try Firebase's own test message ([docs/publishing.md](publishing.md#testing-notifications-from-firebase-itself)). If that arrives, the server's sending is at fault: tell Claude Code the time. **Android:** Settings → Apps → Hyber CRM → Notifications must be on, with its Sessions channel. |
| ☐ 8.3 [Website, then Real phone] | Change that session's time; then cancel it; then mark another No Show; then reassign one of Maya's to another tutor. | "Time Changed", "Cancellation Alert", "No Show", "Session Removed", each with what changed. | |
| ☐ 8.4 [Website, then Real phone] | Add a session for Maya three days from now. | No notification (outside the 24 hours). | One arrives: tell Claude Code. |
| ☐ 8.5 [Website, then Real phone] | Post an announcement to all tutors. | A notification with its title; tapping it opens the announcement. | |
| ☐ 8.6 [Real phone] | Repeat 8.2 with the app open on the screen. | No banner from the phone: a message inside the app instead, which opens the session when tapped. | |
| ☐ 8.7 [Real phone, then Website] | Profile → Notifications: turn off changes. Change one of Maya's sessions inside 24 hours. | No notification, and nothing new in the app's inbox for it. Turn it back on. | |
| ☐ 8.8 [Real phone] | The app's inbox (the bell). | The same notifications, newest first, read and unread; one can be removed. | |
| ☐ 8.9 [Real phone] | **iPhone:** look at the app's icon with unread notifications. | A number on the icon, the unread count. | |
| ☐ 8.10 [Real phone] | Sign out, then change one of Maya's sessions inside 24 hours. | The phone gets nothing. | It still gets it: the phone's token wasn't removed at sign-out; tell Claude Code. |

## 9. Deleting an account

| | Do | Expect | If not |
| --- | --- | --- | --- |
| ☐ 9.1 [Website] | Demo Academy → Access Control: add your test address as a tutor. | It is listed, waiting for its first sign-in (an invitation email arrives). | |
| ☐ 9.2 [Real phone] | **Create an account** with that address and a password; open the confirmation email's link. | The tutor app for Demo Academy (with no sessions of its own). | |
| ☐ 9.3 [Real phone] | Profile → Settings → **Delete my account** → your password → **Delete my account** → confirm. | Signed out. Signing in with that address and password no longer works. | |
| ☐ 9.4 [Website] | Access Control. | The address is still listed in Demo Academy (the center's record), no longer linked to an account. | |
| ☐ 9.5 [Real phone] | The account from 1.5 (no center): on its "No access yet" screen, **Delete my account**. | Deleted the same way. Apple tests exactly this. | No button there: needed before the App Store ([docs/publishing.md](publishing.md), to-do 3). |

## 10. Things that must always be true

| | Do | Expect | If not |
| --- | --- | --- | --- |
| ☐ 10.1 [Real phone] | Switch the phone to dark mode, then back. | The whole app follows, and stays readable. | |
| ☐ 10.2 [Real phone] | Bigger text: **iPhone:** Settings → Display & Brightness → Text Size; **Samsung:** Settings → Display → Font size and style. | Nothing cut off or on top of something else. | |
| ☐ 10.3 [Real phone] | Airplane mode on, then open the app. | What you saw before still shows; a change says it couldn't be saved, or waits. Back online: everything up to date. | |
| ☐ 10.4 [Real phone] | Set the phone to another time zone (iPhone: Settings → General → Date & Time; Samsung: Settings → General management → Date and time), then look at Today and Schedule. | Unchanged: the center's time, not the phone's. Set it back. | Times shifted: a time-zone bug; stop and tell Claude Code. |
| ☐ 10.5 [Real phone] | Every screen inside the center. | The center's name (Demo Academy), never "Hyber" in the center's screens; an automatic change is credited to "System". | |
| ☐ 10.6 [Real phone] | The back swipe (iPhone) and Back button (Android) on every screen; a notification tapped with the app shut down. | Always goes back to the screen before; the notification opens the right screen even from a cold start. | |

## What changed → what to test

| What Claude Code changed | Run |
| --- | --- |
| Anything in `mobile/` (the phone app) | 0.1, then the sections of the screens it touched, on a real phone; 8 if it touched notifications |
| The server's notifications (`functions/`) | 0.2, then 8 |
| Account deletion (`functions/src/account.ts`) | 9 |
| `firestore.rules` | 0.2, then 4, 5, 6 |
| `shared/` (time zones, availability, logs, pay) | 0.2, then 2, 4, 5, 7.3, 10.4 |
| Before a store release (iPhone or Android) | Everything, on both real phones |

## Results sheet

```
Date:            Tested by:
App version (Profile → Settings):
Devices: ☐ iPhone (model, iOS)  ☐ Samsung (model, Android)  ☐ iPhone Simulator  ☐ Android emulator
Sections run:
Failures (item number, what happened, screenshot name):
```
