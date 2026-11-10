# Installation & development

Short versions already exist in [QUICKSTART.md](QUICKSTART.md) and [SETUP.md](SETUP.md); this is the complete, verified guide. There is **no backend to run**: the "backend" is a Supabase project
(hosted, or the local Supabase stack used by tests).

## 1. Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| Node.js | ≥ 20 (`engines`); CI uses 22 | everything |
| pnpm | 10.28.0 (`packageManager`) | workspace install and scripts |
| Git | any | clone, `git diff` checks |
| A Supabase project (free tier is enough) | — | real data, auth, sync (optional for local DEV mode) |
| Deno 2.x | optional | `supabase/functions/send-reminders` tests |
| Supabase CLI + Docker | optional | `supabase start` (API-level RLS tests), `db push` |
| PostgreSQL server binaries | optional | `pnpm test:pg` real-Postgres concurrency tests (skipped if absent) |
| Playwright Chromium | optional | `pnpm test:e2e` |
| Android Studio / Xcode | optional | local native builds (`expo run:android` / `run:ios`) |
| EAS CLI + Expo account | optional | cloud mobile builds |

## 2. Install

```bash
git clone <repository-url> LifeTrack && cd LifeTrack
pnpm install            # installs the whole workspace: apps/*, packages/*, supabase/tests
```

If `pnpm` is not on your PATH: `corepack enable` (Node ≥ 20), or run the pinned version on demand with `npx --yes pnpm@10.28.0 <command>`.

Workspace layout: `pnpm-workspace.yaml` lists `apps/*`, `packages/*` and `supabase/tests`. Shared packages are consumed as source (`workspace:*`), so there is no package build step.

## 3. Environment configuration

Only **public** values are ever configured. Never put a service-role key anywhere in this repository or in client builds.

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `apps/web/.env.local` (copy `apps/web/.env.example`) or the host's build environment | Web → Supabase. Inlined at build time |
| `VITE_LOCAL_MODE=true` (alias `VITE_ALLOW_DEV_MODE=1`) | Only for the hermetic E2E build | Forces the in-browser backend in a production build. **Never ship** |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `apps/mobile/.env.local` (copy `.env.example`) / EAS env | Mobile → Supabase |
| `EXPO_PUBLIC_WEB_URL` | `apps/mobile/.env.local` / EAS env | Where the mobile app loads the exercise catalog/photos and legal pages from. Required for production builds |
| `EAS_PROJECT_ID`, `GOOGLE_SERVICES_JSON` (file secret), `APP_IOS_BUNDLE_ID`, `APP_ANDROID_PACKAGE` | EAS / CI | Push tokens, FCM, bundle ids (defaults `com.aatralex.lifetrack`) |
| `CRON_SECRET`, `EXPO_ACCESS_TOKEN` | `supabase secrets set …` | Edge Function only |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` | GitHub Environment secrets/variables | Manual deploy workflows |
| `E2E_CLOUD`, `E2E_EMAIL`, `E2E_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `REQUIRE_BACKEND`, `REQUIRE_POSTGRES`, `PW_CHROMIUM_PATH` | Test tooling | See [TESTING.md](TESTING.md) |

> The repository root also has a git-ignored `.env`. Vite only reads `apps/web`, so the root file is **not** picked up by the web app. If you want the web app on a real project, put the values in `apps/web/.env.local`.

## 4. Database setup

1. Create a Supabase project (choose the region nearest you).
2. SQL Editor → paste and run **`supabase/setup-all.sql`** (all migrations `0001`–`0010`, idempotent). Or with the CLI: `supabase link --project-ref <ref> && supabase db push`.
3. Project Settings → API → copy the URL and the anon/publishable key into the `.env.local` files above.
4. Authentication → URL Configuration: Site URL = your web URL; Redirect URLs: `<web-url>/reset-password`, `http://localhost:5173/reset-password`, `lifetrack://**`, `exp+lifetrack://**` (dev client).
5. Authentication → Providers → Email: keep confirmation **on** for real use (turn off only for a personal project). Consider disabling sign-ups once your account exists.
6. Optional (reminder push): deploy the Edge Function and schedule it — [NATIVE.md](NATIVE.md) steps 1–6.

For an **existing** project apply only the migrations it lacks, in order ([DATABASE.md §7](DATABASE.md)). `SETUP.md` and `QUICKSTART.md` still list fewer migrations than exist; trust the repository.

## 5. Run the web app

```bash
pnpm dev                     # http://localhost:5173 (Vite, host exposed on the LAN)
pnpm build                   # production build → apps/web/dist (prebuild verifies exercise images)
pnpm --filter @lifetrack/web preview   # serves dist on :4173
```

