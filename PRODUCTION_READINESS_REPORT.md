# LifeTrack production-readiness pass, 25 Nov 2026

**Branch:** `main` at `b398e1e` (clean at the start) · **Scope:** `apps/web`, `apps/mobile`, `packages/*`, `supabase/` (migrations, RLS, Edge Functions, tests), CI/deploy.
**Nothing was committed.** Every change is in the working tree and listed in §5.

This pass builds on three earlier records and does not repeat them: [LIFETRACK_COMPLETE_AUDIT_REPORT.md](LIFETRACK_COMPLETE_AUDIT_REPORT.md) (18–19 Nov), [docs/MISSION_REPORT_NOV25.md](docs/MISSION_REPORT_NOV25.md) and [docs/PLATFORM_CHECKLIST.md](docs/PLATFORM_CHECKLIST.md). Where they already covered an area with tests (DB indexes and EXPLAIN benchmarks, lazy loading, the ₹ font subset, RLS per table), I re-ran the evidence instead of redoing the work.

## 1. Architecture summary

- **Clients:** `apps/web` is a React 18 + Vite PWA with 41 routes and 40 feature folders. `apps/mobile` is an Expo app. Both talk to Supabase directly: there is no custom API server for the apps.
- **Authorisation:** Row Level Security on every table, plus SECURITY DEFINER functions for anything cross-row. Module locks and the app lock are enforced in SQL.
- **Shared code:**
  - `packages/core`: pure domain rules, shared with the Edge Functions through generated `_shared` copies.
  - `packages/data`: the API adapter.
  - `packages/schemas`, `utils`, `constants`, `design-tokens`, `types`.
- **Server:**
  - 32 additive migrations (`0001`–`0032`).
  - 7 Edge Functions: `send-reminders`, `api`, `webhook-dispatch`, `webauthn`, `device-key`, `google-integration`, `google-oauth-callback`.
  - The public REST API authenticates with hashed API keys, scopes and per-key rate limits.
- **Web data:** an in-memory store (optimistic writes, Realtime patches, in-flight de-duplication), an encrypted offline cache and an outbox.
- **Tests:**
  - vitest for web, core, data, schemas, utils, tokens and mobile.
  - jest-expo for React Native screens.
  - PGlite (an in-memory Postgres) for SQL and RLS.
  - Playwright (desktop and mobile projects) with axe.
  - Eight GitHub workflows.

## 2. Baseline (before any change in this pass)

| Check | Result |
| --- | --- |
| `apps/web` vitest | 1,443 / 1,453; the 10 failures were all timeouts while a Playwright run shared the CPU (§7) |
| `packages/core` | 1,174 / 1,174 |
| `packages/data` · `schemas` · `utils` · `design-tokens` | 289 · 143 · 61 · 4, all passed |
| `supabase/tests` pglite + static | all passed |
| `apps/mobile` vitest · jest (React Native) | 235 / 235 · 125 / 125 |
| Typecheck (all packages), ESLint, secret scan, migration safety, `verify-sql` | clean |
| Production build (no credentials) | succeeds |

## 3. Audit findings, by severity

