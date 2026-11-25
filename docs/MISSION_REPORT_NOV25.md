# Engineering pass, 25 Nov 2026

A short, honest record of one pass over the existing app. It builds on [LIFETRACK_COMPLETE_AUDIT_REPORT.md](../LIFETRACK_COMPLETE_AUDIT_REPORT.md); read that for the wider audit. Nothing here was committed.

## What was checked at the start

| Check | Result |
| --- | --- |
| `apps/web` unit/component tests | 1,450 of 1,452 passed (one time-of-day test, one flaky settings test) |
| `packages/core` | 1,163 of 1,164 (stale generated Edge Function copy) |
| `packages/data` | 284 of 284 |
| `supabase/tests` pglite + static | 572 of 572 |
| ESLint (`apps/web`) | clean |
| Web production build | succeeds |

## Problems found and fixed

| Problem | Fix | Proof |
| --- | --- | --- |
| `supabase/functions/_shared/dates.ts` out of sync with `packages/utils` | regenerated with `node scripts/sync-function-core.mjs` | `send-reminders.test.js` 16/16 |
| Smart Recovery "clashing time" test failed whenever it ran after 16:30 ("That time has already passed") | the test now pins only the clock's date to 09:00 | `recovery.test.jsx` 9/9 on repeated runs |
| Habits `?new=1` deep link (Command Center "Create habit") wiped other query parameters such as `view=consistency` | `HabitsPage.jsx` removes only `new` | new `tests/habitsDeepLink.test.jsx`; fails without the fix, passes with it |
| `supabase/tests/pglite/calendar.test.ts` had TypeScript errors | `as` helper typed to return `any` | `tsc` clean for that file; 16/16 |
| Signed-out visitors downloaded the whole app shell (sidebar, command palette) | `AppShell`, auth pages and legal page are `lazy()` in `App.jsx` | see below |
| Every page showing ₹ downloaded Inter's 133 KB `latin-ext` file for one glyph | 1.5 KB subset of U+20B9 added in `src/assets/fonts`, declared after the full set in `index.css` | see below |

## Measurements

- **Initial download** (gzipped JS and CSS referenced by `index.html`, local-mode build): about 383 KB before, 277 KB after lazy loading (-28%).
- **₹ glyph**: in a page containing only `₹1,250`, the browser now loads the latin file and the 1.5 KB subset; `inter-latin-ext` is not requested (checked in a real browser, with the PWA service worker cleared first). Pages that use other latin-ext characters still load it, as before.
- The fixed sizes are single local measurements, not a benchmark suite.

## Test results after the changes

- `apps/web`: 1,453 of 1,453 passed after the lazy-loading change (97 files).
- End-to-end (Playwright): 190 passed, 1 skipped, 1 failed (a test-timing race, since fixed); see the end of this file.

## Not done (so nothing here is claimed)

- No full journey walkthrough in a browser, no responsive audit at 360/390/768/1024/1440/1920 px.
- No new API, security or performance test suites beyond the regressions above.
- Mobile app not re-checked.
- `supabase/tests` `tsc` still reports errors in `flagsPerf.test.ts` and `pagination.test.ts`; those belong to another session's uncommitted work.
- Migrations 0012 onwards are unverified on any hosted Supabase project; no live project was used.
- Open items from the earlier audit remain: monthly reminder drift, incremental sync, the Realtime DELETE exposure, `parseMoney` locale handling, design-system tile consolidation.
- README, architecture, API and deployment docs were not revised in this pass.

## Files changed

