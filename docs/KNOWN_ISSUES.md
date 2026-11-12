# Known issues

Findings from this documentation audit (2026-11-10), merged with limitations the project already records ([README.md](../README.md), [RELEASE_AUDIT.md](RELEASE_AUDIT.md), [UX_AUDIT.md](UX_AUDIT.md), [PARITY.md](PARITY.md)).
Each item states how it was verified. Severity: **High** (can break a release or data), **Medium**, **Low**. Nothing here has been changed in code — this task was documentation only.

## 1. Documentation drift (code is right, documents are wrong or old)

| # | Where | Problem | Sev |
| --- | --- | --- | --- |
| D1 | `docs/SETUP.md` §2 | Lists migrations `0001`–`0008`; `0009_nutrition.sql` and `0010_food_database.sql` exist and are needed for Food & Nutrition | **High** (a new deploy following it has no nutrition tables) |
| D2 | `docs/QUICKSTART.md` step 2 | Mentions `0004_indexes_and_owner_guards.sql`, which does not exist (the file is `0004_hardening.sql`) | Medium |
| D3 | `docs/SETUP.md` §1 | `cp .env.example .env.local` at the repo root; the examples are `apps/web/.env.example` and `apps/mobile/.env.example` | Low |
| D4 | `docs/RELEASE.md` §3 | "all migrations through `0008`" | Medium |
| D5 | `README.md` "Existing Supabase projects" and `docs/NATIVE.md` step 4 | Stop at `0008` | Medium |
| D6 | `docs/RELEASE_AUDIT.md` S5 | "All 5 SECURITY DEFINER functions"; migrations define 4 (`handle_new_user`, `delete_my_account`, `register_push_token`, `unregister_push_token`) | Low |
| D7 | `docs/RELEASE_AUDIT.md` | Says "All 12 modules"; there are now 13 mobile modules (Food & Nutrition) and the planner is *not* virtualised (UX_AUDIT P3) | Low |
| D8 | `packages/data/src/api.js` (`fireDueReminders` comment) | Says "there is no background server push in this build"; the Edge Function exists | Low |
| D9 | `packages/data/src/errors.js` | The missing-table message tells users to run migration `0003` only | Low |
| D10 | `supabase/tests/package.json` | Description mentions "Real-Postgres pgTAP tests live in ./database"; that folder does not exist (real-Postgres tests are in `postgres/`) | Low |
| D11 | `CHANGELOG.md` | Only `[Unreleased]` and `[1.0.0]` exist although mobile is at `2.3.0` and seven APKs `1.0.0`–`2.3.0` were built; says versions are "mirrored in `apps/web/package.json`" which is still `1.0.0` | Medium |
| D12 | `README.md` "Honest status" | Predates Food & Nutrition and exercise database; "12 modules" in `CHANGELOG.md` 1.0.0 | Low |
| D14 | `docs/RELEASE.md` §1 | Refers to `docs/store/STORE_DATA_SAFETY.md`; the file is `docs/legal/STORE_DATA_SAFETY.md` | Low |
| D13 | Versioning | `apps/mobile/app.config.ts` is `2.3.0` (git tag `v2.3.0`), but tags exist only for `v1.0.0`–`v1.0.2` and `v2.3.0`; APKs `1.1.0`, `2.0.0`, `2.1.0` have no tag and no changelog section | Low |

## 2. Bugs and functional gaps

