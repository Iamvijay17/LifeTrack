# Roadmap

> **Read this first.** Section 1 and 2 record what exists (verified in code). Everything from section 3 onward is a **suggestion** derived from gaps found in the code and in the earlier audits ([UX_AUDIT.md](UX_AUDIT.md) "Remaining issues",
> [RELEASE_AUDIT.md](RELEASE_AUDIT.md), [PARITY.md](PARITY.md)). No commitment, schedule or owner is implied; the repository contains no issue tracker export or roadmap file. No AI-assistant feature is proposed (project rule).

## 1. Completed (✅ implemented)

| Area | What exists |
| --- | --- |
| Platform | Web PWA, iOS/Android app, shared packages, Supabase backend with RLS, Realtime sync, JSON/CSV export, account deletion |
| Productivity | Dashboard (13 widgets, Today agenda, daily score, customisation), Planner with recurrence, Focus timer, Habits, Notes & Journal, Goals & Milestones |
| Growth | Career & Learning (timer, goals, topics, revisions), Job Switch (board, interviews, insights, status history) |
| Wellness | Gym & Fitness (plan, routines, logging, PRs, progress, body metrics, 876-exercise database with photos), Sleep & Health, **Food & Nutrition** (293 foods, Tamil search, custom weights, water, analytics) |
| Money | Transactions, budgets with alerts, savings goals, recurring rules |
| System | Notifications/reminders (inbox, runners, Edge Function push), Settings, Help, global search, quick actions, light/dark themes, motion system |
| Engineering | Monorepo, ≈ 1,290 declared tests, RLS suite for every table, migration-safety and secret scanners, CI/CD workflows, release runbooks |

## 2. In progress / written but unproven (🟡)

- Server-side reminder push (Edge Function + cron + Expo) — [KNOWN_ISSUES.md](KNOWN_ISSUES.md) U3.
- CI workflows, real-backend CI, EAS pipeline, Maestro flows — U1, U2, U4.
- Food & Nutrition and exercise-database rollout: migrations 0009/0010, mobile reliance on `EXPO_PUBLIC_WEB_URL`.
- Most recent work (commits of 2026-11-10): searchable Help center, grouped Settings sections, Food & Nutrition macro bars without targets, mobile `2.3.0`.
- Release preparation: legal text, store listing, hardening checklist ([RELEASE.md](RELEASE.md)).

## 3. Missing features (suggestions)

Ordered by how often the existing audits flagged them.

| Priority | Suggestion | Why / evidence | Needs |
| --- | --- | --- | --- |
| High | Data export and restore on mobile | UX_AUDIT recommended; mobile-only users cannot export | New screens, share sheet |
| High | Server-side posting of recurring transactions (or a clear "posts when opened" indicator) | Nothing posts while no device is open | Edge Function / cron |
| High | Food in the rest of the app: global search, quick action "Log food", Reports and Analytics sections, optional score category | Food & Nutrition is an island ([KNOWN_ISSUES.md](KNOWN_ISSUES.md) B1–B2) | Core + UI, no schema |
| Medium | Rest timer between sets, estimated 1RM, set types | Gym doc gaps | UI + small core logic |
| Medium | Per-category budgets UI | Table already supports it | UI only |
| Medium | Reports and global search on mobile | PARITY.md | UI |
| Medium | Job follow-up/interview notifications and `.ics` export | UX_AUDIT | Reminder generation |
| Medium | Job offer details (expected salary, offer deadline, rejection reason) | UX_AUDIT | Schema |
| Medium | Courses, subtopics, skills in Learning | UX_AUDIT | Schema |
| Low | Custom task categories (currently a database `CHECK`) | UX_AUDIT | Schema |
| Low | Archive for notes and tasks | UX_AUDIT | Schema/UI |
| Low | Native tablet layout and orientation | UX_AUDIT | Mobile UI |
| Low | Recipes / meal plans, barcode scanning, imports from other apps | Common nutrition-app features; not in code | Larger scope, licensing for data |
| Low | Web push notifications | Only mobile push exists | Service worker + VAPID |

## 4. Technical improvements (suggestions)

1. Apply and **record** the first green runs of every workflow; then require the status checks and pin Actions to SHAs ([CI.md](CI.md)).
2. Merge the duplicated `packages/core` domain layers (`src/*.js` vs `src/web/*.js`) — UX_AUDIT P2, [KNOWN_ISSUES.md](KNOWN_ISSUES.md) T1.
3. Use one cache/mutation implementation (TanStack Query) on web and mobile — T2.
4. Add error reporting that respects the privacy policy (T4) and Web Vitals for field data.
5. Extend lint/format to `apps/mobile` and `packages/*`.
6. Update the stale docs listed in KNOWN_ISSUES §1, then add a CI check that fails when `SETUP.md` lists fewer migrations than `supabase/migrations` contains.
7. Add `CHECK` limits on unbounded text/JSON columns; make `application_history` insert-by-trigger only ([SECURITY.md](SECURITY.md) §10).
8. Remove or justify unused dependencies; align `jest`/`@types/jest`; consider an unused-dependency checker.
9. Introduce versioned releases in the changelog and keep `apps/web/package.json` and `app.config.ts` versions aligned.
10. Move exercise photos to object storage/CDN or Git LFS to shrink the repository.

## 5. Performance improvements (suggestions)

- Month-ranged queries and `updated_at`-based incremental fetch instead of whole-table loads, starting with `food_logs`, `exercise_logs`, `transactions`.
- Subscribe to Realtime only for loaded tables.
- Replace Recharts with a lighter option for simple charts, or keep it behind the existing lazy boundary.
- Measure on low-end Android and publish field numbers.

## 6. UX improvements (suggestions)

- A shorter phone dashboard order (UX_AUDIT "accepted for now": ~3,200 px with all widgets on).
- Onboarding for nutrition (set targets, favourite a few foods) and for the exercise database.
- Visual and screen-reader audit of Tamil text, VoiceOver/TalkBack and dynamic type.
- Make "days missing food logs" actionable from the dashboard.

## 7. Suggested priority order

1. **Release blockers** (not features): hosted Auth hardening, migrations 0009/0010 applied, legal placeholders, first live run of reminder push and EAS build, device test matrix.
2. Close the Food & Nutrition integration gaps (search, quick action, reports) — no schema change.
3. Mobile export/restore and server-side recurring posting.
4. Fitness depth: rest timer and progress parity on mobile.
5. Technical debt T1/T2 before adding many more features, so each rule is written once.
