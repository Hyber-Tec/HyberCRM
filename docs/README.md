# Hyber CRM documentation

Hyber CRM is a multi-tenant SaaS CRM for tutoring centers. It is a rebuild of the **True Education** CRM: one shared core, with each tutoring center (a "branch") customized on top of it.

## Start here

1. [`hyber/DECISIONS.md`](hyber/DECISIONS.md): the owner's answers and the build decisions. Overrides the plan where they differ.
2. [`hyber/PLAN.md`](hyber/PLAN.md): architecture, multi-tenancy, roles and permissions, Super Admin flow, build order.
3. [`true-education/00-overview.md`](true-education/00-overview.md): how True Education works, the navigation map, and corrections to earlier assumptions.

## Hyber (the new product)

| Document | Contents |
|---|---|
| [PLAN.md](hyber/PLAN.md) | Principles, stack, repo layout, tenancy model, customization layers, identity and roles, rules strategy, routing, time-zone model, domain changes vs TE, Cloud Functions, security, local workflow, **build order** |
| [DATA_MODEL.md](hyber/DATA_MODEL.md) | Every Firestore collection and field, with the True Education mapping, indexes and access matrix |
| [BRANCH_SETTINGS.md](hyber/BRANCH_SETTINGS.md) | Every per-branch business rule, with True Education's value as the default |
| [MOBILE_APP.md](hyber/MOBILE_APP.md) | The iPhone and Android app: what it does for each role, its rules and flows (the code: [mobile/README.md](../mobile/README.md)) |
| [DECISIONS.md](hyber/DECISIONS.md) | The owner's answers and developer calls (wins over the other docs) |
| [QUESTIONS.md](hyber/QUESTIONS.md) | The original questions, with recommendations (answered) |

## The phone app (written for the owner, step by step)

| Document | Contents |
|---|---|
| [running-the-apps.md](running-the-apps.md) | One command each: the app on the simulators (the practice copy, Demo Academy) and on your iPhone and Android phone (the real Hyber CRM); the demo logins; when a build fails; a new Mac |
| [testing-guide.md](testing-guide.md) | The lab sheet for testing the tutor app on your phones with the demo tutor |
| [publishing.md](publishing.md) | TestFlight, the public App Store listing and Google Play: where things stand, what Apple checks (account deletion, Sign in with Apple), costs and timing, updates with one command, the push key |
| [store/](store/) | What the stores ask for: listing texts, review notes, privacy answers, the privacy policy, TestFlight notes |
| [../mobile/README.md](../mobile/README.md) | How the app is built and checked (for Claude Code and developers) |

## True Education (the reference system, analyzed read-only)

> These files describe a live production system and are kept **locally only** (git-ignored, the repository is public).

| Document | Contents |
|---|---|
| [00 Overview](true-education/00-overview.md) | System at a glance, portals, navigation map TE → Hyber, core business loop, corrections |
| [01 Auth, roles & access](true-education/01-auth-roles-and-access.md) | Login, signup, roles, statuses, Account Management, Access Control, Settings, app shell |
| [02 Data model](true-education/02-data-model.md) | All 53 collections, fields, IDs, relationships, smells |
| [03 Schedule views](true-education/03-schedule-views.md) | Day/Week/Month/Master rendering, colors, lanes, gestures, URL state |
| [04 Schedule operations & audit log](true-education/04-schedule-operations-and-audit-log.md) | Mutations, statuses, events, day configs, Activity Log, notifications |
| [05 Availability & Employee Calendar](true-education/05-availability-and-employee-calendar.md) | Availability entry and rules; Employee → Calendar |
| [06 Time clock & payroll](true-education/06-time-clock-and-payroll.md) | Kiosk, teaching/admin split, Log Hours, Pay Rates, Payroll |
| [07 Session logs & progress reports](true-education/07-session-logs-and-progress-reports.md) | Log form, submit side effects, AI, reports |
| [08 Students & subjects](true-education/08-students-and-subjects.md) | Students, lifecycle, conferences, Student Calendar, subjects |
| [09 Announcements, Home & notifications](true-education/09-announcements-home-notifications.md) | Announcements, Home dashboard, push, Suggestions |
| [10 Tutor portal & PWA](true-education/10-tutor-portal-and-pwa.md) | Tutor portal, mobile PWA, native-app implications |
| [11 Cloud Functions](true-education/11-cloud-functions.md) | All 23 functions and integrations |
| [12 Security rules](true-education/12-security-rules.md) | Permission matrix and ranked holes |
| [13 Issues found](true-education/13-issues-found.md) | Problems in the **live** True Education system worth fixing now |
