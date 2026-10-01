# Hyber CRM: owner decisions

> The owner answered [QUESTIONS.md](QUESTIONS.md) on 2026-09-30. This file records each answer and what it means for the build. **Where this file and PLAN / DATA_MODEL / BRANCH_SETTINGS disagree, this file wins.** The owner also said that further detail questions should be decided by the developer, not asked; those calls are listed in §3.

## 1. Cross-cutting changes

| Topic | Decision |
|---|---|
| Language | **TypeScript** everywhere (web, shared, functions). |
| UI | **shadcn/ui** with the **neutral** theme (light + dark tokens), icons from **react-icons** (shadcn's internal icons use the Lucide set via `react-icons/lu`). The UI is a remake, not a port: better than TE, modern and professional. **Exception:** the Schedule keeps TE's layout (time grid, tutor rows, lanes, events strip, right panel), restyled with the Hyber theme. |
| Identity | Everything runs under **goochoi913@gmail.com**: Firebase, GitHub and the only Super Admin. No other address is used. |
| Deploys | Full permission to deploy rules, indexes, functions **and Hosting** (`hybercrm.web.app`), and to seed data. No need to announce each deploy. |
| Git | https://github.com/goochoi913/HyberCRM, commit and push straight to `main`, no PRs. Commit rules are in [`CLAUDE.md`](../../CLAUDE.md). The repo is public, so the True Education analysis (`docs/true-education/`) stays local and out of git. |
| True Education | TE never moves onto Hyber (Q9). No migration tooling. |

## 2. Answers

| # | Question | Answer → what gets built |
|---|---|---|
| Q1 | Super Admin | `goochoi913@gmail.com` only. Bootstrapped in the security rules (platform owner) plus the `platformAdmins` collection for future additions. |
| Q2 | Writing to `hyber-crm` | Yes to rules, indexes, functions and seeding. Later extended to Hosting. |
| Q3 | JS or TS | TypeScript. |
| Q4 | Access | (1) Admins add people by email (employee, parent, student); the first Google sign-in links them automatically; unknown emails see "No access yet" with the signed-in email. (2) **Every branch has its own public sign-up page**, `/{branchId}/signup`, where tutors, parents and students request access with Google. Requests land in the branch's Account page for an admin to approve (choosing the role and linking or creating the person record) or reject. |
| Q5 | Several roles | **Superseded by §4 (one role per person).** ~~A member holds several roles (`roles: ["admin","tutor"]`). A person with more than one portal gets a portal switcher. An employee teaches when they hold the `tutor` role.~~ |
| Q6 | Parent & student portals | **Student:** Home with upcoming sessions, a Calendar of their own sessions, and their own profile info. **Parent:** read-only upcoming sessions for linked students, plus progress reports the branch chooses to share. No Diagnostics anywhere. |
| Q7 | Suggestions | Dropped. |
| Q8 | Clock-in before a kiosk | A **demo web kiosk**: an admin opens `/{branchId}/kiosk` on the center's computer, staff punch in/out with a 4-digit PIN. It calls the same server functions a future **Android tablet kiosk app** will call. |
| Q9 | TE migration | Never. |
| Q10 | Availability lead time | Warn when a block is less than **14 days** ahead; **lock everything** (create, edit, delete, move) inside **7 days**; enforced by the security rules. Both numbers and the enforcement mode are per-branch settings, editable by the branch admin and the Super Admin. Admins are never locked. |
| Q11 | Availability shape | Several ranges per day, plus **Repeat weekly** and **Copy last week** shortcuts. |
| Q12a | What counts as teaching time | Only sessions whose **session log has been submitted** (the tutor filled in the log, which makes the session Present). Pending, Confirmed and No Show time is admin time. Because a log can be submitted after clock-out, the teaching/admin split is **computed from shifts and sessions when pay is viewed**, and frozen when a pay period is locked. |
| Q12b | Admins who teach | **Superseded by §4: admins never teach.** ~~Paid their own single rate for the whole shift (no split).~~ |
| Q12c | "Dev Clock In" | Dropped. |
| Q12d | Pay periods | Keep the free date-range report **and** add weekly, biweekly and semi-monthly pay periods that can be **locked**. Locked periods freeze the computed pay and block edits to shifts inside them. |
| Q12e | Google Sheets payroll mirror | Dropped. No Sheets integration. |
| Q13 | Tutor-entered hours | Not built. |
| Q14 | Manual student status | A manually set status stops the automatic transitions until someone changes it again. |
| Q15a | Session-log AI | Kept, per-branch toggle. Student names may be sent to the AI provider. The app never names the provider (§4). |
| Q15b | Tutors see other tutors' logs | Yes (TE behavior), as a per-branch setting. |
| Q15c | Logging canceled / No Show sessions | Not allowed. |
| Q15d | Editing a log after submitting | Allowed. |
| Q16 | Session notifications | Push is deferred to the future phone app. Hyber stores in-app notification records and per-person notification preferences now, so the app can use them later. Intended rule: tutors are notified of new sessions inside 24 h and of any change or deletion inside 24 h, each type switchable by the tutor. |
| Q17 | Editing past days | **Nobody** edits past schedule days. No Development Mode, no override permission. (Session logs stay editable.) |
| Q18 | Audit Log | Permanent and append-only; Pending sessions are logged too. |
| Q19 | Google Calendar sync of events | Not built now. Events keep a reserved `googleSync` field and the branch settings keep a disabled `integrations.googleCalendar` switch, so it can be added later without a data change. |
| Q20 | Week start | Weeks start on **Sunday** everywhere (as TE's mini calendar). **Closed days are not shown at all** in the schedule: no "Closed" placeholders. A branch closed on Sundays therefore effectively starts on Monday. |
| Q21 | What tutors see about students | Decided in §3. |
| Q22 | Installed app identity | One "Hyber CRM" installable app (PWA) for everyone, branded with the branch logo and name inside. No further PWA work (§4). |

## 3. Developer calls (owner delegated these)

| Topic | Decision |
|---|---|
| URL scheme | `/` landing · `/login` · `/app` (resolver) · `/platform/*` (Super Admin) · `/{branchId}/signup` · `/{branchId}/admin/*` · `/{branchId}/tutor/*` · `/{branchId}/parent/*` · `/{branchId}/student/*` · `/{branchId}/kiosk`. Branch IDs are slugs and may not use reserved words (`app`, `login`, `platform`, `admin`, `api`, `assets`, …). |
| Sign-in | Google sign-in goes through the project's default auth domain (`hyber-crm.firebaseapp.com`), the only return address registered on the OAuth client. Using the app's own domain needs its `/__/auth/handler` added to that client in Google Cloud first. After sign-in, `/app` sends the Super Admin to the Platform dashboard (all branches) even when they also belong to a branch; anyone else goes straight to their branch, or picks one if they have several. |
| Tutor access to students (Q21) | The basic student record (name, grade, school, status, subjects, learning notes) holds nothing sensitive, and every staff member can read it; the schedule and session logs need it. Contacts, parents, address, birth date, school login and intake answers live in `students/{id}/private/profile`, **admin-only**. The tutor Students page lists only students the tutor teaches (sessions in the last 90 days or upcoming). |
| Branch public profile | `branches/{b}/public/profile` (name, logo, colors, sign-up enabled) is world-readable, so the sign-up page and the branch picker can show the brand before access exists. |
| Staff record | `staff/{id}.roles` mirrors the employee roles on the member doc (`admin`, `tutor`). Schedule rows = active staff with the `tutor` role. Editing an employee's roles updates both docs in one batch. |
| Pay data | Shifts (`clockShifts`) are the only stored worked time. Admin "Time Entries" create, edit and delete shifts (with an optional forced type, e.g. a meeting that is all admin time). Teaching/admin segments are computed by `shared/pay` on demand; locked pay periods store a snapshot. |
| Pay-period lock | `branches/{b}/payroll/state.lockedThrough` (a dateKey). Rules refuse shift writes on or before it. Periods are locked in order. |
| Past-day lock | Sessions carry `dayEndAt` (the next local midnight); rules refuse client writes to sessions whose day has ended. Session-log submission and scheduled jobs run on the server. |
| Kiosk PINs | Hashed on the server, stored where clients can't read them (`branches/{b}/kioskPins/*`), unique per branch, set by an admin through a callable. |
| Notifications | In-app inbox docs (`notifications`) and per-person preferences now; FCM push later with the phone app. Tutors see a bell with the unread count; items link to the post or the schedule week. Items are written only by Cloud Functions with deterministic IDs (a retried trigger can't notify twice). |
| Admin Home | TE's cards minus Diagnostics, fed by live listeners (no 30-second polling). "Missing & Needs Attention" = sessions in the last 14 days whose start passed (plus an optional grace, default 0 as in TE) without a submitted log, unfixed automatic clock-outs (the stored `autoClosed` flag, not a midnight guess), and pending sign-up requests. The sidebar Home badge counts those plus new students to follow up. Clicking an auto clock-out opens the correction dialog. Shortcuts are saved per person and branch in the browser. |
| Announcements | Real routes (`announcements`, `/new`, `/:id`, `/:id/edit`), so posts can be linked. Audience: all tutors or picked people (`audienceType` + `audienceKeys` = member emails), checked by the rules. Categories = the branch defaults (Settings) plus any typed in the editor. Pinned posts float to the top. HTML is sanitized (DOMPurify) on save and on display; images and attachments go to Storage under the post's folder. Read receipts are write-once and only the tutor portal writes them (TE: admins never did). `readCount`/`commentCount` are kept by functions; deleting a post removes its receipts, comments and files. Admins may delete any comment. The read-receipts dialog also lists who hasn't read it yet. |
| Session notifications | TE's decision table (`shared/src/schedule/notify.ts`): "Session Confirmed" for new confirmed sessions; cancellation of a confirmed session and its correction; reassignment (both tutors); no-show, date, time and subject changes (one per update, in that order). Only sessions starting within `notifications.sessionChangeWindowHours` (24) before or after the change notify; pending sessions stay silent, as in TE. Hyber adds "Session Deleted"/"Session Restored" when a confirmed session goes to or comes back from the Trash. Each item obeys the tutor's switch for new sessions, changes or cancellations. |
| Daily jobs | 08:00 UTC: automatic student statuses (TE's rules, 20 idle days → Paused) and each student's next session date; a hand-set status is left alone until an admin clicks "Let Hyber manage it again". 08:30 UTC: inbox items older than `notifications.retentionDays` and trashed sessions older than `trash.retentionDays` are deleted. |
| Installable app | One PWA, "Hyber CRM" (`start_url` `/app`), with a small service worker that only serves the last app shell when offline. The installed icon shows the tutor's unread announcements, like TE's News badge. |
| Parent & student portals | Parent: upcoming sessions for linked children (list or month, 4 weeks at a time, per child) and the progress reports the branch shared, which open the printable report. Student: Home (next session, hours, what's coming up, shared reports), Calendar and My Info (the basic record; contact details stay admin-only). Statuses use family words (Scheduled, Confirmed, Attended, Missed, Canceled); staff notes on sessions are not shown. The branch's contact details (Settings → profile) appear for questions and changes. |
| Sample data | "Add sample data" (Super Admin) runs the `seedDemoData` function: the data set includes submitted logs, counters and other people's comments that clients may not write. |

## 4. Round 2 (owner, 2026-10-01)

The owner's second list of changes, focused on the **admin portal**; the tutor, parent and student portals get their own rounds later and are only touched where the admin side depends on them. **Where this section disagrees with §1–§3, this section wins.** Rules marked **permanent** apply to all future work.

| Topic | Decision |
|---|---|
| Month calendars (**permanent**) | Every monthly calendar, on web and on phone, scrolls **vertically** through months like the iOS Calendar app. No static months with ‹ › arrows anywhere: the Schedule's mini calendar and Month view, availability, employee and student calendars, the opening-hours calendar and every date picker use the shared month scroller. |
| One role per person (**permanent**) | A member has exactly **one role**: Owner, Admin, Tutor, Parent or Student (`role`, replacing `roles[]`). No portal switcher. Supersedes Q5. |
| Admins never teach | Only Tutors are on the schedule, have sessions and write session logs. Owners and Admins are paid one rate for all their clocked time. Supersedes Q12b. |
| Branch rules (**permanent**) | Core business rules are chosen by the **Super Admin when creating a branch** (after visiting the center), not in the admin's Settings, and nothing is hard-coded to True Education: **pay model** (Teaching only, the default, or Teaching + Admin), **students per tutor at once** (enforced everywhere the schedule creates or moves sessions) and **parent conferences** (on/off and every N tutoring hours; off = nothing tracked, no Conference tab, no Home card). Only the Super Admin changes them later, from the Platform page. |
| Pay model changes | **Teaching only:** tutors are paid only for teaching time inside their clocked shifts (time in sessions whose log was submitted); idle or gap time is unpaid. **Teaching + Admin:** True Education's split (teaching rate in sessions, admin rate for the rest of the shift). The Super Admin can switch a branch's model **from a chosen date**, which must be after the last locked pay period; pay before that date keeps the old model, so past payroll never changes. Demo Academy stays Teaching + Admin. |
| AI naming (**permanent**) | The app never names the AI model or provider: no labels, settings, messages or errors. It is always "AI". |
| Layout | No page header row; the sidebar toggle sits in the sidebar header next to the branch name (phones keep a slim top bar to open the menu). The Super Admin bar stays. |
| Admin menu | Home, Announcements, Schedule, Students, Employees (Directory, Calendar, Subjects, Pay Rates, Payroll, Time Entries), Sessions (Session Log, Progress Reports); Account, Access Control and Settings at the bottom. Audit Log moves into Settings. Students → Calendar is removed (each student's calendar is on their profile). The master schedule is removed entirely. |
| Opening hours | Weekly defaults plus **per-date hours** (open, closed or custom times) on a calendar in Settings → Schedule, with a range tool (from–to dates, optional weekdays, closed or a time range). Dates that differ from the default are marked and can be reset. Per-date hours feed the schedule, hidden closed days and availability. |
| Availability | Times follow **that date's** opening hours (including per-date hours); closed days accept no availability. The availability calendar supports copy/paste of an item or whole days (⌘/Ctrl+C, ⌘/Ctrl+V), Shift-click range selection, and dragging an item to another day. |
| Schedule | The right panel **floats** over the schedule and opens and closes, also with Escape. While a session card is dragged, a dotted line at its start edge shows the start time, following the time snap. |
| Payroll | True Education's structure: filter bar (Role, Status, Employee, From, Up to, Generate, Clear), "Recent Payroll Records" table (Date, Name, Type, Start Time, End Time, Hrs, Rate, Total, Edit/Delete), 25 per page, rows shaded by date. Hyber still computes the rows from shifts and logged sessions, so Edit and Delete act on the shift behind a row. |
| Email | Real emails for owner invites, new accounts and approved sign-up requests, with a link to sign in. Sent through Gmail from **hybertecofficial@gmail.com** (HyberTec LLC), with an app password stored as the `GMAIL_APP_PASSWORD` secret. The sign-up page must be easy to find. |
| Company | Hyber CRM is a product of **HyberTec LLC**; the public pages and emails say so. |
| View the app as | Super Admin only: an eye icon next to their name previews the app as themselves, a regular admin, or a tutor, parent or student. It only changes what is shown; their access stays the same. |
| PWA | No further PWA work; real phone apps come later. The mobile-friendly web stays as a fallback. |
