# LifeTrack — personal life OS

Private, cloud-first tracker for planning, habits, learning, job search, fitness, sleep and health, **food and nutrition**, finance, notes, goals and reminders.
One Supabase backend (Postgres, Auth, Row Level Security, Realtime) behind two apps: a web app (PWA) and an iOS/Android app. Money is stored in integer paise, dates as `yyyy-MM-dd` strings in the user's time zone. There are no AI features.

## Features

| Area | Modules |
| --- | --- |
| Overview | Life Command Center: Today agenda, Life Score with trends, module summaries, upcoming deadlines, resizable and reorderable widgets |
| Productivity | Daily Planner (recurring tasks), Focus timer, Habits and streaks, Notes & Journal |
| Growth | Career & Learning (study timer, goals, topics), Job Switch (board, interviews, insights), Goals & Milestones |
| Wellness | Gym & Fitness (routines, workout logging, records, **876-exercise database with photos**), Sleep & Health, **Food & Nutrition (293 Indian foods, Tamil search, water, analytics)** |
| Money | Transactions, budgets, savings goals, recurring rules |
| Insights & system | Analytics, Reports (web), Notifications & reminders (server push), Settings, JSON/CSV export and backup (web), Help, global search (web) |

Full list with status: [docs/FEATURES.md](docs/FEATURES.md).

## Technology stack

| | Path | Stack |
|---|---|---|
| Web (PWA) | `apps/web` | React 18, Vite, Tailwind, React Router 7, React Hook Form + Zod, Recharts, Motion |
| iOS + Android | `apps/mobile` | Expo SDK 58, Expo Router, React Native, TanStack Query |
| Shared logic | `packages/{core,data,schemas,types,constants,utils,design-tokens}` | domain rules, data layer, Zod schemas, tokens |
| Backend | `supabase/{migrations,functions,tests}` | 10 SQL migrations (32 tables), `send-reminders` Edge Function, RLS tests |

There is no custom API server: the apps talk to Supabase directly and authorisation is Row Level Security ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

## Installation and development

```bash
pnpm install                      # Node >= 20, pnpm 10.28 (or: npx --yes pnpm@10.28.0 install)
cp apps/web/.env.example apps/web/.env.local   # PUBLIC Supabase URL + anon key (never a service-role key)
pnpm dev                          # http://localhost:5173 (without the variables: in-browser DEV mode, not secure)
```

Database: run `supabase/setup-all.sql` (migrations 0001–0010) in a Supabase project's SQL editor. Mobile: `cd apps/mobile && cp .env.example .env.local && pnpm start` (development build required). Complete guide: [docs/INSTALLATION.md](docs/INSTALLATION.md).