| # | Area | Issue | Sev | Status |
| --- | --- | --- | --- | --- |
| B1 | Global search | Does not search foods, food logs, workouts or exercises; the command palette has no "Log food" action | Medium | 🟡 gap |
| B2 | Reports / Analytics page | Neither includes nutrition (Reports `TABLES` list and Analytics sections have no food data); the daily score ignores food and water entries except through `health_logs.water_ml` | Medium | 🟡 gap |
| B3 | Finance | `budgets.category` supports per-category budgets; only the overall monthly budget is editable | Low | 🟡 table-ready, UI missing |
| B4 | Fitness | No rest timer between sets, no estimated 1RM, no set types/supersets | Medium | ❌ not built |
| B5 | Fitness data | Sets reference exercises by *name*; renaming a library exercise does not rename past sets; `exercise_id` is null for names that were never added to "My exercises" | Low | by design |
| B6 | Habits | Changing a habit's schedule re-judges past days against the new schedule | Low | documented limitation |
| B7 | Focus / study | A running timer's length uses the device clock at stop (can only be corrected downward); focus timer state is per device | Low | documented |
| B8 | Recurring transactions | Posted only by an open app, never by the server; nothing posts while no device is open (back-dated when one opens) | Low | by design |
| B9 | Backup | Restore only merges: items deleted since the backup return; no mobile export; `profiles` and `device_push_tokens` not exported | Medium | by design / gap |
| B10 | Favourite foods | One JSON list: simultaneous toggles on two devices keep the later write | Low | documented |
| B11 | Mobile exercise database | Depends on the web deployment (`EXPO_PUBLIC_WEB_URL`) being up and serving `/exercises/` | Medium | by design |
| B12 | Exercise catalog | 3 of 876 exercises have no photos | Low | upstream |
| B13 | Job Switch (mobile) | List instead of board; no month calendar | Low | deliberate |
| B15 | Calendar alerts | Events and tasks alert only while LifeTrack is open on some device; the `send-reminders` Edge Function does not read `calendar_events`, so there is no push to a closed app | Medium | 🟡 gap |
| B16 | Calendar | Web only (no mobile screen). The whole `calendar_events` table is loaded and expanded on the device | Medium | by design |
| B17 | Calendar | Repeating **tasks** keep the Planner's model (one open occurrence at a time): no "this and following", no custom schedules, no end-after-N | Low | by design |
| B18 | Calendar | Moving a repeating event "this and following" is several writes with a compensating undo, not one database transaction; the stale-version check is made on the device, not by the database | Low | documented |
| B19 | Calendar | Week start is Monday or Sunday only (the app-wide setting); not covered by a live Supabase run (verified on pglite, the in-memory test database and the local backend) | Low | documented |
| B20 | Notification Center | Smart notifications (tasks, habits, fitness, finance, jobs, learning, goals) and calendar alerts are made only while LifeTrack is open on some device; no server job makes them, so nothing arrives for a closed app (reminders do, via the Edge Function, still unproven live: U3) | Medium | 🟡 gap |
| B21 | Notification Center | Desktop notifications need an open browser tab (no Web Push: no service-worker handler, VAPID keys or sender) | Medium | by design |
| B22 | Notification Center | The mobile app has no priority picker, snooze or quiet-hours screen (quiet hours are applied by the server to its pushes); a notification deleted from History can be made again today by a device that never saw it | Low | gap |
| B14 | Seed data | New accounts get default learning topics oriented to a software career (Frontend, Backend, DSA, AI, Projects) | Low | product choice |

## 3. Incomplete / unproven (written, never run live)

| # | Item | Sev |
| --- | --- | --- |
| U1 | All six GitHub Actions workflows (`ci.yml` … `mobile-build.yml`) | Medium |
| U2 | `ci-backend.yml`: real-Supabase API-level RLS and two-device sync | Medium |
| U3 | `send-reminders` against a live project, `pg_cron` scheduling, Expo → APNs/FCM delivery | **High** for reminders |
| U4 | EAS builds, Maestro device flows, native pickers/keyboard/deep links on devices | Medium |
| U5 | Screen-reader (VoiceOver/TalkBack) and dynamic-type behaviour | Medium |
| U6 | `npx expo install --check` SDK alignment | Medium |
| U7 | Hosted Supabase Auth hardening (confirmation, leaked-password protection, redirect list) | **High** before launch |
| U8 | Whether migrations `0009` and `0010` have been applied to any hosted project cannot be determined from the repository; the changelog marks them "run before releasing" | **High** until confirmed |
| U9 | Legal drafts: `[placeholder]` entity/contact/region/date remain in `docs/legal/*`, `LICENSE`, `SECURITY.md` | **High** for store release |
| U10 | Final app icon art is a placeholder (RELEASE_AUDIT) | Low |

## 4. Technical debt

