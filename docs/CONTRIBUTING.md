# Contributing

LifeTrack is a proprietary project (see `LICENSE`); this guide is for people working in the repository. The pull-request checklist is `.github/pull_request_template.md`; `.github/CODEOWNERS` requests the owner's review for everything and especially
`supabase/migrations`, `supabase/functions`, `.github`, `scripts`, `apps/mobile/app.config.ts` and `eas.json`.

## 1. Workflow

1. Branch from the default branch (`claude/tender-planck-szrekq` at the time of writing, per `ci.yml`).
2. Set up as in [INSTALLATION.md](INSTALLATION.md); use a throwaway Supabase project for anything that writes data.
3. Make a focused change. Commit messages follow the conventional style seen in history: `feat(nutrition): …`, `fix(health): …`, `chore(mobile): …`, `ci: …`, `docs: …`, `test: …`.
4. Run `pnpm verify` (typecheck, lint, format, secrets, coverage, RN tests, RLS, SQL, drift, migration safety) and, for UI changes, `pnpm test:e2e`.
5. Add an entry under **Unreleased** in `CHANGELOG.md` (required in every PR) and update docs ([§8](#8-documentation)).
6. Open a PR using the template; CI (`ci.yml`) must be green.

## 2. Architecture rules (from the original `docs/ARCHITECTURE.md`, still current)

Web modules live in `apps/web/src/features/<module>/`:

```text
features/<module>/      everything that belongs to one module
  <Module>Page.jsx      route component: wires data + state, little markup logic (lazy-loaded from App.jsx)
  *Dialog.jsx           create/edit forms (React Hook Form + Zod via useDialogForm)
  *Card.jsx, *List.jsx  presentational pieces; actions arrive as callbacks
domain/                 one-line re-exports of pure rules (no React, no Supabase)
hooks/                  cross-feature hooks (store/useTable, useAction, useDialogForm, useEntityForm, useSettings…)
services/               the only code that talks to Supabase or the local dev backend (db, auth, api, backup, csv)
components/ui|shared|layout|loaders   design-system primitives and app chrome
lib/                    small helpers (dates, money, validation, markdown)
```

- **Pure logic goes in `packages/core`** with a unit test. A page should read: load data → derive with a core function → render. Never copy logic between web and mobile.
- **Forms:** `useDialogForm` + a Zod schema built from `lib/validation.js` (`optionalDay`, `requiredDay`, `moneyField`, `nonNegativeNumber`, `optionalNumber`). Do not add `eslint-disable` for "reset when the dialog opens" — the hook handles it.
  A single-row dialog can use `useEntityForm` (saves through `services/api.js#saveRow`); bound records (a day's journal or health log) use `useRecordForm` so remote changes never overwrite what is being typed.
- **Deletes:** `useConfirmedDelete(table, toast)` = confirm + delete + toast + duplicate-submit protection.
- **Writes** go through `hooks/store` (`insert/update/upsert/remove`) or an operation in `packages/data/src/api.js`; **UI never calls Supabase directly**. Counter-style or multi-row writes become database functions invoked with `store.rpc`.
- **Realtime:** the store applies changes straight to the cache and discards fetches that started before a local write.
- **Quick add** (`features/quick`): `QuickActions.jsx` holds the menu; the forms in `QuickDialogs.jsx` load on first use. **Auth** (`features/auth`): `authForm.jsx` holds the shared schemas and helpers.
- **Unsaved input is never overwritten** by a background refresh.
- Every module keeps (a) unit tests for domain logic, (b) component tests for forms, (c) an E2E flow where it makes sense.

Product invariants (also in the PR template): **money in integer paise; dates as `yyyy-MM-dd` strings in the user's timezone; no AI-assistant features; no estimation presented as fact; web behaviour preserved.**

## 3. Code style

Prettier (`.prettierrc.json`: single quotes, no semicolons, trailing commas, 140 columns); ESLint 9 (`apps/web/eslint.config.js`: React + hooks rules, `eqeqeq`, `no-console` except `warn`/`error`). Lint/format scripts cover `apps/web` only; other workspaces
rely on `tsc --noEmit` (`pnpm typecheck`). Mobile is TypeScript. Prefer small pure functions and JSDoc on exported helpers.

## 4. Tests

Add the test with the change: pure logic in the package's `tests/`, forms/components in `apps/web/tests` (RTL) or `apps/mobile/tests-rn`, flows in `apps/mobile/tests`, journeys in `apps/web/e2e`. Keep coverage thresholds green
([TESTING.md](TESTING.md)). Parity-sensitive changes need an update to the golden datasets (`packages/core/tests/parity.test.js`, `apps/mobile/tests/parity.test.ts`).

## 5. Common tasks

### Add or change a database table or column

1. Create `supabase/migrations/00NN_description.sql` — **a new file, never an edit of an old one**. Make it additive and re-runnable (`create table if not exists`, `add column if not exists`).
2. For a user table: `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`, `enable` + `force row level security`, `revoke all … from anon`, policy `owner_all`, `set_updated_at` trigger, publish to `supabase_realtime`, indexes
   for `(user_id, …)` and foreign keys, `check_fk_owner` triggers for every cross-table reference (copy the pattern in `0009_nutrition.sql`).
3. Run `pnpm sql:build` (regenerates `supabase/setup-all.sql`); `pnpm check:migrations` must pass or the file needs `-- lifetrack:allow-destructive <reason>` after review.
4. Mirror it in `packages/constants/src/schema.js` (`TABLES` in parent-before-child order, `DEFAULTS`, `UNIQUES`, `CONFLICT_KEYS`), `packages/schemas/src/tables.ts`, and a fixture in `supabase/tests/pglite/fixtures.ts` (the RLS suite fails without one).
5. Update [DATABASE.md](DATABASE.md), [API.md](API.md) if an RPC is added, the backup/CSV lists if the table should be exported (`EXPORTABLE`), and the changelog (state which migration to run before release).

### Add a built-in food

See [FOOD_NUTRITION.md §10](FOOD_NUTRITION.md). Keys are permanent; never delete or rename.

### Add or refresh the exercise database

`node scripts/sync-exercise-db.mjs --refresh` (network), review the diff, run `exercises:check`, commit `catalog.json`, `images.sha256.json` and any new photos. Keep the Unlicense attribution files.

### Add a module

Page under `apps/web/src/features/<module>/`, lazy route in `App.jsx`, nav entry in `lib/nav.js`, accent in `packages/design-tokens` **and** `index.css` (a test keeps them in sync), core logic + tests, mobile screen under `apps/mobile/app/(app)/module/` and an entry in
`src/lib/modules.ts`, a help guide in `features/help/helpContent.js`, parity row in [PARITY.md](PARITY.md).

### Change reminder logic

Edit `packages/core/src/reminders.js`, then `node scripts/sync-function-core.mjs`, commit `supabase/functions/_shared`.

## 6. Security checklist for contributors

No service-role or secret keys in code, env examples, logs or docs · no `dangerouslySetInnerHTML` · user text is rendered through React or the Markdown tokenizer · new tables have RLS and ownership guards · new RPCs `revoke … from public, anon` and set `search_path` · run `pnpm check:secrets`.

## 7. Releases

Follow [RELEASE.md](RELEASE.md). Bump `version` in `apps/mobile/app.config.ts` (and `apps/web/package.json`), move the changelog's Unreleased entries into a version heading, apply migrations before shipping builds that need them.

## 8. Documentation

Update the relevant document when behaviour, setup, commands, schema or API change. Mark status honestly (✅ / 🟡 / 📋 / ❌), cite real file paths, never describe planned work as implemented, and keep secrets out of documents. After editing docs, check links and Mermaid diagrams
(see the verification notes in [CHANGELOG.md](CHANGELOG.md)).