| Command | What |
|---|---|
| `pnpm dev` / `pnpm build` | web dev server / production build |
| `pnpm test`, `pnpm test:coverage`, `pnpm test:rn` | Vitest suites / with coverage gates / React Native component tests |
| `pnpm test:e2e` | Playwright (desktop + Pixel 7) |
| `pnpm test:rls`, `pnpm test:sql`, `pnpm test:pg` | RLS suite / migrations on in-memory Postgres / real-PostgreSQL concurrency |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm check:secrets` | static checks |
| `pnpm sql:build` | regenerate `supabase/setup-all.sql` after changing a migration |
| `pnpm verify` | the whole local quality gate |

## Documentation

| Topic | Documents |
| --- | --- |
| Overview | [docs/README.md](docs/README.md) (index) · [PROJECT_STRUCTURE](docs/PROJECT_STRUCTURE.md) · [FEATURES](docs/FEATURES.md) · [USER_GUIDE](docs/USER_GUIDE.md) · [FAQ](docs/FAQ.md) |
| Design | [ARCHITECTURE](docs/ARCHITECTURE.md) · [DATA_FLOW](docs/DATA_FLOW.md) · [DATABASE](docs/DATABASE.md) · [API](docs/API.md) · [UI_UX](docs/UI_UX.md) · [DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md) · [ERROR_HANDLING](docs/ERROR_HANDLING.md) · [PERFORMANCE](docs/PERFORMANCE.md) |
| Modules | [FOOD_NUTRITION](docs/FOOD_NUTRITION.md) · [GYM_FITNESS](docs/GYM_FITNESS.md) · [PARITY](docs/PARITY.md) (web vs mobile) |
| Run and operate | [INSTALLATION](docs/INSTALLATION.md) · [DEPLOYMENT](docs/DEPLOYMENT.md) · [DEPLOY](docs/DEPLOY.md) · [RELEASE](docs/RELEASE.md) · [NATIVE](docs/NATIVE.md) · [CI](docs/CI.md) · [BACKUP_RECOVERY](docs/BACKUP_RECOVERY.md) · [SETUP](docs/SETUP.md) · [QUICKSTART](docs/QUICKSTART.md) |
| Quality and security | [TESTING](docs/TESTING.md) · [SECURITY](docs/SECURITY.md) · [APP_SECURITY](docs/APP_SECURITY.md) · [SECURITY policy](SECURITY.md) · [DEPENDENCIES](docs/DEPENDENCIES.md) · [RELEASE_AUDIT](docs/RELEASE_AUDIT.md) · [UX_AUDIT](docs/UX_AUDIT.md) |
| Project | [ROADMAP](docs/ROADMAP.md) · [CHANGELOG](CHANGELOG.md) · [docs changelog summary](docs/CHANGELOG.md) · [KNOWN_ISSUES](docs/KNOWN_ISSUES.md) · [CONTRIBUTING](docs/CONTRIBUTING.md) |
| Legal and store | [docs/legal](docs/legal) · [docs/store](docs/store) |

There is no admin console, so there is no admin guide. No screenshots are committed to the repository (capture instructions: [docs/store/SCREENSHOTS.md](docs/store/SCREENSHOTS.md)).

## Contributing

Read [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) and the pull-request template. Short version: shared logic goes in `packages/*`; database changes are new additive migrations with RLS and a test fixture; money stays in integer paise; no service-role keys in clients;
add a `CHANGELOG.md` entry; run `pnpm verify`. The code is proprietary (`LICENSE`).

## Honest status
**Automated and passing locally:** unit/component tests across all packages, the RLS suite (every user-owned table and foreign key), real-PostgreSQL concurrency tests,
Deno tests of the Edge Function, Playwright on desktop and a phone profile, and web and mobile production bundles.

**Written but never run in a live environment** (they need accounts or infrastructure that were not available during development):
the GitHub Actions workflows, the real-Supabase API/RLS tests and two-device sync (`ci-backend.yml`), EAS builds, Maestro device flows,
push delivery on real iOS/Android devices. Treat each as implemented-but-unproven until its first green run (see `docs/RELEASE.md`). Documentation drift and open issues found in a full audit: [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md).

## Design limits
- Online-first: no offline editing; offline shows a banner and writes fail visibly (nothing is silently dropped). The PWA caches only the app shell.
- Realtime is one `postgres_changes` channel plus refetch; DELETE events carry only the primary key, so the app refetches.
- Water and savings additions are atomic in the database (`add_water`, `log_water`, `add_savings`), so concurrent devices never lose an increment.
- A running study/focus timer's duration uses the device clock at stop (you can only correct downward).
- Streaks and interview rates are computed from current data; changing a habit's schedule re-judges past days against the new schedule.
- Backup restore (web) merges by id and never deletes. Account deletion calls `delete_my_account()` and removes all data.
- Reminders are pushed by a scheduled Edge Function (server) and, as a fallback, by open apps after a 2-minute grace; de-duplicated by the database.
- Recurring transactions are posted by open apps, not the server: nothing is added until a device opens, then each missed charge appears dated the day it fell due. De-duplicated by the database.
- Reports, Export/Import and global search exist on web only.
- DEV-mode local auth (no Supabase env) is for development only and is not secure.

## Existing Supabase projects
Apply the migrations you have not applied yet, **in order**, from `supabase/migrations` (all are additive and safe to re-run; `supabase/setup-all.sql` contains them all and is regenerated with `pnpm sql:build`):
`0004_hardening.sql` (ownership guards, indexes, atomic `add_water` / `replace_exercise_logs`), `0005_history_owner_guard_and_user_indexes.sql`, `0006_push_tokens.sql` (mobile push), `0007_savings_atomic.sql` (`add_savings`),
`0008_recurring_rules.sql` (recurring transactions), `0009_nutrition.sql` (Food & Nutrition) and `0010_food_database.sql` (food names and sources). See [docs/DEPLOY.md](docs/DEPLOY.md) and [docs/DATABASE.md §7](docs/DATABASE.md).

## Loading UI
`apps/web/src/components/loaders/` (LifeTrack Progress Orbit): pure CSS/SVG, transform and opacity only, honours `prefers-reduced-motion`, no percentages when progress is unknown. Verified in headless Chromium (desktop, 360px mobile, dark/light, reduced motion); not profiled on physical low-end phones.
