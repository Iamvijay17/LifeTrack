# LifeTrack — Complete Audit Report

**Date:** 18–19 November 2026 · **Branch:** `feat/food-nutrition` (HEAD `a156c37`) · **Scope:** web app, mobile app (Expo), shared packages, Supabase (SQL, RLS, Edge Functions), tooling.

Everything below was checked by reading the code and by running the project's own tools. Where something could not be run (no Deno, no live Supabase project, no phone), the report says so.

All changes are **uncommitted** in the working tree. They sit next to another session's unfinished Command Center work (§11.4), so nothing was committed or pushed.

## 1. Overall project health

LifeTrack is a large, mature codebase: about 68k lines across a React 18 PWA, an Expo app, seven shared packages and 21 SQL migrations. It already has strong engineering habits: Row Level Security on every table, an RLS test suite, coverage gates, a secret scanner and a migration-safety check. The architecture is sound and did not need redesigning.

The audit still found real defects. None was a crash on a fresh account. They were integrity and trust problems that appear with real data or at the edges:

- the web cache could show a module as "loaded" with a single row;
- backup restore stopped part-way for new accounts;
- a locked session could still delete the account, or get past the PIN by changing the password;
- one bad time zone could stop server reminder pushes for every user;
- several forms saved silently wrong data, or refused to save without saying why.

These are fixed. Section 11 lists what remains.

### Before and after