| # | Severity | Area | Finding | Status |
| --- | --- | --- | --- | --- |
| F1 | **Medium** | API (Edge Function) | The public API's pagination cursor was accepted if `Date.parse` could read its timestamp, and the timestamp is spliced into a PostgREST `or=` filter. `Date.parse("Jan 1 2020 (or(x))")` is valid (V8 ignores text in parentheses), so a caller could inject filter syntax. The owner filter is applied separately, so other users' rows were never reachable, but the query could be reshaped or made to fail | **Fixed** (§4.1) |
| F2 | **Medium** | CSV import | `2026-02-30`, `2025-02-29` and `2026-04-31` passed the importer's date check, because V8 rolls them into March or May. The preview showed them as fine, then Postgres refused the whole 200-row chunk, and the import stopped partway. The in-browser backend would store the impossible date | **Fixed** (§4.2) |
| F3 | **Medium** | Integrations (OAuth) | The Google OAuth `state` is HMAC-signed and holds the user id, but it is not bound to the browser that started the flow, and it can be replayed for its 10 minutes. Someone could send a victim a consent link started from their own account: the victim's Google Calendar or Drive would then be linked to the sender's LifeTrack account | **Fixed** (§4.5); needs a redeploy and one check against real Google |
| F4 | Low | Database | `_audit_gate(text)` (0027) was executable by `anon`. `handle_new_user()` (0001) was executable by every client role; it is harmless because trigger functions can't be called directly, but the hosted advisor flags it | **Fixed** by migration 0031 |
| F5 | Low | Tests | Five tables with a `user_id` (`integrations`, `integration_events`, `integration_tokens`, `platform_admins`, `experiment_events`) were missing from the RLS fixture map. Each has its own lock test, but nothing would catch the next table someone forgets | **Fixed**: new catalog-wide guard (§4.3) |
| F6 | Low | Web, XSS defence in depth | Challenge evidence links rendered `href={e.url}` unchecked. The database enforces `https?://`, but rows from the in-browser backend or a restored backup skip that check | **Fixed**: same `isSafeUrl` guard as the Jobs page |
| F7 | Low | Accessibility | Calendar: the now-line was a `div` with a forbidden `aria-label`, and the hour grid could not be scrolled by keyboard on an empty day. Recovery: an inline link was marked out by colour only. Legal pages had no `h1` and no `main` landmark. The a11y spec only covered the 17 oldest pages | **Fixed**: the spec now covers every route (§4.4) |
| F8 | Low | Deploy | `deploy-functions.yml` deployed only `send-reminders`; the other six functions had no deploy path in CI | **Fixed**: all seven, with each one's JWT setting |
| F9 | Low | API | `_emit_restored(uuid, text)` is callable by signed-in users, because `audit_restore` (SECURITY INVOKER) needs it. A person can queue a `data.restored` webhook to their own endpoint for one of their own audit events, once per event, without restoring anything. No other user is affected | **Fixed** by migration 0032: `_emit_restored` now needs the audit row that a real restore writes (`restored_from`), and a mode that `audit_restore` produces |
| F10 | Info | Webhooks | SSRF protection resolves DNS and checks every address before the call, but `fetch` resolves again, so a fast DNS-rebinding host could still land on a private address. Closing it needs pinning the connection to the checked IP, which Deno's `fetch` doesn't offer directly | Documented (§9) |

Known items carried over (still open, unchanged): Realtime DELETE events reveal deleted row ids to other subscribers; whole-table loading on both apps; reminders and smart notifications only run while an app is open (B15, B20); migrations from 0012 on are unverified on the hosted project. See `docs/KNOWN_ISSUES.md` and the earlier report's §11–§12.

## 4. Fixes, with proof

### 4.1 API cursor (F1)

`supabase/functions/_shared/platformApi.js` `decodeCursor`:
- only a strict ISO 8601 timestamp is accepted (`YYYY-MM-DDTHH:MM:SS[.ffffff](Z|±HH[:MM])`), and the id must be a real UUID;
- the value is kept exactly as sent, so Postgres microseconds survive and keyset paging does not skip rows.

New test in `packages/core/tests/api-gateway.test.js`: three injection-shaped cursors and a non-UUID id are rejected with `bad_request`, and a microsecond timestamp with an offset round-trips. Result: 19 / 19.

### 4.2 CSV import dates (F2)

`apps/web/src/services/csvImport.js` now uses the shared `isValidDay`, which round-trips the date. Two new tests are in `tests/importPreview.test.jsx`:
- impossible dates are reported per line, and 29 Feb 2024 is accepted;
- `"₹1,250.50"` and Indian-grouped `"1,00,000"` parse to the right paise.

### 4.3 Catalog-wide database guards (F4, F5, F9)

New `supabase/tests/pglite/catalog.test.ts` runs after every migration and reads the system catalog. It checks that:
- every `public` table has RLS on;
- every table with `user_id` is in the RLS fixture map;
- `anon` holds no table privilege;
- every SECURITY DEFINER function pins `search_path`;
- no SECURITY DEFINER function is callable with the anon key;
- `_`-prefixed helpers are not callable by signed-in users, except a reviewed list of three (each with its reason in the test);
- no trigger function is executable by a client role.

On its first run it found F4 and F5. `supabase/migrations/0031_function_grants.sql` (additive, idempotent, grants only) fixes F4, and `fixtures.ts` lists the five tables. `supabase/setup-all.sql` was regenerated with 0031.

### 4.4 Accessibility and responsive coverage (F7)

- **`e2e/a11y.spec.js`** (axe, WCAG 2 A/AA, serious and critical): adds 16 newer routes and both legal pages, so every route that needs no id is now scanned.
  - First run: violations on `/calendar` (2), `/recovery` (1) and the legal pages.
  - After the fixes: 5 / 5 tests pass.
