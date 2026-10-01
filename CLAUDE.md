# Hyber CRM

Multi-tenant CRM for tutoring centers: one shared core, each center is a **branch** customized by settings, branding and optional extensions. It is a remake of the owner's True Education (TE) CRM.

Read first: [`docs/hyber/DECISIONS.md`](docs/hyber/DECISIONS.md) (owner answers, wins over everything else) → [`docs/hyber/PLAN.md`](docs/hyber/PLAN.md) → [`docs/hyber/DATA_MODEL.md`](docs/hyber/DATA_MODEL.md) → [`docs/hyber/BRANCH_SETTINGS.md`](docs/hyber/BRANCH_SETTINGS.md). The TE analysis lives in `docs/true-education/` **locally only** (git-ignored: it describes a live production system and this repo is public). The TE source is at `/Users/goo/Documents/True Education/true-education-app-v2` (read-only reference).

## Owner, accounts, permissions

- Solo developer. Everything for this project runs under **goochoi913@gmail.com** (Firebase, GitHub, the only Super Admin). Never use any other address.
- Full permission to deploy Firestore/Storage rules, indexes, Cloud Functions and Hosting to `hyber-crm`, to seed data, and to push to `main`. Do it without asking or announcing each time, unless the owner sets a limit.
- When a detail is unclear, decide it (and record notable calls in DECISIONS.md §3) instead of asking.

## Layout

| Path | What |
|---|---|
| `web/` | Vite + React 19 + React Router 7 + TypeScript, Tailwind v4 + shadcn/ui (neutral theme), react-icons. All portals. |
| `shared/` | Pure TypeScript business logic (time zones, settings defaults, pay segmentation, rounding, lanes, permissions). No React, no Firebase. Imported by `web` (`@shared/*`) and `functions` (bundled by esbuild). |
| `functions/` | Cloud Functions v2 (Node 22, TypeScript, bundled with esbuild). |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules` | Security rules. No catch-all rule. |
| `tests/rules/` | Firestore rules tests against the emulator. |
| `scripts/` | Admin scripts (seed, maintenance) using the gcloud user token and the Firestore REST API. |

## Commands

- `npm run dev` (root) → web dev server on http://localhost:5173 against the real `hyber-crm` project.
- `npm run typecheck`, `npm run build`, `npm test` (shared unit tests), `npm run test:rules` (emulator).
- `npm run deploy:rules`, `npm run deploy:functions`, `npm run deploy:hosting`, `npm run deploy` (all).

## Conventions

- **Tenancy:** all branch data under `branches/{branchId}/…`; root collections are only `platformAdmins`, `branches`, `users`. Every new collection gets explicit rules.
- **Identity:** `branches/{b}/members/{emailLower}` with `roles: ("admin"|"tutor"|"parent"|"student")[]`; people records `staff/{id}` and `students/{id}` are referenced by ID only.
- **Settings:** defaults in `shared/src/settings/defaults.ts` (TE behavior); a branch stores only overrides; always read through the resolver.
- **Time:** branch IANA time zone only. Wall clock `dateKey` (`YYYY-MM-DD`) + `startMin`/`endMin`, plus absolute `startAt`/`endAt`. Use `shared/src/time.ts`, never the browser zone.
- **Audit:** every schedule, availability, people, pay and settings mutation writes an append-only `auditLog` entry in the same batch.
- **UI:** shadcn/ui components in `web/src/components/ui`, icons from react-icons. The Schedule keeps TE's layout; everything else may improve on TE.
- **Secrets:** never commit API keys, service-account files, tokens, passwords or PINs. The Firebase web config lives in `web/.env.local` (git-ignored).

## Git and commits

- Work on `main` and push straight to it. No pull requests until the owner says more developers are joining.
- Every commit is authored solely as the git user configured in this repo (`goochoi913` / goochoi913@gmail.com).
- **No attribution trailers:** no `Co-Authored-By:` line, no session line, no "Generated with" footer, in commit messages or PR bodies.
- **Conventional Commits v1.0.0:** `<type>[(scope)][!]: <imperative description>`, blank line, body, blank line, footers.
  - Types: `feat` `fix` `docs` `refactor` `test` `chore` `perf` `build` `ci` `style`.
  - The scope is the part of the app the change is about (e.g. `auth`, `platform`, `access`, `settings`, `schedule`, `availability`, `students`, `employees`, `payroll`, `kiosk`, `sessions`, `announcements`, `rules`, `functions`, `shared`); leave it off when the change spans several.
  - Breaking changes take `!` before the colon, a `BREAKING CHANGE:` footer, or both.
- **Commit far less often:** one commit per meaningful, self-contained piece of work (a feature, a fix, a refactor, a runbook). Small things join the commit they belong to. Never one commit per file, per review round or per step of a session. A day's work is a handful of commits split by type and scope, not by when the edits were made.
