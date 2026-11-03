# CI/CD map

| Workflow | Starts | What it proves | Run it locally |
|---|---|---|---|
| `ci.yml` (PR gate) | every PR, pushes to main | typecheck, secrets scan, `setup-all.sql` and migration checks; all unit/component tests with coverage gates; RLS + real-PostgreSQL tests; Deno tests of the Edge Function; web build + Playwright; mobile bundle | `pnpm verify` (+ `pnpm test:e2e`, `pnpm --filter @lifetrack/mobile export`) |
| `ci-backend.yml` | nightly, manual, PRs touching `supabase/**` / data layer | migrations on a real Supabase stack, RLS through the HTTP API, two-device Realtime sync | `supabase start`, then see *API-level RLS* in SETUP.md |
| `mobile-build.yml` | manual or `mobile-v*` tag; **off** until `EAS_ENABLED=true` | EAS preview/production builds after the same gates | docs/NATIVE.md |
| `db-migrate.yml` | manual only | dry run, safety check, then apply to staging/production | docs/DEPLOY.md |
| `deploy-functions.yml` | manual only | tests then deploys `send-reminders` | docs/DEPLOY.md |
| `deploy-web.yml` | manual only | production build + bundle secrets scan, artifact | docs/DEPLOY.md |

## Required status checks
After the first green run of `ci.yml`, require these jobs in *Settings > Branches > Branch protection*:
`Typecheck, secrets, SQL drift`, `Unit and component tests (with coverage gates)`, `RLS, SQL and real-PostgreSQL tests`,
`Edge Function (Deno)`, `Web build and Playwright e2e`, `Mobile bundle (Android + iOS)`. Do **not** require *Backend (real Supabase stack)*
until it has been green for a while; it is slower and depends on the Supabase CLI image.

## Secrets and variables
No workflow needs the Supabase service-role key. Per-Environment values are listed in DEPLOY.md; `EXPO_TOKEN` and `EAS_ENABLED` in NATIVE.md.
Workflows request `contents: read` only.

## Dependencies
Dependabot opens grouped weekly PRs. Expo SDK packages and React are deliberately **ignored**: they must move together
(`npx expo install --check`, then the mobile tests and `expo export`). Upgrade them as one planned change.

## Pinning actions
Actions are referenced by major tag (`actions/checkout@v4`) so the first runs are not blocked by a typo'd hash. Once the pipeline is green, pin
each to its full commit SHA (Dependabot keeps SHA-pinned actions updated) to protect against a moved tag.

## When CI fails
- *Typecheck / unit*: run the same command locally; the log names the file.
- *SQL drift*: run `pnpm sql:build` and commit `supabase/setup-all.sql`.
- *Function drift*: run `node scripts/sync-function-core.mjs` and commit `supabase/functions/_shared`.
- *Migration safety*: the migration drops or rewrites data. Make it additive, or review and add the allow marker (see DEPLOY.md).
- *RLS suite "has no ownership test"*: a new table or foreign key needs a fixture in `supabase/tests/pglite/fixtures.ts`.
- *Playwright*: download the `playwright-traces` artifact and open it with `npx playwright show-trace`.
