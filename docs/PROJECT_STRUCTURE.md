# Project structure

A pnpm monorepo (`pnpm-workspace.yaml`: `apps/*`, `packages/*`, `supabase/tests`). Shared packages are consumed as TypeScript/JavaScript **source** through `workspace:*` and `exports`, so there is no package build step.

```text
LifeTrack/
├── apps/
│   ├── web/                 React + Vite PWA  (@lifetrack/web)
│   └── mobile/              Expo + React Native app  (@lifetrack/mobile)
├── packages/
│   ├── core/                Pure domain rules shared by both apps
│   ├── data/                Supabase adapter, auth wrapper, createApi, error mapping
│   ├── schemas/             Zod schemas: table rows, forms, auth
│   ├── constants/           Defaults, table metadata, 293 built-in foods
│   ├── utils/               Dates, money, ids, text
│   ├── design-tokens/       Colours, module accents, motion, radius, spacing
│   └── types/               Inferred TypeScript types from the schemas
├── supabase/
│   ├── migrations/          0001 … 0010 (additive SQL)
│   ├── setup-all.sql        Generated concatenation of the migrations
│   ├── functions/           send-reminders (Deno Edge Function) + _shared (generated copy of core code)
│   ├── tests/               RLS, SQL, concurrency, API and migration-safety tests (@lifetrack/db-tests)
│   └── config.toml          Local Supabase stack used by tests only
├── scripts/                 Repo-level Node/shell tooling (see §5)
├── docs/                    This documentation, runbooks, legal drafts, store copy
├── .github/                 Workflows, Dependabot, CODEOWNERS, PR template
├── README.md  CHANGELOG.md  SECURITY.md  LICENSE
├── package.json  pnpm-lock.yaml  pnpm-workspace.yaml  tsconfig.base.json
├── .prettierrc.json  .prettierignore  .audit-allowlist.json  .npmrc
└── (local only, git-ignored) .env, node_modules, coverage, dist, *.apk
```

Not part of the product: `.claude/` (untracked local tooling config), `LifeTrack-*.apk` (release builds at the root, ignored by `.gitignore` `*.apk`), `.DS_Store`.

## 1. `apps/web`

```text
apps/web/
├── index.html  vite.config.js  tailwind.config.js  postcss.config.js  eslint.config.js  playwright.config.js  vercel.json
├── public/                  PWA icons, theme-init.js (anti-flash), _headers, _redirects, brand/, exercises/ (876 exercises, ≈ 99 MB)
├── scripts/                 resolve-backend.js (build-time backend choice), generate-icons, generate-mobile-assets, measure-perf, verify-bundles
├── src/
│   ├── main.jsx  App.jsx    Entry (ErrorBoundary, router, PWA register) and the route table
│   ├── features/<module>/   One folder per module: *Page.jsx (route), *Dialog.jsx (forms), *Card/*Tab/*List (presentation)
│   │   analytics auth export finance fitness(+catalog) focus goals habits health help jobs learning legal
│   │   notes notifications nutrition overview(dashboard) planner quick reports settings
│   ├── components/
│   │   ├── ui/              Design-system primitives (button, card, dialog, form, menu, pickers, popup, tooltip, misc)
│   │   ├── shared/          App-level building blocks (PageHeader, StatCard, FormDialog, Confirm, charts, states, ErrorBoundary…)
│   │   ├── layout/          AppShell, Sidebar, MobileNav, GlobalSearch, NotificationBell, ProfileMenu, StatusIndicators
│   │   ├── loaders/         Branded loading states
│   │   └── motion/          Motion primitives and tokens
│   ├── domain/              One-line re-exports of @lifetrack/core(/web) and constants
│   ├── hooks/               store.js (cache), useAuth, useAction, useDialogForm, useEntityForm, useRecordForm, useSettings, useTheme, useToday…
│   ├── services/            api.js (createApi), auth.js, db.js, backup.js, csv.js, localAdapter.js (DEV backend), errors/session re-exports
│   ├── lib/                 backend.js, supabase.js, nav.js, modules.js, validation.js, format/dates/money helpers, markdown renderer, celebrate
│   └── index.css            Tokens as CSS variables, module accents, utilities (.lt-*), print and reduced-motion rules
├── tests/                   Vitest + RTL (44 files)       e2e/   Playwright (19 specs + helpers.js)
└── dist/ dist-perf/ coverage/ test-results/   Build and test output (ignored)
```

## 2. `apps/mobile`

