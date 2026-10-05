# Notes for the reviewers

What to paste into App Store Connect's **App Review Information**, the reply to send if Apple answers with guideline 4.8, and Google Play's **App access** instructions. Fill in the ALL CAPS parts. Keep them true: reviewers try what the notes say.

**Delete my account is on the "No access yet" screen too** (every build from 1.0.0 (2) on), as the notes say. When the app changes, remove a sentence rather than send it untrue.

The reviewers sign in as Demo Academy's demo tutor, so it must exist on the real Hyber CRM (it does; `npx tsx scripts/demo-accounts.ts` makes the demo logins again if they are ever missing). If Demo Academy's sessions have run out around the review's dates (its sample covers two weeks before to three weeks after the day it was filled), fill it again first: `npm run seed` (or ask Claude Code).

## Apple: App Review Information

- **Sign-in required:** Yes
- **User name:** `tutor@demo.hybercrm.com`
- **Password:** DEMO PASSWORD (in HyberCRM_Demo_Accounts.md)
- **Contact:** CONTACT NAME, CONTACT PHONE, `hybertecofficial@gmail.com`
- **Notes:**

```
Hyber CRM (by HyberTec LLC) is software for tutoring and learning centers: each center runs its schedule, tutors, students, payroll, session logs and progress reports in it. This app is the tutors' part: their sessions, availability, session logs, their center's announcements and notifications. A center's owners and admins work on our website (https://hybercrm.com); parents and students have portals there too, which come to the app later (in the app they see a screen saying so, with a link to the website). The whole product can be seen without signing in in the live demo at https://hybercrm.com/demo.

DEMO ACCOUNT
Sign in with the email and password (no Google needed):
  Email: tutor@demo.hybercrm.com
  Password: DEMO PASSWORD (in HyberCRM_Demo_Accounts.md)
This is Maya Thompson, a tutor at "Demo Academy", a sample center with made-up students and sessions. The center keeps New York time, so the app's "today" is New York's.

WHAT TO TRY
- Today: the day's sessions.
- Schedule: open a session that has already started today, see its details, and write its session log (drafts save as you type; submit at the end). Canceled and no-show sessions have no log.
- Availability: scroll through the months, tap a day two weeks or more ahead and set hours. Days in the coming week are locked by the center's rules, and the app says so; days inside two weeks show a reminder.
- News: open an announcement and comment on it.
- Profile: account details, subjects, payroll history, notification switches, and Settings, which has Delete my account and the privacy policy.
Deleting the demo account is fine: we can make it again.

SIGN-IN (guideline 4.8)
Hyber CRM is a business app that requires an account the user's center has already created. A center adds a person's email address (a tutor, a parent or a student) to its Hyber CRM, and only that address can open the center. Signing in with Google or with an email and a password are two ways of proving it is that address; an account that no center has added sees "No access yet" and can do nothing else in the app. We therefore believe the app falls under 4.8's exception for "an education, enterprise, or business app that requires the user to sign in with an existing education or enterprise account".

ACCOUNT DELETION (guideline 5.1.1(v))
Profile → Settings → Delete my account. An account that no center has added yet (for example one made with "Create an account") finds the same button on its "No access yet" screen. Deleting removes the sign-in, the person's profile and their phones' notification tokens at once. The records the center keeps about its own work (sessions taught, session logs, pay records, its audit log) stay with the center, as our privacy policy explains: https://hybercrm.com/privacy#delete

NOTIFICATIONS
Remote notifications (APNs through Firebase Cloud Messaging) tell a tutor about new, changed or canceled sessions starting within the next day, and about new announcements from their center. Each kind can be turned off in Profile → Notifications. No marketing.

COMMENTS (guideline 1.2)
Comments on announcements are seen only inside one center, by people the center added. The center's admins can delete any comment and remove anyone's access; anyone can reach us at hybertecofficial@gmail.com.

Contact during review: CONTACT NAME, hybertecofficial@gmail.com, CONTACT PHONE (US Eastern time).
```

## If Apple answers with guideline 4.8

Reply once, from the same message in App Store Connect ([docs/publishing.md](../publishing.md), "Sign in with Apple"). If Apple still asks for it after this, ask Claude Code to add Sign in with Apple.

```
Thank you for the review. Hyber CRM is a business app for tutoring centers, and nobody can use it without an account their center has created: a center adds the person's email address to its Hyber CRM (as a tutor, a parent or a student), and only that address can open the center. Google sign-in and email-and-password sign-in are two ways for that person to prove they own the address the center added; an account that no center has added sees "No access yet" and nothing else. We believe this falls under guideline 4.8's exception for "an education, enterprise, or business app that requires the user to sign in with an existing education or enterprise account". The demo account in the review notes is a tutor's account at a sample center. If you still find Sign in with Apple necessary, please tell us and we will add it.
```

## Google Play: App access

Play Console → **App content → App access** → "All or some functionality is restricted" → **Add instructions**: name `Demo tutor`, the email and password, and:

```
Every part of the app requires an account that a tutoring center has created in Hyber CRM. Sign in with the email and password (no Google needed):
Email: tutor@demo.hybercrm.com
Password: DEMO PASSWORD (in HyberCRM_Demo_Accounts.md)
This is a tutor at "Demo Academy", a sample center with made-up data (New York time). Today, Schedule (open a session to see it and write its session log), Availability (tap a day two weeks or more ahead; the coming week is locked by the center's rules), News and Profile are all open to it. Profile → Settings → Delete my account deletes the account (we can make the demo account again).
```

## Google Play: other declarations

The app asks for no sensitive permission (no location, no background work, no photos or files, no contacts, no calls or SMS), so there is nothing else to declare and no video to record. If the Play Console asks about the **advertising ID**: No (no ads, no analytics).
