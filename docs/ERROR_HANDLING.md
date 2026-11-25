# Error handling

Principle: **never lose typed data, never fail silently, never show internals.** Because the apps are online-first and writes are not optimistic, an error always means "this change did not happen".

## 1. Error normalisation

`packages/data/src/errors.js` (re-exported to both apps):

- `AppError(message, {code, isNetwork, cause})` — the only error type the UI displays.
- `toAppError(e)` maps anything thrown:

| Input | Result |
| --- | --- |
| Already an `AppError` | unchanged |
| Network failure (`TypeError` "fetch/network/load failed", `navigator.onLine === false`) | "Can't reach the server. Check your internet connection. Nothing was saved yet." (`isNetwork: true`) |
| Postgres/PostgREST code in the table below | friendly message, `code` preserved |
| Message matching `JWT` / `token … expired` | "Your session has expired. Please sign in again." (`code: 'jwt'`) |
| Anything else | the message if it is < 160 characters, otherwise "Something went wrong. Please try again." |

| Code | Message |
| --- | --- |
| `23505` | That record already exists. |
| `23503` | This item is linked to something that no longer exists. |
| `23514` | One of the values is not allowed. |
| `23502` | A required value is missing. |
| `42501` | You do not have permission to do that. Try signing in again. |
| `PGRST301` | Your session has expired. Please sign in again. |
| `PGRST205`, `42P01` | Your database is missing the latest LifeTrack tables… (points at migration 0003 — stale since 0004–0010 exist) |
| `PGRST116` | That record could not be found. |

Sign-in additionally maps "invalid login" to "Incorrect email or password." (`createSupabaseAuth.signIn`). Database function errors (`log_water`, `add_savings`, `replace_exercise_logs`…) raise readable messages that pass through (< 160 chars).

## 2. Where errors surface

| Mechanism | Behaviour | File |
| --- | --- | --- |
| `useAction(fn, {success, error})` | Locks against double submit (a ref, so two clicks in one render cannot both run), exposes `pending`, shows a **toast** with the mapped message on failure, resolves `undefined` so the caller keeps the form open | `apps/web/src/hooks/useAction.js` |
| Form validation | Zod messages inline under the field (`aria-invalid`, `aria-describedby`, `role="alert"`) | `components/ui/form.jsx` |
| Data load errors | `DataGate` shows `ErrorState` with **Try again** for a failed *first* load; a failed *background* refresh keeps the data on screen | `components/shared/states.jsx`, `hooks/store.js` |
| Save status | Header shows Saving… / Saved / **Save failed**; a leave-page prompt appears while a save is in flight | `components/layout/StatusIndicators.jsx` |
| Offline | Banner "You're offline. LifeTrack is online-only, so changes can't be saved until you reconnect."; the live-sync dot reads Offline | same |
| Misconfiguration | `ConfigError` screen when a production build has no Supabase variables; DEV banner when running the local backend | `ConfigError.jsx`, `Banners` |
| Render crashes | `ErrorBoundary` — `variant="page"` at the root, `variant="section"` around routed pages; `resetKey={pathname}` clears the error on navigation; **Try again** button | `components/shared/ErrorBoundary.jsx`, `main.jsx`, `AppShell.jsx` |
| Dismissing a dirty form | Confirmation before discarding typed input | `FormDialog` |
| Destructive actions | `Confirm` / `TypedConfirmDialog` (typed `ERASE`, account deletion); `useConfirmedDelete` adds duplicate-submit protection | `components/shared` |
| Undo | Toast with Undo after completing a task, logging food/water, marking rest/skip | various |

Mobile: `Txt`/`EmptyState`/`DataGate` equivalents in `src/ui/controls.tsx`; `confirm()` wrapper (`src/ui/confirm.ts`); forms keep sheets open on failure (`useZodForm`, `useAction`); offline writes fail visibly.

## 3. Concurrency and idempotency errors that are *expected*

Some failures are signals, not problems, and are swallowed deliberately:

| Operation | Code | Meaning | Handling |
| --- | --- | --- | --- |
| Completing a recurring task | `23505` on `(user_id, series_id, due_date)` | Another device already created the next occurrence | Ignored |
| Firing a reminder / inserting a notification | `23505` on `dedupe_key` | Already notified (server or another device) | Ignored (`null` returned in the Edge Function) |
| Posting a recurring transaction | `23505` on the occurrence index | Another device posted it | Ignored |
| Posting a recurring transaction | `23503` | Rule was deleted a moment ago | Skip the rule |
| Starting a study timer | `23505` on the one-running-timer index | A timer is already running (maybe on another device) | Refetch and show "A study timer is already running…" |
| Saving a copy of a built-in food | `23505` on `(user_id, base_key)` | Another device saved a copy first | Refetch and update that one |
| Saving a new workout's sets fails | any | Avoid half-saved workouts | The new workout row is deleted again, the error is shown |
| Cache write racing a fetch | — | A fetch started before a local write may hold an old snapshot | The store discards it and refetches (max 3 attempts) |

## 4. Edge Function

Returns `401` (no/incorrect secret or unset secret), `200` with counters, or `500 {"error"}` when a database call fails. Push failures never fail the run: inbox rows are already saved, errors are counted in `pushErrors`, and
`DeviceNotRegistered` tokens are deleted.

## 5. Backups and imports

`importBackup` wraps failures as `Import stopped at "<table>": <reason> Nothing was deleted; you can import the same file again to continue.` Restore is idempotent (upsert by id).

## 6. Logging and monitoring

- The apps do not send logs or analytics anywhere and contain no error-reporting SDK (no Sentry/Crashlytics). `ErrorBoundary.componentDidCatch` logs to the console only. **A crash in production is not reported to the developer.**
- Server-side visibility is limited to Supabase's own logs and `cron.job_run_details` ([RELEASE.md](RELEASE.md) §9 lists what to watch in the first week).

## 7. Known gaps

- The "missing tables" message names migration 0003 only.
- No central error reporting (see above).
- Mobile has no custom error boundary (none found under `apps/mobile/app` or `src`); it relies on Expo Router's default route error handling.
- `fireDueReminders` in `packages/data/src/api.js` still carries a comment saying there is "no background server push in this build", which is no longer true.
