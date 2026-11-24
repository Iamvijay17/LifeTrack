# Offline-first & smart sync (web)

Implemented Nov 24 2026. Web app only; mobile is unchanged. No new services, no paid dependencies, no AI.
The only new package is `fake-indexeddb` (dev dependency, tests only).

## What the person gets

- Install the app (already existed: `lib/install.js`, manifest, shortcuts) and open **any page they have opened before with no connection**.
- Lists and screens show the **last data from the server** (kept encrypted on the device) with a banner saying changes are saved on the device.
- Create, edit and delete work offline for every table written through the data store (tasks, habits, notes, finance, health, goals, jobs, calendar, and so on). Changes are queued and sent when the connection returns.
- **Sync pill** in the header (only appears when something is waiting, offline, signing in, or needs attention) and a **Sync Center** dialog listing each waiting change, with Try again / Discard for failures and a side-by-side chooser for conflicts.
- Nothing is lost silently, nothing newer on the server is overwritten silently.

## Architecture (what was inspected, what was added)

Existing: Supabase is the source of truth. `hooks/store.js` is an in-memory cache with optimistic writes; `@lifetrack/data` adapters (Supabase, and an in-browser dev adapter) do the I/O; RLS enforces ownership and module locks; every table has a server-owned `updated_at` (trigger `set_updated_at`); inserts already carried client-made UUIDs.

Added (all under `apps/web/src/sync/` unless noted):

| File | Role |
| --- | --- |
| `packages/core/src/offlineSync.js` | Pure rules: error classification, backoff, queue merging, conflict planning, per-field resolution |
| `idb.js` | Tiny IndexedDB wrapper (4 stores: keys, snapshots, outbox, meta) |
| `vault.js` | AES-GCM encryption at rest, non-extractable key held in IndexedDB |
| `snapshots.js` | Encrypted read cache, per user and table |
| `outbox.js` | Durable queue of unsent changes, shared between tabs (BroadcastChannel) |
| `engine.js` | Sends the queue in order; retry, backoff, conflicts, resolution |
| `index.js` | Front door used by the store and the UI (`useSyncStatus`, `useQueue`, actions) |
| `describe.js` | Plain-language descriptions for the Sync Center |
| `components/sync/SyncCenter.jsx` | Sync Center dialog |
| `components/layout/StatusIndicators.jsx` | `SyncPill`, updated offline banner |
| `public/sw-sync.js` | Service-worker Background Sync hook (wakes open windows only) |

Changed: `hooks/store.js` (queue instead of roll back on connection loss, overlay on refresh, hydrate on failed first load), `hooks/useAuth.jsx` (start/stop, wipe cache on sign-out), `features/security/SecurityProvider.jsx` (wipe cache on lock and on module-lock change), `AppShell.jsx`, `vite.config.js`, both data adapters.

## How each requirement is met

1. **PWA / installability** – existed; unchanged and verified (manifest, icons, shortcuts, `beforeinstallprompt` button).
2. **Service worker caching** – precache of the whole shell (163 entries: every route chunk, CSS, fonts, icons) with `navigateFallback`; exercise photos cache-first on first view; exercise catalog stale-while-revalidate; **Supabase API is `NetworkOnly`**; outdated caches cleaned up; auto-update retained.
3. **Offline access to loaded pages** – shell from the precache, data from the encrypted per-table snapshot (`load()` falls back to it on a connection failure and lays waiting changes over it). Verified with the server stopped (see testing).
4. **Local storage of changes** – IndexedDB outbox, encrypted, survives reload/restart, shared across tabs.
5. **Reliable queue** – strict order per row; a failing or conflicting change blocks only later changes to the same row; one request for a burst of edits to one row (coalescing); a row created and deleted offline never reaches the server; deletes of rows already gone count as done.
6. **Automatic sync** – on `online`, on tab focus, on a timer for the earliest retry, every 60 s while something is waiting, at startup, and via Background Sync where supported (it wakes open windows; see Limits).
7. **Conflict detection and safe resolution** – optimistic concurrency on `updated_at`, no database change needed:
   - the engine reads the server row, then writes with `ifUpdatedAt` (`UPDATE … WHERE updated_at = <seen>`); a write that loses the race cannot overwrite;
   - **different fields changed** on both sides → both edits are kept automatically;
   - **same field, different values** → the change stops, the server value stays, the person picks per field (this device / other device) in the Sync Center;
   - edited here, deleted elsewhere → restore my version, or let it stay deleted;
   - deleted here, edited elsewhere → keep it, or delete anyway;
   - keyed upserts (journal day, habit log, settings) resolve to insert-or-edit with the same rules; a row another device created for the same key while offline is a conflict, not an overwrite.
   - Choosing "mine" re-sends against the server row as it is *now*, so even that cannot overwrite something newer.