| | Before (HEAD `a156c37`) | After (working tree, 19 Nov) |
| --- | --- | --- |
| Web tests | 1147 / 1154 | **1193 / 1193** |
| All other suites | schemas drift test never ran; 3 RN timeouts; `test:sql` failing | **all green** (§9) |
| Playwright e2e | not completed | **170 passed, 1 skipped** |
| Lint / format | 6 warnings / 3 files unformatted | **0 / clean** |
| Verified high-severity defects open | 5 (C1–C5) | **0** |
| Verified medium defects open | 9 (C6–C14), plus about 30 lower | **0 of C6–C14**; lower ones fixed except those listed in §11 |
| Security findings | 9 (S1–S9) + dependency gate failing | S1–S7 fixed; S8 and parts of S9 documented; gate passes with reasons recorded |
| Dashboard JS on landing | included recharts (about 105 KB gz) | recharts not loaded |
| Uncommitted files | 6 (another session) | about 150 (this pass + the other session's), **nothing committed** |

## 2. Architecture assessment

- **Shape:**
  - `apps/web`: React 18, Vite 8, Tailwind 3, React Router 7, React Hook Form + Zod, Recharts, motion.
  - `apps/mobile`: Expo 58, TanStack Query.
  - `packages/{core,data,schemas,constants,utils,types,design-tokens}`.
  - `supabase/{migrations,functions,tests}`.
  - There is no custom API server. Clients talk to Supabase directly, and authorisation is RLS plus SECURITY DEFINER functions.
- **Data flow:**
  - Web uses its own cache (`hooks/store.js`): optimistic writes, Realtime patches, refetch on focus or reconnect, and a 90 s poll while Realtime is down.
  - Mobile uses TanStack Query through `src/data/queryStore.ts`.
  - Both share `packages/data`: `createApi`, the Supabase adapter, auth and security.
- **Strengths:**
  - Domain rules are pure and tested (`packages/core`).
  - SQL and RLS behaviour is tested on an in-memory Postgres (PGlite).
  - Every page is a lazy chunk.
  - The CSP and security headers are strict.
  - Money is stored in integer paise; dates are strings in the user's time zone.
- **Structural debt** (unchanged, already in `docs/KNOWN_ISSUES.md`):
  - The `packages/core/src/web` layer duplicates parts of `packages/core`.
  - There are two cache implementations.
  - Tables are fetched whole, with no incremental sync.
  - Smart notifications and automations run only while an app is open.
- **Process risk seen during the audit:** several Claude sessions work in this one checkout at once, and their uncommitted work mixes (§11.4). Migration numbers have to be checked right before a new one is created.

## 3. Module-by-module audit

**How the audit was done:**
- Five read-only audit agents (security, data integrity, productivity modules, life modules, performance/UI) traced code paths and reported VERIFIED or SUSPECTED findings.
- I checked the baseline by running everything.
- I swept 24 routes in a browser at 1280 px and 375 px on a fresh local account: no crashes, no horizontal overflow, no console errors.
- Each verified finding was then fixed in code. The fixes were split across two fix agents with separate file sets, plus my own.

| Module | Verdict before | Main problems found |
| --- | --- | --- |
| Dashboard | Logic solid, roll-up wrong | Paused habits counted against the day and the Life Score; the conflict dialog discarded edits; widget links lost their context; recharts loaded on the landing page |
| Planner & Tasks | **Save blocker** | Choosing Urgent priority or Every year repeat silently blocked saving |
| Habits | Sound on its own page | Pauses ignored everywhere else (Analytics, Today agenda, nudges) |
| Calendar | Robust | "Saved" toast after a cancelled scope prompt; job items opened the list, not the application; `?` shortcut conflict (in the other session's file) |
| Focus / Companion | Toast bugs | Contradictory "nothing recorded" + "saved"; the Companion queried a table that doesn't exist (`interviews`) on every resync |
| Notes & Journal | **Dangerous delete** | One click permanently deleted the day's journal entry |
| Goals | Risky delete | One click deleted a milestone with no confirm or undo |
| Notifications | Sound | Preference saves had no error handling |
| Smart Recovery | Hard dependency | The whole page errored without migration 0016 |
| Automation | Sound | "Retried" toast even when the retry failed |
| Analytics / Reports | Habits section wrong | Pauses ignored; CSV header said "(paise)" |
| Life Map | Timer leak | Arrow-key nudge leaked timers, so the node saved many times and jumped |
| Career & Learning | Minor | Negative or blank study minutes accepted; non-study goals offered as targets |
| Job Switch | Confusing filter | The Board applied a status filter that is only visible in Table view |
| Gym & Fitness | Data loss | Cardio saved hidden exercise sets; logging measurements twice in a day wiped the earlier fields |
| Food & Nutrition | Minor | "entrys"; bulk delete reached entries from other days; water logging failed under a Health lock |
| Sleep & Health | Wrong undo | "Undo last 250 ml" always removed 250 ml |
| Finance | Stale filters | Filters survived a month change; the Select showed the wrong label |
| Settings & Profile | Sound | Sign-out did nothing when offline |
| Auth & Security | **PIN bypass path** | `/reset-password` (outside the lock) changed the password without the current one; account deletion and PIN-disable were allowed from locked or ended sessions |
| Export / Backup | **Restore stopped** | Missing foreign-key remaps and natural keys; Erase sent thousands of ids in one URL |
| Mobile | Same cache bug | Writes seeded never-fetched tables; job-post links opened any URL scheme |

## 4. Critical bugs discovered

| # | Severity | Bug | Effect |
| --- | --- | --- | --- |
| C1 | High | `hooks/store.js`: a write to a table nobody had loaded marked it `ready` with only that row | Example: a recurring charge posted while on /planner made Finance show one transaction (wrong totals, wrong CSV export) until the next tab switch. Mobile had the same bug in `queryStore.ts` |
| C2 | High | Backup restore had no remap for `focus_sessions.topic_id` / `calendar_events.topic_id`, and no natural keys for `habit_logs`, calendar exceptions, map positions or dedupe-keyed rows | Restoring into a new or reused account stopped with "Import stopped at …", and every later table was skipped |
| C3 | High | `/reset-password` is outside the app lock and set a password without the current one | Someone at a locked device could change the password, sign in again and get past the PIN and module locks |
| C4 | High | The task dialog schema allowed only low/medium/high and none…monthly, but the selects offered Urgent and Yearly | Saving silently did nothing, with no error shown |
| C5 | High | Journal Delete had no confirmation and no undo | One click permanently lost the day's entry |
| C6 | Medium | `delete_my_account()` did not require an unlocked session | A token from a locked session could erase everything |
| C7 | Medium | `send-reminders`: an invalid `user_settings.timezone` threw inside the loop, and there was no paging (1000-row cap) | One account could stop server pushes for every user, and other users' reminders could be starved |
| C8 | Medium | `disable_app_lock` did not check that the session still exists | An ended session's token could keep guessing the PIN for up to an hour |
| C9 | Medium | The Supabase adapter treated a delete that RLS quietly refused (0 rows) as success | A delete under a module lock said "Deleted", and the row came back after unlocking |
| C10 | Medium | Erase all data sent every id in one `id=in.(…)` URL | Likely to fail part-way on large tables (URL limit) |
| C11 | Medium | No index on `task_reschedules.task_id` | Deleting a task scanned the whole history table; `pnpm test:sql` failed |
| C12 | Medium | Paused habits were ignored outside the Habits page | Life Score, daily progress, the Today agenda, Analytics and the evening nudge counted paused days as missed |
| C13 | Medium | The workout dialog kept hidden exercise sets for Cardio, and same-day body measurements wiped earlier fields | Wrong workout logs; lost measurements |
| C14 | Medium | The Companion page loaded the non-existent table `interviews` | Interviews never showed, and a failing request went out on every resync |

## 5. Bugs fixed

### 5.1 Data layer, store, backup, auth and server

| File(s) | Fix | Proof |
| --- | --- | --- |
| `apps/web/src/hooks/store.js` | Only loaded tables are patched. Writes that land after a reset (sign-out, lock) are dropped. A Realtime change during a first load triggers a re-fetch. A refresh that brings unchanged rows keeps the snapshot (no app-wide re-render). While Realtime is connected, a short look away (under 60 s) no longer re-downloads every table | 4 new tests in `tests/store-sync.test.js`; store suites 33 / 33 |
| `apps/mobile/src/data/queryStore.ts` | Same rule on mobile: a table that was never fetched is never seeded | New test; the mobile test harness now starts from fetched, empty tables, as a screen does |
| `packages/data/src/supabaseAdapter.js` | Deletes are sent in slices of 100 ids. A delete that removes fewer rows than asked re-checks them and errors if they are still there (locked). Paging de-duplicates ids | 3 new tests |
| `packages/data/src/auth.js` | Sign-out falls back to a local sign-out when the server can't be reached | New test |
| `apps/web/src/services/backup.js` | Topics are remapped for `focus_sessions` and `calendar_events`. Natural keys added for `habit_logs`, `calendar_event_exceptions` and `life_map_positions`; dedupe keys for `notifications`, `task_reschedules` and `automation_executions` | New round-trip test (same account and new account) |
| `apps/web/src/features/export/BackupCard.jsx`, `EraseCard.jsx` | The file size is checked before reading. A missing or edited export date no longer shows "Invalid Date". The file is named by the local date. The Erase text now says nutrition targets are erased too | — |
| `apps/web/src/features/auth/AuthPages.jsx`, `hooks/useAuth.jsx`, `App.jsx` | `/reset-password` sets a password only on a visit from the reset link, detected before the auth client consumes the URL. A signed-in visit goes to Security, which asks for the current password. After sign-in you land on the full deep link (query and hash; in-app paths only). Sign-out forgets the palette's recent-item titles for that account | New test |
| `supabase/migrations/0021_audit_fixes.sql` (+ `setup-all.sql`) | Index on `task_reschedules(task_id)`. `delete_my_account()` requires an unlocked session; `disable_app_lock()` requires a live session | 2 new SQL tests |
| `supabase/functions/send-reminders/{logic.js,index.ts}` | An unknown time zone falls back to the default. One failing reminder no longer stops the run or the pushes. Active reminders are paged in a stable order, and id lists are sent in slices | 2 new tests |
| `apps/web/src/lib/nav.js`, `features/focus/FocusPage.jsx` | Browser-tab titles for sub-pages. Leaving Focus no longer wipes the next page's title | Tests in `audit-fixes.test.jsx` |
| `apps/web/src/features/jobs/{ApplicationDetail.jsx,contextMenu.js}`, `apps/mobile/src/features/jobs/ApplicationDetail.tsx` | Job-post links are shown only for `http(s)`/`mailto`. React and `Linking.openURL` would otherwise follow `javascript:` or other schemes coming from imported data | — |
| `packages/schemas/tests/db-drift.test.ts` | Uses the shared Supabase stub and pgcrypto, and skips the 7 server-only security tables | 85 skipped checks → all run |
| `apps/mobile/jest.config.js` | 30 s test timeout: the first test in a file timed out at 5 s when the machine was busy | — |
| `supabase/tests/pglite/security.test.ts` | The "re-run the migration" test now re-runs every migration from 0012 in order, as the docs say to. Re-running 0012 alone put back function bodies that later migrations had replaced | — |
| `apps/web/src/features/command/useShortcuts.js` | The global `?` waits one tick and steps aside when a page handled the key, so `?` on the Calendar opens the Calendar's own shortcut list (failing at HEAD) | `calendarPage.test.jsx` passes, with HEAD and with the other session's edits |
| `apps/mobile/src/features/{fitness,finance}/forms.tsx`, `hooks/useZodForm.ts` | Mobile counterparts of two web fixes: cardio drops hidden exercise rows; a savings-goal edit leaves an unchanged total out | Mobile 232 / 232, RN 125 / 125 |
| `apps/web/e2e/{a11y,notifications,phase6}.spec.js` | Three stale or time-of-day-dependent expectations corrected (§9) | 29 / 29 |
| Lint/format, `CHANGELOG.md` | Prettier on 3 files; 6 unused imports/variables removed; Unreleased → Fixed entry | — |

### 5.2 Productivity modules

| File(s) | Fix |
| --- | --- |
| `planner/TaskDialog.jsx`, `TaskList.jsx`, `planner/contextMenu.js` | Priority and Repeat options come from the shared `PRIORITIES` / `RECURRENCES` (Urgent, Yearly) and show their errors. Urgent has a dot, a badge and a menu entry. Checked in the browser: an Urgent, yearly task saves |
| `notes/Journal.jsx`, `goals/Milestones.jsx` | Deletes confirm first (`useConfirmedDelete`), like the rest of the app |
| `core/streaks.js` (`withPauses`), `habits/useHabits.js`, `analytics/AnalyticsPage.jsx`, `core/web/analytics.js`, `core/notificationSources.js`, `notifications/useSmartNotifications.js` | Habit pauses reach the Today agenda, daily progress and Life Score, Analytics and the "habits left" nudge. `habit_pauses` is loaded tolerantly, so a missing table never breaks a page |
| `companion/CompanionPage.jsx` | Loads `interview_events` (the table that exists) |
| `focus/FocusPage.jsx`, `companion/widgets.jsx` | "Stopped and saved" only when something was saved; nothing for breaks. A second `?start=1` from the palette works |
| `calendar/ItemDialog.jsx` | The this / following / all question is asked before saving, so cancelling saves nothing and toasts nothing |
| `overview/builder/Dialogs.jsx`, `useDashboardBuilder.js` | Dismissing the save-conflict dialog keeps your edits ("keep editing") instead of discarding them |
| `recovery/useRecovery.js`, `RecoveryPage.jsx` | History loads on its own, so the page works without migration 0016. Undo from a toast reports failures |
| `lifemap/MapCanvas.jsx` | The previous nudge timer is cleared, so one save per hold and no jump |
| `core/calendar.js`, `overview/MoreCards.jsx`, `OverviewPage.jsx` | Links go to `/jobs?app=…`, `/notes?note=…` and `/calendar?date=…`. Interview days use the user's time zone |
| `quick/HabitQuick.jsx` | "Loading habits…" instead of a false "No habits due today" |
| `notifications/PreferencesTab.jsx` | Failed saves show an error and roll back |
| `automation/HistoryPage.jsx` | A retry that fails again says so |
| `reports/reportCsv.js` | Header "Spent (minor units)", which is correct for any currency |
| `core/recurrence.js`, `data/api.js` | Monthly and yearly tasks go back to their original day after a short month (Jan 31 → Feb 28 → Mar 31; Feb 29 returns in leap years) |
| `core/web/analytics.js`, `core/streaks.js`, `core/report.js` | Application dates and archive days use the user's time zone, not UTC |
| `overview/WeeklyScoreCard.jsx`, `shared/chartParts.jsx`, `shared/charts.jsx` | Chart redrawn without recharts (§7) |
| `layout/AppShell.jsx` | Background runners isolated (§7) |
| `calendar/MonthView.jsx`, `notifications/NotificationCard.jsx`, 5 files with muted text | Touch-tablet visibility and light-mode contrast (§8) |

Tests added or updated: `planner-notes`, `goals`, `companion`, `dashboardBuilder`, `lifeMap`, `notifications`, `analytics-reports` (web); `audit-bugfixes.test.js` (new), `calendar.test.js` (core); `api.test.js` (data).

### 5.3 Life modules

| File(s) | Fix |
| --- | --- |
| `nutrition/WaterCard.jsx`, `fitness/BodyTab.jsx`, `fitness/FitnessStats.jsx` | With Health locked: water controls are disabled with an Unlock link, and the body tab and weight tile show the locked card. No more "permission denied" toast |
| `finance/FinancePage.jsx`, `ui/pickers.jsx` | Transaction filters reset when the month changes. A Select whose value isn't an option shows "—" instead of another option's label (`''`/`null` still show the empty or first option) |
| `jobs/JobsPage.jsx` | The status filter applies only in Table view, where it is visible |
| `fitness/WorkoutDialog.jsx`; mobile `features/fitness/forms.tsx` + `hooks/useZodForm.ts` | Cardio drops hidden exercise rows, which are neither validated nor saved (web and mobile) |
| `core/web/fitness.js`, `schemas/forms.ts` | Body measurements send only filled fields, so a second entry the same day adds to the first |
| `health/WaterDialog.jsx` | Undo removes exactly the last amount added ("Undo last 500 ml"), with a matching toast |
| `learning/StudyTimer.jsx` | Stop dialog refuses negative or blank minutes and a 0-minute / 0-problem session |
| `lib/validation.js`, `health/DailyLogForm.jsx`, `fitness/RoutineDialog.jsx`, `fitness/WorkoutDialog.jsx`, `schemas/forms.ts`, `core/nutrition.js` | Whole numbers for integer columns (water, steps, sets, reps, minutes). Food-log totals are checked against every database limit. Long "food (variant)" names are shortened to 120 characters |
| `schemas/forms.ts` (`savingsGoalToPayload`), `finance/SavingsGoalDialog.jsx`; mobile `features/finance/forms.tsx` | Editing a goal leaves "saved" out when unchanged, so it can't undo another device's atomic addition (web and mobile) |
| `finance/SavingsGoals.jsx`, `RecurringRules.jsx` | Loading and error states (`DataGate`) instead of a false empty state |
| `learning/LearningPage.jsx`, `SessionDialog.jsx`, `StudyGoalDialog.jsx` | Only study goals offered as study targets; editing keeps a goal's category and a session's goal/topic |
| `learning/TopicDialog.jsx`, `jobs/ApplicationDialog.jsx`, `ui/misc.jsx`, `TransactionDialog.jsx`, `RecurringRuleDialog.jsx`, `FoodEntryForm.jsx` | Labels wired to datalist inputs. `Segmented` takes an accessible name and is named in forms |
| `core/web/jobs.js`, `jobs/PrepChecklist.jsx`, `jobs/ApplicationDialog.jsx` | Upcoming interviews sorted. Checklist taps made during a save are queued, not dropped. Moving to "applied" fills today's date if empty |
| `fitness/WorkoutSets.jsx`, `catalog/ExerciseDetailPage.jsx`, `fitness/contextMenu.js` | A new set copies what was typed. No "Add to my exercises" flash while loading. "Mark completed" renames "Rest day"/"Skipped" (undo restores it) |
| `lib/format.js`, `context-menu/helpers.js`, `SelectionBar.jsx`, `nutrition/NutritionPage.jsx`, `GoalsDialog.jsx`, `FoodsTab.jsx` | "entries", not "entrys". Bulk selection covers only the viewed day. Typed targets survive a background settings write. The reset toast wording is fixed |
| `shared/FormDialog.jsx`, `ui/pickers.jsx` | "Discard your changes?" also covers changes made with pickers (they now emit an `input` event) and Segmented choices (`dirty` prop) |
| `utils/dates.ts` (+ generated `supabase/functions/_shared/dates.ts`) | `zonedToIso` uses the offset at that wall-clock time, so interviews on daylight-saving change days are no longer an hour off |
| `finance/TransactionList.jsx`, `FinanceStats.jsx`, `nutrition/WaterCard.jsx`, `AnalyticsTab.jsx`, `fitness/FitnessStats.jsx`, `LibraryTab.jsx` | Light-mode icon contrast via design tokens; touch-tablet visibility (§8) |

Tests added or updated:
- Web: `fitness`, `health`, `finance`, `jobs`, `learning-habits`, `nutrition`, `moduleLocks`, `exerciseLibrary`, `ui-logic`, `components/shared`, `contextMenu/{core,modules}`.
- Schemas: `nutrition-form`, `health-form`, `fitness-form`, `finance-form`.
- Core: `nutrition`, `jobs-ui`.
- Utils: `zoned`.

## 6. Security vulnerabilities discovered and fixed

| # | Finding | Status |
| --- | --- | --- |
| S1 | PIN and module-lock bypass by changing the password at `/reset-password` (outside the lock, no current password needed) | **Fixed on the client:** only recovery-link visits can use the page; other visits go to Security, which verifies the current password. **Server config:** `secure_password_change = true` and `minimum_password_length = 8` in `supabase/config.toml`; the same must be turned on in the hosted dashboard. **Residual:** GoTrue still accepts `updateUser({password})` from any valid token until re-authentication is required (§11) |
| S2 | `delete_my_account()` callable from a locked session | **Fixed** (0021) |
| S3 | One invalid time zone breaks `send-reminders` for all users; only the first 1000 reminders were read | **Fixed:** per-reminder isolation, time-zone fallback, paging |
| S4 | `disable_app_lock` usable by an ended session's token | **Fixed** (0021) |
| S5 | `javascript:` URL in a job posting link (imported data skips form validation) | **Fixed:** render guard on web and mobile |
| S6 | The palette's recent-item titles stayed in localStorage after sign-out | **Fixed:** cleared on sign-out |
| S7 | Backup file read fully before the 50 MB check | **Fixed** |
| S8 | Realtime DELETE subscriptions are unfiltered, so every client receives other users' deleted row ids | **Not fixed.** Supabase does not apply RLS to DELETE events; this needs a soft-delete design (§12) |
| S9 | Hardening | **Fixed:** the secret scan now also covers `supabase/functions`, `scripts`, `.github` and YAML/TOML files; `.gitignore` covers `.env.*` (examples excepted); the mobile build check decodes the JWT role of the public key. **Open:** no `deno.lock` for the `webauthn` and `device-key` functions (needs Deno); CSP `connect-src https://*.supabase.co` could be pinned to the project ref at deploy time |
| D | Dependencies | See below |

**Dependencies.** `pnpm audit --prod` reports 2 high advisories (picomatch ReDoS, no upstream fix) and 4 node-forge advisories. All are reachable only through `expo > @expo/cli` or jest tooling and are never bundled into the apps. They are added to `.audit-allowlist.json` with reasons and a review date (2027-02-01), as the project already does for glob and minimatch. Upgrade Expo once its CLI ships node-forge 1.4.3 or later.

**Checked and sound:**

- RLS is enabled and forced on every table, with owner policies (USING + WITH CHECK).
- Every cross-table foreign key has a same-owner guard.
- Every SECURITY DEFINER function sets `search_path = ''` and has the right grants; nothing is executable by `anon`.
- PIN storage: bcrypt cost 12, lockout, row locks.
- WebAuthn and device-key Edge Functions check origin, rpId, single-use challenges, the counter, CORS and body limits.
- `send-reminders` authenticates with a constant-time `CRON_SECRET` check.
- The Markdown renderer uses no `innerHTML` and allows only safe link schemes.
- CSV export guards against formula injection.
- Security headers are in place: CSP, frame-ancestors, HSTS, nosniff, Referrer-Policy and Permissions-Policy.
- No secrets are committed.
- The DEV backend is kept out of production bundles.
- Every app route is behind `Protected` → `SecurityProvider` → `AppLockGate`.

## 7. Performance improvements

Measured on the production build (`vite build`). The largest chunks before this pass, gzip:

| Chunk | gzip |
| --- | --- |
| recharts | 104.6 KB |
| `misc` (shell, toasts, icons, runners) | 92.9 KB |
| entry (React, router, zod) | 76.1 KB |
| Overview (including react-grid-layout) | 55.1 KB |
| `db` (Supabase client + data API) | 50.9 KB |
| Nutrition (food database) | 39.1 KB |

First load is about 261 KB gz of JS; the signed-in landing route about 440 KB gz. The PWA precache is 154 entries (3.1 MB raw).

| Change | Effect |
| --- | --- |
| Dashboard Life Score chart redrawn without recharts (`WeeklyScoreCard.jsx`; `EmptyChart` moved to the recharts-free `chartParts.jsx`) | The landing route no longer downloads or parses the 105 KB gz / 405 KB raw chart library. Checked in the browser: 0 recharts instances on the dashboard, and the chart is visually equivalent |
| Background runners moved into their own `Runners` component (`AppShell.jsx`) | A task toggle, notification or calendar change no longer re-renders the sidebar, header, mobile nav and FAB (previously twice per write: optimistic, then confirmed) |
| Refresh with unchanged rows keeps the cached snapshot (`store.js`) | Coming back to the tab no longer re-renders every subscriber (Overview recomputed scores up to about 27 times per focus) |
| No full re-download on a short look away while Realtime is connected (`store.js`) | Alt-tab under 60 s no longer re-fetches every loaded table in full. Longer absences and reconnects still catch up |
| Delete in 100-id slices; reminders paged | Big erases and big reminder sets stay inside URL and row limits |
| Life Map nudge timer leak fixed | Holding an arrow key saves once, not once per key repeat |

Checked and already good:

- Every page is lazy.
- The food database is only in the Nutrition chunk.
- The exercise catalog is fetched on demand and cached.
- motion uses `LazyMotion`.
- Reduced motion is honoured.
- All about 40 timers, listeners and observers checked are cleaned up.
- Images are lazy-loaded with fixed sizes.

The larger wins left (§12): incremental sync, lazy shell for signed-out visitors, a ₹ font subset, and smaller exercise thumbnails.

## 8. UI/UX improvements

The user previously rejected a full redesign (`docs/DESIGN_SYSTEM.md`, the violet dark-first look). So this pass fixed defects inside the existing design language and did not restyle anything.

- **Silent failures made visible:**
  - The task form shows Priority and Repeat errors.
  - Preference saves that fail show a toast and roll back.
  - Toast "Undo" failures in Smart Recovery say so.
  - "Retried" no longer claims success when the retry failed.
  - Contradictory "nothing recorded" + "Stopped and saved" toasts were removed (Focus, Companion).
  - Cancelling the calendar scope prompt no longer says "Saved".
- **Destructive actions guarded:** journal entry and milestone deletes now confirm, like the rest of the app.
- **Correct context:**
  - Dashboard widgets open the exact note or calendar day.
  - Calendar job items open the exact application.
  - After sign-in you land on the full deep link.
  - Browser-tab titles exist for sub-pages.
- **Touch and contrast:**
  - Hover-only controls in Month view, Notifications and the exercise library are visible on touch tablets.
  - `text-muted-foreground/70` and `/60` (3.1:1 and 2.6:1 in light mode) raised to the token colour in the Score card, Priorities, Notification filters, Help and the Life Map toolbar.
  - Hard-coded emerald/sky icon colours on finance, fitness and nutrition cards moved to design tokens.
- **Accessibility:**
  - `Segmented` accepts an accessible name and is named where it is a form field.
  - Datalist fields are properly labelled.
  - Dashboard and HabitQuick no longer flash an empty state while loading.
- **Responsive:** 24 routes checked at 1280 px and 375 px (an empty account and a seeded account with data). No horizontal overflow, no crash, no console errors.

## 9. Tests executed and their actual results

**How the runs were set up:**
- Every run used a scratch copy of the working tree. The other session's unfinished files (§11.4) were replaced with their HEAD versions there.
- `VITE_SUPABASE_*` / `EXPO_PUBLIC_SUPABASE_*` were blanked, so nothing reached the real Supabase project.
- "Before" is HEAD `a156c37` on 18 Nov; "After" is the final run on 19 Nov.

| Suite (command) | Before | After |
| --- | --- | --- |
| TypeScript `tsc --noEmit`: core, data, schemas, types, constants, utils, design-tokens, mobile | clean | clean |
| ESLint (`apps/web`) | 0 errors, 6 warnings | 0 errors, 0 warnings |
| Prettier `--check` (web `src`, `tests`, `e2e`) | **3 files fail** | clean |
| `check-no-secrets` | pass (6 directories) | pass (9 directories, plus YAML/TOML) |
| `check-migration-safety` | 20 additive | 21 additive |
| SQL drift (`setup-all.sql` matches the migrations) | in sync | in sync (regenerated with 0021) |
| `packages/core` vitest | 872 / 872 | **886 / 886** |
| `packages/data` vitest | 249 / 249 | **259 / 259** |
| `packages/schemas` vitest | 49 pass, **85 skipped, 1 file failing** | **137 / 137** |
| `packages/utils` vitest | 55 / 55 | **56 / 56** |
| `packages/design-tokens` vitest | 4 / 4 | 4 / 4 |
| `apps/mobile` vitest | 231 / 231 | **235 / 235** |
| `apps/mobile` jest (React Native screens) | **122 / 125** (3 timeouts under load) | **125 / 125** |
| `apps/web` vitest | **1147 / 1154** (7 failing) | **1193 / 1193** |
| SQL suites (`supabase/tests` pglite + static) | 450 / 450 | **452 / 452** |
| `scripts/verify-sql.mjs` (`pnpm test:sql`) | **1 check failing** (unindexed FK) | all checks pass |
| Playwright e2e (desktop + Pixel 7) | not completed before the first stop | **170 passed, 1 skipped** (see below) |
| Edge Function Deno tests | not runnable (no Deno) | not runnable (no Deno) |

**Coverage gates** (`pnpm test:coverage`, run on the final tree): all pass.

| Package | Statements | Branches | Lines | Gate |
| --- | --- | --- | --- | --- |
| core | 94.75 % | 87.45 % | 97.24 % | pass |
| data | — | 92.26 % | 98.58 % | pass (gate: branches 92, lines 98) |
| schemas | 98.28 % | 86.89 % | 98.1 % | pass |
| utils | 100 % | 98.26 % | 100 % | pass |
| mobile | — | 89.64 % | 93.46 % | pass (gate: 88 / 88) |
| web | 81.63 % | 75.09 % | 83.38 % | pass (`src/services` gate: lines 95, branches 80) |

During this pass, coverage dropped below two gates, and both were restored with tests rather than by lowering the gate:
- `data` was at 90.59 % branches. The new task-anchor branches and an untested `saveRow` were added to the tests.
- `mobile` was at 87.88 %. `useZodForm` had no tests and now has its own.

The context-menu module test is known to flake under heavy parallel load. It failed once during a coverage run, passed alone (13 / 13), and passed in the final run with no retries.

**Before: the 7 web failures.**
- 3 were in the other session's unfinished palette tests.
- 1 was the Calendar `?` shortcut conflict (fixed).
- 3 were timeouts under load (they pass now).

**Playwright.** The first full run on 19 Nov had 167 passed and 3 failed. All three were wrong expectations, and the tests were corrected:
- `a11y.spec.js` expected the old search box's option id `search-opt-0`; the palette uses `cmd-opt-0`.
- `notifications.spec.js` snoozed "earlier today" to 09:00, which is still in the future before 9 am (the run started at 07:55).
- `phase6.spec.js` expected "Stopped and saved" after stopping a timer a few seconds in. That was the contradictory toast being fixed: nothing is recorded under a minute.

The three spec files were then re-run: 29 / 29 passed.

**Browser checks** (in-app browser, local backend):
- 24 routes at 1280 px and 375 px on an empty account and on a seeded account: no crash, no overflow, no console errors.
- The redrawn dashboard chart renders, with 0 recharts instances on the page.
- A signed-in visit to `/reset-password` goes to `/security`.
- An Urgent, yearly task saves and shows both badges.

## 10. Build status

| Build | Result |
| --- | --- |
| Web production build (`vite build`, no backend configured) | passes. 156 precache entries (2.83 MB) |
| Web local-mode build (`VITE_LOCAL_MODE=true`, used by e2e) | passes |
| `verify-bundles.mjs` (the insecure DEV backend must not leak into production bundles) | passes |
| Mobile: `tsc` + Hermes-free test runs | pass. `expo export` and native builds not run in this pass |

Largest production chunks after the changes (gzip):

| Chunk | gzip | Note |
| --- | --- | --- |
| charts | 105.4 KB | no longer loaded on the dashboard |
| misc | 94.4 KB | |
| entry | 77.1 KB | |
| Overview | 55.9 KB | no reference to the charts chunk any more |
| db | 51.5 KB | |
| Nutrition | 39.6 KB | |

## 11. Remaining issues

### 11.1 Found, not fixed (with reason)

| Issue | Why it is left | Where to pick it up |
| --- | --- | --- |
| Realtime DELETE events reach every client (other users' deleted row ids) | Supabase applies no RLS to DELETE changes; the fix is a soft-delete or incremental-sync design | §12.1 |
| GoTrue lets any valid token change the password (no current password) until re-authentication is required | Server behaviour outside the app; the in-app path is closed and `secure_password_change` is set | §12.3; turn on "Secure password change" in the hosted dashboard |
| Restoring a backup into a *different* account while the source account still exists fails RLS on upsert-by-id | Needs re-keying of every row and foreign key | §12.4 |
| Monthly **reminders** still drift (Jan 31 → Feb 28 → Mar 28) | `reminders` keeps no original day, `remind_date` is overwritten, and the logic is mirrored into the Edge Function. Tasks are fixed (anchor read from the series) | §12.8 |
| `parseMoney` reads "12,50" as 1250 | INR users type "1,250.50"; changing comma handling needs a locale setting so their input doesn't break | §12.9 |
| Light-theme consistency items (about 12 inset-tile variants, notification tiles not using module accents, three colour palettes, palette border invisible in light mode, tab chips without arrow keys) | Cosmetic. Kept to the existing design language and left for a focused design pass, since the user rejected an unprompted redesign | §12.6 |
| Performance items: lazy shell for signed-out visitors, ₹ font subset, exercise thumbnails, dashboard grid memoisation, smart-notification table set, double fetch when a forced refresh meets an in-flight one | Larger changes with build or asset pipeline impact | §12.5, §12.7 |

Both fix agents finished their lists. The only item skipped was the reminders half of the monthly-drift fix (row above). The two mobile gaps one agent couldn't reach (cardio rows, savings total) were fixed afterwards.

### 11.2 Not verified (missing infrastructure, stated plainly)

- **No live Supabase project was used.** All SQL ran on PGlite (an in-memory Postgres) through the project's own suites. Migrations 0012–0021 have not been run on the hosted project from this session. Earlier notes say 0012–0020 were also not yet applied there.
- **Deno is not installed**, so `supabase/functions/send-reminders/index.test.ts` (and the WebAuthn and device-key function tests) were not run. The reminder pipeline logic (`logic.js`) is covered by the Node test suite (16/16).
- **No physical phone or emulator run.** Mobile is covered by `tsc`, vitest and the React Native component tests.
- **GitHub Actions workflows were not run** (they need the hosted repository and secrets).

### 11.3 Deploy steps these changes need

1. Run `supabase/migrations/0021_audit_fixes.sql` (and any of 0012–0020 not yet applied) in order, or re-run `supabase/setup-all.sql`. Both are idempotent.
2. Redeploy the reminder function: `supabase functions deploy send-reminders --no-verify-jwt`. Its `_shared/dates.ts` was regenerated by `scripts/sync-function-core.mjs`.
3. In the Supabase dashboard:
   - Set **Minimum password length 8**.
   - Turn on **Secure password change**.
   - Keep email confirmation on.
4. Rebuild and deploy the web app. Ship a new mobile build for the mobile cache fix and the job-link guard.

### 11.4 Another session's uncommitted work in this checkout (not touched)

The "Global Command Center" session has unfinished edits in `features/command/*`, `HabitsPage.jsx`, `CalendarPage.jsx`, `docs/FEATURES.md` and `docs/COMMAND_CENTER.md`. They were left alone. The only `features/command` file edited here is `useShortcuts.js`, which their work does not modify (the `?` fix). Verification ran against HEAD versions of their files, and the affected tests were also run against their edits. Reviewing that diff turned up these issues for that session to fix:

- **Accessibility:** `CommandCenter.jsx` uses Tab to jump between result groups (`preventDefault`). Keyboard users can no longer Tab to the palette's other controls; only Esc leaves.
- **Habits:** `HabitsPage.jsx`'s `?new=1` handler calls `setParams({})`, which also wipes `view=consistency`. It should delete only `new`.
- **Calendar:** "Add calendar event" goes to `/calendar?new=1`, which drops the current view and date, so the new event defaults to today rather than the day being viewed.
- **Tests:** 3 tests in `commandPalette.test.jsx` fail against HEAD sources. They are written for the unfinished feature.
- **Styling (pre-existing):** the palette uses `backdrop-blur` on phones, against the stated blur policy, and its border is invisible in light mode.

## 12. Recommended future improvements (larger than this pass, by value)

1. **Incremental sync.** Fetch only rows with `updated_at > lastSync` instead of whole tables. This is the biggest remaining cost for heavy users, because transactions, habit logs and notifications grow forever. Pair it with a soft delete, which also closes S8.
2. **Server-side jobs.** Move smart notifications, calendar alerts, recurring transactions and automations into scheduled Edge Functions, so they work while no app is open (`KNOWN_ISSUES` B8, B15, B20).
3. **Password-change hardening on the server.** Record `password_changed_at` with a trigger on `auth.users`. Then `unlock_after_login` and `reset_app_lock(null)` can refuse for a cooling-off period after a password change that did not come from a recovery link.
4. **Restore into a different account while the source still exists.** Re-key every row and remap every foreign key through one id map. Today, ids owned by the old account make upserts fail RLS.
5. **Bundle.**
   - `lazy()` the AppShell and the auth pages, so signed-out visitors don't download the shell (about 140 KB gz).
   - Add a one-glyph font subset for ₹, so money pages don't pull the 133 KB `latin-ext` Inter file.
   - Use 320 px WebP exercise thumbnails with `srcset` instead of 850 px JPEGs (average 57 KB, largest 919 KB).
6. **Design-system consistency within the current violet look.**
   - One `.lt-inset` tile instead of about 12 hand-rolled variants.
   - Map notification tiles to module accents.
   - One shared colour palette for habits and the Life Map.
   - Proper keyboard behaviour for the widget-library and workspace tab chips.
7. **Dashboard rendering.**
   - Memoise widget items and menus.
   - Gate each widget on its own tables instead of all 18.
   - Measure the grid width before the first render (`DashboardGrid`).
8. **Monthly recurrence anchor in the database.** Store the series' original day of month for tasks and reminders, so dates stay exact for months shorter than that day (an anchor on the 31st falls on Feb 28, then back on Mar 31).
9. **Money input in other locales.** `parseMoney` treats commas as thousands separators, so "12,50" in a comma-decimal locale becomes 1250. Add a locale-aware parser or a decimal-separator setting.
10. **Lint and format for `apps/mobile` and `packages/*`.** Today only `tsc` covers them (`KNOWN_ISSUES` T5).

No AI assistant was added, and no feature that duplicates an existing one.
