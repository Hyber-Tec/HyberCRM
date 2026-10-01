# Hyber CRM: questions for the owner

> **Answered 2026-09-30.** The answers and what they mean for the build are in [DECISIONS.md](DECISIONS.md).

Each question has my **recommendation**, so a quick "go with your recommendation for 3, 7, 11…" is a valid answer. The question numbers are referenced from [PLAN.md](PLAN.md), [DATA_MODEL.md](DATA_MODEL.md) and [BRANCH_SETTINGS.md](BRANCH_SETTINGS.md).

**Part A** affects the foundation and needs an answer before I start building. **Part B** covers business rules: unless you say otherwise, Hyber's default for each will be **True Education's current behavior**, and each one is a per-branch setting anyway.

---

## Part A: needed before building

**Q1. Super Admin account(s).** Which Google account(s) should be the platform Super Admin? I've seen two of yours: `goo.choi@takeoffprime.com` (this Claude session) and `goochoi913@gmail.com` (the Firebase CLI login). Both are possible.

**Q2. Writing to the real `hyber-crm` project** (never Hosting). OK for me to:
- (a) deploy **Firestore and Storage security rules plus indexes**? The app can't work against the real database without them.
- (b) deploy **Cloud Functions** when we reach them? Callables can run locally in the Functions emulator, but triggers (push notifications) and schedules (auto-confirm, auto clock-out) only run once deployed.
- (c) **seed Demo Academy** with fake tutors, students, subjects, availability and sessions? These would be written only under `branches/demo-academy/`.

*Recommendation:* yes to all three. I'll tell you each time I deploy.

**Q3. JavaScript or TypeScript?**
- *Recommendation:* **JavaScript (JSX)**, like True Education. The schedule port stays close to the original, so you can compare the two side by side and maintain it the way you maintain TE. The shared business-logic package gets JSDoc types and unit tests.
- TypeScript is safer for a large multi-tenant model but slows the port.

**Q4. How people get access (Google-only).**
- (a) Admins add people **by email address** (employee, parent, student). The first time that person signs in with Google, they are linked automatically. Anyone else sees a "No access yet" page that shows the email they signed in with. OK?
- (b) TE's public **"Get Started" signup** creates student login accounts for anyone on the internet. Drop it for now, or rebuild it later as a **lead form** that creates a "Signed Up" student record without a login?

*Recommendation:* (a) yes. (b) Drop now; add the lead form later behind a branch setting.

**Q5. One person, several roles.** In TE, staff who are both admin and tutor use two accounts. Proposal: one Google account with role **Admin**, plus a **"Teaches"** switch on their employee record. With it on, they:
- appear on the schedule, with availability, clock and teaching pay;
- get a **"Tutor view"** toggle for their own tutor screens.

A person can also belong to several branches; that is built in. OK?

**Q6. Parent and student portals.** In TE the parent portal is a placeholder and the student portal is Diagnostics only (excluded). What should they show in Hyber?
- (a) Placeholder only for now.
- (b) **Minimal read-only:** upcoming sessions for the linked student(s), plus progress reports you choose to share.
- (c) More, e.g. session summaries or parent announcements. If so, which parts of a session log may parents see?

*Recommendation:* (b), built after the Sessions phase. Placeholder shells exist from Phase 1.

**Q7. Suggestions box** (admin + tutor in TE). It isn't in your Hyber menu. Keep it or drop it?

*Recommendation:* drop for now. It's isolated, and easy to add later as a branch toggle.

**Q8. Clock in/out before a kiosk exists.** TE clocks people in only at the kiosk; the web clock page is dead code. Without some clock-in, Hyber has no green clock pills, no auto clock-out and no automatic teaching/admin split. Options:
- (a) Only manual Time Entries by admins.
- (b) A **Clock in / Clock out button** in the staff portal, calling the same server functions the future kiosk will use, behind a branch setting.
- (c) A browser **"kiosk mode"** page with PINs on the center's computer.

*Recommendation:* (b) now. (c) or the real kiosk later.

**Q9. Will True Education itself move onto Hyber?** If yes, I'll keep the TE → Hyber field mapping exact (it's already in DATA_MODEL.md) and write a migration script near the end. The build order doesn't change.

