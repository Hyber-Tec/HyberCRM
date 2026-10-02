# Hyber CRM: per-branch settings catalog

> Every business rule that could differ between tutoring centers. The defaults live in code (`shared/settings/defaults.js`); a branch stores only its **overrides** in `branches/{branchId}.settings`; the app and Cloud Functions both read `deepMerge(defaults, overrides)` ([PLAN §3.3](PLAN.md)).
>
> **Default = True Education's behavior**, so a branch with no overrides behaves like TE. The one exception is TE-specific content (event title presets, intake questions); there the default is a generic placeholder and TE's value is listed for reference.
>
> The "Source" column points to the True Education doc and section that documents the original rule. Rows marked **(Q#)** depend on [QUESTIONS.md](QUESTIONS.md).

## Business rules (Super Admin only, round 2)

The core rules that shape a center live in `branches/{branchId}.businessRules`, not in `settings`. The Super Admin chooses them in **New branch** after visiting the center and changes them only from the branch's **Platform** page; branch admins see them read-only in Settings → Branch, and the security rules don't let them write the field. Nothing is hard-coded to True Education: Demo Academy just runs TE's values.

| Key | New branch default | Demo Academy (TE) | Notes |
|---|---|---|---|
| `payModels` | `[{model: "teaching_only", from: "2000-01-01"}]` | `teaching_admin` from the start | A timeline: each entry applies from its date. Switching adds an entry from a chosen date after the last locked pay period, so earlier pay keeps its model. **Teaching only:** tutors are paid for time inside sessions with a submitted log, other clocked time is unpaid. **Teaching + Admin:** TE's split. Owners and admins never teach and are always paid one hourly rate (their admin rate). |
| `maxStudentsPerTutor` | 1 | 3 | Enforced on create, move, resize, paste, duplicate, restore from Trash and in the session dialog. |
| `conferences.enabled`, `conferences.everyHours` | off, 25 | on, 25 | Off: nothing is tracked or shown (no Conference tab, no Home card, no directory column, no bell item). |

These used to be `settings.payroll.payModel`, `settings.payroll.adminStaffSingleRate`, `settings.schedule.maxConcurrentStudentsPerTutor` and `settings.students.conference.cycleHours`; `scripts/migrate-round2.ts` moves them.

## Branch profile (fields on the branch doc, not under `settings`)

| Key | Default | Source | Notes |
|---|---|---|---|
| `timezone` | `America/New_York` | 03 §5.18, 11 §6 | IANA zone. All business dates, "today", locks and cut-offs use it. |
| `locale` | `en-US` | many | Number, date and time formatting |
| `currency` | `USD` | 06 §9 #26 | |
| `branding.logoUrl` | placeholder SVG | 01 §9 | TE: `/images/logo.png` |
| `branding.primaryColor` | `#2563eb` | — | Sidebar active item, primary buttons. Status colors are fixed (below). |
| `branding.sidebarTitle` / `portalSubtitle` | branch name / "Admin Portal" · "Tutor Portal" | 01 §3.5, 10 §3.2 | TE: "True Education" / "Admin Portal" |
| `contact.*` | empty | 01 §9 | Address, phone, email, website (TE hard-coded on marketing pages) |

## `general`

| Key | Default | Source | Notes |
|---|---|---|---|
| `general.weekStartsOn` | `monday` | 03 §5.18 **(Q20)** | TE: Monday for schedule weeks; Sunday for mini calendar, month view and availability calendars |
| `general.dateFormat` | `MM/DD/YYYY` | 06 §9 #26 | Display only. Storage always uses `dateKey`. |

## `schedule`

| Key | Default (TE) | Source | Notes |
|---|---|---|---|
| `schedule.defaultWeek` | Mon–Thu open 14:00–21:00 · Fri **closed** · Sat open 09:00–17:00 · Sun **closed** | 03 §5.1, 04 §5.2 | `{monday: {isOpen, openMin, closeMin}, …}`. Applies to every date without a day config. |
| `schedule.snapMinutes` | 5 | 03 §5.2 | Click/drag/resize snap and time-picker step |
| `schedule.defaultSessionMinutes` | 110 | 03 §5.9, 04 §5.5 | New session length from a double-click |
| `schedule.minSessionMinutes` | 5 | 04 §5.5 | |
| `schedule.lockPastDays` | `true` | 03 §5.16 | Past days read-only unless the admin has the `editPastDays` grant **(Q17)** (TE: Developer Mode password) |
| `schedule.autoConfirm.enabled` | `true` | 03 §5.19 | |
| `schedule.autoConfirm.hoursBefore` | 24 | 04 §5.8 | Pending → Confirmed when the start is within this window (on create and hourly) |
| `schedule.autoConfirm.notifyTutor` | `on_create_only` | 04 §5.8 **(Q16)** | TE pushes "Session Confirmed" only on the create path |
| `schedule.noShow.countsTowardStudentHours` | `true` | 04 §5.9 | No Show adds the session's rounded hours to the student |
| `schedule.showClockForStaffRoles` | `["tutor"]` | 03 §3.0 | TE hides the clock pill for admin-role staff |
| `schedule.defaultView` | `week` | 03 §3.17 | `day` \| `week` \| `month` |
| `schedule.tutorOrder` | `[]` | 03 §5.3 | Ordered `staffId`s. Others follow alphabetically. |
| `schedule.monthViewContent` | `events` | 03 §3.5 | TE's Month view shows events only |
| `schedule.pasteStatus` | `pending` | 03 §3.12 | Status of pasted and duplicated sessions |
| `schedule.duplicate.overwriteTargetDays` | `true` | 04 §5.10 | TE soft-deletes the target days first. Hyber only does it when there is something to copy (TE bug M6). |
| `schedule.duplicate.checkAvailability` | `false` | 04 §5.10 | TE ignores availability when duplicating |
| `schedule.events.titlePresets` | `["Consultation","Follow-up","Payment Reminder","Parent Meeting","Interview"]` | 04 §3.10 | TE: `SAT DT, PSAT DT, ACT DT, CAT DT, SAT IT, PSAT IT, ACT IT, CAT IT, DC, Interview, Clearing Service` |
| `schedule.events.defaultMinutes` | 60 | 03 §3.10 | Double-click on the events strip |
| `schedule.events.monthDefaultStartMin` | 840 (2:00 PM) | 03 §3.5 | Double-click in Month view |
| `schedule.dayEditor.hourStepMinutes` | 60 | 04 §3.7 | Edit Day timeline start/end selects |
| `schedule.editorRange` | 06:00–22:00 | 04 §3.7 | Bounds of the day-hours editors |
| `schedule.alerts.conferenceNoteDays` | 20 | 03 §5.13 | Bell item: parent-conference note newer than N days |
| `schedule.alerts.firstSession` | `true` | 03 §5.13 | Bell item: the student's first session |
| `trash.retentionDays` | 14 | 04 §3.6 | Purged by a scheduled function (TE purged only when someone opened the Trash) |

## `availability`

| Key | Default (TE) | Source | Notes |
|---|---|---|---|
| `availability.leadTimeDays` | 14 | 05 §5.4 **(Q10)** | "Set at least 2 weeks in advance" |
| `availability.leadTimeEnforcement` | `notice` | 05 §5.4 **(Q10)** | `notice` (TE: text only) \| `warn` \| `block` |
| `availability.lockWindowDays` | 7 | 05 §5.4 | Tutors can't change blocks starting within N days |
| `availability.lockAnchor` | `now` | 05 §5.4 | `now` (TE: the current minute) \| `startOfDay` |
| `availability.lockedActions` | `["edit","delete","dragFrom"]` | 05 §5.4 **(Q10)** | TE doesn't lock creating, pasting or dragging *into* the window (loopholes) |
| `availability.enforceOnServer` | `true` | 05 §10.2 | Rules check the lock with server time (TE: browser only) |
| `availability.stepMinutes` | 30 | 05 §5.1 | Picker step |
| ~~`availability.pickerRange`~~ | — | 05 §5.1 | Removed in round 2: the picker offers that date's opening hours (TE offered a fixed 9:00–22:00 and trimmed on save). |
| `availability.minBlockMinutes` | 30 | 05 §5.1 | |
| `availability.clampToOpenHours` | `true` | 05 §5.1 | Hyber warns instead of silently clamping (TE bug) |
| `availability.maxRangesPerDay` | 1 | 05 §5.1 **(Q11)** | |
| `availability.defaultNewRange` | `openHours` | 05 §5.1 | A new block defaults to the day's full open hours |
| `availability.allowPastDates` | `true` | 05 §5.4 | TE lets tutors enter availability for past dates |

## `students`

| Key | Default (TE) | Source | Notes |
|---|---|---|---|
| `students.autoStatus.enabled` | `true` | 08 §5.2 | Signed Up→Enrolled, Enrolled→Paused, Paused→Enrolled |
| `students.autoStatus.inactivityPauseDays` | 20 | 08 §5.2 | |
| `students.autoStatus.respectManual` | `true` | 08 §10 **(Q14)** | TE overwrote manual statuses (bug M4) |
| `students.hourRounding` | `te_business` | 04 §5.9, 06 §5.12 | Minutes → billed hours: ≤30 → 0.5 · ≤70 → 1 · 71–74 → 1.5 · **75 → 2** · 76–85 → 1.5 · 86–120 → 2 · >120 → `ceil((m−10)/30)×0.5` |
| `students.gradeOptions` | Pre-K, K, 1–12, College, Adult, Other | 08 §5.6–5.8 | |
| `students.tutorEditableTabs` | `["school"]` | 08 §1 | |
| `students.tutorsSeeAll` | `true` | 08 **(Q21)** | TE shows every student to tutors |

Student statuses are a **fixed enum** with TE's colors: Signed Up, Enrolled, Paused, No Answer, Not Interested, Finished.

## `sessionLogs`

| Key | Default (TE) | Source | Notes |
|---|---|---|---|
| `sessionLogs.sessionTypes` | School Help, SAT, PSAT, ACT, Skill Building, Homework Support, Other | 07 §3.4 | No Diagnostic Review (Q6). SAT, PSAT and ACT use the topic picker (matched by name; Settings says so). Changing the type clears the topics. |
| `sessionLogs.homeworkStatuses` | Completed, Partially Done, Not Done, Not Assigned | 07 §3.4 | Progress reports count these by name (Settings says so) |
| `sessionLogs.ratingDimensions` | Effort, Motivation, Behavior, Focus, Confidence (1–5) | 07 §3.4 | Stored by the lower-cased label: renaming one starts a new rating (Settings says so) |
| `sessionLogs.studentFlags` | On Track, Needs Attention, At Risk | 07 §3.4 | Fixed keys `on_track`, `needs_attention`, `at_risk` |
| `sessionLogs.allowForStatuses` | Pending, Confirmed, Present | 07 §10 **(Q15)** | Canceled and No Show sessions can't be logged (TE allowed it) |
| `sessionLogs.tutorsSeeAllLogs` | `true` | 07 §7 **(Q15)** | |
| `sessionLogs.allowEditAfterSubmit` | `true` | 07 §6 | Tutors may re-submit their own logs; admins always can |
| `sessionLogs.ai.enabled` | `true` | 07 §8.1 **(Q15)** | AI summary, homework and next-session plan, and the Polish notes button; a deterministic fallback stays |
| `sessionLogs.autosaveSeconds` | 30 | 07 §6.2 | The longest gap between draft saves; drafts also save ~2 s after typing stops, on Next, and when the tab is hidden or closed |

**Fixed, not settings** (round 3): the SAT/PSAT/ACT topic lists, the required fields (TE's set: type, topic, homework status, materials, attempted ≥ 1, wrong ≤ attempted, the four notes, every rating, the flag), Present on submit, submitting only after the session has started, and the note box heights. Logs work on phones.

## `progressReports`

| Key | Default (TE) | Source |
|---|---|---|
| `progressReports.risk.atRisk` | homework completion < 50 % or average focus < 3 (or any "At Risk" flag) | 07 §5.15, 11 §3.9 |
| `progressReports.risk.needsAttention` | completion < 70 % or average motivation < 3.5 (or any "Needs Attention" flag) | same |
| `progressReports.strengthThreshold` | rating ≥ 4, completion ≥ 70 % | same |
| `progressReports.ai.enabled` | `true` | same |
| `progressReports.maxTopics` | 30 | 07 §4.2 |

## `payroll`

| Key | Default (TE) | Source | Notes |
|---|---|---|---|
| `payroll.payTypes` | `[{key: "teaching", label: "Teaching"}, {key: "admin", label: "Admin"}]` | 06 §9 #1 | Rate keys on `staff/*/private/compensation` |
| `payroll.teachingSessionStatuses` | pending, confirmed, present, no_show | 06 §5.2 **(Q12)** | TE excludes only canceled and deleted sessions |
| `payroll.mergeOverlappingSessions` | `true` | 06 §5.1 | Simultaneous students are paid once, by clock time |
| `payroll.adminStaffTeachingPay` | `true` | 06 §5.3 **(Q12)** | The kiosk splits admin-role staff normally; TE's dev edit forced all-admin |
| `payroll.allTeachingMode.enabled` | `true` | 06 §5.1 **(Q12)** | TE "Dev Clock In": the whole shift at the teaching rate. Hyber restricts it to staff with an admin-given grant (TE let tutors self-enable it). |
| `payroll.hoursDecimals` | 2 | 06 §5.4 | |
| `payroll.payFromRoundedHours` | `true` | 06 §5.4 | |
| `payroll.payPeriod` | `{type: "custom"}` | 06 §5.10 **(Q12)** | TE has no pay periods. Options later: weekly, biweekly, semi-monthly with an anchor. |

## `timeClock` and `timeEntries`

| Key | Default (TE) | Source | Notes |
|---|---|---|---|
| `timeClock.webClock.enabled` | `false` | 06 §3.11 **(Q8)** | TE: kiosk only |
| `timeClock.autoClockOut.enabled` | `true` | 06 §5.7 | |
| `timeClock.autoClockOut.localTime` | `00:00` | 06 §5.7 | In the branch time zone |
| `timeClock.autoClockOut.entryStatus` | `approved` | 06 §10 | Or `pending` to hold auto-closed shifts for review |
| `timeClock.kiosk.*` | `pinLength: 4`, `enrollment: "self_service"`, `successReturnSeconds: 2` | 06 §5.6 | For the future kiosk |
| `timeEntries.allowedHours` | Mon–Fri 14:00–22:30 · Sat–Sun 08:30–18:00 | 06 §5.9 | Manual entry window |
| `timeEntries.stepMinutes` | `{admin: 5, teaching: 10}` | 06 §5.9 | |
| `timeEntries.eligibleRoles` | `["tutor"]` | 06 §3.4 | TE's Log Hours lists tutors only |
| `timeEntries.selfEntry.enabled` | `true` | 06 §3.10 | Tutor "Request Work Hours" |
| `timeEntries.selfEntry.requiresApproval` | `false` | 06 §10.5 **(Q13)** | TE writes self entries as approved |

## `home`

| Key | Default (TE) | Source |
|---|---|---|
| `home.missingLogLookbackDays` | 14 | 09 §5.8 |
| `home.missingLogGraceMinutes` | 0 | 09 §12 (TE has no grace period) |
| `home.clockLookbackDays` | 7 | 06 §5.8 (automatic clock-outs to fix) |

Round 3 replaced TE's Home (shortcut buttons and multi-day cards) with option 1 "Today", so the upcoming-days and shortcut settings are gone.

## `announcements` and `notifications`

| Key | Default (TE) | Source | Notes |
|---|---|---|---|
| `announcements.defaultCategories` | General, Updates | 09 §4.5 | |
| `announcements.audiences` | `["all_tutors","members"]` | 09 §5.1 | TE: all active tutors, or a hand-picked list |
| `notifications.push.enabled` | `true` | 09 §1 | |
| `notifications.retentionDays` | 14 | 09 §4.8 | Inbox history |
| `notifications.events` | all on | 04 §5.14, 09 §5.6 | Announcement new/updated; session confirmed, canceled, restored, reassigned (in/out), no-show, date, time, subject |
| `notifications.recipients` | `["tutor"]` | 09 §1 | TE never pushes to admins |
| `notifications.badge` | `unread_announcements` | 10 §12 Q12 | App-icon badge formula |

## `audit`

| Key | Default | Source | Notes |
|---|---|---|---|
| `audit.retentionDays` | `null` (keep forever) | 04 §3.12 **(Q18)** | TE: 14 days |
| `audit.logPendingSessions` | `true` | 04 §5.11 **(Q18)** | TE skipped Pending sessions (most creates) |

## `suggestions`, `intake`, `integrations`

| Key | Default | Source | Notes |
|---|---|---|---|
| `suggestions.enabled` | `false` | 09 §3.8 **(Q7)** | |
| `intake.enabled` | `false` | 01 §3.3 **(Q4)** | Public "Get Started" lead form. When enabled it creates a pending student, never a login. |
| `intake.questions` | generic set | 08 §5.7 | TE: found-out-via, programs, urgency, careers; GPA/SAT/ACT for grades 9–12 |
| `integrations.googleCalendar` | `{enabled: false, calendarId: null}` | 04 §3.10 **(Q19)** | One-way mirror of events |
| `integrations.payrollSheet` | `{enabled: false, spreadsheetId: null, tabName: "Payroll"}` | 06 §4.8 **(Q12)** | One-way mirror of time entries |

## Fixed design tokens (not per branch in v1)

These keep the schedule visually identical to TE.

| Token | Value | Source |
|---|---|---|
| Session card background by status | pending `#FFFFD7` · confirmed `#ECFFE2` · present `#E6F5FF` · no show `#DFDFDF` · canceled `#FFE8E8` (popover only) | 03 §3.2.5 |
| Availability band / track | `#FFFFFF` on `#F6F6F6` | 03 §3.2.5 |
| Clock span / pill | span `#F8FFF9`, line `#88D5A4`; pill `#EFFFF5` / `#7EECA7` / `#20723B` | 03 §3.2.5 |
| Event chip / events track | `#009EEB` / `#EDF9FF` | 03 §3.2.4 |
| Now line | `#F59E0B` | 03 §3.2.3 |
| Log submitted / missing | `#1D4ED8` check / `#B91C1C` triangle | 03 §3.2.5 |
