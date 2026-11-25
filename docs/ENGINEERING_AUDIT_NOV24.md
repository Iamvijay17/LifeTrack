# Engineering audit follow-up — 24 Nov 2026

Follow-up to `LIFETRACK_COMPLETE_AUDIT_REPORT.md` (18–19 Nov). Scope: web app, shared packages, Supabase layer. Nothing is committed.

## Premises that did not hold
- There is no MongoDB, Mongoose or custom API server. The backend is Supabase (Postgres + RLS + 4 edge functions), so the "MongoDB indexing / Mongoose schema" items map to SQL migrations and RLS, already covered and tested (`test:sql`, `test:rls`). `check-migration-safety`: 24 migrations, additive only.
- The app was already audited 5 days ago; routes are lazy, charts are not in the first-load bundle, headers/CSP/caching are strict. I did not rewrite working code.

## Fixed
| Issue | Change |
| --- | --- |
| A request refused as "session expired" (revoked session, clock skew) only showed a toast; every later action failed and the user stayed on a page that could not save. | New `src/services/sessionGuard.js`: on an expired-session error the store asks the server (`auth.getUser`); if rejected, the device is signed out and the app returns to sign-in (deep link kept). One check per burst, network failure never signs out. Wired into `load()` and `tracked()` in `src/hooks/store.js`. |
| `features/habits/habitData.js`: dead, outdated copy of `useHabits.js` (no pauses support), a trap for future edits. | Deleted. |

## Tests added (8)
`tests/sessionGuard.test.js` (5: error classification, sign-out on 401, no sign-out on network failure or valid session, burst de-dupe) and `tests/storeExpiredSession.test.js` (3: save refused → check + rollback + rethrow, first load refused → check, ordinary error → no check).

## Measurements
| | Before | After |
| --- | --- | --- |
| Web tests (own run, clean of other WIP) | 1285 pass / 1 fail (my first draft of a test, since rewritten) | new files 8/8 pass, `store.test.js` unchanged and passing |
| Packages core / data / schemas / utils | 1014 / 284 / 143 / 56 pass | not re-run (untouched) |
| Lint, Prettier, secret scan, bundle-variant check | clean | clean |
| First-load JS (gzip) | 277.4 KB | 280.1 KB (+2.7 KB; the guard is under 1 KB, the rest is other sessions' uncommitted edits to shared files built in between) |
| Production build | 14.7 s | 4.1 s (warm cache; not a real change) |

Not measurable here: runtime/FCP (`pnpm perf` needs the Playwright browser), field data.

## Full-suite status — read this
The last full web run (1310 tests) had 121 failures in 9 files (automation, calendar, habits, module locks, notification centre, recovery, security UI, context menus). All show a modal "Welcome to LifeTrack" dialog covering the page (scroll-locked body, focus guards). That comes from another session's uncommitted onboarding/tour work (`features/onboarding`, `features/tour`, `AppShell.jsx`), not from this pass; the run before it had only my own test failing. Re-run the suite when that work settles, or make the tour stay off in tests. I did not run Playwright e2e, which that same work would also affect. `audit:gate` needs network (npm audit) and could not run.

## Reviewed, no change needed
Optimistic store (versioned fetches, rollback, outbox), duplicate-submit lock (`useAction`), error boundary at the root, offline/network handling (`toAppError`, cache fallback), security headers, migration safety, no unused npm dependencies (`autoprefixer`/`postcss` are used by the PostCSS config, `workbox-window` by the PWA plugin).

## Remaining technical debt
- ~20 exports are never imported (e.g. `Ring`, `TaskRow`, `EntryRow`, `useGated`, `wipeAll`); some are used only by tests. Low risk, not removed.
- Tables are fetched whole; no incremental sync (known, `docs/KNOWN_ISSUES.md`).
- Duplicate `packages/core/src/web` layer and two cache implementations (web store vs mobile query store).
- Migrations 0012–0023 and the `send-reminders` redeploy are still not run on the real Supabase project.
- First-load JS is ~280 KB gz; the `misc` vendor chunk (~100 KB) could be split further if load time matters.
- ~150 uncommitted files from several sessions; commit in separate pieces.

## Files changed by this pass
`apps/web/src/services/sessionGuard.js` (new), `apps/web/src/hooks/store.js` (+3 lines), `apps/web/src/features/habits/habitData.js` (deleted), `apps/web/tests/sessionGuard.test.js` (new), `apps/web/tests/storeExpiredSession.test.js` (new), this file.