- **New `e2e/responsive-sweep.spec.js`** (mobile project) covers 34 routes at 360, 390, 768, 1024, 1440 and 1920 px, on an **empty** account. The earlier manual sweep used seeded data only, so empty states were never checked. It fails on:
  - page-level horizontal overflow;
  - any element in `main` or a dialog running past the right edge without a scroll or clip parent;
  - any uncaught page error.
  - Result: passes (1.4 min).
  - While building it, I found that resizing in place briefly overflows by about 48 px at 360 px on 7 pages while the layout catches up. It is gone within 300 ms and never visible to someone loading at that width, so the test waits for the layout to settle instead.
- Code changes, all in the existing violet design (no visual change except the Recovery link, which is now always underlined):
  - `TimeGrid.jsx`: the hour grid is a focusable, labelled region with a focus ring, and the now-line has `role="img"`.
  - `RecoveryPage.jsx`: the inline link is underlined.
  - `LegalPage.jsx`: has a `<main>`.
  - `lib/markdown.jsx`: gets a `headingOffset` prop (default 1, so notes are unchanged), and the legal pages pass 0, so their title is an `h1`.

### 4.5 Google connection bound to the signed-in account (F3)

`google-oauth-callback` no longer exchanges the code or stores anything. It checks the signed state and redirects to `/integrations#gcode=…&gstate=…`. The fragment is never sent to a server or written to a log. The keys are deliberately not `code`, which supabase-js reads from the hash as its own PKCE callback; this collision was found by the review in §4.8.

The Integrations page clears the fragment first, then calls the new `finish` action. `google-integration` stores tokens only if the state names the **caller**; otherwise it answers `403 wrong_account` and connects nothing. Google's code is single-use, so a leaked fragment cannot be replayed.

Tests:
- `packages/core/tests/google-integration.test.js` (30 / 30): the callback alone stores nothing and makes no Google call, a link started by another account is refused, and the full round trip connects.
- `apps/web/tests/integrations.test.jsx` (10 / 10): the page finishes once, clears the address bar and explains a wrong-account refusal.

### 4.6 PDF and CSV samples (step 10)

**PDF.** I generated ten sample PDFs with `PDF_SAMPLES_DIR` and inspected them with PyMuPDF:
- Every page has the "Page N of M" footer (up to 64 of 64).
- No text runs off the page.
- No replacement characters.
- Inter is embedded and subset.
- ₹ renders (861 times in the year report).

I also rendered pages to images and looked at them: the month report's cover and KPIs, charts, tables, and the year report's last page with its repeated table header.

Findings:
- As documented, Latin-only fonts mean CJK and Tamil print as `?`, emoji are dropped and ✓ becomes `v`. Tamil food names would print as `?`.
- Cosmetic: whole-rupee amounts drop the decimals (`₹1,690` next to `₹1,963.50`), so the money column doesn't line up on the decimal point.

**CSV.** I wrote a real transactions export and checked it byte by byte: UTF-8 BOM, CRLF row breaks, doubled quotes, `'` before `=…` and `+…` (formula injection), a line break inside a quoted cell, Tamil and ₹ intact. The importer reads it back (round-trip test), and the impossible-date fix is in §4.2.

### 4.7 Click-through of every control (steps 4 and 5)

A scratch Playwright crawler (not part of the suite, because its results need a person to triage them) started demo mode, which has realistic sample data in every module. On each of 33 routes it clicked every visible button, tab, switch, checkbox and summary inside `<main>`, up to 45 per page. After each click it watched for any DOM change, navigation, focus or `aria` state change, download or popup, then reset with Escape. It skipped sign out, exit or reset demo, delete account and print.

