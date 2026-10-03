# Hyber CRM: Firestore data model

> Companion to [PLAN.md](PLAN.md). This is the target model; it evolves during the build, and every change gets recorded here. The **TE** column maps each Hyber field to its True Education source (see [`../true-education/02-data-model.md`](../true-education/02-data-model.md)), which also serves as the basis for a future TE → Hyber migration (Q9).

## 1. Conventions

| Topic | Rule |
|---|---|
| Tenancy | All branch data lives under `branches/{branchId}/…`. Root collections hold platform data only: `platformAdmins`, `users`, `branches`, and `inquiries` (landing-page requests, DECISIONS §7). |
| Names | Collections: camelCase plural (`timeEntries`). Fields: camelCase. Enums: lowercase snake strings (`no_show`); display labels live in the UI and settings. |
| IDs | Firestore auto-IDs, except where a deterministic key enforces a rule. Examples: `availability/{staffId}_{dateKey}` (one per tutor per day), `members/{emailLower}`, `sessionLogs/{sessionId}` (one log per session), `dayConfigs/{dateKey}`. |
| References | Always by ID (`tutorId`, `studentId`, `staffId`, `subjectId`, `categoryId`). Names are stored only as display snapshots (`tutorName`, `studentName`), never used for joins (TE joined logs and subjects by name). |
| Time | `dateKey` = `YYYY-MM-DD` in the **branch time zone**; `startMin`/`endMin` = minutes after local midnight (0–1440); `startAt`/`endAt` = absolute Timestamps; `weekday` = `monday` … `sunday`. See PLAN §7. |
| Audit fields | `createdAt`, `updatedAt` = `serverTimestamp()`; `createdByUid`/`createdByName`, `updatedByUid`/`updatedByName`. Never the client clock. |
| Soft delete | `isDeleted`, `deletedAt`, `deletedByUid`, `deletedByName`, `deleteReason`. Purged after `trash.retentionDays` by a scheduled function, not by the UI. |
| Money | Numbers in the branch currency. Hours are rounded to `payroll.hoursDecimals` (2). Pay is calculated from the rounded hours (TE rule). |

## 2. Platform level

### `platformAdmins/{emailLower}`: super admins
| Field | Type | Notes |
|---|---|---|
| `email` | string | Google account email |
| `name` | string | |
| `addedAt`, `addedByUid` | Timestamp, string | Bootstrapped by `scripts/bootstrap-super-admin.mjs` or the console |

### `users/{uid}`: global profile (one per Google account)
| Field | Type | Notes |
|---|---|---|
| `email`, `emailLower`, `displayName`, `photoURL` | string | From Google, upserted by the user at each sign-in |
| `createdAt`, `lastLoginAt` | Timestamp | |
| `lastBranchId` | string | Opens the last-used branch on the next visit |
| `uiPrefs` | map | Per-person UI preferences, e.g. `{scheduleZoom, scheduleDrawerOpen, scheduleDefaultView}` (TE: `settings/admin_scheduling_ui` + localStorage) |

`users/{uid}/devices/{deviceId}`: push tokens. Fields: `{token, platform: web|ios|android, userAgent, createdAt, lastSeenAt}`. Deleted on logout (TE never removed them).

### `inquiries/{autoId}`: "Talk to us" requests from the landing page
Written only by the `submitInquiry` function; the Super Admin reads them (Platform → Inquiries) and may change only the handled fields.

| Field | Type | Notes |
|---|---|---|
| `name`, `email`, `center`, `phone`, `students`, `locations`, `message` | string | Checked by `shared/src/inquiry.ts`; `students`/`locations` are one of the form's ranges or empty |
| `status` | `new` \| `handled` | |
| `createdAt` | Timestamp | |
| `from` | string | Hash of the sender's address (spotting repeats), never the address |
| `userAgent` | string | |
| `notify` | map | The email to HyberTec: `{status: sent|not_configured|failed, at, error}` |
| `handledAt`, `handledBy` | Timestamp, string | Set when the Super Admin marks it handled |

### `branches/{branchId}`: the branch
`branchId` is an immutable slug, e.g. `demo-academy`.

