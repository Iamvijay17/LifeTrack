# Changelog summary

The authoritative, hand-maintained change log is [../CHANGELOG.md](../CHANGELOG.md) (sections `[Unreleased]` and `[1.0.0]`). This page does **not** invent history: it re-organises what is recorded there and in `git log` (114 commits, 2026-11-01 → 2026-11-10)
by category, and lists what is missing from the log. Dates are commit dates.

## 1. Release markers

| Marker | Date | Source |
| --- | --- | --- |
| Git tags `v1.0.0`, `v1.0.1` | 2026-11-04 | `git tag` (both on commit `25022e9`, the Android release script) |
| Git tag `v1.0.2` | 2026-11-04 | commit `b61be67` |
| Git tag `v2.3.0` | 2026-11-10 | merge commit of PR #44 (Food & Nutrition) |
| Android builds `LifeTrack-1.0.0 … 2.3.0.apk` | 2026-11-04 → 2026-11-10 | files in the repo root (git-ignored); `1.1.0`, `2.0.0`, `2.1.0` have no tag or changelog section |
| Mobile `version` | `2.3.0` | `apps/mobile/app.config.ts` (bumps in commits `3dc5562` → 2.1.0, `b289e85` → 2.3.0) |
| Web `apps/web/package.json` | `1.0.0` | not bumped |

## 2. Major feature additions (from `CHANGELOG.md` and git)

| Date | Change |
| --- | --- |
| 2026-11-01/02 | Initial web app with 12 modules; Focus, Notes, Goals & Milestones, Reminders/Notifications, Reports, Data Export, daily score, global search, dashboard customisation; branded loaders |
| 2026-11-02 | Monorepo (`apps/web`, shared packages), mobile app scaffold and all modules on mobile (Phases 3–4), push backend and deep links (Phase 5), EAS profiles |
| 2026-11-03 | Test/CI/CD infrastructure (RLS suite, real-Postgres tests, Maestro, workflows), legal drafts, store assets, release runbook, atomic water/savings, EAS workflow |
| 2026-11-04 | Recurring transactions; custom pickers; Android one-command release script; UX audit fixes (upcoming deadlines, onboarding, PRs, sleep goal, budget alerts) |
| 2026-11-05 | Premium redesign of web and mobile with a motion system (see [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)) |
| 2026-11-10 | Cardio counts toward steps; Help & Support (web and mobile); **Food & Nutrition**; exercise database with photos (web, then mobile); exercise photos in pickers; dashboard Food widget; food database expanded to ~290 foods (293 today); searchable help centre; grouped Settings; macro bars without targets |

## 3. Database changes

| Migration | Date added | Summary |
| --- | --- | --- |
| `0001_schema.sql`, `0002_rls_realtime.sql` | 2026-11-01 | Core schema, RLS, Realtime, `delete_my_account` |
| `0003_focus_notes_goals_reminders.sql` | 2026-11-02 | Focus, notes, milestones, savings goals, reminders, notifications, settings JSON, `offer` status |
| `0004_hardening.sql`, `0005_…owner_guard…` | 2026-11-02 / 03 | Same-owner foreign-key guards, indexes, `add_water`, `replace_exercise_logs` |
| `0006_push_tokens.sql` | 2026-11-02 | Push tokens + register/unregister RPCs |
| `0007_savings_atomic.sql` | 2026-11-03 | `add_savings` |
| `0008_recurring_rules.sql` | 2026-11-04 | `recurring_rules`; recurring columns on `transactions` |
| `0009_nutrition.sql` | 2026-11-10 | `foods`, `food_logs`, `water_logs`, `nutrition_settings`, `log_water`, `delete_water_log` |
| `0010_food_database.sql` | 2026-11-10 | `foods.aliases`, `foods.source`, indexes |

Dates for 0005–0007 are not shown by `git log --diff-filter=A` (the files arrived through merges); the sequence comes from the commit messages. Details: [DATABASE.md §7](DATABASE.md).

## 4. API changes

No HTTP API of its own exists, so "API changes" are RPCs and Edge Function changes: `delete_my_account` (0002); `add_water`, `replace_exercise_logs` (0004); `register_push_token`, `unregister_push_token` and the `send-reminders` Edge Function (0006, Phase 5.5);
`add_savings` (0007); `log_water`, `delete_water_log` (0009). Client operations in `packages/data/src/api.js` grew to 31 (`postDueRecurring`, nutrition and water operations are the latest). See [API.md](API.md).

## 5. UI changes

- 2026-11-05 redesign: dark-first violet/indigo palette, per-module accents, elevation, motion, sliding navigation indicator, draggable bottom sheets, chart gradients, reduced-motion support.
- Accessibility pass: AA contrast tokens (`primarySolid`, `dangerSolid`), keyboard support in menus/tabs, labelled heatmap, chart summaries, 40–44 px touch targets.
- Dashboard: 12-column layout, hero with clock, Today agenda, Upcoming, getting-started guide, Food today widget, drag-to-reorder widgets.
- Pickers (select/date/time) replaced with custom components (2026-11-04).

## 6. Bug fixes recorded in `CHANGELOG.md` (Unreleased → Fixed)

Data export now covers nutrition and other tables and names the currency; backup restore no longer fails when nutrition settings or a starter-food copy already exist; daily score counts Personal/Finance/Gym/Health tasks and no longer scores a non-studier zero;
savings additions on web are atomic; long titles no longer widen Dashboard/Planner on phones; calendars/menus clipped inside dialogs; Escape on a dropdown closed the whole form; dashboard ignored a month's own budget; custom finance categories were browser-local;
daily score and health chart used different sleep targets; stray focus outline and jumping dialogs. Earlier fixes visible only in git: stale-fetch race and Realtime application (Phase 2–3), cross-account and two-tab timer bugs, silent routine validation, category dropdown,
archived-habit rates, offline banner crash, flaky Habits test, `expo-router` emitter/`navigateToTab` in the tab bar, cardio duration counted toward steps.

## 7. Security-related changes

Same-owner FK triggers (0004/0005), `zod` 3→4 and `react-router-dom` 6→7 for advisories, secret scanning of sources and bundles, production refusal to run without credentials, security headers (CSP, HSTS…), backup size caps, migration-safety checker, audit gate.

## 8. Gaps in the recorded history

- `CHANGELOG.md` has no version sections between `1.0.0` and `Unreleased`, although `v1.0.1`, `v1.0.2`, `v2.3.0` exist.
- Dates for migrations 0005–0007 and several mid-history phases can only be inferred from commit messages.
- No release notes exist for APK builds `1.1.0`, `2.0.0`, `2.1.0`.

## 9. Documentation verification log (this documentation set, 2026-11-10)

Documentation was written from source inspection; internal links, referenced paths, Mermaid blocks, the API surface and the table list were checked mechanically at the end of the work — see the final report in the task output and [KNOWN_ISSUES.md](KNOWN_ISSUES.md) §1 for documents found out of date.
