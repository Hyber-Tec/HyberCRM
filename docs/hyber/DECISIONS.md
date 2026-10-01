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
| Q5 | Several roles | A member holds **several roles** (`roles: ["admin","tutor"]`). A person with more than one portal gets a portal switcher. An employee teaches when they hold the `tutor` role. |
| Q6 | Parent & student portals | **Student:** Home with upcoming sessions, a Calendar of their own sessions, and their own profile info. **Parent:** read-only upcoming sessions for linked students, plus progress reports the branch chooses to share. No Diagnostics anywhere. |
| Q7 | Suggestions | Dropped. |
| Q8 | Clock-in before a kiosk | A **demo web kiosk**: an admin opens `/{branchId}/kiosk` on the center's computer, staff punch in/out with a 4-digit PIN. It calls the same server functions a future **Android tablet kiosk app** will call. |
| Q9 | TE migration | Never. |
| Q10 | Availability lead time | Warn when a block is less than **14 days** ahead; **lock everything** (create, edit, delete, move) inside **7 days**; enforced by the security rules. Both numbers and the enforcement mode are per-branch settings, editable by the branch admin and the Super Admin. Admins are never locked. |
| Q11 | Availability shape | Several ranges per day, plus **Repeat weekly** and **Copy last week** shortcuts. |
| Q12a | What counts as teaching time | Only sessions whose **session log has been submitted** (the tutor filled in the log, which makes the session Present). Pending, Confirmed and No Show time is admin time. Because a log can be submitted after clock-out, the teaching/admin split is **computed from shifts and sessions when pay is viewed**, and frozen when a pay period is locked. |
| Q12b | Admins who teach | Paid their own single rate for the whole shift (no split). |
| Q12c | "Dev Clock In" | Dropped. |
| Q12d | Pay periods | Keep the free date-range report **and** add weekly, biweekly and semi-monthly pay periods that can be **locked**. Locked periods freeze the computed pay and block edits to shifts inside them. |
| Q12e | Google Sheets payroll mirror | Dropped. No Sheets integration. |
| Q13 | Tutor-entered hours | Not built. |
| Q14 | Manual student status | A manually set status stops the automatic transitions until someone changes it again. |
| Q15a | Session-log AI (Gemini) | Kept, per-branch toggle. Student names may be sent to Google's API. |
| Q15b | Tutors see other tutors' logs | Yes (TE behavior), as a per-branch setting. |
| Q15c | Logging canceled / No Show sessions | Not allowed. |
| Q15d | Editing a log after submitting | Allowed. |
| Q16 | Session notifications | Push is deferred to the future phone app. Hyber stores in-app notification records and per-person notification preferences now, so the app can use them later. Intended rule: tutors are notified of new sessions inside 24 h and of any change or deletion inside 24 h, each type switchable by the tutor. |
| Q17 | Editing past days | **Nobody** edits past schedule days. No Development Mode, no override permission. (Session logs stay editable.) |
| Q18 | Audit Log | Permanent and append-only; Pending sessions are logged too. |
| Q19 | Google Calendar sync of events | Not built now. Events keep a reserved `googleSync` field and the branch settings keep a disabled `integrations.googleCalendar` switch, so it can be added later without a data change. |
| Q20 | Week start | Weeks start on **Sunday** everywhere (as TE's mini calendar). **Closed days are not shown at all** in the schedule: no "Closed" placeholders. A branch closed on Sundays therefore effectively starts on Monday. |
| Q21 | What tutors see about students | Decided in §3. |
| Q22 | Installed app identity | One "Hyber CRM" installable app (PWA) for everyone, branded with the branch logo and name inside. |

## 3. Developer calls (owner delegated these)

| Topic | Decision |
|---|---|
| URL scheme | `/` landing · `/login` · `/app` (resolver) · `/platform/*` (Super Admin) · `/{branchId}/signup` · `/{branchId}/admin/*` · `/{branchId}/tutor/*` · `/{branchId}/parent/*` · `/{branchId}/student/*` · `/{branchId}/kiosk`. Branch IDs are slugs and may not use reserved words (`app`, `login`, `platform`, `admin`, `api`, `assets`, …). |
| Tutor access to students (Q21) | The basic student record (name, grade, school, status, subjects, learning notes) holds nothing sensitive, and every staff member can read it; the schedule and session logs need it. Contacts, parents, address, birth date, school login and intake answers live in `students/{id}/private/profile`, **admin-only**. The tutor Students page lists only students the tutor teaches (sessions in the last 90 days or upcoming). |
| Branch public profile | `branches/{b}/public/profile` (name, logo, colors, sign-up enabled) is world-readable, so the sign-up page and the branch picker can show the brand before access exists. |
| Staff record | `staff/{id}.roles` mirrors the employee roles on the member doc (`admin`, `tutor`). Schedule rows = active staff with the `tutor` role. Editing an employee's roles updates both docs in one batch. |
| Pay data | Shifts (`clockShifts`) are the only stored worked time. Admin "Time Entries" create, edit and delete shifts (with an optional forced type, e.g. a meeting that is all admin time). Teaching/admin segments are computed by `shared/pay` on demand; locked pay periods store a snapshot. |
| Pay-period lock | `branches/{b}/payroll/state.lockedThrough` (a dateKey). Rules refuse shift writes on or before it. Periods are locked in order. |
| Past-day lock | Sessions carry `dayEndAt` (the next local midnight); rules refuse client writes to sessions whose day has ended. Session-log submission and scheduled jobs run on the server. |
| Kiosk PINs | Hashed on the server, stored where clients can't read them (`branches/{b}/kioskPins/*`), unique per branch, set by an admin through a callable. |
| Notifications | In-app inbox docs (`notifications`) and per-person preferences now; FCM push later with the phone app. |