- **577 controls clicked, 0 page errors.**
- **12 showed no visible change.** I probed each one:
  - 10 were tabs or segments that were already selected (`aria-selected=true`).
  - "Restore from JSON…" opens the file chooser (confirmed with Playwright's `filechooser` event).
  - "Fit to screen" on the Life Map does nothing on a map that is already fitted when it loads.
- **No dead or fake controls were found.**

Limits:
- Header, sidebar and the inside of dialogs were not crawled; they are covered by the existing specs.
- Only the first 45 controls per page were clicked.
- One data set (demo) was used.
- Module journeys (create, edit, complete, delete per module) are the existing e2e specs, which all passed (§7).

### 4.8 Independent review (step 13)

I ran the code-review skill at high effort over the whole working-tree diff. It reported 6 findings:

| Finding | Outcome |
| --- | --- |
| **Important:** the `code` fragment key collides with supabase-js PKCE detection | Fixed (§4.5) |
| An old cached web build ignores the new fragment | Fixed: deploy order is now in §10 |
| No permanent proof that the 0031 revoke leaves sign-up working (the suite runs as superuser) | Fixed: a new catalog test shows that a revoked trigger function still fires for a non-superuser role |
| An empty evidence list renders when every link is filtered out | Fixed |
| `finish` has no throttle | Fixed: at most 5 failed finishes per person per 10 minutes, then `429` without calling Google |
| `_emit_restored` (F9) | Fixed: migration 0032; new platform test shows a direct call queues nothing |

## 5. Files modified

| File | Change |
| --- | --- |
| `supabase/functions/_shared/platformApi.js` | strict cursor decoding (F1) |
| `packages/core/tests/api-gateway.test.js` | cursor injection test |
| `apps/web/src/services/csvImport.js` | strict date validation (F2) |
| `apps/web/tests/importPreview.test.jsx` | impossible-date and ₹/Indian-grouping tests |
| `supabase/migrations/0031_function_grants.sql` (new) | revoke `_audit_gate` from anon; revoke `handle_new_user` from client roles (F4) |
| `supabase/migrations/0032_restore_webhook_guard.sql` (new) | `_emit_restored` only for a real restore (F9) |
| `supabase/tests/pglite/platform.test.ts` | direct-call test for 0032 |
| `supabase/functions/_shared/googleStore.js` | `countEvents` for the finish throttle |
| `supabase/setup-all.sql` | regenerated (adds 0031 and 0032) |
| `supabase/tests/pglite/catalog.test.ts` (new) | catalog-wide guards |
| `supabase/tests/pglite/fixtures.ts` | five server-only tables listed (F5) |
| `apps/web/src/features/challenges/ChallengeDetail.jsx` | safe-URL filter on evidence links (F6) |
| `apps/web/src/features/calendar/TimeGrid.jsx` | focusable hour region; now-line role (F7) |
| `apps/web/src/features/recovery/RecoveryPage.jsx` | underlined inline link (F7) |
| `apps/web/src/features/legal/LegalPage.jsx`, `apps/web/src/lib/markdown.jsx` | `main` landmark, `h1` (F7) |
| `apps/web/e2e/a11y.spec.js` | 16 more routes and the legal pages |
| `apps/web/e2e/responsive-sweep.spec.js` (new) | every route × 6 widths, empty account |
| `.github/workflows/deploy-functions.yml` | deploys all seven functions (F8) |
| `docs/CI.md`, `docs/DEPLOY.md` | describe the new deploy steps |
| `supabase/functions/google-integration/logic.js`, `supabase/functions/google-oauth-callback/index.ts` | `finish` action; the callback hands back instead of storing (F3) |
| `apps/web/src/services/integrations.js`, `apps/web/src/features/integrations/IntegrationsPage.jsx` | finish the connection from the signed-in page |
| `packages/core/tests/google-integration.test.js`, `apps/web/tests/integrations.test.jsx` | login-CSRF and round-trip tests |
| `docs/INTEGRATIONS.md`, `docs/KNOWN_ISSUES.md` | the new flow; open items |
| `PRODUCTION_READINESS_REPORT.md` (new) | this report |

## 6. Performance (measured; no change justified)

Production build without credentials, gzip sizes:

| Measure | Value |
| --- | --- |
| JS + CSS referenced by `index.html` (34 files, including modulepreloads) | **259.8 KB** |
| All JS + CSS chunks | 1,487.8 KB in 245 chunks |
| Largest lazy chunks | PDF engine 496 KB (loaded only on export), charts 102 KB, toast/feedback 81 KB (initial), Dashboard 55 KB |

The Nov 25 pass already lazy-loaded the shell and added the ₹ subset: 383 → 277 KB in a local-mode build. The DB side has EXPLAIN-backed benchmarks at 10 k/50 k/100 k rows in `docs/benchmarks/db-performance.md` (migration 0028 indexes). I found no measured hotspot that justified a further change, and I made none. The remaining large costs are structural: whole-table loading, and the 81 KB feedback chunk on first paint. They are listed in §9.

## 7. Test results after the changes

Final run: every suite in sequence on a quiet machine, after all fixes.

| Suite | Result |
| --- | --- |
| `apps/web` vitest | **1,456 / 1,457**. The one failure (a Smart Recovery clash test) passed 9 / 9 on two immediate re-runs of its file. An earlier full run had 2 different failures in `contextMenu/modules.test.jsx`, which passed 13 / 13 alone. Both are long jsdom interaction tests that time out under load, and no page they cover was changed here except a CSS class. No backend or rate-limit errors |
| `packages/core` | 1,177 / 1,177 |
| `packages/data` · `schemas` · `utils` · `design-tokens` | 289 · 143 · 61 · 4, all passed |
| `supabase/tests` pglite + static | **583 / 583** (with 0031, 0032 and the catalog guards) |
| `apps/mobile` vitest · jest (React Native) | 235 / 235 · 125 / 125 |
| Mobile `expo export` (Android and iOS Hermes bundles) | builds. Neither bundle contains the real project URL |
| **Playwright, full suite** (desktop and mobile projects) | **176 passed, 1 skipped, 1 failed**. The failure was an axe scan timing out at 45 s while other work loaded the CPU. That spec (`notifications.spec.js`) then passed 12 / 12 alone |
| Playwright `a11y.spec.js` (now every route) · `responsive-sweep.spec.js` (new) | 5 / 5 · 1 / 1 |
| Click-through crawler (scratch) | 577 controls on 33 routes, 0 page errors, 0 dead controls (§4.7) |
| `verify-bundles` | 4 / 4 PASS |
| Typecheck (all packages), ESLint, Prettier, secret scan, migration safety (32 additive), `verify-sql`, function-core sync | all clean |
| SQL drift (`setup-all.sql` vs migrations) | regenerated, includes 0031 and 0032 |

All tests run hermetically: blank `VITE_SUPABASE_*`, the in-browser backend, PGlite. **No real Supabase project was contacted.**

## 8. Build status

The production build succeeds. The initial download is 259.8 KB gzipped, the same as the baseline. The local-mode e2e bundle was built in the scratchpad, never in `apps/web/dist`. I checked that it contains no real project URL, only the `<project-ref>` placeholder in the API docs page.

## 9. Remaining debt and limits (honest)

- **Not done in this pass:**
  - No physical device or emulator run for mobile (both Hermes bundles build; see §7).
  - No screen-reader (VoiceOver/TalkBack) pass and no manual colour-contrast review. Axe runs with its contrast rule off, as the project chose.
  - Spacing and visual hierarchy were not re-judged page by page. The checks were overflow, axe, page errors and the click-through. The violet design was left as it is.
  - Nothing ran against the hosted Supabase project or real Google.
- **Cosmetic, PDF:** money columns mix `₹1,690` and `₹1,963.50` (§4.6). CJK and Tamil text prints as `?` because only Latin fonts are embedded.
- **F3** is fixed in code, but not yet run against real Google (no credentials here).
- **F10, DNS rebinding:** pin the resolved address (connect by IP with a `Host` header and SNI), or route webhooks through an egress proxy.
- **Carried over:** Realtime DELETE id exposure; whole-table loading and incremental sync; server-side jobs for smart notifications and calendar alerts; `parseMoney` with comma-decimal locales; restore into a different account; the OS app-switcher snapshot on mobile.
- **Flaky tests:** heavy jsdom interaction tests (`contextMenu/modules`, `moduleLocks`, `recovery`) and one axe scan time out under CPU load; each passes alone. The fix is splitting the long scenario tests, or running web tests with fewer workers on CI.

## 10. Manual deployment steps

1. **Database:** run every migration not yet on the hosted project, in order, up to **0032**. Use the *Database migrations (manual)* workflow (dry run first) or `supabase/setup-all.sql`; both are idempotent. Earlier notes say 0012 onwards have not been confirmed there.
2. **Functions:** run *Deploy Edge Functions (manual)*, which now deploys all seven. If Google integrations are live, deploy the web app (step 5) first, so no cached page meets the new callback. Before or after, set:
   - `CRON_SECRET`;
   - the Google secrets (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_STATE_SECRET`, `APP_ORIGIN`);
   - `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGINS`.

   Schedule `send-reminders` and `webhook-dispatch` each minute.
3. **Auth dashboard:** minimum password length 8, *Secure password change* on, email confirmation on, leaked-password protection on, redirect allow-list.
4. Insert yourself into `platform_admins` for System Health and Feature Management.
5. **Web:** deploy the web app **before** redeploying `google-oauth-callback`. An old cached page does not know the new hand-back, so a connection made during the gap would not complete. Build with the real `VITE_SUPABASE_*` and deploy (`vercel.json` / `_headers` carry the CSP and HSTS).
6. **Mobile:** ship a new build for the earlier fixes. Nothing in this pass changes mobile.

## 11. Next steps, by value

1. Redeploy the Google functions and connect a real Google account once to confirm the new flow (F3).
2. Incremental sync with soft deletes (fixes whole-table loading and the Realtime DELETE exposure).
3. Server-side scheduled jobs for smart notifications and calendar alerts.
4. Run the full Playwright suite in CI on every PR (it exists in `ci.yml`; prove it green on GitHub).
5. Split the long jsdom interaction test files so the web suite is not load-sensitive.
