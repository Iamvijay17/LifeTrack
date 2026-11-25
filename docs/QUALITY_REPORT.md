# Quality report: LifeTrack 2026 platform work (24 Nov 2026)

Everything below was run in this session on this Mac, with Supabase credentials blanked so no run touched the hosted project. Nothing is committed.
Status of every requested item is in [PLATFORM_CHECKLIST.md](PLATFORM_CHECKLIST.md).

## Results

| Check | Result |
| --- | --- |
| Web unit/component tests (vitest) | 1357 tests: **1354 pass, 3 fail**. All 3 are `contextMenu/modules.test.jsx`, a known load-sensitive file: it passes alone (18/18) |
| `packages/core` tests | 1039 pass (incl. 25 new Google integration tests against a simulated Google) |
| `packages/data` tests | 284 pass |
| Database tests (pglite + static) | 505 pass (incl. new RLS/constraint tests for migrations 0024, 0025, 0026) |
| Playwright, full run (desktop + mobile + visual, before the last fixes) | 186 pass, 5 fail, 1 skipped (see below) |
| Playwright after fixes (re-run per file) | calendar 11/11, phase6 + PWA 15/15, onboarding + demo 4/4, visual 17/17 |
| Lint / Prettier | clean |
| Type check | all packages pass **except** `supabase/tests/pglite/calendar.test.ts` (13 `unknown` errors; the file is untouched by this work) |
| Production build / bundle guard (`verify:bundles`) | pass: no in-browser dev backend in production bundles, no secrets |
| Migration safety / secrets scan | 26 migrations additive-only; no secrets found |

**Not done: a complete Playwright run after the final fixes.** The per-file re-runs above cover everything that failed, but the whole suite (about 15 minutes) was not repeated.

### The 5 Playwright failures in the full run
1. `phase6` sidebar groups: fails identically on a clean checkout of HEAD (the "Insights" group and page share a name). Test fixed.
2. `premium` PWA: fails identically on HEAD (the offline layer adds a NetworkOnly rule naming Supabase). Assertion updated to say exactly that.
3. `phase6` global search: caused by someone else's uncommitted Command Center change (a "Search everything for…" option shares the input's label). Selector fixed.
4. `calendar` month drag: **caused by this work**: the new first-use tip pushed the month grid down. Tips are now hidden in automated runs.
5. `responsive` mobile quick add: passed on re-run (a page-transition flake).

I also caused, and fixed, a wider regression early on: the welcome dialog blocked every test that creates a new account. Automated runs now set `lifetrack:onboarding:skip`.

## What was built (all uncommitted)

Onboarding and tours; undo/redo history; demo mode; shortcut reference and remapping; first-use hints; profile photo and email change; transactions CSV import and backup restore preview; Integration Center with Google Calendar / Drive server code; Playwright visual regression; CI wiring; docs (ONBOARDING, UNDO, DEMO_MODE, INTEGRATIONS).

## Needs your action before it works for real

- **Run migrations 0024, 0025, 0026** on your Supabase (all additive). Until then onboarding progress, profile photos and integrations stay on the device or are unavailable; the app says so rather than failing.
- **Google integrations** need your own Google Cloud OAuth client, four secrets and two function deployments (`docs/INTEGRATIONS.md`). They have **never run against real Google**. Calendar sync and Drive backup are tested only against a simulated Google. The Edge Function glue (`index.ts`) has not been executed (no Deno on this machine).
- **Linux visual baselines**: only macOS baselines exist. Run the "Update visual baselines" workflow, review the images, commit them; CI compares only once they exist.
- Commit: this work is mixed in the working tree with other sessions' uncommitted changes.

## Known issues and limits

- Demo mode: no server search, no server functions, reload ends it, browser notifications for demo reminders are not suppressed.
- Calendar sync skips repeating events and never deletes; Drive restore is download-then-restore.
- Tokens are stored as plain text in a client-inaccessible table (use Supabase Vault if you need encryption at rest).
- Shortcut remaps are per device. Ctrl/⌘+Shift+N is claimed by some browsers for a private window.
- Date format, time format and language preferences are not configurable; login history beyond the session list is not available from the auth service; CSV import exists for transactions only.
- Tour steps find elements by CSS selector and fall back to a centred card; they are covered by one e2e spec, not one per module.

## Technical debt

- `contextMenu/modules.test.jsx`, `recovery` (time-of-day dependent) are flaky under load.
- `supabase/tests` typecheck failure in `calendar.test.ts`.
- `localAdapter` was split into `localCore` + dev storage; both adapters share one engine, which is good, but the file still has no direct unit tests for the demo adapter beyond `demoMode.test.js`.

## Recommended next steps

1. Run the migrations, commit in small pieces, then deploy the Google functions and test a real connection.
2. Generate and review the Linux visual baselines.
3. Date/time format and language-readiness settings (touches every formatter, so do it as its own change).
4. Repeating-event sync and a scheduled (opt-in) Drive backup.