| Field | Type | Notes |
|---|---|---|
| `name`, `shortName` | string | "Demo Academy", "Demo" |
| `status` | `active` \| `suspended` \| `archived` | Super admin only |
| `timezone` | IANA string | `America/New_York`. The only business time zone (PLAN §7). |
| `locale`, `currency` | string | `en-US`, `USD` |
| `branding` | map | `{logoUrl, logoPath, primaryColor, accentColor, sidebarTitle, portalSubtitle}` |
| `contact` | map | `{email, phone, address, website}` |
| `settings` | map | **Overrides** of `shared/settings/defaults.js`; see [BRANCH_SETTINGS.md](BRANCH_SETTINGS.md) |
| `businessRules` | map | Super Admin only: `payModels[]` (timeline), `maxStudentsPerTutor`, `conferences {enabled, everyHours}`; see [BRANCH_SETTINGS.md](BRANCH_SETTINGS.md#business-rules-super-admin-only-round-2) |
| `extensions` | string[] | Enabled per-branch extension keys (PLAN §3.4) |
| `createdAt`, `createdByUid`, `updatedAt`, `updatedByUid` | | |

## 3. People and access

### `branches/{b}/members/{emailLower}`: who may sign in, and as what
| Field | Type | TE | Notes |
|---|---|---|---|
| `email`, `emailLower` | string | `users.email` | Key = lower-cased Google email |
| `role` | `owner` \| `admin` \| `tutor` \| `parent` \| `student` | `users.role` | **One role per person** (round 2). Decides the portal; owners use the admin portal and also manage admins and Access Control. |
| `status` | `active` \| `suspended` | `users.status` (blocking subset) | Access only. HR status lives on `staff.status`. Enforced in the rules (TE enforced it in the UI only). |
| `staffId` | string? | (was the uid) | Admin/tutor → `staff/{id}` |
| `studentId` | string? | `users.studentId` | Student → `students/{id}` |
| `studentIds` | string[]? | — | Parent → their children |
| `restrictions` | string[] | `users.blockedPages` | Page keys this admin can't use, e.g. `payRates`, `payroll`, `timeEntries`, `accessControl` (enforced in the rules too) |
| `grants` | string[] | — | Extra capabilities, e.g. `editPastDays` (replaces Development Mode) |
| `uid`, `displayName`, `photoURL`, `firstLoginAt`, `lastLoginAt` | | | Written by the person at sign-in (allow-listed fields only) |
| `createdAt`, `createdByUid`, `updatedAt`, `updatedByUid` | | | |

### `branches/{b}/staff/{staffId}`: employee record
| Field | Type | TE (`users/{uid}`) | Notes |
|---|---|---|---|
| `name`, `nameLower`, `email`, `emailLower`, `phone` | string | same | |
| `role` | `owner` \| `admin` \| `tutor` | `role` | Mirrors the member role. **Only tutors teach**: on the schedule, availability, sessions, teaching pay. Owners and admins are paid one rate for all their clocked time. |
| `status` | `active` \| `on_hold` \| `finished` \| `rejected` | `status` | HR status (TE values and colors) |
| `subjectIds` | string[] | `subjects.tutorIds` **and** `users.subjects` | **Single source** of qualifications |
| `startWorkingDate`, `endWorkingDate`, `dob` | dateKey | same | |
| `homeAddress` | string | same | |
| `profileNote` | string | `note` (shared with the tutor in TE) | Visible to the employee; the admin-only note is in `private/notes` |
| `notificationPrefs` | map | `notify*` fields | `{announcements, sessionCreated, cancellations, timeChange, dateChange, reassignment, noShow, subjectChange}`; all default true |
| `createdAt`, `updatedAt`, … | | | |

- `staff/{staffId}/private/compensation`: `{rates: {teaching: 35, admin: 20}, rateHistory: [{effectiveFrom, rates, setAt, setByUid}], updatedAt}`. Keys follow `payroll.payTypes`. TE: `users.teachingRate`/`adminRate`. Admins (without the `payRates` restriction) read and write; the employee reads their own.
- `staff/{staffId}/private/notes`: `{adminNote, updatedAt, updatedByUid}`. Admin only.
- (Future kiosk) `branches/{b}/kioskPins/{staffId}`: `{pinHash, salt, updatedAt}`. Cloud Functions only; no client access.

### `branches/{b}/students/{studentId}`
| Field | Type | TE (`students`) | Notes |
|---|---|---|---|
| `name`, `nameLower` | string | `name` | |
| `grade` | number \| string | `grade` | Numbers, or labels like "Pre-K", "College" |
| `status` | `signed_up` \| `enrolled` \| `paused` \| `no_answer` \| `not_interested` \| `finished` | Title-case strings | Lifecycle (doc 08 §5.1–5.2) |
| `statusSource` | `auto` \| `manual` | — | A manual status isn't overwritten by the automatic transitions (TE bug M4); see Q14 |
| `email`, `phone`, `school`, `dob`, `homeAddress`, `note` | string | same | |
| `parents` | `[{name, email, phone, relation}]` | `parentName/Email/Phone` | An array, so two parents fit; a parent email can become a `parent` member |
| `customFields` | map label→string | same | Intake answers |
| `signUpDate` | dateKey | `startDate` (ambiguous in TE) | |
| `firstSessionDate`, `lastSessionDate`, `nextSessionDate` | dateKey | `firstSession*`, `endDate`, `nextSessionDate` | `lastSessionDate` = TE's `endDate` ("Last Session") |
| `totalSessionHours`, `totalSessionHoursUpdatedAt` | number, Timestamp | same | Changed only by the server (log submit / No Show) |
| `conference` | map | `conferenceLastCompleted*`, `conferenceCycleReset*` | `{lastCompletedAt, lastCompletedHours, cycleResetAt, cycleResetHours, lastNoteAt, lastNoteId}` |
| `followUpReviewedAt` | Timestamp | same (ISO string) | "New students to follow up" on Home |
| `schoolCourses`, `schoolGradeSnapshots`, `schoolPlan`, `schoolLogin` | arrays / string | `schoolCoursesTable`, `schoolGradeSnapshots`, … | School tab (legacy mirrors dropped) |
| `createdAt`, `createdByUid`, `updatedAt`, `updatedByUid` | | | Field-level updates only, never whole-doc rewrites (TE bug M2) |

`students/{id}/conferenceNotes/{noteId}`: `{date (dateKey), html (sanitized), categoryId, authorUid, authorName, createdAt, updatedAt}`. TE: `students.conferences[]` array without an author.

### Catalogs
- `branches/{b}/subjectCategories/{id}`: `{name, order}`. TE: slug IDs, linked by name.
- `branches/{b}/subjects/{id}`: `{name, nameLower, categoryId, order, createdAt}`. TE linked to categories by name.
- `branches/{b}/conferenceCategories/{id}`: `{name, color, createdAt}`.

## 4. Scheduling

### `branches/{b}/sessions/{sessionId}` (TE `scheduled_sessions`)
| Field | Type | TE | Notes |
|---|---|---|---|
| `tutorId`, `tutorName` | string | `tutorUid`, `tutorName` | `tutorId` = `staff` ID |
| `studentId`, `studentName`, `studentGrade` | string | same | Snapshots; copies take the live grade (TE `sessionCopyUtils`) |
| `subjectId`, `subject` | string?, string | `subject` (free text) | Free text is still allowed ("Use “…”" in TE's picker); `subjectId` is set when picked from the catalog |
| `note` | string | `note` | "Short Note" (blue stripe + tooltip) |
| `status` | `pending` \| `confirmed` \| `canceled` \| `no_show` \| `present` | Title Case | |
| `dateKey`, `weekday`, `startMin`, `endMin` | | `dayKey` + derived from `start` | Wall clock in branch time |
| `startAt`, `endAt` | Timestamp | `start`, `end` | Absolute |
| `lane`, `visualOrder` | number | `slotIdx`, `visualOrder` | Lane at write time (informational; layout is recomputed) and manual stacking order |
| `noShowAppliedHours`, `noShowAppliedAt` | number, Timestamp | same | Student-hours ledger for No Show |
| `attendanceMarkedAt`, `attendanceMarkedBy` | Timestamp, `session_log` \| `admin` | same | |
| `logStatus`, `logSubmittedAt` | `none` \| `draft` \| `submitted`, Timestamp | (separate read of `session_logs`) | Drives the blue check / red triangle. `draft` is mirrored from the log by `onSessionLogWritten`; `submitted` is set by `submitSessionLog`. A session with a submitted log stays `present` (rules and app). |
| `confirmedAt`, `confirmedBy` | Timestamp, `auto` \| uid | — | |
| `source` | `manual` \| `paste` \| `duplicate_week` \| `student_calendar` (older data may say `master`) | — | |
| soft-delete + audit fields | | same | TE's `blockId` is **dropped** (placement by time) |

### `branches/{b}/availability/{staffId}_{dateKey}` (TE `tutor_availability_blocks/day_{date}_{uid}`)
| Field | Type | Notes |
|---|---|---|
| `staffId`, `dateKey`, `weekday` | string | |
| `ranges` | `[{startMin, endMin}]` | TE stores exactly one range per day; `availability.maxRangesPerDay` (default 1) |
| `unavailable` | bool | Explicitly not available (TE soft delete / admin "Unavailable") |
| `hidden` | bool | Hide the row when the tutor has no sessions or clock activity (TE Edit Day "Hide") |
| `updatedVia` | `tutor` \| `admin_calendar` \| `admin_day_edit` | TE recorded no author |
| audit fields | | |

### Day configuration
- `branches/{b}/dayConfigs/{dateKey}`: `{dateKey, isClosed, openMin, closeMin, updatedAt, updatedByUid}`. TE: `schedule_day_configs/{date}` with `timelineStartMin/EndMin`.
- The **default week** lives in branch settings: `settings.schedule.defaultWeek` (TE: `settings/scheduleDefault`). Tutor order: `settings.schedule.tutorOrder` (TE: `settings/global_tutor_order`).

### `branches/{b}/events/{eventId}`
TE fields, with `date` → `dateKey` and `startTime`/`endTime` → `startMin`/`endMin`: `{title, dateKey (series start), startMin, endMin, notes, recurrence {enabled, frequency daily|weekly|monthly, interval, weekDays[], monthlyDay, ends {type never|on|after, endDate, occurrences}}, isRecurring, googleSync {calendarId, eventId, status pending|synced|failed, error, lastSyncedAt}, …audit}`. Hard delete, as in TE.

### `branches/{b}/auditLog/{id}` (TE `activity_logs`, renamed Audit Log)
| Field | Type | Notes |
|---|---|---|
| `at` | serverTimestamp | |
| `actorUid`, `actorEmail`, `actorName`, `actorRole` | | `role` includes `super_admin` and `system` (functions) |
| `action` | string | `session.create`, `session.move`, `session.status`, `session.tutor`, `session.subject`, `session.note`, `session.multi`, `session.delete`, `session.restore`, `session.purge`, `schedule.duplicate_week`, `event.*`, `dayConfig.update`, `availability.update`, `timeEntry.*`, `shift.*`, `sessionLog.submit`, `settings.update`, `member.*` … |
| `category` | `schedule` \| `event` \| `availability` \| `people` \| `pay` \| `sessions` \| `settings` | Filter on the Audit Log page |
| `entityType`, `entityId` | string | TE logged no IDs |
| `studentId`, `studentName`, `tutorId`, `tutorName`, `dateKey` | | Search and display (TE: `meta.*Name`) |
| `context` | string | "Wednesday, 9/30/2026 (4:00 PM – 5:50 PM)" as in TE |
| `changes` | `[{field, label, from, to}]` | Structured diff; the UI renders TE's From/To |
| `summary` | string | The sentence TE shows in toasts and rows |
| `via` | `web` \| `function` \| `kiosk` | |

Rules: create-only, with `actorUid == request.auth.uid`; no update or delete by clients. Retention: `audit.retentionDays` (default null = keep). TE purged after 14 days and let admins wipe it.

## 5. Time clock and pay

### `branches/{b}/clockShifts/{shiftId}`: one doc per clock-in (fixes TE critical C4)
| Field | Type | Notes |
|---|---|---|
| `staffId`, `staffName`, `staffRole` | | |
| `dateKey` | dateKey | Local date of the clock-in |
| `clockInAt`, `clockOutAt` | Timestamp (server time) | `clockOutAt` is null while open |
| `status` | `open` \| `closed` | |
| `mode` | `normal` \| `all_teaching` | TE "Dev Clock In"; allowed only if the setting and per-staff grant allow it (Q12) |
| `source`, `deviceId` | `web` \| `kiosk` \| `admin` | |
| `autoClosed`, `autoCloseReason` | bool, `cutoff` | TE `midnight_safety` |
| `correctedAt`, `correctedByUid`, `originalClockOutAt` | | Home correction |
| `entryIds` | string[] | The time entries this shift produced |
| `totals` | `{hours, pay, byType: {teaching: {hours, pay}, admin: {…}}}` | |

- `branches/{b}/openShifts/{staffId}`: `{shiftId, clockInAt}`. Enforces one open shift per employee, written in a transaction by `clockIn`/`clockOut`.
- `branches/{b}/clockEvents/{id}`: append-only audit. `{type: clock_in|clock_out|auto_clock_out|corrected|adjusted, shiftId, staffId, at, byUid|system, source, details}`.

### `branches/{b}/timeEntries/{entryId}` (TE `payroll_records`)
| Field | Type | TE | Notes |
|---|---|---|---|
| `staffId`, `staffName`, `staffRole` | | `uid`, `tutorName` | |
| `type` | pay-type key (`teaching` \| `admin`) | `type` | From `payroll.payTypes` |
| `dateKey`, `startMin`, `endMin` | | `date` ("MM/DD/YYYY", mixed zones) | Branch time |
| `startAt`, `endAt` | Timestamp | `startTime`, `endTime` | |
| `hours`, `rate`, `pay` | number | `hours`, `rateUsed`, `totalPay` | Same rounding as TE |
| `status` | `approved` \| `pending` \| `rejected` | always `approved` | Self entries can require approval (Q13) |
| `source` | `clock` \| `auto_clock_out` \| `admin_entry` \| `self_entry` \| `correction` | `kiosk_clock`, `admin_logging`, `tutor_logging` | |
| `shiftId` | string? | `clockSessionId` (= uid in TE) | The real per-shift link |
| `note` | string | — | |
| audit + `approvedAt`, `approvedByUid` | | (missing on manual TE rows) | |

## 6. Sessions: logs and reports

### `branches/{b}/sessionLogs/{sessionId}` (TE `session_logs`, same ID-equals-session rule)
TE fields kept (doc 07 §4.1), cleaned up:
- **Status:** `status: draft|submitted` and `submittedAt` (TE: `isDraft`).
- **Session snapshot:** `tutorId`, `tutorName`, `studentId`, `studentName`, `subject`, `subjectId` (to match earlier logs of the same subject), `dateKey`, `startMin`, `endMin`, `startAt`, `endAt`, `usedHours` (billed with `students.hourRounding`), `sessionNote` (the session's admin note when submitted).
- **Content:** `sessionType`, `topics[]` plus `topicCovered` (joined string), `homeworkStatus`, `homeworkComments`, `materials[{label, url, type: text|link}]` (curriculum refs dropped), `questionsAttempted`, `questionsWrong`, `accuracyPercent`, `lessonActivity`, `learningInsight`, `nextFocus`, `homeworkGiven`.
- **Evaluation:** `ratings{effort, motivation, behavior, focus, confidence}` (keyed by the lower-cased dimension label), `studentFlag: on_track|needs_attention|at_risk`.
- **AI:** `ai{sessionSummary, homeworkAssigned, nextSessionPlan, riskAlert, provider}`.
- **Attribution:** `enteredBy {role: tutor|admin, email, name, at}` (the first submit), `enteredByAdmin {email, name} | null` (set only when that first submit was an admin's who isn't the session's tutor), `lastEditedBy {email, name, at} | null` and `editCount` (re-submits), plus `updatedAt`/`updatedBy`.

Submitted only through the `submitSessionLog` callable, which is atomic and does the student-hours and lifecycle side effects; it refuses before the session's start time. Every submit writes an audit entry (`sessionLog.submit` / `sessionLog.edit`, `entityId` = session ID) whose `changes[]` lists what an edit changed. Drafts are written directly by the session's tutor or an admin and may hold only the content and snapshot fields (rules allowlist). When an admin moves, re-times, reassigns or re-subjects a logged session, `onLoggedSessionUpdated` updates the log's snapshot and `usedHours`, corrects the student's hours and writes a `sessionLog.sync` audit entry. There is no delete-log UI.

### `branches/{b}/progressReports/{reportId}` (TE `student_progress_reports`, schema version 2)
A snapshot built by `generateProgressReport` (types in `shared/src/reports/types.ts`):
- **State:** `schemaVersion: 2`, `status: draft|shared`, `sharedWithParents` (mirrors `shared`; family queries and rules read it), `sharedAt`, `sharedBy {email, name}`, `notify {status: sent|not_configured|failed|skipped, at, recipients[], error}`, `firstViewedAt` (set by `onReportViewed`).
- **Who and when:** `studentId`, `studentName`, `student {name, firstName, lastName, grade, school}`, `period {from, to, preset, label}` plus `startDate`/`endDate`, `sessionCount`, `generatedAt`, `generatedBy {email, name, role, staffId}`, `updatedAt`, `updatedBy`, `customName`.
- **Built from:** `source {sessionIds[], logCount, fingerprint}` (staleness and duplicate checks) and `snapshot {ratingDimensions[], accentColor, branchName, logoUrl, contact, aiDisclosure}` (later Settings or branding changes never alter a report).
- **Figures:** `facts` (attendance, hours by subject, consistency, homework with halves, engagement then → now, practice accuracy, skills covered, resources, tutors, subjects, what's next, conference, previous report and deltas), `series.sessions[]` (one compact point per scheduled session for the charts) and `progress {level: on_track|needs_attention|at_risk|null, drivers[], rule}`. Computed in `shared/src/reports/facts.ts` and `status.ts`; never written by AI.
- **Words:** `narrative {overview, academicProgress, practice, engagement, homework, strengths[], focusAreas[], goals[{goal, measure}], previousGoals[{goal, status, note}], homeSupport[], tutorNote}`, `narrativeOriginal` (the last AI or template version, for Restore) and `narrativeMeta {source: ai|template, generatedAt, sections{key: {source: ai|template|staff, editedBy, needsReview, reasons[]}}}`.
- **Switches:** `options {showStatus, showPractice, showResources, showConference}`.
- **`views/{emailKey}`:** a family member's write-once view receipt `{viewedAt, role}`.

Created, refreshed and shared only by functions (`generateProgressReport`, `regenerateReportSection`, `shareProgressReport`); staff edit a draft's `narrative`, `narrativeMeta`, `options` and `customName` (admins may rename a shared report). Every change writes a `report.*` audit entry.

## 7. Communication

- `branches/{b}/announcements/{id}`: `{title, contentHtml (sanitized), contentText, category, audienceType: all|members, audienceKeys[] (member email keys), commentsEnabled, pinned, pinnedAt, archived, notifyRequestedAt, attachments[{name, url, path, size, contentType}], authorKey, authorName, readCount, commentCount, createdAt/By, updatedAt/By}`. `notifyRequestedAt` is set on publish with "Notify" and bumped by "Notify again"; the `onAnnouncementWritten` function writes inbox items when it changes. Counters are maintained by functions. Categories: `announcements.defaultCategories` (settings) plus any used on posts; there is no category collection.
  - `…/reads/{memberKey}`: `{email, name, branchId, announcementId, readAt}`. Write-once read receipts; a collection-group query on `email` gives a person's read posts.
  - `…/comments/{id}`: `{authorKey, authorName, authorRole, text, createdAt}`. The author is validated by the rules (TE allowed impersonation).
  - Storage: `branches/{b}/announcements/{id}/images/*` (inline images) and `…/files/*` (attachments).
- `branches/{b}/notifications/{id}`: the in-app inbox (TE `tutor_notifications`). `{recipientKey (member email key), type, title, body, link (path below the branch), refs {sessionId, announcementId, dateKey}, createdAt, readAt}`. Written by functions only; the recipient may set `readAt` or delete. Retention: `notifications.retentionDays` (14).
- `branches/{b}/suggestions/{id}`: only if kept (Q7). TE fields: `{title, description, urgency, status, createdByUid, createdByName, read*/completed*/edited* audit}`.
- `branches/{b}/intake/{id}`: only if a public intake form is kept (Q4). It creates a pending lead, never a login.

## 8. Composite indexes (initial)

Collection-scope indexes apply to every subcollection with that ID, i.e. to every branch.

| Collection | Fields | Used by |
|---|---|---|
| `sessions` | `tutorId ↑, dateKey ↑` | Tutor schedule, teacher filter, segmentation |
| `sessions` | `studentId ↑, dateKey ↑` | Student calendar, student sessions tab |
| `sessions` | `status ↑, startAt ↑` | Auto-confirm |
| `availability` | `staffId ↑, dateKey ↑` | Tutor calendar, Employee Calendar |
| `timeEntries` | `staffId ↑, startAt ↑` | Payroll report, tutor payroll, Employee Calendar |
| `timeEntries` | `status ↑, startAt ↓` | Pending approvals (if self entries need approval) |
| `clockShifts` | `staffId ↑, clockInAt ↓` | Employee history, Home live clock |
| `sessions` | `logStatus ↑, dateKey ↑` | Home and Session Log "missing" lists |
| `sessionLogs` | `studentId ↑, dateKey ↓` | Student history, Prepare step, Session Log student filter |
| `sessionLogs` | `tutorId ↑, dateKey ↓` | Session Log tutor filter and tutor's own logs |
| `sessionLogs` | `studentId ↑, tutorId ↑, dateKey ↓` | Prepare step for tutors who see only their own logs |
| `sessionLogs` | `status ↑, dateKey ↓` | Session Log (submitted or drafts) |
| `sessionLogs` | `studentId ↑, status ↑, dateKey ↓` | Progress reports |
| `auditLog` | `entityId ↑, at ↓` | A session log's History |
| `progressReports` | `studentId ↑, generatedAt ↓` | Reports per student |
| `progressReports` | `studentId ↑, sharedWithParents ↑, generatedAt ↓` | Family portal |
| `progressReports` | `sharedWithParents ↑, generatedAt ↓` | Tutors' list (shared reports) |
| `progressReports` | `generatedBy.staffId ↑, generatedAt ↓` | Tutors' list (their drafts) |
| `progressReports` | `status ↑, generatedAt ↓` and `studentId ↑, status ↑, generatedAt ↓` | Previous shared report, duplicate drafts |
| `auditLog` | `category ↑, at ↓` | Audit Log filter |
| `notifications` | `recipientKey ↑, createdAt ↓` | Inbox |
| `members` (field override, **collection group**) | `emailLower` | "Which branches am I in?" on sign-in |

## 9. Access matrix (summary)

✓ = full · own = only the person's own records · linked = only records of linked students · — = none

| Collection | Super admin | Admin | Tutor | Parent | Student |
|---|---|---|---|---|---|
| `branches/{b}` (profile, branding, settings) | ✓ | read; edit settings, branding and contact | read | read | read |
| `members` | ✓ | ✓ (Access Control fields: owners only) | own (read; allow-listed login fields) | own | own |
| `staff` | ✓ | ✓ | own (read; limited self-edit, e.g. phone, subjects, prefs) | — | — |
| `staff/*/private/compensation` | ✓ | ✓ unless restricted | own (read) | — | — |
| `staff/*/private/notes` | ✓ | ✓ | — | — | — |
| `students` (+ `conferenceNotes`) | ✓ | ✓ | read all (TE behavior, Q21); edit School tab fields | linked (read) | own (read) |
| `subjects`, categories | ✓ | ✓ | read; self-assign through `staff.subjectIds` | — | — |
| `sessions` | ✓ | ✓ (past days need the `editPastDays` grant) | own (read; no writes, since attendance comes from the log) | linked (read) | own (read) |
| `availability` | ✓ | ✓ | own (read; write within lead-time/lock rules) | — | — |
| `dayConfigs`, `events` | ✓ | ✓ | read | — | — |
| `auditLog` | ✓ | read (create via app/functions) | — | — | — |
| `clockShifts`, `clockEvents`, `openShifts` | ✓ | read (changes through callables) | own (read) | — | — |
| `timeEntries` | ✓ | ✓ unless restricted | own (read; create `pending` self entries if enabled) | — | — |
| `sessionLogs` | ✓ | ✓ | read (all or own, Q15); write drafts for own sessions; submit through a callable | — (families see progress reports) | — |
| `progressReports` | ✓ (share: admins only) | ✓ | read shared reports and their own drafts; create drafts if allowed; edit their own drafts | linked, if shared (Q6) | own, if shared |
| `announcements` (+ reads, comments) | ✓ | ✓ | audience (read; own read receipt; comment if enabled) | audience | audience |
| `notifications` | ✓ | own | own | own | own |
