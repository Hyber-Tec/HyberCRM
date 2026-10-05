# Hyber CRM

A multi-tenant CRM for tutoring centers: scheduling, tutor availability, time clock and payroll, session logs and progress reports, with portals for admins, tutors, parents and students. Each center is a **branch** with its own people, settings and branding on one shared core.

- **Stack:** React 19 + TypeScript (Vite), Tailwind CSS + shadcn/ui, Firebase (Auth with Google, Firestore, Storage, Cloud Functions, Hosting).
- **Docs:** [`docs/hyber/DECISIONS.md`](docs/hyber/DECISIONS.md) → [`PLAN.md`](docs/hyber/PLAN.md) → [`DATA_MODEL.md`](docs/hyber/DATA_MODEL.md) → [`BRANCH_SETTINGS.md`](docs/hyber/BRANCH_SETTINGS.md).

## Development

```bash
npm install && npm --prefix web install   # once
npm run dev          # http://localhost:5173 against the hyber-crm Firebase project
npm test             # shared business-logic tests
npm run test:rules   # Firestore security rules (emulator, Java 21+)
npm run e2e          # every portal end-to-end against the emulators
npm run seed         # (re)create Demo Academy sample data
npm run iphone       # the phone app on the iPhone plugged in (npm run android: the Android phone)
npm run iphone:sim   # the phone app in the iPhone Simulator, on the local practice copy
```

The phone app (`mobile/`): [docs/running-the-apps.md](docs/running-the-apps.md) runs it, [docs/publishing.md](docs/publishing.md) puts it in the stores, [docs/testing-guide.md](docs/testing-guide.md) checks it.

`web/.env.local` holds the Firebase web config (see `web/.env.example`).
