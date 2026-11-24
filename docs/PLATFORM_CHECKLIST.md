# LifeTrack 2026 platform transformation — checklist

Audit of the repository on 2026-11-24 against the six-area brief. Status: **Done** (built and tested) · **Partial** · **Improve** · **Not built** · **Needs credentials**.
Updated as work lands; nothing is marked Done without a test or a check noted next to it.

## 1. Product experience

| Item | Status | Notes |
| --- | --- | --- |
| 1.1 Onboarding (9 steps, autosave, resume, skip, later) | **Done** | `docs/ONBOARDING.md`; unit + component tests; migration 0024 not yet run on the hosted Supabase |
| 1.2 Product tours (6 modules, skip, restart, completion) | **Done** (logic) | Not yet exercised in a real browser (no e2e spec) |
| 1.3 Contextual tooltips / first-use hints | **Done** | `FirstUseHint` (one-time, remembered on the account, hidden during setup) on Calendar, Automation, Life Map, Recovery, Insights, Search; shortcut keys shown in hints and on `/shortcuts`. `Tooltip` for the collapsed sidebar was already there |
| 1.4 Empty-state redesign | **Done** | Audited: every module already used the shared `EmptyState` (icon, explanation, next action). Health history was the one plain-text gap; it now has an icon, an example and a "Log today" action |
| 1.5 Demo data mode | **Done** | `docs/DEMO_MODE.md`: separate in-memory DB, offline layer stopped, banner, reset/exit, tested in jsdom and Playwright. Known limits listed there |

## 2. Customization

| Item | Status | Notes |
| --- | --- | --- |
| 2.1 Dashboard widgets (add/remove/rearrange/resize/restore) | **Done** | Existing dashboard builder (`docs/DASHBOARD_BUILDER.md`) |
| 2.2 Themes (dark/light/system, accents, contrast checks) | **Done** | Existing `lib/appearance.js` (WCAG contrast maths) |
| 2.3 Layout presets | **Done** | Dashboard templates/workspaces in the builder |
| 2.4 Preferences (timezone, currency, week start, motion, density) | **Partial** | Date/time format and language readiness are not configurable |
| 2.5 Configurable navigation | **Done** | Pin/reorder (Settings → Navigation). Hiding items is intentionally not offered |

## 3. Account

| Item | Status | Notes |
| --- | --- | --- |
| 3.1 Profile | **Done** | Name, photo (shrunk on device, stored on the profile; migration 0025), email change (confirmation link on Supabase), account creation / last sign-in dates |
| 3.2 Security (password, sessions, delete account) | **Partial** | PIN/passkeys/sessions/password exist (`SessionsCard`, `PasswordCard`, `EraseCard`); to be verified against the brief |
| 3.3 Login activity | **Partial** | Sessions card shows signed-in devices with last activity and sign-out controls; last sign-in date added. A full login-attempt history is not available from the auth service |
| 3.4 Privacy (export, deletion) | **Partial** | JSON/CSV export and erase exist (`/export`) |

## 4. Power user

| Item | Status | Notes |
| --- | --- | --- |
| 4.1 Shortcut system | **Done** | `/shortcuts` reference (Mac/Windows keys, search), Ctrl/⌘+Shift+N, Ctrl/⌘+/, remap g-/c- chord keys with clash detection (per device), conflict list. Ctrl/⌘+Shift+N may be taken by the browser (private window); the page says so. Default `g f` = Focus and `g w` = Fitness differ from the brief's letters: remappable |
| 4.2 Context menus | **Done** | `docs/CONTEXT_MENU.md` |
| 4.3 Multi-select / bulk | **Done** | Existing `useSelection` + `SelectionBar` (Ctrl/Cmd/Shift+click, bulk complete/category/status/delete with confirm); "Select all N" added this round. Available where a module wires it (tasks, finance, notes, …) |
| 4.4 Undo / redo | **Done** | `lib/actionHistory.js`: 50-entry history, 10-minute expiry, stale-data guard, Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z, refusals are explained. Covers every menu/bulk action that reports an `undo`; irreversible ones (deletes, repeating-task completion) are never offered |

## 5. Integrations

| Item | Status | Notes |
| --- | --- | --- |
| 5.1 Integration Center | **Done** | `/integrations`: status, permissions, last sync, activity log, disconnect |
| 5.2 Google Calendar | **Needs credentials** | Built and tested against a simulated Google (no duplicates, conflicts not overwritten, revoked access handled). **Not tested against real Google.** Repeating events skipped. `docs/INTEGRATIONS.md` |
| 5.3 Google Drive backup | **Needs credentials** | Same status: explicit-action backup, history, download, failure and revoke handling; untested against real Google |
| 5.4 Import/Export center | **Done** | JSON/CSV export, JSON restore with new-vs-existing preview, **transactions CSV import** with preview, duplicate detection and per-row errors. Other modules' CSV import is not built |
| 5.5 Integration security | **Done** (design) | OAuth 2.0 server-side, locked token table, minimum scopes, signed state, origin-locked function; see docs. Needs deploy and a real-Google check |

## 6. Testing & CI

| Item | Status | Notes |
| --- | --- | --- |
| 6.1 Unit tests | **Done** | 1300+ vitest tests across web/core/data |
| 6.2 API/DB integration tests | **Done** | pglite RLS/SQL suites, adapter contract tests |
| 6.3 E2E (Playwright) | **Done** | 27 specs, desktop + mobile projects |
| 6.4 Visual regression | **Not built** | No screenshot baselines |
| 6.5 CI pipeline | **Done** | `.github/workflows/ci.yml` (lint, typecheck, unit, DB, build, e2e) |
| 6.6 Quality report | **Partial** | `LIFETRACK_COMPLETE_AUDIT_REPORT.md` predates this work |