```text
apps/mobile/
├── app.config.ts  eas.json  metro.config.js  jest.config.js  vitest.config.ts  tsconfig.json  .env.example
├── app/                     Expo Router routes
│   ├── _layout.tsx  +not-found.tsx  auth-callback.tsx  reset-password.tsx
│   ├── (auth)/              index, sign-in, sign-up, forgot-password
│   └── (app)/               _layout, help, sync-check, (tabs)/{index, planner, habits, finance, more}, module/{analytics, fitness, focus, goals, health, jobs, learning, notes, notifications, nutrition, settings}
├── src/
│   ├── data/                client.ts (QueryClient + createApi), queryStore.ts, useTable.ts
│   ├── features/            Forms and widgets per module (dashboard, finance, fitness incl. ExerciseDatabase, goals, habits, health, jobs, learning, notes, notifications incl. push, nutrition, planner, quick, reminders, settings)
│   ├── hooks/ lib/ providers/ ui/   Hooks, helpers (supabase, deepLinks, chunkedStorage…), Auth/Theme/Realtime providers, UI kit and motion
├── tests/ (Vitest, 17)  tests-rn/ (jest-expo, 5)  .maestro/ (device flows)
├── assets/                  Icons, splash, notification icon
└── android/                 Generated native project (git-ignored)
```

## 3. `packages/*`

| Package | Key files |
| --- | --- |
| `core` | One file per domain: `agenda, analytics, dashboard, exerciseCatalog, finance, fitness, focus, focusTimer, goals, habits, health, jobs, learning, notes, nutrition, progress, records, recurrence, recurring, reminders, report, score, sleep, streaks, tasks, upcoming` + `web/` variants. Subpath exports `@lifetrack/core/<file>` |
| `data` | `api.js` (31 operations), `supabaseAdapter.js`, `auth.js`, `client.js`, `errors.js`, `validatingAdapter.js`, `session.js`, `testing/` (adapter contract, in-memory Supabase) |
| `schemas` | `tables.ts` (row mirrors + drift test), `forms.ts` (form schemas and payload mappers), `auth.ts` |
| `constants` | `defaults.js` (topics, 26 exercises, colours), `schema.js` (table order, conflict keys, defaults, uniques), `foods.js` + `foods/*.js` |
| `utils` | `dates.ts`, `money.ts`, `id.ts`, `text.ts` |
| `design-tokens` | `index.ts` |
| `types` | `index.ts`, `check.ts` |

## 4. `supabase`

See [DATABASE.md](DATABASE.md) and [API.md](API.md). `functions/send-reminders/` = `index.ts` (Deno entry), `logic.js` (pure pipeline), `deno.json`/`deno.lock`, `index.test.ts`.
`functions/_shared/` = `reminders.js`, `dates.ts` — **generated** by `scripts/sync-function-core.mjs`; do not edit.
`tests/` = `pglite/` (RLS, fixtures), `postgres/` (real-cluster concurrency), `api/` (HTTP RLS), `static/` (migration safety).

## 5. `scripts/`

| Script | Purpose |
| --- | --- |
| `build-setup-sql.mjs` | Concatenate migrations → `supabase/setup-all.sql` (`pnpm sql:build`) |
| `verify-sql.mjs` | Apply migrations to PGlite and check RLS/constraints (`pnpm test:sql`) |
| `check-migration-safety.mjs` | Flag destructive migrations (`pnpm check:migrations`) |
| `check-no-secrets.mjs` | Scan sources/bundles for service-role keys (`pnpm check:secrets`) |
| `check-legal-ready.mjs` | Block production builds while legal drafts have placeholders |
| `audit-gate.mjs` | Dependency-advisory gate with allow-list |
| `sync-function-core.mjs` | Refresh the Edge Function's shared code |
| `sync-exercise-db.mjs` | Import/verify the Free Exercise DB |
| `release-android.sh` | One-command signed Android release |

## 6. `docs/`

Index and map: [README.md](README.md). The reference documents written in the 2026-11-10 documentation pass sit beside earlier runbooks ([SETUP.md](SETUP.md), [DEPLOY.md](DEPLOY.md), [RELEASE.md](RELEASE.md), [NATIVE.md](NATIVE.md), [CI.md](CI.md), [PARITY.md](PARITY.md),
[UX_AUDIT.md](UX_AUDIT.md), [RELEASE_AUDIT.md](RELEASE_AUDIT.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), [QUICKSTART.md](QUICKSTART.md)), `legal/` (privacy policy, terms, store data-safety — drafts rendered at `/privacy` and `/terms`) and `store/` (listing text, screenshot instructions).

## 7. Notable conventions

- Files: React components `PascalCase.jsx/tsx`; hooks `useThing`; domain files `camelCase.js`; migrations `NNNN_description.sql`.
- Imports: web uses the `@/` alias for `src`; shared packages use `@lifetrack/<name>[/subpath]`.
- Mobile code is TypeScript; web is JavaScript with JSDoc; packages mix `.js` (logic) and `.ts` (types/schemas/utils).