8. **Sync status** – header pill (offline with count, waiting, syncing, needs attention, sign in), offline banner, Sync Center with last-synced time and per-change status; the existing "All changes saved" indicator is untouched.
9. **No duplicate submissions** – every insert carries its final id; a repeat that hits "already exists" and finds the row counts as done; a single flush per tab (single-flight) and per browser (Web Locks); realtime echoes of rows with waiting changes are ignored; the outbox entry is removed only after the server confirms.
10. **Retry and backoff** – no connection: waits for `online`, not counted as an attempt, spacing 2 s up to 30 s; server hiccup (5xx, 429, timeout, connection-class SQLSTATE): 2 s, 4 s, 8 s … capped at 5 min, ±20 % jitter, 8 attempts; expired session: pauses without losing anything, resumes after sign-in; anything the server will never accept (validation, permission, locked module): stops, keeps the change, shows the reason with Try again / Discard (Discard asks first).
11. **Protecting tokens and data**
    - No sign-in token is ever written by this feature (a test scans every store for token patterns). The session stays where Supabase keeps it; the service worker never sees it (that is why Background Sync only wakes the page).
    - Cached rows and queued changes are **AES-GCM encrypted** with a non-extractable key; each blob is bound to its own key name (swapping or tampering fails to decrypt).
    - If WebCrypto or IndexedDB is missing, the feature **switches itself off** (online-only as before); nothing is ever stored in the clear.
    - The cache is wiped on **sign-out, app lock, and any module-lock change** ("locked means gone" holds on disk too). Hydration happens only after the lock gate, and the lock itself needs the server, so a locked app cannot be opened offline.
    - Unsent changes survive sign-out (so nothing is lost), stay encrypted, are tied to the user id, and never go out under another account.
    - Service worker never caches the database/auth API.
12. **Loading / offline / error / recovery states** – existing skeletons unchanged; offline banner wording; Sync pill and Sync Center states; a table with no saved copy offline shows the existing error state with Try again; failures show the server's reason.
13. **Performance** – snapshot writes are debounced (500 ms) and per table; the outbox writes only the changed entry; an empty sync round is never announced; the offline layer is a no-op when nothing is queued; no extra requests while online except a conflict check per queued edit.
14. **Testing** – below.

## Testing

Automated (all run with `VITE_SUPABASE_URL=` blanked so nothing touches the real project):

- `packages/core/tests/offlineSync.test.js` – 20 tests: error classes, backoff curve and jitter, queue merging, conflict planning for edits and deletes, per-field resolution.
- `packages/data` adapter contract (now 3 more cases: `get`/`find`, guarded update, guarded remove) – runs against the Supabase adapter over the fake client and, in `apps/web`, against the dev adapter.
- `apps/web/tests/offlineSync.test.js` – 35 tests against a shared in-memory "server" with a second device writing to it:
  - vault round trip, tamper/rebind refusal, non-extractable key, no tokens anywhere in IndexedDB;
  - create/edit/delete offline then sync; burst coalescing; create-then-delete cancels; refresh keeps waiting changes; real rejections still roll back immediately; database functions refuse offline honestly; online-only fallback without IndexedDB;
  - restart: queue read back after "closing the tab"; offline open from the encrypted copy; cache wipe; another account never sees or sends the queue;
  - duplicate prevention (reply lost, three simultaneous flushes);
  - retry: growing backoff, permanent failure kept and retried/discarded, expired session pause/resume, connection drop mid-queue keeps order;
  - multi-device conflicts: different field merges, same field asks, keep theirs, keep mine, per-field, edited-vs-deleted both ways, both-deleted, blocked row does not block others, realtime does not overwrite waiting rows; keyed upserts incl. same-day journal entry created elsewhere;
  - status transitions.
- `apps/web/tests/syncUi.test.jsx` – 3 tests: pill and banner states through offline → synced, Sync Center listing, and the conflict chooser end to end.

Real browser (Chromium in the app's browser pane, production build with the local backend, `vite preview`):

- Service worker active, precache present, `sw-sync.js` imported.
- Device key is `AES-GCM`, `extractable: false`; 22 table snapshots written.
- Offline add of a task through the real form: stayed on screen, 1 encrypted outbox entry, pill "Offline · 1 saved", Sync Center listed "New task · Waiting to sync"; back online it sent once, the queue emptied, the pill disappeared, one row in the database.
- With the preview server **stopped**, loading `/habits` fully rendered from the service worker.
- This also caught a real bug (the engine kept retrying while the browser said offline); fixed and re-verified.

Full-suite results: see the final message for the numbers and the failures that are not from this change.

## Limits (be aware)

- **Database functions (RPCs)** – `add_water`, `log_water`, `add_savings`, `replace_exercise_logs` – compute on the server and are not safe to replay, so they report "can't reach the server" offline instead of queuing. Quick water logging and savings deposits need a connection; their rows are visible offline.
- **Background Sync only wakes an open window.** The service worker cannot send because it deliberately never gets the session. With no window open, the queue is sent at the next visit.
- **Write-ahead is on failure, not before every request.** A change is queued when the request fails or the browser reports offline. A tab closed in the middle of a live request still triggers the existing "unsaved changes" prompt.
- **Locked apps cannot be opened offline** (the lock and PIN are verified by the server). Intentional.
- Notifications are never queued (the app raises them itself; a replay would announce twice).
- A person who signs out with unsent changes keeps them (encrypted) for their next sign-in on this device; a shared-computer user should sync before signing out. The sign-out dialog does not yet warn about this.
- Safari/iOS has no Background Sync; everything else works the same.
- Row-level "pending" badges are not on every list yet; the global pill and the Sync Center show them.
