# Architecture conventions

Modules are migrated to this layout one at a time (done: **Planner**, **Notes & Journal**, **Learning**, **Habits**, **Finance**, **Jobs**, **Fitness**, **Health**, **Goals**, **Focus**, **Notifications**, **Settings**, **Export**, **Analytics**, **Reports**, **Overview** — every page now lives under `src/features/`; `src/pages/` no longer exists).

```
src/
  features/<module>/      everything that belongs to one module
    <Module>Page.jsx      route component: wires data + state, little markup logic (lazy-loaded from App.jsx)
    *Dialog.jsx           create/edit forms (React Hook Form + Zod via useDialogForm)
    *Card.jsx, *List.jsx  presentational pieces; actions arrive as callbacks
  domain/                 pure functions (no React, no Supabase): grouping, scoring, filtering. Unit-tested.
  hooks/                  cross-feature hooks (store/useTable, useAction, useDialogForm, useEntityForm, useSettings…)
  services/               the only code that talks to Supabase or the local dev backend (db, auth, api, backup, csv)
  components/ui|shared|layout|loaders   design-system primitives and app chrome
  lib/                    small helpers (dates, money, validation, markdown)
```

Rules of thumb

- **Pure logic goes in `domain/`**, with a unit test. A page should read as: load data → derive with a domain function → render.
- **Forms**: `useDialogForm` + a Zod schema built from `lib/validation.js` (`optionalDay`, `requiredDay`, `moneyField`, `nonNegativeNumber`, `optionalNumber`). No `eslint-disable` for
  "reset when the dialog opens" — the hook already does it correctly.
- **Delete flows**: `useConfirmedDelete(table, toast)` = confirm dialog + delete + toast + duplicate-submit protection.
- **Create/edit dialogs for a single row** can use `useEntityForm` (it wraps `useDialogForm` and saves through `services/api.js#saveRow`); dialogs with custom saves use `useDialogForm` directly.
- **Realtime**: `hooks/store` applies Realtime row changes straight to the cache (`applyChange`) and discards fetches that started before a local write; multi-row/counter operations run as database functions (`add_water`, `replace_exercise_logs`, migration `0004_hardening.sql`) via `store.rpc`.
- **Writes** go through `hooks/store` (`insert/update/upsert/remove`) or a domain operation in `services/api.js`; UI never calls Supabase.
- **Forms bound to a stored record** (a day's journal, a day's health log) use `useRecordForm`: remote changes update fields you have not touched and never overwrite what you are typing.
- **Unsaved input is never overwritten** by a background refresh (see `features/notes/Journal.jsx`).
- Every module keeps (a) unit tests for its domain logic, (b) component tests for its forms, (c) an E2E flow.
