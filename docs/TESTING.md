# Testing

Counts below are the number of declared `it(`/`test(`/`Deno.test(` blocks found by static search (parameterised `describe.each` suites expand into more at run time). They were **not re-run** for this documentation task;
run the commands to get live results.

| Layer | Runner | Location | Files | Declared cases |
| --- | --- | --- | --- | --- |
| Shared domain logic | Vitest | `packages/core/tests` | 22 | 259 |
| Data layer + adapter contract | Vitest | `packages/data/tests` | 4 | 65 |
| Zod schemas, drift against SQL | Vitest | `packages/schemas/tests` | 10 | 54 |
| Utils (dates, money, text) | Vitest | `packages/utils/tests` | 5 | 38 |
| Design tokens ↔ CSS sync | Vitest | `packages/design-tokens/tests` | 1 | 2 |
| Web unit + component (jsdom, React Testing Library) | Vitest | `apps/web/tests` | 44 | 609 |
| Web end-to-end | Playwright | `apps/web/e2e` | 19 specs | 105 |
| Mobile logic and flows | Vitest | `apps/mobile/tests` | 21 | 229 |
| Mobile components | Jest + `jest-expo` + RN Testing Library | `apps/mobile/tests-rn` | 9 | 125 |
| Mobile device flows | Maestro (YAML) | `apps/mobile/.maestro` | 3 flows + screenshot capture | not run |
| Database: RLS, constraints, triggers, RPCs | Vitest + PGlite (in-memory Postgres) | `supabase/tests/pglite` | 1 (table-driven) | part of 39 |
| Database: concurrency on real PostgreSQL | Vitest + local `postgres` cluster | `supabase/tests/postgres` | 1 | part of 39 |
| Database: migration safety rules | Vitest | `supabase/tests/static` | 1 | part of 39 |
| Security: app lock, gate, passkey functions, password hook | Vitest + PGlite | `supabase/tests/pglite/security.test.ts` | 1 | 140 |
| Security: WebAuthn verifier, rules, Edge Function decisions | Vitest + a software authenticator | `packages/core/tests/{security,webauthn,webauthn-function}.test.js` | 3 | 106 |
| Security: lock screen, Security page, dev backend | Vitest + Testing Library | `apps/web/tests/{securityUi,localSecurity,devAuthSecurity,securityBackends}.test.*` | 4 | 89 |
| Security: real browser incl. a WebAuthn virtual authenticator | Playwright | `apps/web/e2e/security*.spec.js` | 2 | 20 |
| Device keys: migration 0014 (the phone's biometric keys) | Vitest + PGlite | `supabase/tests/pglite/deviceKeys.test.ts` | 1 | 58 |
| Device keys: verifier, `device-key` function decisions, client API | Vitest + a software phone (OpenSSL) | `packages/core/tests/device-key*.test.js`, `packages/data/tests/deviceKeys.test.js` | 3 | 56 |
| Mobile app lock: signer, device-key service against the real function logic, rules, controller | Vitest (fake clock, fake server) | `apps/mobile/tests/{ecdsa,deviceKey,lockPolicy,lockController}.test.ts` | 4 | 122 |
| Mobile app lock: root Gate, lock screen, PIN pad, Security screen, notification remount | jest-expo + RN Testing Library | `apps/mobile/tests-rn/{gate,lockScreen,securityScreen,notificationBootstrap}.test.tsx` | 4 | 67 |
| Mobile app lock: Android and iOS Hermes bundles | `expo export --platform android --platform ios` | `apps/mobile` | — | builds |
| Database: RLS over the real HTTP API | Vitest | `supabase/tests/api` | 1 | part of 39 |
| Edge Function | `deno test` | `supabase/functions/send-reminders/index.test.ts` | 1 | 2 |
| Pipeline scripts | Node | `scripts/verify-sql.mjs`, `check-*.mjs`, `audit-gate.mjs` | — | — |
| **Total declared** | | | | **≈ 1,590** |

## 1. Unit testing

- Pure domain code is tested exhaustively and gated by coverage thresholds in each `vitest.config.ts`: `utils` 98 % lines / 95 % branches, `data` 98 / 92, `schemas` 95 / 80, `core` 93 / 82, `design-tokens` 85 / 0, mobile 88 / 88; web gates
  `src/services/**` at 95 % lines / 80 % branches (screens and hooks are covered by component tests and Playwright instead).
- **Parity**: `packages/core/tests/parity.test.js` and `apps/mobile/tests/parity.test.ts` run a golden dataset so web and mobile produce identical numbers.
- **Food database**: `packages/core/tests/foodDatabase.test.js` checks permanent keys, unique names/aliases, serving data, 4/4/9 calorie agreement, estimate-basis honesty, Tamil/spelling search, 100 g servings, custom weights, duplicates and
  that old logs stay valid; `nutrition.test.js`, `packages/schemas/tests/nutrition-form.test.ts` cover arithmetic and forms.
- **Exercise database**: `exerciseCatalog.test.js`, `apps/web/tests/exerciseLibrary.test.jsx`.
- **Reminders**: `send-reminders.test.js` plus the Deno test; a test also fails when the Edge Function's generated copy of `packages/core/src/reminders.js` is stale.

## 2. Integration testing

- `packages/data/tests` runs the same **adapter contract** (`src/testing/adapterContract.js`) against an in-memory fake Supabase (`memorySupabase.js`) and the web `localAdapter`.
- Web store behaviour (stale-fetch discarding, Realtime application, retries): `store.test.js`, `store-sync.test.js`.
- Backup/CSV round-trips: `backup.test.js`, `backup-csv.test.js`, `csv.test.js`.
- Mobile flows exercise `createApi` over the real query store: `tests/flows*.test.ts` (planner/habits, jobs, finance, fitness, health, notes, nutrition…).
- `apps/mobile/tests-rn/screens.test.tsx` renders every mobile screen with real and empty data — the closest check to a device without a Supabase account.

## 3. API testing

| Suite | What it proves | Needs |
| --- | --- | --- |
| `supabase/tests/pglite/rls.test.ts` | For **every** user table: other users cannot see/update/delete rows, cannot insert rows owned by someone else or hand rows over, `anon` has no access; every cross-table foreign key rejects another user's parent; fails if a new table/FK lacks a fixture (`fixtures.ts`) | nothing (in-memory) |
| `scripts/verify-sql.mjs` (`pnpm test:sql`) | Migrations apply cleanly; history trigger; key constraints | nothing |
| `supabase/tests/postgres/increments.test.ts` | Concurrent `add_water` / `add_savings` / `log_water` never lose increments | PostgreSQL binaries (`REQUIRE_POSTGRES=1` in CI; skipped locally if absent) |
| `supabase/tests/api/rls.api.test.ts` | The same isolation through PostgREST with real JWTs, atomic counters, push tokens | `supabase start` + `SUPABASE_URL`/`SUPABASE_ANON_KEY` (`REQUIRE_BACKEND=1` in CI). **Never run in a live environment** |
| `supabase/functions/send-reminders/index.test.ts` | 401 without secret; due reminder → notification insert → reminder advance → Expo push, with `fetch` stubbed | Deno |

## 4. Frontend testing

- Component tests: `apps/web/tests/*.test.jsx` (auth pages, banners, components, error boundary, finance, fitness, focus, goals, health, jobs, learning/habits, loaders, motion, notifications, nutrition, overview, planner/notes, quick actions,
  settings/export, show-more…). Setup in `tests/setup.js`; custom pickers helpers in `tests/pickers.js`.
- Playwright (`apps/web/playwright.config.js`): `workers: 1`, `serviceWorkers: 'block'` (except `pwa.spec.js`), projects **desktop** (1280×800, everything except `responsive*`) and **mobile** (Pixel 7, `responsive*` only), web server =
  `pnpm build && pnpm preview` with `VITE_LOCAL_MODE=true` so the suite is hermetic (in-browser backend). Specs: `auth`, `modules`, `finance`, `fitness`, `focus`, `nutrition`, `exercise-library`, `notifications`, `recurring`, `settings`, `sync`,
  `phase6`, `pwa`, `loaders`, `a11y`, `ux-audit`, `responsive`, `responsive-audit`, and `cloud-sync` (two devices against a real project, only with `E2E_CLOUD=1`).
- Playwright traces are uploaded as an artifact on CI failure (`playwright-traces`).

## 5. Responsive testing

`e2e/responsive.spec.js` and `responsive-audit.spec.js` run on the Pixel 7 profile; `ux-audit.spec.js` and `a11y.spec.js` run on desktop. Results of the audit are in [UX_AUDIT.md](UX_AUDIT.md) ("Responsive testing"). Not covered: tablets,
foldables, physical devices, widths between the two profiles.

## 6. Security testing

`supabase/tests` (RLS), `scripts/check-no-secrets.mjs` (sources + web + mobile bundles), `apps/web/tests/noSecrets.test.js`, `verify:bundles`, `check:migrations`, `audit:gate` (dependency advisories), `legalReady.test.js`, Edge Function auth tests.
No fuzzing, DAST, penetration test or third-party security review exists ([SECURITY.md](SECURITY.md) §8).

## 7. Regression testing

The PR gate (`ci.yml`) runs: typecheck + lint + format + secrets + SQL drift + migration safety; unit/component tests with coverage; RLS/SQL/Postgres tests; Edge Function (Deno) with generated-copy drift check; web build + bundle checks +
Playwright; mobile `expo export` for Android and iOS plus a secrets scan; a dependency audit job. `ci-backend.yml` (nightly/on demand) starts a real Supabase stack. Local equivalent: `pnpm verify` then `pnpm test:e2e`.

## 8. Not covered / unproven

- GitHub Actions workflows, the real-Supabase suite, EAS builds, Maestro flows and push delivery have not run in a live environment.
- No device testing of the native apps; no TalkBack/VoiceOver testing; no load/performance regression tests beyond `apps/web/scripts/measure-perf.mjs` (lab numbers).
- The mobile exercise database loads its catalog from the deployed web app; the automated tests (`tests-rn/exerciseDatabase.test.tsx`) do not hit a real deployment.
- The web `lint` and `format:check` scripts cover only `apps/web`; other packages are covered by `tsc` only.

## 9. How to run

See [INSTALLATION.md §8](INSTALLATION.md) for the commands and [INSTALLATION.md §9](INSTALLATION.md) for troubleshooting (Playwright browser location via `PW_CHROMIUM_PATH`, `test:pg` skipping when PostgreSQL binaries are absent).