**Q23. Local git.** May I initialize a **local** git repository (no remote, nothing pushed) and commit at each milestone, so we can roll back?

*Recommendation:* yes.

---

## Part B: business rules (default = TE behavior, configurable per branch)

**Q10. Availability lead time ("2 weeks ahead").** TE only *shows* the text "Set at least 2 weeks in advance"; nothing enforces it. The only enforced rule is a **7-day lock**: tutors can't edit or delete an existing block starting within 7 days. That lock runs only in the browser and has loopholes: creating, pasting or dragging *into* the window is allowed.
- What should the 14-day rule do: text only (TE) / **warn** / **block**?
- Should the 7-day lock also stop *creating* and *dragging into* the window?
- Should both be enforced by the server?

*Recommendation:* warn at 14 days; lock everything inside 7 days; enforce on the server.

**Q11. Availability shape.**
- Do tutors ever need **two ranges in one day** (e.g. 2–4 PM and 6–9 PM)? TE allows one.
- Do they want a **"repeat weekly" / "copy last week"** shortcut? TE has none.

*Recommendation:* the data model supports several ranges; the default stays at 1; copy-week comes later.

**Q12. Pay rules.**
- (a) TE pays **No Show** and **Pending** sessions as teaching time. Keep that?
- (b) Admin-role staff who teach: the kiosk pays them the teaching rate for their sessions, but TE's admin clock-edit tool forces admin rate. Which is right?
- (c) **"Dev Clock In"** pays the whole shift at the teaching rate. What is it used for? Keep it as an admin-granted option?
- (d) **Pay periods:** TE has none (free date-range report). Keep that, or add weekly/biweekly/semi-monthly periods with locking?
- (e) The **Google Sheet** mirror: what do columns J ("Draft") and K–N hold? Keep it as an optional per-branch export?

**Q13. Tutor self-entered hours** ("Request Work Hours" on mobile). TE writes them as **approved** immediately, although the screen says they're reviewed. Require admin approval in Hyber?

*Recommendation:* yes, as a setting.

**Q14. Student statuses.** TE's automatic status pass can undo a status you set by hand (e.g. you set *Paused*, it flips back to *Enrolled*). Should a manually set status stop the automatic transitions until someone changes it again?

*Recommendation:* yes.

**Q15. Session logs.**
- (a) Keep the **Gemini AI** fields (summary, homework, next-session plan, risk alert), as a per-branch toggle? Is it OK that student names are sent to Google's API?
- (b) Should tutors see **all** tutors' logs (TE) or only their own?
- (c) Should logging **canceled / no-show** sessions be allowed? TE allows it, and it turns a canceled session into Present.
- (d) Can tutors edit a log after submitting (TE: yes)?

**Q16. Session notifications.** TE pushes "Session Confirmed" only when a session is created within 24 h of its start. The hourly auto-confirm and manual confirmations are silent, and deleting a confirmed session notifies no one. Keep TE's behavior, or notify on every confirmation and deletion?

**Q17. Editing past days.** TE locks past days and unlocks them with a password-protected "Development Mode", which also silently turns off the activity log. Proposal: an **"Edit past days" permission** per admin, with every such edit recorded in the Audit Log. OK?

**Q18. Audit Log.** TE purges entries after 14 days, lets admins delete them, and doesn't log changes to Pending sessions (most new sessions). Proposal:
- **permanent and append-only**;
- logs every schedule, availability, day-setting, pay and settings change, with who and when.

OK?

**Q19. Events ↔ Google Calendar.** TE mirrors schedule events (follow-ups, payment reminders…) one-way to a Google Calendar. Keep it as an optional per-branch integration (late phase)?

**Q20. Week start.** TE uses Monday for schedule weeks but Sunday for the mini calendar, month view and availability calendars. That mix causes a real bug: the week header's Sunday is a different date from the Sunday section below it. Make it consistent (Monday everywhere), with a per-branch setting?

**Q21. What tutors can see about students.** TE lets tutors read every student, including parent contacts and school-login notes. Keep that, or limit tutors to the students they teach and/or hide parent contacts?

**Q22. Installed app identity.** One "Hyber CRM" installable app for everyone, with the branch's logo and colors inside the app? Or a separate name and icon per branch? The second needs a domain per branch.

*Recommendation:* one app now.
