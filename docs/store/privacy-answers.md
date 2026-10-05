# Privacy questionnaires: the answers

What the phone app collects, as Apple's **App Privacy** section and Google's **Data safety** form ask for it. Both are answered the same way, because both describe the same app, and both agree with the [privacy policy](privacy-policy.md). If the app ever starts collecting something new, change these, the policy and the stores' forms together.

Both stores ask about what **the app** sends off the phone. Records a center enters on the website (pay rates, students' contact details, the schedule itself) are not collected by the app, even when the app shows them to the tutor; the privacy policy covers them.

## What the app actually collects (the facts behind every answer)

| Data | When | Why | Linked to the person | Shared with |
| --- | --- | --- | --- | --- |
| Name, email address | Signing in or creating an account (Google, or email and password) | The account; who the person is at their center | Yes | Nobody; stored with Google Firebase (our host) |
| Profile picture (its web address) | Signing in with a Google account that has one | Shown next to the person's name inside the center | Yes | Nobody |
| Account id | Signing in | Everything the person does is theirs | Yes | Nobody |
| Session logs, availability, comments | When the tutor writes them | The tutor's work for the center: the center keeps them | Yes | The center's own people, by role; the AI service drafts summaries when the center turns AI help on (a processor working for us) |
| Notification token, phone model and system version, app version, a random id for the installation | When notifications are allowed | To deliver notifications to that phone, and list the person's phones | Yes | Apple's and Google's push services deliver the notifications |
| Nothing else | | No location, contacts, photos or files, no analytics, no advertising identifiers, no crash reporting service, no tracking across other apps or websites | | |

Everything travels encrypted (HTTPS) and is stored with Google Firebase in the United States. People can delete their account in the app (Profile → Settings → Delete my account) or by email ([privacy policy](privacy-policy.md), "Deleting your account"); the center's own records about its work stay with the center.

## Apple: App Privacy (App Store Connect → App Privacy)

**Do you or your third-party partners collect data from this app?** Yes.

Data types to tick, and their answers (every one: *Linked to the user's identity: Yes*; *Used for tracking: No*):

| Data type | Purpose |
| --- | --- |
| Contact Info → **Name** | App Functionality |
| Contact Info → **Email Address** | App Functionality |
| User Content → **Photos or Videos** (the Google profile picture) | App Functionality |
| User Content → **Other User Content** (session logs, availability, comments) | App Functionality |
| Identifiers → **User ID** | App Functionality |
| Identifiers → **Device ID** (the installation's random id and its notification token) | App Functionality |

Not collected: Health & Fitness, Financial Info, Location, Sensitive Info, Contacts, Emails or Text Messages, Audio Data, Gameplay Content, Customer Support, Browsing History, Search History, Purchases, Usage Data, Diagnostics, Other Data.

**Tracking:** No. In Apple's sense, "tracking" is linking the app's data with other companies' data for advertising, or sharing it with data brokers; Hyber CRM does neither, so the app never asks for tracking permission.

The label Apple then shows will read "Data Linked to You: Contact Info, User Content, Identifiers", which is accurate.

## Google: Data safety (Play Console → App content → Data safety)

- **Does your app collect or share any of the required user data types?** Yes.
- **Is all of the user data collected by your app encrypted in transit?** Yes.
- **Which account creation methods does your app support?** Username and password (email), and OAuth (Google).
- **Do you provide a way for users to request that their data is deleted?** Yes. The deletion link: `https://hybercrm.com/privacy#delete`.
- **Data types:**

| Category → type | Collected | Shared | Processed ephemerally | Required or optional | Purposes |
| --- | --- | --- | --- | --- | --- |
| Personal info → **Name** | Yes | No | No | Required | App functionality, Account management |
| Personal info → **Email address** | Yes | No | No | Required | App functionality, Account management |
| Personal info → **User IDs** | Yes | No | No | Required | App functionality, Account management |
| Photos and videos → **Photos** (the Google profile picture) | Yes | No | No | Optional | App functionality |
| App activity → **Other user-generated content** (session logs, availability, comments) | Yes | No | No | Optional | App functionality |
| Device or other IDs → **Device or other IDs** (the notification token and the installation's id) | Yes | No | No | Optional (only with notifications allowed) | App functionality |

Everything else: not collected (no location, financial info, health, messages, photos from the phone, audio, files, calendar, contacts, app activity besides the above, web browsing, crash logs or diagnostics). **Shared** is No everywhere: Google's form does not count service providers working for us (Firebase, the push services, the AI service) as sharing.

- **Privacy policy URL:** `https://hybercrm.com/privacy`.
- **Account deletion (Google's policy):** the in-app path is Profile → Settings → Delete my account; the web link above is the one Google asks for.