| # | Debt | Sev |
| --- | --- | --- |
| T1 | **Duplicated domain layers.** `packages/core/src/*.js` (shared) and `packages/core/src/web/*.js` both hold logic for ~11 domains (analytics, dashboard, finance, fitness, goals, habits, health, jobs, learning, notes, tasks); 9 other `web/` files are one-line re-exports. Parity is protected by golden tests, but changes may need to be made twice (UX_AUDIT P2) | Medium |
| T2 | Two state/cache implementations: web `hooks/store.js` (custom) vs mobile TanStack Query | Medium |
| T3 | Whole-table loading on both apps (see [PERFORMANCE.md](PERFORMANCE.md)) | Medium |
| T4 | No central error reporting/crash analytics ([ERROR_HANDLING.md](ERROR_HANDLING.md)) | Medium |
| T5 | Lint/format cover `apps/web` only; mobile and packages rely on `tsc` | Low |
| T6 | Unused or odd dependencies: mobile `@react-native-community/datetimepicker`, `@types/jest` 30 vs `jest` 29, web `workbox-window` ([DEPENDENCIES.md](DEPENDENCIES.md)) | Low |
| T7 | CI actions pinned by major tag, not SHA | Low |
| T8 | Dependabot ignores all majors: Tailwind 4, Recharts 3, Jest 30, TypeScript 7 await manual migration | Low |
| T9 | `supabase/setup-all.sql` and migrations must be kept in sync by `pnpm sql:build` (CI-checked) | Low |
| T10 | `apps/web/dist` and `apps/web/dist-perf` in the working tree are stale builds (git-ignored) | Low |
| T11 | The Edge Function's `_shared/` code is generated; forgetting `sync-function-core.mjs` fails CI | Low |
| T12 | 99 MB of exercise photos live in git | Low |

## 5. Performance concerns

See [PERFORMANCE.md §7](PERFORMANCE.md): full-table fetches, 30-table Realtime channel, 98 KB gzip chart chunk, no field metrics. The Phase 8A claim that the Planner is virtualised is incorrect.

## 6. Security concerns

See [SECURITY.md §9](SECURITY.md): unbounded free-text/JSON columns, client-writable `application_history`/`notifications`, localStorage session on web, `style-src 'unsafe-inline'`, Edge Function reachable with any method, no MFA, plaintext data and backups,
no external security review, placeholder `SECURITY.md` contact.

The Security & Privacy work (migration 0012, [APP_SECURITY.md](APP_SECURITY.md)) adds these, all by design and documented there:
- **The mobile app lock and its fingerprint / face unlock have not been run on a physical device** (nor the two Edge Functions under Deno or against a live Supabase project). The logic, the server rules and both Hermes bundles are tested here; the system prompts, the key store's behaviour, `AppState` and the native build are not ([APP_SECURITY.md §9.3](APP_SECURITY.md)). Walk through the smoke test in §7 on an Android phone and an iPhone before release.
- **Phone fingerprint / face unlock is inactive until `0014_device_keys.sql` is run and `supabase functions deploy device-key` is done.** Until then the phone's Security screen says so and only the PIN is offered. The phone also needs a new native build.
- **The phone's biometric key is not in secure hardware for its whole life:** it is released into the app's memory to sign, in JavaScript. It still cannot be read without a fingerprint or face check, and a server-verified signature is the only thing that unlocks anything; a hardware-resident key would need a native module ([APP_SECURITY.md §9.2](APP_SECURITY.md)).
- **After a phone unlocks, the app starts at the home tab,** and anything typed but not saved when it locked is gone: nothing is mounted behind the lock. The OS app-switcher snapshot of an unlocked app is not covered by a privacy screen.
- **The lock does not protect the account.** GoTrue lets any valid session change the password or email; enable *Secure password change* and keep sessions short.
- **The password lockout hook and the passkey function are inactive until you configure them** (dashboard hook; `supabase functions deploy webauthn` plus `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGINS`). Neither has run against a live Supabase project, and the function has not run under Deno (its logic is tested in Node).
- A signed-out device's access token stays valid until `jwt_expiry` (1 hour by default); with the lock on, the gated tables close at once.
- A 4 or 6 digit PIN is protected by the online lockout, not by the hash. Only six tables are closed on the server; the rest are hidden by the lock screen only.
- `supabase/tests` has pre-existing TypeScript errors in `pglite/calendar.test.ts` and `notifications.test.ts` (`unknown` row types); they do not affect the test run.

## 7. Compatibility

- Android release APKs are ARM-only and crash on an x86_64 emulator (build a debug APK for x86_64).
- Expo Go is unsupported (native modules: SecureStore, dev client, notifications) — use a development build.
- iOS push cannot be tested in a simulator.
- Web: requires a browser with service workers for PWA install; production headers assume HTTPS. React 18 on web vs React 19 on mobile (shared packages are React-free).
- Tamil text in the food database uses system fallback fonts (Inter has no Tamil glyphs); not visually audited.
- Playwright 1.64 needs a matching browser build (`PW_CHROMIUM_PATH` or `playwright install`) — UX_AUDIT P4.
