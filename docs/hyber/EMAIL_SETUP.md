# Email (invites and sign-in links)

Hyber CRM emails people a link to sign in when they are given access. The mail goes out through Gmail from HyberTec LLC's address, **hybertecofficial@gmail.com**.

## What gets sent

| When | Email | Sent to |
|---|---|---|
| The Super Admin adds an owner (new branch or Platform → branch → Owners) | "Set up {branch} on Hyber CRM" | the owner |
| An existing member is made an owner | "You're now an owner of {branch}" | that person |
| An owner or admin adds a person (Account → Add person) | "You've been added to {branch}" | that person |
| An admin approves a sign-up request | "{branch} approved your request" | the person who asked |
| Someone clicks **Email sign-in link** / **Resend sign-in email** (Account row menu, Platform owners) | the same invite again | that person |

Each email has a button to the branch's sign-in page (`/login?next=/{branch}&email=…`), which shows the branch's name and logo and pre-selects that Google account. The sender name is "{branch} via Hyber CRM"; replies go to the admin who added the person, or the branch's contact email.

Nothing is emailed to paused access, suspended branches, or test addresses (`*.test`, `example.com`, `*.invalid`, `localhost`).

## Where to see what happened

The Account page's **Status** column (and the Owners list on the Platform branch page) shows, per person:

- **Signed in {date}**: they're in.
- **Invited {date}**: the email went out; they haven't signed in yet.
- **Email failed**: Gmail refused it. The tooltip has the reason. Resend from the row menu, or copy the sign-in link and send it yourself.
- **Not emailed yet**: the app password isn't set up (below). Copy the sign-in link from the row menu in the meantime.

The result is stored on the member doc (`members/{email}.invite`) by the `onMemberWritten` and `resendInvite` Cloud Functions.

## One-time setup (owner)

Gmail only lets apps send mail with an **app password**, which needs 2-Step Verification on the account.

1. Sign in to Google as **hybertecofficial@gmail.com**.
2. Turn on 2-Step Verification if it's off: <https://myaccount.google.com/signinoptions/twosv>.
3. Create an app password: <https://myaccount.google.com/apppasswords>. Name it `Hyber CRM` and click **Create**. Google shows 16 letters in four groups. Copy them. You won't see them again.
4. In Terminal, in the HyberCRM folder, run:

   ```sh
   firebase functions:secrets:set GMAIL_APP_PASSWORD --project hyber-crm
   ```

   Paste the 16 letters when asked (with or without the spaces) and press Enter. Nothing shows while you paste; that's normal.
5. Deploy the functions so they use the new password:

   ```sh
   npm run deploy:functions
   ```

6. Check it: on the Account page, open a person's menu → **Email sign-in link**. The toast should say "Sign-in email sent", and the email arrives within a minute (look in Spam the first time and mark it "Not spam").

Never paste the app password into chat, code, or a file in this repo.

## Changing or revoking the password

- To revoke: delete the "Hyber CRM" entry at <https://myaccount.google.com/apppasswords>. Emails then show **Email failed**.
- To replace: create a new app password and repeat steps 4–5.
- Changing the Google account's normal password also revokes app passwords.

## Limits

A regular Gmail account can send about **500 emails a day**. That's plenty for invites. If the company moves to Google Workspace, the same setup works with the Workspace address (and higher limits); update `SENDER_EMAIL` in `shared/src/brand.ts`.

## Local development

In the Firebase emulator nothing is sent: each email is written as an HTML file to `$TMPDIR/hyber-outbox/` (or `$HYBER_OUTBOX`), and the function log prints the path. `functions/.secret.local` (git-ignored) holds a placeholder `GMAIL_APP_PASSWORD` so the emulator doesn't ask Secret Manager.
