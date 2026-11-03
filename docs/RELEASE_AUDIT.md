# Release audit (Phase 8A)

Findings from the pre-release review of web, mobile, database and pipeline. Severity: **High** blocks release, **Medium** should be fixed or consciously accepted,
**Low** is housekeeping. "Status" says what was done in this phase.

## Security

| # | Finding | Sev | Status |
|---|---|---|---|
| S1 | Cross-owner foreign keys: 11 child tables could reference another user's parent row (RLS checks only the row's own `user_id`). | High | **Fixed**: same-owner triggers (`check_fk_owner`, migrations `0004`/`0005`), covered by a catalog test in `supabase/tests` that fails for any new unguarded FK. |
| S2 | `zod` < 4.6.6 can exhaust memory on oversized collections (advisory, high). | High | **Fixed**: upgraded to 4.6.x; schemas, drift, backup and e2e suites pass. |
| S3 | `react-router` < 7.18 open redirect via backslash and constructor injection in `deserializeErrors` (moderate). | Medium | **Fixed**: upgraded to 7.18.x. The app also only ever navigates to paths it builds itself. |
| S4 | Remaining `pnpm audit` items: `glob`/`minimatch` (inside `@expo/cli`, a build-time tool) and `deepmerge` (inside jest). | Low | **Accepted**: dev/build tooling, never shipped in the app or run on user input. Re-check after the next Expo SDK upgrade. |
| S5 | All 5 `SECURITY DEFINER` functions set `search_path`; `delete_my_account` / push-token RPCs check `auth.uid()` and are not executable by `anon`. | — | Verified (pglite, real PostgreSQL, and API-level tests). |
| S6 | Service-role key: not referenced by any client source or bundle; scanner runs in CI on sources and both bundles; production mobile builds refuse a secret-looking public key. | — | Verified. |
| S7 | Edge Function `send-reminders` fails closed without `CRON_SECRET`; tested under Deno. | — | Verified. |
| S8 | Deep link `lifetrack://auth-callback` only accepts a PKCE `code` that Supabase must validate; errors are shown generically. | — | Verified by reading; device test listed in `RELEASE.md`. |
| S9 | No `dangerouslySetInnerHTML` / `innerHTML`; notes use a markdown renderer that builds React elements. No `console.*` output of user data. | — | Verified by search. |
| S10 | Supabase **Auth settings are outside the repo**: confirm email confirmation ON, leaked-password protection ON, a sensible password minimum, and redirect URLs restricted to your domains/`lifetrack://`. | Medium | **Action for you** (checklist in `RELEASE.md`). |
| S11 | Rate limiting / abuse: relies on Supabase Auth's built-in limits. | Low | Accepted; review limits in the dashboard. |

## Dependencies
`expo install --check` could not run here (the sandbox blocks the Expo versions API), so SDK alignment is checked by the successful `expo export`,
jest-expo and typecheck runs. **Action**: run `cd apps/mobile && npx expo install --check` once on your machine before the first store build.

## Accessibility
- Mobile: 92 pressable elements, 52 explicit accessibility labels; interactive rows use `minHeight` 44. A real defect was found and fixed in Phase 6: a loading `Button` lost its accessible name.
- Charts expose text summaries; progress bars expose `progressbar` values with clamping (tested).
- Web: form errors are announced (`role="alert"`), dialogs trap focus (Radix), icon buttons have labels.
- **Not verifiable here**: real screen-reader behaviour (TalkBack/VoiceOver), colour contrast of every theme state, dynamic type at the largest sizes. These are in the device test matrix.

## Performance
- Web (gzip): main bundle 63 KB; the charts chunk (98 KB) and the Supabase client (68 KB) load lazily/shared; each page is its own lazy chunk (largest page 11 KB).
- Mobile: Android+iOS export 15 MB total for both platforms (JS + assets), no large unused assets found.
- Lists: planner is virtualised; finance, fitness history and health history were already paged/capped. **Fixed**: notes and job applications were unbounded and now page 40 at a time with "Show more".
- Realtime: one channel for all tables; refetch is debounced (250 ms) and focus/reconnect driven.

## Feature parity (`docs/PARITY.md`)
All 12 modules, auth, settings, notifications and push are built on mobile. Three web features are deliberately **not** on mobile: Reports, Export/Import (JSON backup, CSV) and global search.
Decision for v1: acceptable. Note that data export exists on web only, so a mobile-only user who wants a copy of their data must use the web app or ask via the support address.

## Known limitations (carry into release notes)
- Online-first: no offline use; writes need a connection.
- iOS push cannot be tested in a simulator and Android push needs FCM credentials: both are in the device checklist.
- App icon art is a placeholder until you approve final artwork.
- The Backend (real Supabase stack) workflow, the EAS build workflow, Maestro flows and every GitHub Actions workflow have not yet run in a live environment.
