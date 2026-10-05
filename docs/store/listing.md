# Store listing texts

Paste these into App Store Connect and the Google Play Console ([docs/publishing.md](../publishing.md), parts 3 and 4). Both stores count characters; the limits are given, and every text below fits. The listing is **public** on both stores (owner, 2026-10-04): it is written for tutors who have never heard of Hyber CRM and for centers who might buy it.

Before pasting, read each paragraph against the app as it is on that day (the app was still being finished when this was written): the stores reject a description that promises something the app doesn't do.

## Apple App Store

**Name** (30): `Hyber CRM`. If App Store Connect says the name is taken: `Hyber CRM: Tutoring Centers`.

**Subtitle** (30): `The CRM for tutoring centers`

**Promotional text** (170; can be changed at any time, without a new version):
`For tutors at centers that use Hyber CRM: today's sessions, your week, session logs, availability and your center's news, with a notification when something changes.`

**Description** (4000):

```
Hyber CRM is the CRM built for tutoring and learning centers. This app is for the tutors of centers that use Hyber CRM: your day, your schedule, your availability and your center's news, in your pocket.

You need an account from your center. When your center adds your email address to Hyber CRM, sign in with that address, with Google or with a password.

TODAY
Your sessions for the day in order, with each student, subject and time, and what still needs a session log.

SCHEDULE
Your sessions week by week. Open one to see the student, the subject and your center's note, and write its session log: what you covered, notes, ratings and homework.

AVAILABILITY
Tell your center when you can teach. Scroll through the months, tap a day and set your hours. Your center's rules about how far ahead are shown before you save.

NEWS
Your center's announcements, with comments. The tab shows how many you haven't read.

NOTIFICATIONS
New sessions, changes and cancellations close to the day, and new announcements, even with the app closed. Choose which ones you get.

PROFILE
Your account, your subjects, your payroll history, your notifications, and deleting your account.

Everything follows your center's time zone, wherever you are.

RUN A TUTORING CENTER?
Hyber CRM keeps your schedule, tutors, students, payroll, session logs and progress reports in one place, with portals for tutors, parents and students. Try the live demo at https://hybercrm.com

Privacy: https://hybercrm.com/privacy
```

**Keywords** (100, commas, no spaces after them; the name's own words are left out, as Apple counts them anyway): `tutor,tutoring,tutoring center,learning center,schedule,availability,session log,lessons,test prep`

**Support URL:** `https://hybercrm.com/#contact`
**Marketing URL:** `https://hybercrm.com`
**Copyright:** `2026 HyberTec LLC`
**Category:** Business; secondary Education.
**What's New** (first version): `First release.`

## Google Play

**App name** (30): `Hyber CRM`

**Short description** (80): `The tutor's app for Hyber CRM centers: sessions, availability, logs and news.`

**Full description** (4000): the App Store description above, unchanged.

**App category:** Business. **Tags:** choose those closest to Business, Productivity and Education.
**Contact details:** email `hybertecofficial@gmail.com`, website `https://hybercrm.com` (a phone number only if you want one shown publicly).
**Privacy policy:** `https://hybercrm.com/privacy`

## Screenshots

`npm run publish:screenshots` (20–30 minutes) makes every image both stores need, from the practice copy (Demo Academy's made-up people), signed in as its demo tutor, Maya Thompson, on a simulator and an emulator of its own, into `mobile/.publish/screenshots/`:

- `ios/`: five PNGs, 1320 × 2868 (the "iPhone 6.9-inch" size App Store Connect requires; it scales them for smaller phones). The app is iPhone-only, so no iPad set.
- `android/`: the same five from a Pixel 9, given white margins to the 9:16 shape the Play Console accepts, plus `icon-512.png` (the app icon, 512 × 512) and `feature-graphic-1024x500.png` (the logo and "The CRM built for tutoring centers" on the website's dark background). The Play Console requires both.

The five screens, named in the order to upload them:

1. `01-today`: Today, the day's sessions.
2. `02-schedule`: Schedule, the tutor's sessions.
3. `03-availability`: Availability, the months ahead.
4. `04-news`: News, the center's announcements.
5. `05-profile`: Profile: account, subjects, payroll, notifications.

The pictures show whatever the app shows that day, so take them on a weekday afternoon (Demo Academy keeps New York time), when Today is full. `-- --iphone` or `-- --android` makes one store's set again. Look at each before uploading: Demo Academy's made-up names only, no real person.
