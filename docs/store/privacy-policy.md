# Hyber CRM privacy policy

*Published at https://hybercrm.com/privacy: the website's `web/public/privacy.html` is this text, so change both together and deploy the website (`npm run deploy:hosting`, or ask Claude Code). Apple and Google both ask for this address, and the app must link to it too. Last updated: October 4, 2026.*

*For HyberTec: students can be children, and this is a legal document. It is written to be accurate about what Hyber CRM does today; have a lawyer read it before the app is public, and change it whenever the app starts collecting something new (then also [privacy-answers.md](privacy-answers.md) and the stores' forms).*

---

**Hyber CRM** is software for tutoring and learning centers, made by **HyberTec LLC** ("HyberTec", "we", "us"). Centers use it to run their schedule, staff, students, session notes, progress reports and payroll; their staff, families and students use it on the website, hybercrm.com, and in the Hyber CRM app for iPhone and Android. This policy explains what Hyber CRM collects, why, who can see it, how long it is kept, and how to have it deleted.

## Who is responsible for what

Each center decides what it records in Hyber CRM about its own people (staff, students and families) and who at the center may see it. For those records the center is in charge, and HyberTec runs the service on its behalf. For the accounts people sign in with, and for our own website, HyberTec is in charge. If you have a question about what your center keeps, ask the center first; we help centers answer.

## What we collect

**Your account.** Your name, your email address and how you sign in: with Google, or with an email and a password (the password is kept by Google's Firebase Authentication in a form nobody can read; we never see it). If you sign in with Google, the profile picture of your Google account. When you last signed in, which centers gave you access, and your role in each (owner, admin, tutor, parent or student).

**What a center keeps in Hyber CRM.** Depending on your role and what your center uses:

- About staff: name, contact details, role, the subjects they teach, availability, schedule, clock-in and clock-out times (including at the center's sign-in kiosk, where the 4-digit PIN is stored only in scrambled form), pay rates and pay records, and notification choices.
- About students: name, grade, school, status, subjects, learning notes, sessions and attendance; and, seen only by the center's owner and admins, contact details, parents or guardians, address, birth date, school login and sign-up answers.
- About the center's work: the schedule, the session logs tutors write (what was covered, notes, ratings, homework), progress reports, parent-conference notes, announcements and their comments, and an audit log of who changed what and when.

**On your phone.** If you allow notifications, the app keeps a notification token for that phone, with the phone's model and system version, the app's version and a random identifier for the installation, so that we can send you notifications (new or changed sessions, announcements). The token is removed when you sign out.

**On the website.** Your browser keeps your sign-in and a few display preferences (for example the schedule's zoom). We use no advertising or tracking cookies. If you write to us with the "Talk to us" form, we keep what you typed (your name, email, center, phone, the center's size and your message), your browser's description, and a one-way fingerprint of your internet address that only lets us spot repeated messages (never the address itself). The live demo at hybercrm.com/demo runs entirely in your browser, with made-up data: nothing you do there reaches us.

**AI help, when a center turns it on.** To draft a session summary or a progress report, the text of the session log or report (which can include a student's first name and what they worked on) is sent to our AI service provider, which returns the draft. Each center decides whether to use it.

**What we don't collect or do.** No location. No contacts, photos or files from your phone. No advertising, no analytics or crash-reporting services, and no tracking across other companies' apps or websites. We never sell or rent personal information.

## Why we use it

To run Hyber CRM for your center (schedules, availability, pay, session logs, reports and notifications), to keep accounts secure and stop abuse, to keep the audit trail centers rely on, to answer your questions, and where the law requires it.

## Who can see it

- **People at your center, by role.** Owners and admins see the center's records (an owner can keep some pages, such as pay, from an admin). Tutors see their own schedule, availability and pay, the basic record of students (name, grade, school, subjects, learning notes; never their contact details), the center's announcements and, if the center allows it, other tutors' session logs. Parents see their own children's upcoming sessions and the progress reports the center chooses to share with them. Students see their own sessions and their own information.
- **HyberTec.** Our administrators can open a center's records to set the center up, to help it when it asks, and to keep the service working, and for no other purpose.
- **Our service providers**, who process the information only for us: Google (Firebase: hosting, sign-in, database, file storage, server functions and push notifications; and Gmail, which sends account emails from HyberTec's address), Apple (push notifications to iPhones), and our AI service provider (when a center uses AI help). The information is stored in the United States.
- **Nobody else**, unless the law requires it (for example a valid court order), to protect someone's safety, or as part of a sale or merger of HyberTec's business, in which case this policy keeps applying.

## How long we keep it

- Your account: until you delete it.
- A center's records: as long as the center uses Hyber CRM. When a center leaves, we delete its records when it asks, or within a reasonable time, except what the law requires to be kept.
- In-app notifications: 14 days, unless the center chooses otherwise. Sessions in the schedule's trash: for the center's trash period, then deleted.
- Notification tokens: until you sign out of the app, or until the push service says they no longer work.
- "Talk to us" messages: as long as needed to answer and follow up.

## Deleting your account {#delete}

- **In the app:** Profile → Settings → **Delete my account**. The app first asks you to confirm it's you (your password, or Google).
- **Without the app:** email hybertecofficial@gmail.com from the address you sign in with, or ask your center.

Deleting your account removes your sign-in, your personal profile and your phones' notification tokens at once, and ends your access to every center. The records a center keeps about its own work stay with the center: the sessions you taught or attended, the logs you wrote, pay records and the audit log (payroll law can require a center to keep them). To have those removed too, ask the center, or write to us and we will pass the request on.

## Children

Hyber CRM is a tool for tutoring centers and is not directed to children. Centers may keep records about students who are children, and may give a student a login of their own. The center is responsible for getting any permission it needs from a parent or guardian before it adds a child's information or gives a child an account (for example under the U.S. Children's Online Privacy Protection Act, COPPA). A child cannot open a center by signing up alone: a student's account works only once the center has added the student. We use children's information only to provide the service to their center, never for advertising or profiling. A parent or guardian can ask the center, or us, to see, correct or delete their child's information. If you believe a child's information reached Hyber CRM without the permission it needed, write to hybertecofficial@gmail.com and we will delete it.

## Security

Everything travels encrypted (HTTPS) and is stored with Google Firebase. Access rules let each person reach only what their role allows, in their own center. Passwords are held by Firebase Authentication, never by us, and kiosk PINs only in scrambled form. Changes to schedules, availability, people, pay and settings are recorded in the center's audit log.

## Your choices and rights

You can turn notifications off in the app (Profile → Notifications) or in your phone's Settings. You can see and correct your account details in the app or on the website, or ask your center. You can delete your account at any time. Depending on where you live (for example California, the European Union or the United Kingdom), you may also have the right to ask for a copy of your information, to have it corrected or deleted, or to object to how it is used: write to us and we will answer within 30 days. For records a center keeps, we work with the center to answer.

## Changes

When we change this policy, we update this page and the date at the top. If a change matters, we tell centers, and the people it affects, before it takes effect.

## Contact

HyberTec LLC · hybertecofficial@gmail.com
