# Hyber CRM: architecture & build plan

> **Status:** written 2026-09-30 after the full True Education (TE) analysis (kept locally in `docs/true-education/`, not in git). The owner's answers are in **[DECISIONS.md](DECISIONS.md), which overrides this plan wherever they differ** (notably: TypeScript, shadcn/ui, several roles per member, per-branch sign-up pages, Sunday week start, deploys and GitHub allowed). Companion documents:
> - [DATA_MODEL.md](DATA_MODEL.md): every Hyber Firestore collection and field, with the TE mapping.
> - [BRANCH_SETTINGS.md](BRANCH_SETTINGS.md): every per-branch setting, with TE's value as the default.
> - [MOBILE_APP.md](MOBILE_APP.md): concepts and rules for the future native app.

---

## 1. Goals and principles

1. **One core, many branches.** Every tutoring center ("branch") runs the same code, data structure and features. A branch customizes on top of the core: branding, settings, business-rule strategies and optional extra pages. Signing a new customer means creating a branch, never forking the code.
2. **Same structure, flows and logic as TE.** The schedule, availability, clock/pay, session logs and progress reports behave like TE. Where TE has a known bug, Hyber keeps the intended behavior and drops the bug. Each such deviation is listed in this plan.
3. **Every rule that could differ between centers is a setting.** TE's hard-coded values become the **defaults**, so a branch with default settings behaves exactly like TE.
4. **Security is enforced on the server.** Firestore rules and Cloud Functions enforce branch isolation, roles and money-related writes. The UI only mirrors them. TE enforces most rules in the UI only.
5. **Branch time zone, not the browser's.** All dates, "today", locks and cut-offs are computed in the branch's IANA time zone. A super admin in another country sees the same schedule as the branch admin.
6. **Real project from day one.** `npm run dev` runs against the real `hyber-crm` Firebase project; rules, indexes, functions and Hosting (https://hybercrm.com) are deployed as the build progresses (DECISIONS §1).

---

## 2. Tech stack and repository layout

| Layer | Choice | Why |
|---|---|---|
| Web app | **Vite + React 19 + React Router 7**, **TypeScript** | Same React/Router generation as TE. Vite gives a near-instant dev loop (CRA is deprecated). |
| Styling | **Tailwind CSS v4 + shadcn/ui, neutral theme** | The owner's preferred kit. Branch branding is applied through CSS variables. |
| Icons | **react-icons** | The owner's preferred set; shadcn's Lucide icons come from `react-icons/lu`. |
| Backend | Firebase project `hyber-crm`: Auth (Google only), Firestore (`nam5`), Storage, Cloud Functions v2 (Node 22), FCM | Same platform as TE, new project, new multi-tenant data model. |
| Shared logic | `shared/` folder of pure TypeScript (no React, no Firebase) | Time-zone math, lane layout, availability rules, pay segmentation, hour rounding, lifecycle, recurrence. Used by the web app **and** Cloud Functions, so there is one implementation of each rule (TE has three copies of the pay split). Also the future native app's core. |
| Tests | Vitest for `shared/` (the kiosk's Dart segmentation tests get ported) | The rules engines are where bugs cost money. |

```
HyberCRM/
├── web/                     Vite React app (all portals)
│   └── src/
│       ├── app/             App root, router, providers
│       ├── core/            firebase init, auth, tenancy (BranchProvider), settings resolver, permissions
│       ├── platform/        Super Admin pages (branch list, create/edit branch)
│       ├── portals/         admin/, tutor/ (desktop + mobile), parent/, student/ shells and nav configs
│       ├── features/        home, announcements, scheduling, availability, students, employees,
│       │                    timeclock, payroll, sessions (logs, progress reports), account, access, settings
│       ├── extensions/      per-branch extra pages, registered by key (see §3.4)
│       └── ui/              shared components (modals, pickers, tables, toasts)
├── shared/                  pure business logic + default settings (imported by web and functions)
├── functions/               Cloud Functions (notifications, schedules, callables)
├── scripts/                 admin scripts run locally with ADC: bootstrap super admin, seed Demo Academy
├── firestore.rules · firestore.indexes.json · storage.rules · firebase.json · .firebaserc (hyber-crm)
└── docs/                    true-education/ (reference) · hyber/ (this plan and companions)
```

---

## 3. Multi-tenancy model

### 3.1 Data isolation: one subtree per branch

Every branch-owned document lives **under its branch**: `branches/{branchId}/sessions/{id}`, `branches/{branchId}/students/{id}`, and so on.

- **Isolation by path.** A query can only ever touch one branch's subtree. No query needs a `where("branchId", "==", …)` filter, so forgetting one can't leak data.
- **Rules by path.** One `match /branches/{branchId}/...` block checks membership once for everything under it.
- **Lifecycle.** A branch can be exported, archived or deleted as a unit.
- **Cross-branch views** (super admin dashboards) use collection-group queries. Only super admins may run them.

Root-level collections hold only platform data: `platformAdmins`, `users` (global profile + devices) and `branches` (the branch docs themselves).

The branch ID is a readable, immutable slug chosen at creation (`demo-academy`). It appears in URLs.

### 3.2 What a branch is

`branches/{branchId}` holds the branch profile (name, status, time zone, locale, currency), **branding** (logo, colors), contact details, enabled **extensions**, and the branch's **settings overrides**. See [DATA_MODEL.md §2](DATA_MODEL.md).

### 3.3 The "parent class / subclass" model: five customization layers

| Layer | Where it lives | Who changes it | Example |
|---|---|---|---|
| 1. **Core defaults** | `shared/settings/defaults.js` (code) | Developer | `schedule.maxConcurrentStudentsPerTutor = 3` |
| 2. **Branch settings overrides** | `branches/{b}.settings` (deep-merged over the defaults) | Branch admin (Settings page) or super admin | Another center sets it to `1` |
| 3. **Rule strategies** | `shared/rules/*`, selected by a setting | Developer adds a strategy; the branch picks it | `payroll.payModel = "teaching_admin_split"` (TE) or `"single_rate"` |
| 4. **Branding** | `branches/{b}.branding` + Storage `branches/{b}/branding/*` | Branch admin / super admin | Logo, primary color, display name, page titles |
| 5. **Extensions** (extra pages for one center) | Code in `web/src/extensions/<key>/`, enabled by `branches/{b}.extensions[]` | Developer builds; super admin enables per branch | A center-specific report page added to that center's sidebar |

`useBranchSettings()` returns `deepMerge(DEFAULTS, branch.settings)`. Cloud Functions use the same resolver from `shared/`. A branch with no overrides behaves exactly like TE.

### 3.4 Extensions (per-branch pages)

```js
// web/src/extensions/registry.js
export const EXTENSIONS = {
  "example-report": {
    label: "Example report",
    nav: [{ portal: "admin", group: "sessions", key: "exampleReport", label: "Example Report", path: "sessions/example-report" }],
    routes: [{ path: "sessions/example-report", component: lazy(() => import("./example-report/Page.jsx")) }],
    settingsDefaults: { /* optional extra settings */ },
  },
};
```

The admin and tutor nav builders merge the core nav with the nav items of the branch's enabled extensions. Disabled extensions are never loaded.

---

## 4. Identity, access and roles

### 4.1 Google sign-in only

Firebase Auth with only the Google provider (already enabled on `hyber-crm`). All of TE's password machinery disappears: email-first login, password setup and resets, `setUserPassword`, and public account creation.

### 4.2 Membership is keyed by email **(Q4)**

People get access by **email**, before they ever sign in:

1. An admin adds a person (employee, parent, student) with their Google email address. This writes `branches/{b}/members/{email}` with a role.
2. The person clicks **Sign in with Google**. The app reads their verified Google email and finds every branch where a member doc with that email exists. It records their `uid` and last login on the member doc.
3. One branch → straight in. Several → a branch chooser. None → a "No access yet" page showing the signed-in email, so they can tell the admin which address to add.

Keying member docs by **lower-cased email** has two benefits:
- The admin can set everything up before the person's first sign-in.
- The Firestore rules can find the member doc directly from the sign-in token (`request.auth.token.email`), with no lookup table or Cloud Function.

Rules also require `email_verified == true`.

### 4.3 People records vs access records

| Collection | Purpose | Key |
|---|---|---|
| `branches/{b}/members/{email}` | **Access:** role, access status, links to the person record, admin restrictions, last login | lower-cased email |
| `branches/{b}/staff/{staffId}` | **Employee record** (TE's tutor/admin `users` doc): name, status, phone, employment dates, subject qualifications, `teaches` flag, notification prefs | auto ID |
| `branches/{b}/staff/{staffId}/private/compensation` | Pay rates + history (admin read/write; the employee can read their own) | fixed |
| `branches/{b}/staff/{staffId}/private/notes` | Admin-only internal note | fixed |
| `branches/{b}/students/{studentId}` | Student record (TE's `students` doc) incl. parent contacts | auto ID |

Sessions, availability, time entries and logs reference **`staffId` / `studentId`**, never an auth uid or an email. Benefits:
- Admins can schedule a tutor who hasn't signed in yet.
- Someone who changes Google account only needs their member doc's email updated.
- TE's split between `users` with role "student" and `students` docs disappears: a student is one `students` doc, with an optional login (a `student` member doc pointing to it).

### 4.4 Roles and portals **(Q5, Q6)**

| Role | Portal | Notes |
|---|---|---|
| Super admin (platform) | Platform pages + **the admin portal of any branch** | Not a branch member. Sees each branch exactly as its admin does, with full access. |
| `admin` | Admin portal | Full branch access, minus any per-admin restrictions (§4.5). If the linked staff record has `teaches: true`, the admin also appears on the schedule, has availability/clock/pay, and gets a **"Tutor view"** switch (one account instead of TE's two). |
| `tutor` | Tutor portal: desktop sidebar or mobile PWA | Own schedule, availability, session logs, students, payroll, profile, announcements |
| `parent` | Parent portal | Linked students only (`studentIds`). Scope is **(Q6)**; default is a minimal read-only portal. |
| `student` | Student portal | Own record only (`studentId`). Same scope question **(Q6)**. |

### 4.5 Admin restrictions (Access Control)

TE's per-admin `blockedPages` becomes `members/{email}.restrictions` (e.g. `["payRates","payroll","timeEntries","accessControl"]`). Two improvements:
- **Rules enforce it.** A restricted admin is denied the guarded collections (pay rates, time entries), not just the menu item.
- **No shared password.** Only the branch **owner** admins (`isOwner: true`) and super admins can open Access Control.

TE's "Development Mode" (a client-side password that unlocks past days and silently stops audit logging) becomes a per-admin permission, **"Edit past days"** **(Q17)**. Those edits are always audit-logged.

### 4.6 Rules strategy (sketch)

```
function signedIn() { return request.auth != null && request.auth.token.email_verified == true; }
function emailKey() { return request.auth.token.email.lower(); }
function isSuperAdmin() { return signedIn() && exists(/databases/$(database)/documents/platformAdmins/$(emailKey())); }
function memberPath(b) { return /databases/$(database)/documents/branches/$(b)/members/$(emailKey()); }
function isMember(b) { return signedIn() && exists(memberPath(b)) && get(memberPath(b)).data.status == "active"; }
function role(b) { return get(memberPath(b)).data.role; }
function isAdmin(b) { return (isMember(b) && role(b) == "admin") || isSuperAdmin(); }
function isTutor(b) { return isMember(b) && role(b) == "tutor"; }
function myStaffId(b) { return get(memberPath(b)).data.staffId; }
function notRestricted(b, page) { return isSuperAdmin() || !(page in get(memberPath(b)).data.get("restrictions", [])); }

match /branches/{b} {
  allow read: if isMember(b) || isSuperAdmin();
  match /sessions/{id} {
    allow read: if isAdmin(b) || (isTutor(b) && resource.data.tutorId == myStaffId(b));
    allow create, delete: if isAdmin(b);
    allow update: if isAdmin(b) || (isTutor(b) && resource.data.tutorId == myStaffId(b)
                     && request.resource.data.diff(resource.data).affectedKeys().hasOnly([...attendance keys...]));
  }
  // … every collection gets an explicit rule; there is NO catch-all
}
```

Firestore caches `get()` within one request, so each request pays at most one extra read for the member doc.

---

## 5. Super Admin flow

1. **Sign in** → `platformAdmins/{email}` exists → **Platform home** (`/platform`): a grid of branch cards (logo, name, status, time zone, counts) and **New branch**.
2. **New branch:** name, slug ID (immutable), time zone, locale, logo upload, primary color, first admin's email. Creates the branch doc and the first admin's member doc (with `isOwner: true`).
3. **Open a branch** → `/{branchId}/admin/home` renders that branch's **admin portal**, with no extra bar (round 2: DECISIONS.md §4).
4. **Switch branch** from the account menu, which opens the platform home.
5. **Platform branch settings** (super admin only): status (active/suspended/archived), enabled extensions, and any setting locked at platform level.

The first branch is **Demo Academy**: generic name, placeholder logo (an SVG monogram), seeded with realistic fake tutors, students, subjects, availability and sessions, so the product looks professional immediately. Seeding is a script (`scripts/seed-demo.mjs`) that writes **only under `branches/demo-academy/`** **(Q2)**.

---

## 6. Routing and app shell

| Path | Who | What |
|---|---|---|
| `/` | public | Placeholder landing page (Hyber CRM, one paragraph, **Sign in with Google**) |
| `/login` | public | Google sign-in |
| `/app` | signed in | Resolver: super admin → `/platform`; one membership → `/b/{id}`; several → chooser; none → "No access yet" |
| `/platform`, `/platform/branches/new`, `/platform/branches/:id` | super admin | Platform pages |
| `/b/:branchId/*` | members, super admin | The role's portal. Admin paths mirror TE's (below). |
| `/:branchId/session-log/:sessionId` | tutor, admin | Session-log form, opened in a **new tab** from the schedule (loads by ID, unlike TE). A submitted log opens read-only with **Edit log**. |
| `/:branchId/session-log/:sessionId/view` | staff | Read-only session log (renders from the log, so tutors can read other tutors' logs when allowed) |
| `/b/:branchId/progress-reports/:reportId` | staff (+ parents if shared) | Progress report page (print/PDF) |

Admin portal paths: `home`, `announcements`, `scheduling/schedule/{day|week|month}/…` (TE's URL scheme, e.g. `day/2026-09-30`, `week/2026-W40`, `?mode=master`), `scheduling/audit-log`, `students/directory[/:id[/:tab]]`, `students/calendar?student=`, `employees/directory[/:id]`, `employees/calendar`, `employees/subjects`, `employees/pay-rates`, `employees/payroll`, `employees/time-entries`, `sessions/log`, `sessions/progress-reports`, `account`, `access-control`, `settings`.

Tutor portal paths: `home` or `announcements` (default, as in TE), `schedule`, `availability`, `sessions/log`, `sessions/progress-reports`, `students/directory[/:id]`, `payroll`, `my-info/profile`, `my-info/subjects`. On phones (< 768 px) the same tutor portal renders the PWA shell with bottom tabs. Unlike TE, those tabs are real routes, so reload and back work.

**Branding in the shell:** the branch logo and display name are in the sidebar header. Branch colors are applied as CSS variables (`--brand-primary` …). The tab title is `{Page} | {Branch name}`.

---

## 7. Time and dates (redesigned)

TE mixes browser time, kiosk device time and New York time. Hyber uses one model:

- `branches/{b}.timezone` (IANA, e.g. `America/New_York`) is the only time zone used for business logic.
- **Wall-clock fields** (what the schedule thinks in): `dateKey` (`YYYY-MM-DD` in branch time) plus `startMin`/`endMin` (minutes after local midnight). Sessions, availability, day configs, events and time entries all carry them. They render without any time-zone math.
- **Absolute fields** (`startAt`/`endAt` Timestamps) are stored alongside for anything compared with "now" or with clock times (auto-confirm, pay segmentation, missing-log detection).
- One module, `shared/time.js`, converts between the two with the `Intl` API: `todayKey(tz)`, `nowMinutes(tz)`, `toInstant(dateKey, minutes, tz)`, `dateKeyOf(instant, tz)`, `minutesOf(instant, tz)`, week math with `weekStartsOn`. It has unit tests, including DST days.

Queries by date become simple string ranges on `dateKey`. That replaces TE's 121 single-document reads per week for day configs with one query.

---

## 8. Domain design notes (what stays, what changes)

### 8.1 Schedule (the heart)

**Rebuilt the same:**
- Day/Week/Month views and the Master Schedule.
- Tutor rows: white availability band on a gray track, clock overlay with green pill, ghost rows, "N Canceled" pills.
- Up to N lanes with the +1 empty lane.
- Status colors and icons, the events strip, gestures, hotkeys, copy/paste, Trash, Duplicate Week, the Edit Day pencil, the right-hand drawer, zoom, the URL scheme and live updates.
- Capacity checks and tutor eligibility (availability containment + seats left).
- No Show hour accounting, auto-confirm 24 h before start, the activity toasts.

Details: doc 03 and doc 04.

**Changed on purpose:**

| TE | Hyber | Why |
|---|---|---|
| Sessions bucketed by legacy period `blockId`; mismatches are silently not drawn | Placed purely by time | Removes invisible sessions (TE bug). Visually identical for valid data. |
| Status strings in mixed spellings (`Canceled`/`Cancelled`, Title Case) | Fixed lowercase enum `pending/confirmed/canceled/no_show/present`; labels are UI | Ends spelling drift in queries and functions |
| Session-log indicator needs a separate read of `session_logs` | Denormalized `logStatus` on the session | One listener instead of N reads |
| Availability, clock and day configs are fetched once (stale) | Real-time listeners | An open schedule reflects tutor changes and kiosk punches |
| Whole `users`/`students` collections downloaded on mount | Staff list from `staff`; students loaded on demand or by IDs | Cost and speed |
| Past-day lock and capacity enforced only in the browser | Also checked in rules (past-day lock) and in the server notification/auto-confirm logic | TE's rules check only the role |
| Activity Log: client-written, 14-day purge, deletable, skipped in Developer Mode | **Audit Log**: append-only, actor uid + entity IDs, structured changes, retention is a setting (default: keep) **(Q18)** | It must be trustworthy |
| "Student" label when grade is missing | Always the student's name, with "(grade)" only when a grade exists | TE bug |
| Week header Sunday ≠ section Sunday | Consistent `weekStartsOn` everywhere **(Q20)** | TE bug |

### 8.2 Availability

- One doc per tutor per date: `availability/{staffId}_{dateKey}`. The deterministic ID keeps TE's one-record-per-day semantics without de-duplication.
- Each doc holds `ranges[]`. TE allows one range per day, so `maxRangesPerDay = 1` by default **(Q11)**.
- Soft delete keeps TE's "explicitly unavailable" meaning.
- The lead time and the lock window are settings **(Q10)**. Hyber can enforce them in the rules using server time (`request.time`), which TE never did.
- A drag to another day becomes delete-plus-create. That fixes TE's moved-doc-ID bug.

### 8.3 Time clock and pay (kiosk-ready)

- **A shift is a document.** Each clock-in creates `clockShifts/{shiftId}`. A pointer doc `openShifts/{staffId}` enforces one open shift per employee inside a transaction. This fixes TE's critical correction bug, where `clockSessionId` was the uid.
- **One segmentation engine** (`shared/pay/segment.js`) implements TE's algorithm exactly:
  - Sessions are merged; canceled and deleted ones are excluded.
  - Time inside sessions is Teaching and the rest is Admin.
  - Hours are rounded to 0.01 h, and pay is calculated from the rounded hours.
  - Which statuses count is a setting.

  Cloud Functions use it for clock-out, the auto clock-out and corrections. The web app uses it for previews.
- **Pay model is a setting:**
  - `teaching_admin_split` (TE)
  - `single_rate` (all clocked time at one rate)
  - room for more later, e.g. per-session pay
- **Time entries** (TE `payroll_records`) are one doc per segment. They carry `shiftId`, `source` (`clock` / `auto_clock_out` / `admin_entry` / `self_entry` / `correction`), `rate` snapshot and `status`.
- **Employees → Time Entries** = TE's Log Hours (create) **plus** the inline edit/delete that TE had on the Payroll page. **Payroll** becomes a read-only report (TE's date-range report with Admin/Teaching/Total).
- **Clock-in/out without a kiosk** is decided by **(Q8)**. The data model and the server callables (`clockIn`, `clockOut`) are the same ones a future kiosk will call; only the client differs.
- **Future kiosk:**
  - Paired devices (`branches/{b}/kioskDevices/{deviceId}`) with a device-only auth token (claims `{kiosk, branchId, deviceId}`), never an admin account.
  - Hashed PINs in a functions-only collection.
  - Server time and server-side segmentation.

  See doc 06 §8.5.

### 8.4 Sessions: log and progress reports

- **The form loads by session ID** from Firestore (not `localStorage`), so links and refreshes work on any device.
- **Steps, fields, validation and labels are the same as TE:** 6 steps; types, topics, homework, materials, metrics, notes, ratings and flag.
- **The option lists and required fields come from settings.**
- **Submit is one atomic server operation** (callable `submitSessionLog`):
  1. Validate.
  2. Generate the AI fields if AI is enabled **(Q15)**.
  3. Write the log.
  4. Set the session to Present and set `logStatus`.
  5. Apply the billable-hours delta and the lifecycle update to the student.
  6. Write an audit entry.

  This fixes TE's non-atomic writes and the No Show double count (the No Show and the log share one hours ledger).
- **Logs and reports reference `studentId`**, never the name.
- **Drafts are excluded** from lists and reports.
- **Progress reports:** same metrics, thresholds (now settings) and AI narrative; frozen snapshots; print/PDF.

### 8.5 Students and subjects

- **Statuses and transitions are TE's.** The 6 statuses and the 3 automatic transitions (20-day pause) are kept. The transitions run in a **daily per-branch job** and on log submit, not when an admin happens to open the directory. A manually set status is respected **(Q14)**.
- **Hours and conferences:** `totalSessionHours` and the 25-hour conference cycle are kept. Conference notes move to a subcollection with author and date (TE stored them in an array inside the student doc).
- **Subjects:** a two-level catalog (categories → subjects) referenced by **ID**. Qualifications have **one** source of truth: `staff.subjectIds`. TE kept them twice, linked by name.

### 8.6 Home, Announcements, notifications

- **Home dashboard:** the same cards except Diagnostics. Clock data comes from shifts, so "Auto clock-out" detection uses the stored flag instead of a "ends at midnight in the browser's zone" guess.
- **Announcements:** wizard, audience, pin/archive, read receipts, comments and push as in TE. HTML is sanitized (DOMPurify) and images are uploaded to Storage instead of being inlined.
- **Notifications:**
  - An inbox (`branches/{b}/notifications`) plus FCM push.
  - Device tokens are per user and removed on logout.
  - All preference toggles are honored, including Announcements, which TE ignored.
- **Suggestions:** kept or dropped per **(Q7)**.

---

## 9. Cloud Functions plan

| Function | Kind | Replaces TE | Notes |
|---|---|---|---|
| `onSessionCreated`, `onSessionUpdated` | Firestore triggers | `sendSession*Notification` | Same decision table as TE (doc 04 §5.14), branch time zone, branch app URL. On create: auto-confirm inside the window. |
| `autoConfirmSessions` | schedule, every hour | same | Loops over active branches; uses each branch's setting; skips trashed sessions (TE bug). |
| `autoClockOut` | schedule, every 15 min | `autoClockOutOpenSessions` | Closes open shifts once each branch's local cut-off passes (default 00:00). |
| `clockIn`, `clockOut`, `correctShift` | callables | kiosk logic + Home correction | Server time, one engine, one open shift per employee. Used by the web now and the kiosk later. |
| `submitSessionLog`, `generateAi` | callables | client submit + `generateSessionLogAi` | Atomic submit; Gemini key in Secret Manager; per-branch AI toggle and quota. |
| `onAnnouncementWrite` | trigger | `sendAnnouncement*Notification` | Honors preferences. |
| `studentLifecycleDaily` | schedule, daily | directory-load side effect | Per branch time zone. |
| `purgeExpired` | schedule, daily | `purgeOldTutorNotifications` + client purges | Notifications and trash, using each branch's retention settings. |
| `syncEventToGoogleCalendar`, `syncTimeEntryToSheet` | triggers | TE integrations | Optional per branch **(Q12, Q19)**. Built late. |

**Running them locally:** callables run in the **Functions emulator** while the web app talks to the real Firestore and Auth. The emulator uses production Firestore through Application Default Credentials. Triggers and schedules only run once deployed, so they need a functions deploy, which is **(Q2)**.

---

## 10. Security model summary

- **No catch-all rule.** Every collection has explicit rules. Branch data requires an active membership or super admin.
- **Least-privilege reads:**
  - Staff records: admins, plus the employee themselves.
  - Pay rates: admins without the `payRates` restriction, plus the employee themselves.
  - Tutors: their own sessions, availability, shifts and entries; every student in the branch (TE behavior) **(Q21)**.
  - Parents and students: only linked records.
- **Writes use allow-lists** (`hasOnly`) for every non-admin update. Privileged fields (rates, flags, restrictions, roles) are admin-only.
- **Money and lifecycle are written on the server** (clock, segmentation, log submit, lifecycle).
- **Storage** mirrors the branch scoping and enforces size and content-type limits.

---

## 11. Local development workflow

- `web/`: `npm run dev` → `http://localhost:5173`, against the real `hyber-crm` project. `localhost` is an authorized Google sign-in domain by default.
- **Rules and indexes:** `firebase deploy --only firestore:rules,firestore:indexes,storage`, after the owner's OK **(Q2)**. Hosting is never deployed, and `firebase.json` contains no hosting section.
- **Functions:** emulator for callables during development; `firebase deploy --only functions` for triggers and schedules when ready **(Q2)**.
- **Scripts** (`scripts/`) use the Firebase Admin SDK with Application Default Credentials (`gcloud auth application-default login`, project `hyber-crm`). They cover super admin bootstrap and the Demo Academy seed.
- **Git:** https://github.com/goochoi913/HyberCRM, pushed straight to `main` (rules in `CLAUDE.md`).

---

## 12. Build order

Each phase ends with a working, testable slice. Phases 0–1 are the foundation the owner asked for first; Phase 4 is the Schedule.

**Status (2026-10-01):** phases 0–9 are built and deployed to https://hybercrm.com, with these changes from the plan, all recorded in `DECISIONS.md`:
- FCM push waits for the phone app; notifications go to the in-app inbox for now.
- Suggestions were dropped (Q7).
- Google Calendar/Sheets sync is optional and not built yet.
- TE migration is not planned (Q9).

| Phase | Scope | Done when |
|---|---|---|
| **0. Setup** | Repo layout, Vite app, Firebase init for `hyber-crm`, `shared/` with tests, `firebase.json` without hosting, base rules, `CLAUDE.md` with project conventions | `npm run dev` shows the landing page; `shared` tests pass |
| **1. Foundation** | Google sign-in; `/app` resolver; super admin bootstrap script; Platform home, create/edit branch, logo upload; branch context and branding; portal shells for all four roles with the full Hyber menu (placeholder pages); **Account** (members: invite by email, role, status, links); **Access Control** (restrictions, owners); **Settings** (branch profile + every settings section with defaults); Demo Academy seed; rules for all of the above | The super admin signs in, sees Demo Academy, enters it as admin; an invited tutor email lands in the tutor portal; an unknown email sees "No access yet"; rules deny cross-branch reads |
| **2. People & catalogs** | Employees → Directory/Detail (+ compensation, notes); Students → Directory/Profile (Info, School, Sessions placeholder, Conference); Employees → Subjects matrix; tutor My Info (profile, subjects) | Admin can manage the staff, students and subjects the schedule needs |
| **3. Availability** | Tutor availability (desktop calendar + mobile sheet) with lead-time/lock settings; Employees → Calendar (Availability mode); Edit Day availability tab | Tutors enter availability; admins see and edit it; locks enforced by rules |
| **4. Schedule** | 4a read-only Day/Week rendering (rows, availability, sessions, events strip, live data) · 4b create/edit/status/delete/Trash · 4c drag, resize, reorder, copy/paste, hotkeys, zoom, drawer · 4d events with recurrence · 4e day configs, default week, Schedule Calendar, tutor order · 4f Month view, Master Schedule, Duplicate Week · 4g Audit Log page and live toasts · 4h Students → Calendar · tutor Schedule (desktop + mobile list) | Side-by-side with TE, the same actions produce the same schedule |
| **5. Time & pay** | Shifts and the segmentation engine (port the kiosk's tests); `clockIn`/`clockOut`/`correctShift` callables; clock overlay on the schedule; Time Entries; Pay Rates; Payroll report; Employee Calendar hour modes; tutor Payroll; web clock-in per **(Q8)** | TE's worked examples (doc 06 §5.5) give identical segments and pay |
| **6. Sessions** | Session-log form (new tab), autosave/drafts, `submitSessionLog`, AI per **(Q15)**, Session Log workspace (admin/tutor), detail page, Progress Reports | A tutor logs a session from the schedule; the card shows the blue check; the student's hours and status update |
| **7. Home & Announcements** | Admin Home cards (schedule, live clock, missing & needs attention, conference needed, new students); Announcements (admin + tutor); notification inbox | — |
| **8. Functions & push** | Session/announcement notification triggers, auto-confirm, auto clock-out, lifecycle job, purge; FCM web push; PWA manifest + service worker | Tutors receive the same pushes as in TE |
| **9. Remaining portals & integrations** | Parent/student portals **(Q6)**; Suggestions **(Q7)**; optional Google Calendar/Sheets sync; TE data migration tooling **(Q9)** | — |

---

## 13. Testing approach

- **Unit tests (Vitest)** for every `shared/` rule:
  - time-zone math
  - lane layout and capacity
  - availability resolution and locks
  - pay segmentation (TE's 8 worked examples + the kiosk's Dart tests)
  - hour rounding (TE table)
  - lifecycle transitions
  - event recurrence
  - conference cycle
- **Rules tests** with the Firestore emulator (`@firebase/rules-unit-testing`): cross-branch denial, role allow-lists, restricted admins. These run locally only and never touch production data.
- **Manual parity checks** against TE for the schedule, using the same week's data shape.

---

## 14. Risks and how the plan handles them

| Risk | Mitigation |
|---|---|
| The schedule is large (≈ 15 K lines in TE) and subtle | Port it in slices (4a–4h). Keep TE's component boundaries (`AdminScheduling` → `DaySection` → `SessionCard`). Port its algorithms verbatim into `shared/` with tests. |
| Time-zone conversion bugs | One `shared/time.js` with tests. All business logic works on `dateKey` + minutes. |
| Rules complexity | Helper functions, no catch-all, emulator rules tests from Phase 1. |
| Firestore cost from member `get()` in rules | One cached read per request. Small documents. |
| Functions need deployment to run triggers and schedules | Callables run in the emulator. Deploy triggers once the owner OKs it **(Q2)**. |
| Scope creep | The excluded features stay out. Extras go behind extensions or later phases. |