`apps/web/src/App.jsx` (lazy imports; the file also holds another session's feature-flag edits), `apps/web/src/features/habits/HabitsPage.jsx`, `apps/web/src/index.css`, `apps/web/src/assets/fonts/inter-rupee-opsz.woff2` (new), `apps/web/tests/recovery.test.jsx`, `apps/web/tests/habitsDeepLink.test.jsx` (new), `apps/web/e2e/visual.spec.js`, `supabase/functions/_shared/dates.ts` (generated), `supabase/tests/pglite/calendar.test.ts`.

## End-to-end results

Playwright, desktop and mobile projects, against a fresh local-mode build served from `dist-perf`: 190 passed, 1 skipped, 1 failed (16.8 minutes).

The failure was `visual.spec.js` "command palette": it pressed Ctrl+K right after the shell painted, before the shortcut listener was attached, so the palette never opened. It passed with a 1.5 s pause, so the race is in the test's timing. The test now presses until the palette answers (`e2e/visual.spec.js`); that test passed on three separate runs. The full suite was not re-run after that edit.

A real person cannot press a key that fast, but the listener attaching later than the first paint is worth knowing about; the lazy shell makes it a little more visible.

## Responsive overflow check

All 33 signed-in routes (everything in `App.jsx` except the companion window, `automation/:id` and `fitness/exercises/:id`, which need an id) were loaded in the browser pane at 360, 390, 768, 1024, 1440 and 1920 px with a seeded local-mode account. Two things were tested on each page: the page is not wider than the viewport, and no element inside `main` or a dialog runs past the right edge unless a scroll or clip container holds it. Result: nothing found at any width, and a spot check confirmed pages had rendered real content.

What this does not cover: spacing, typography, chart shape, dialogs and empty states were not judged, only horizontal overflow. Only one data set was used, and pages with very long user text, empty accounts or open dialogs could still overflow. The pane may scale very wide sizes down. The existing Playwright visual specs (desktop and mobile projects) passed in the end-to-end run above.

## Documentation fixes

Migration numbers in the setup docs were stale (they stopped at `0008`, `0010` or `0014`, and one named a file that does not exist). `README.md`, `docs/SETUP.md`, `docs/QUICKSTART.md`, `docs/INSTALLATION.md`, `docs/DEPLOYMENT.md` and `docs/RELEASE.md` now point at "every file in `supabase/migrations`" and give `0001`–`0027` as today's range, which is what the committed `supabase/setup-all.sql` contains. Not yet revised: `docs/NATIVE.md` step 4 and the other items in `docs/KNOWN_ISSUES.md` section 1.

Note: `node scripts/build-setup-sql.mjs` has no check mode; it rewrites `supabase/setup-all.sql` from every file in `supabase/migrations`. It was run once by mistake in this pass, which appended the other session's unrun `0028_performance_flags.sql`; the file was restored to the committed version (ends at `0027`). Regenerate it only when 0028 is ready to ship.

## Mobile checks and more doc fixes

- `apps/mobile`: `tsc --noEmit` clean; vitest 235 of 235 (22 files); jest/React Native 125 of 125 (9 suites, including the render-every-screen test). The jest run prints a React `act` warning from `PinWizard.tsx` (a timer that sets state after the test); it does not fail anything and was not changed.
- Not run: a device or emulator, `expo export` bundle build, EAS builds.
- `docs/NATIVE.md` step 4 no longer stops at migration `0008`; `docs/RELEASE.md` points at `docs/legal/STORE_DATA_SAFETY.md`, where the file actually is.

## Migration 0029: monthly reminders keep their day

Problem: a monthly reminder set for the 31st went 31 Jan -> 28 Feb -> 28 Mar and stayed on the 28th, because the next date was worked out from the date it last fired for.

Change:
- `supabase/migrations/0029_reminder_anchor_day.sql` adds a nullable `reminders.anchor_day` (check 1-31), backfills it from each row's current day, and adds an insert trigger that fills it from the date when an insert leaves it out. Additive and idempotent.
- `packages/core/src/reminders.js`: `nextRemindDate(date, repeat, anchorDay)` aims for the anchor and clamps to the month's end (31 Jan -> 28 Feb -> 31 Mar; 29 Feb -> 28 Feb -> ... -> 29 Feb in a leap year). `afterFire` reads the stored anchor. New helpers `anchorDayOf` and `withAnchorDay`.
- The web dialog, the mobile form and `rescheduleReminder` (snooze/move) set the anchor to the day the person picked. The Edge Function's `_shared/reminders.js` copy was regenerated.
- `packages/schemas/src/tables.ts` lists the column.

Tests: `packages/core/tests/reminderAnchor.test.js` (6 cases), two pglite cases in `supabase/tests/pglite/notifications.test.ts`, and an updated expectation in `apps/web/tests/notifications.test.jsx`. Results: core 1,170/1,170, DB 574/574, data 284/284, mobile vitest 235/235, mobile `tsc` clean. In the full web run 3 habit tests timed out under load; they passed on two re-runs in isolation, and the files I touched pass.

Known limits:
- Rows that had already drifted are backfilled with their drifted day (nothing in the data says what they were set for). Editing and saving such a reminder fixes it.
- Existing rows created by older app versions that write no anchor get one from the insert trigger, but an old client that edits a date will leave the old anchor in place until it updates.
- `packages/schemas` db-drift test still fails on tables from the other session's uncommitted `0028_performance_flags.sql` (`db_perf_snapshots` and others), not on anything from 0029.
- `supabase/setup-all.sql` was not regenerated: doing so now would also pull in the unfinished 0028. Run `pnpm sql:build` once 0028 and 0029 are ready to ship together.
- Deploy: run 0029, redeploy `send-reminders` (it ships the changed shared code), then the web and mobile apps. Not run against a live Supabase project.
