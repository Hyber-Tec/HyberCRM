# The Hyber CRM phone app

Expo (SDK 57) and React Native, for iPhone and Android, built the way ycaclock's app is. See `../CLAUDE.md` for the
project's rules (tenancy, branch time zones, audit log, permanent UI rules, commits) and `README.md` for running it.

## Expo changes with every SDK

APIs you remember may have been renamed, moved or removed. Before writing code that touches an Expo, EAS or React
Native API, read the docs for the SDK in `package.json`: https://docs.expo.dev/versions/v57.0.0/, and
https://docs.expo.dev/llms.txt for everything else. React Native Firebase uses its **modular** API (as the website's
Firebase SDK does): `import { collection, query, where, onSnapshot } from "@react-native-firebase/firestore"`.

## Commands

```bash
npx expo install <package>          # instead of npm install: picks the version that matches the SDK
npx expo start                      # the development server
npm run typecheck
npm run lint
```

A package with native code needs a new development build (`npm run iphone:sim -- --rebuild`): don't add one without
asking. Pure JavaScript packages are fine.

## How it is put together

```
app.config.ts          native configuration: ids, Firebase files, plugins (iOS 27 scene life cycle, signing)
src/app/               screens (Expo Router). Root gates: signed out → sign-in screens; a password account with an
                       unconfirmed email → verify-email; otherwise (app)/, which picks the center (AccessProvider)
                       and the portal of the person's one role.
  (app)/(tutor)/       the tutor portal: (tabs) Today · Schedule · Availability · News · Profile, and the screens
                       that open over them (session/[id] sheet, log/[id], log-view/[id], notifications, availability-day)
  (app)/coming-soon    admins, parents and students: their portal comes to the app later; the website meanwhile
src/state/             AuthProvider (Google, email + password, verification), AccessProvider (memberships),
                       BranchProvider (the center: settings, rules, time zone, member, staff), AppearanceProvider,
                       NotificationsProvider (push token, taps, foreground toasts, icon badge)
src/features/<area>/   each area's data hooks and components (schedule, availability, news, notifications, profile, logs)
src/components/        the shared building blocks (Text `T`, Button, Card, ListSection/ListRow, Field, Badge,
                       Avatar, EmptyState, SegmentedControl, Skeleton, Screen, Dialog, IconButton, ToastHost)
src/lib/               firebase, firestore hooks (useDoc, useQuery), callables (api.ts), audit, push, notify, toast,
                       links (open the website), targets (open the screen an inbox item is about), device, env
src/theme/             the website's neutral palette in light and dark, status colors, spacing, type sizes
../shared/src          the business logic the website and the Cloud Functions use, imported as @shared/...
```

## Rules

- **Business logic comes from `@shared`**: time zones (`@shared/time`), availability (`@shared/availability`),
  conflicts, session statuses, logs (`@shared/sessions/logs`), pay (`@shared/pay/*`), settings
  (`resolveSettings`), rules (`resolveBusinessRules`). Never re-implement a rule in the app; if one is missing,
  add it to `shared/` (pure TypeScript, unit-tested) so the website and the functions use the same one.
- **Branch time zone only.** "Today", dates and times come from the branch's IANA zone (`useBranch().timezone`)
  through `@shared/time`, never the phone's zone. Dates are `dateKey` strings plus minutes, as on the website.
- **The server is the authority.** Firestore rules and Cloud Functions enforce every rule; the app mirrors them so
  people aren't surprised (a locked day says so before a save is refused). Callables are the website's own
  (`submitSessionLog`, `sessionAi`, `sessionLogContext`, `sendAccountEmail`, `deleteMyAccount`).
- **Audit log:** every availability, schedule, people, pay and settings change adds an entry in the same batch
  (`src/lib/audit.ts`, `via: "app"`), as the website does.
- **Look:** the website's shadcn neutral theme, light and dark (`useColors()`), on the grouped background of the
  phone's own list screens. Use the shared components; a new reusable one goes in `src/components/` with its own
  file. Icons from `lucide-react-native` (the same set as the website's `react-icons/lu`). Sentence case, plain
  words. Every interactive element gets an `accessibilityLabel` when it has no text, and screens and key controls a
  `testID` (the Maestro flows use them).
- **Month calendars scroll vertically through months**, like the iOS Calendar app (permanent rule): never a static
  month with ‹ › arrows, including date pickers.
- **Never name the AI model or provider** (permanent rule): it is always "AI".
- **Words people see** name the branch ("Demo Academy"), never the platform, inside a center (DECISIONS §6).
- Every route loads its record by ID (deep links, pushes and the back gesture always work).
- Copy from the website's texts where they exist, so both say the same thing.