- With **no** Supabase variables, `pnpm dev` runs in **DEV mode**: an orange banner appears, data and accounts live in that browser only (`localStorage`), and password reset does not work. A production build without
  variables refuses to start ("not connected to a database").
- With variables, the dev server talks to your real project — use a throwaway project for experiments.

## 6. Run the mobile app

```bash
cd apps/mobile
cp .env.example .env.local        # fill in the PUBLIC values and EXPO_PUBLIC_WEB_URL
pnpm start                        # Metro; needs a development build, not Expo Go
pnpm android                      # or: pnpm ios   (local native build)
```

Native modules (SecureStore, dev client, notifications) require a **development build** (`eas build --profile development`, or `expo run:*`). The generated `apps/mobile/android/` folder is git-ignored.

## 7. Running the backend

There is nothing to start for development. To run the whole Supabase stack locally (used by API-level tests):

```bash
supabase start            # applies supabase/migrations; config in supabase/config.toml (API :54321, DB :54322)
supabase status -o env    # shows API_URL and ANON_KEY (public)
```

## 8. Development commands

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` | Web dev server / production build |
| `pnpm typecheck` | `tsc --noEmit` in every package that defines it |
| `pnpm lint`, `pnpm lint:fix` | ESLint (web) |
| `pnpm format`, `pnpm format:check` | Prettier (`apps/web/src`, `tests`, `e2e`) |
| `pnpm test` | All Vitest suites (`pnpm -r --if-present test`) |
| `pnpm test:coverage` | Same with coverage gates |
| `pnpm test:rn` | Jest + `jest-expo` component tests (mobile) |
| `pnpm test:e2e` | Playwright (builds and previews in local mode) |
| `pnpm test:sql`, `pnpm test:rls`, `pnpm test:pg` | PGlite SQL checks · table-driven RLS suite · real-PostgreSQL concurrency tests |
| `pnpm check:secrets` | Fails if a service-role/secret key appears in client sources or build output |
| `pnpm sql:build`, `pnpm check:sql-drift` | Regenerate `supabase/setup-all.sql` / fail if it differs from the migrations |
| `pnpm check:migrations` | Fail on destructive SQL without an allow marker |
| `pnpm audit:gate` | Fail on new production-dependency advisories |
| `pnpm verify:bundles` | Prove production bundles contain no dev backend |
| `pnpm --filter @lifetrack/web exercises:check` / `exercises:sync` | Verify / repair exercise photos |
| `node scripts/sync-function-core.mjs` | Refresh the Edge Function's copy of shared reminder code |
| `pnpm verify` | The complete local gate (typecheck, lint, format, secrets, coverage, RN tests, RLS, SQL, drift, migration safety) |
| `pnpm --filter @lifetrack/mobile export` | Prove Android and iOS bundles build |

## 9. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "LifeTrack isn't configured" / "not connected to a database" | A production build had no `VITE_SUPABASE_*`. Set them before building (they are inlined at build time) |
| Orange DEV banner, data disappears in another browser | You are in DEV mode (no env variables). Add `apps/web/.env.local` |
| "Your database is missing the latest LifeTrack tables…" | A migration has not been applied. Run the missing ones in order (the message names 0003 only) |
| Nutrition screens error or show nothing | `0009_nutrition.sql` / `0010_food_database.sql` not applied |
| "That record already exists." on restore/save | A unique index fired; usually another device already created it — refetch |
| Sign-up works but sign-in says "Incorrect email or password" | Email confirmation is on and the link has not been clicked; or wrong password |
| Reset-password link opens the wrong page | Redirect URLs in Supabase Auth do not include `<web-url>/reset-password` / `lifetrack://**` |
| Mobile "Native module … not found" | You are using Expo Go; use a development build |
| Mobile exercise database empty | `EXPO_PUBLIC_WEB_URL` missing or the web deployment does not serve `/exercises/` |
| No reminder pushes | Edge Function not deployed/scheduled, `CRON_SECRET` mismatch, or push permission denied — see [NATIVE.md](NATIVE.md) |
| `pnpm build` fails at `prebuild` | An exercise image is missing/altered and the network is unavailable; run `pnpm --filter @lifetrack/web exercises:sync` online |
| `test:pg` skipped | No PostgreSQL server binaries found; install PostgreSQL or ignore locally (CI requires it) |
| Playwright cannot find a browser | `pnpm --filter @lifetrack/web exec playwright install chromium`, or set `PW_CHROMIUM_PATH` |
| Tailwind classes missing after editing `tailwind.config.js` | Restart the dev server |
| Android release APK crashes on an x86_64 emulator | Release APKs are ARM-only; build a debug APK for x86_64 or use a device |
