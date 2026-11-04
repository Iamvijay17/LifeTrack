# LifeTrack — personal life OS

Private, cloud-first tracker for planning, habits, learning, job search, fitness, health, finance, notes, goals and reminders.
One Supabase backend (Postgres, Auth, Row Level Security, Realtime) behind two apps:

| | Path | Stack |
|---|---|---|
| Web (PWA) | `apps/web` | React 18, Vite, Tailwind |
| iOS + Android | `apps/mobile` | Expo SDK 58, Expo Router, React Native |
| Shared logic | `packages/{core,data,schemas,types,constants,utils,design-tokens}` | domain rules, data layer, Zod schemas, tokens |
| Backend | `supabase/{migrations,functions,tests}` | SQL migrations, `send-reminders` Edge Function, RLS tests |

Money is stored in integer paise, dates as `yyyy-MM-dd` strings in the user's time zone. There are no AI features.

## Start here
- Run it: [docs/QUICKSTART.md](docs/QUICKSTART.md) · [docs/SETUP.md](docs/SETUP.md)
- Native apps and push: [docs/NATIVE.md](docs/NATIVE.md) · web/mobile feature parity: [docs/PARITY.md](docs/PARITY.md)
- CI/CD: [docs/CI.md](docs/CI.md) · deploying: [docs/DEPLOY.md](docs/DEPLOY.md) · **releasing: [docs/RELEASE.md](docs/RELEASE.md)** · [docs/RELEASE_AUDIT.md](docs/RELEASE_AUDIT.md)
- Privacy/terms drafts and store copy: [docs/legal](docs/legal), [docs/store](docs/store)

`pnpm verify` runs the whole local quality gate (typecheck, lint and formatting, secrets scan, all tests with coverage thresholds, RLS suite, SQL and migration checks).

## Honest status
**Automated and passing locally:** unit/component tests across all packages, the RLS suite (every user-owned table and foreign key), real-PostgreSQL concurrency tests,
Deno tests of the Edge Function, Playwright on desktop and a phone profile, and web and mobile production bundles.

**Written but never run in a live environment** (they need accounts or infrastructure that were not available during development):
the GitHub Actions workflows, the real-Supabase API/RLS tests and two-device sync (`ci-backend.yml`), EAS builds, Maestro device flows,
push delivery on real iOS/Android devices. Treat each as implemented-but-unproven until its first green run (see `docs/RELEASE.md`).

## Design limits
- Online-first: no offline editing; offline shows a banner and writes fail visibly (nothing is silently dropped). The PWA caches only the app shell.
- Realtime is one `postgres_changes` channel plus refetch; DELETE events carry only the primary key, so the app refetches.
- Water and savings additions are atomic in the database (`add_water`, `add_savings`), so concurrent devices never lose an increment.
- A running study/focus timer's duration uses the device clock at stop (you can only correct downward).
- Streaks and interview rates are computed from current data; changing a habit's schedule re-judges past days against the new schedule.
- Backup restore (web) merges by id and never deletes. Account deletion calls `delete_my_account()` and removes all data.
- Reminders are pushed by a scheduled Edge Function (server) and, as a fallback, by open apps after a 2-minute grace; de-duplicated by the database.
- Recurring transactions are posted by open apps, not the server: nothing is added until a device opens, then each missed charge appears dated the day it fell due. De-duplicated by the database.
- Reports, Export/Import and global search exist on web only.
- DEV-mode local auth (no Supabase env) is for development only and is not secure.

## Existing Supabase projects
Apply the migrations you have not applied yet, in order (`supabase/migrations`): `0004_hardening.sql` (ownership guards, indexes, atomic `add_water` / `replace_exercise_logs`), `0005_history_owner_guard_and_user_indexes.sql`, `0006_push_tokens.sql` (mobile push), `0007_savings_atomic.sql` (`add_savings`) and `0008_recurring_rules.sql` (recurring transactions). They are additive and safe to re-run; `supabase/setup-all.sql` contains them all and is regenerated with `pnpm sql:build`. See docs/DEPLOY.md.

## Loading UI
`apps/web/src/components/loaders/` (LifeTrack Progress Orbit): pure CSS/SVG, transform and opacity only, honours `prefers-reduced-motion`, no percentages when progress is unknown. Verified in headless Chromium (desktop, 360px mobile, dark/light, reduced motion); not profiled on physical low-end phones.
