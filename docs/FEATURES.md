# Features

Every module below was checked against the source. Route paths are the web app (`apps/web/src/App.jsx`, `src/lib/nav.js`); the mobile equivalent is in the
"Mobile" row. Status uses ✅ Implemented · 🟡 Partially implemented · 📋 Planned · ❌ Not implemented. The web/mobile differences are tracked in
[PARITY.md](PARITY.md). Deep dives: [FOOD_NUTRITION.md](FOOD_NUTRITION.md), [GYM_FITNESS.md](GYM_FITNESS.md).

## Summary

| # | Module | Web route | Mobile | Status |
| --- | --- | --- | --- | --- |
| 1 | Authentication & account | `/login` `/register` `/forgot-password` `/reset-password` | Sign-in, Sign-up, Forgot, Reset | ✅ |
| 2 | Dashboard | `/` | Dashboard tab | ✅ |
| 3 | Daily Planner & Tasks | `/planner` | Planner tab | ✅ |
| 4 | Focus Mode | `/focus` | More → Focus Timer | ✅ |
| 5 | Habits | `/habits` | Habits tab | ✅ |
| 6 | Notes & Journal | `/notes` | More → Notes & Journal | ✅ |
| 7 | Career & Learning | `/learning` | More → Career & Learning | ✅ |
| 8 | Job Switch | `/jobs` | More → Job Switch | ✅ (mobile: list instead of board) |
| 9 | Goals & Milestones | `/goals` | More → Goals & Milestones | ✅ |
| 10 | Gym & Fitness (+ exercise database) | `/fitness`, `/fitness/exercises/:id` | More → Gym & Fitness | ✅ (mobile has no Progress tab/chart) |
| 11 | Sleep & Health (+ weight) | `/health` | More → Sleep & Health | ✅ |
| 12 | Food & Nutrition | `/nutrition` | More → Food & Nutrition | ✅ |
| 13 | Finance & Expenses | `/finance` | Finance tab | ✅ |
| 14 | Analytics | `/analytics` | More → Analytics | ✅ |
| 15 | Reports | `/reports` | — | ✅ web · ❌ mobile |
| 16 | Notifications & Reminders | `/notifications` | More → Notifications & Reminders | ✅ (server push 🟡 unproven live) |
| 17 | Settings | `/settings` | More → Settings | ✅ |
| 18 | Data Export / Backup / Erase | `/export` | — | ✅ web · ❌ mobile |
| 19 | Help & Support | `/help` | More → Help & Support | ✅ |
| 20 | Legal pages | `/privacy`, `/terms` | — (store listing links) | ✅ drafts (placeholders remain) |

Cross-cutting capabilities (verified in code): global search / command palette (web), quick actions, daily score, Today agenda, Upcoming deadlines, theme sync,
Realtime sync, PWA install, celebrations, account deletion, JSON/CSV export, recurring-transaction engine, reminder runner, loaders, error boundaries,
reduced-motion support. **Counts for the final report: 20 modules + 10 cross-cutting capabilities listed in §21 = 30 documented features.**

Modules the request listed that do **not** exist as separate modules: a standalone **Calendar** (calendar views exist inside Planner's week strip, Jobs → Interviews,
Fitness → History, Nutrition → Calendar and date-jump pickers) and a standalone **Weight Tracking** (weight lives in Sleep & Health's daily log and the Fitness → Body tab).
"Daily Routine & Habits" is Planner + Habits.

---

## 1. Authentication & account ✅

**Purpose:** one private account per person; all data is isolated by row-level security.
**How it works:** email + password through Supabase Auth ([ARCHITECTURE.md §6](ARCHITECTURE.md)). `Protected` redirects unauthenticated users to `/login` with the
original path in router state. A DB trigger creates `profiles` and `user_settings`. First sign-in seeds default learning topics and 26 exercises (`seedDefaults`).

| Sub-feature | Status | Where |
| --- | --- | --- |
| Sign up (name, email, password 8–72, confirm) with email-confirmation notice | ✅ | `features/auth/AuthPages.jsx`, `packages/schemas/src/auth.ts` |
| Sign in, sign out | ✅ | same |
| Forgot / reset password | ✅ | `ForgotPasswordPage`, `ResetPasswordPage`; recovery event in `useAuth` |
| Change display name (updates auth metadata and `profiles`) | ✅ | `settings/ProfileCard.jsx` |
| Change password | ✅ | `settings/AccountCard.jsx` |
| Delete account (typed confirmation, RPC `delete_my_account`) | ✅ web and mobile | `AccountCard.jsx`, `TypedConfirmDialog.jsx` |
| Social / SSO / MFA | ❌ | — |
| Missing-configuration screen (production build without Supabase env) | ✅ | `components/shared/ConfigError.jsx` |
| In-browser DEV account (no Supabase env, `pnpm dev` only; **insecure by design**) | ✅ dev-only | `services/auth.js` `local` |

**Interactions:** the sign-up screen announces "Check your email…" when confirmation is on; after sign-out the cache is reset so no data leaks between accounts.

## 2. Dashboard ✅

**Purpose:** the day at a glance. **How:** `dashboardData()` (`packages/core/src/dashboard.js`) derives everything from raw rows; the page is `features/overview/OverviewPage.jsx`.

| Sub-feature (widget key) | Status | Notes |
| --- | --- | --- |
| Hero with live clock, greeting, active-day streak (`DashboardHero`) | ✅ | |
| Today agenda (`today`) | ✅ | One ordered list: interviews and reminders by time, tasks, habits, planned workout, revisions, follow-ups, bills due; tasks/habits can be ticked |
| Daily score (`score`), Weekly score chart (`weekly`) | ✅ | See below |
| Today's progress (`progress`), Today at a glance (`stats`) | ✅ | |
| Top priorities & tasks (`priorities`), Upcoming deadlines (`upcoming`) | ✅ | Upcoming includes recurring bills |
| Goal progress (`goals`), Monthly spending (`spending`), Food & nutrition (`nutrition`) | ✅ | Food widget: calories vs target, protein, carbs, fat |
| Recent activity (`activity`), Quick actions (`quick`), Getting-started guide (`getting_started`) | ✅ | Guide ticks off with real data and hides itself |
| Customize (hide/show, drag reorder; arrows on mobile) saved to `user_settings.dashboard_widgets` | ✅ | `CustomizeDialog.jsx` |
| Undo after completing a task | ✅ web · ❌ mobile | |
| Confetti on real achievements | ✅ | `lib/celebrate.js` |

**Daily score** (`score.js`): five categories (Learning, Career, Fitness, Habits, Sleep & Health) each give a 0–1 fraction from what was planned/recorded; categories
with nothing planned or recorded are *not applicable*, weights are re-normalised over the applicable ones, and `null` ("—") means nothing applied. Default weights
25/25/20/15/15, editable in Settings. Sleep target defaults to 7.5 h unless a sleep goal is set.

## 3. Daily Planner & Tasks ✅

| Sub-feature | Status |
| --- | --- |
| Create/edit/delete tasks: title ≤ 200, notes, category (Learning, Job Search, Gym, Health, Personal, Finance), priority, due date | ✅ |
| Statuses `pending`, `in_progress`, `done`, `skipped`, `cancelled`; started/completed timestamps | ✅ |
| Recurrence `daily`, `weekdays`, `weekly`, `monthly` with end date; completing creates the next occurrence (skips past dates; unique `(series_id, due_date)` prevents duplicates across devices) | ✅ |
| Day navigation, week strip, jump-to-date calendar, "Move to today" for overdue (web), overdue-first on phones | ✅ (move-to-today and jump are web-only) |
| Buckets from `groupTasksForDay`: top 3 priorities of the day, other pending, done, skipped/cancelled, overdue (shown only on today) and "someday" (no due date) | ✅ |

## 4. Focus Mode ✅

Pomodoro-style timer driven by an absolute end timestamp (survives background/reload). Presets 25 and 50 minutes plus custom minutes (1–240); optional link to a task or
a learning topic and a label; short and long breaks (defaults 5/15, long break every 4, set in Settings → Focus mode); beep on completion (web) / local notification
(mobile); sessions shorter than 60 s are not recorded; summary and daily chart; session list with delete. Data: `focus_sessions`. Timer state is **per device**.

## 5. Habits ✅

| Sub-feature | Status |
| --- | --- |
| Habit with name, description, colour, schedule `daily` / `weekly` (target 1–7) / `custom` weekdays, start date, archive | ✅ |
| One-tap check-in with statuses `done`, `skipped`, `rest`; clear | ✅ (unique per habit/day) |
| Streaks, completion %, per-habit stats, consistency card, last-7-days strip, heatmap (26 weeks web, 20 mobile) | ✅ |
| Week strip to jump between days | ✅ |
| History is judged against the habit's *current* schedule (editing re-judges past days) | 🟡 documented limitation |

## 6. Notes & Journal ✅

Notes: title, Markdown body (rendered to React elements, never HTML; links limited to `http(s)`/`mailto`), category (General, Learning, Career, Ideas, Health, Finance,
Personal), tags, pin, optional link to a goal and a task, search, pagination ("Show more", 40 at a time). Journal: one entry per day with mood 1–5 (Rough…Great),
content and "wins"; unsaved text is never overwritten by a background refresh. Mobile has no `?note=` deep link from search.

## 7. Career & Learning ✅

Tabs **Overview · Goals · Topics · Sessions**. Study goals (target hours, due date, status) and topics grouped (defaults: Frontend, Backend, DSA, AI, Projects) with notes and
revision dates (picked from a calendar). Study timer (one running timer per user; stop with an optional downward correction of minutes; discard) and manual sessions with
problems solved. Only `completed` sessions count. The daily study target (default 120 min) is applied to the score only if you studied in the last 14 days.

## 8. Job Switch ✅

Views **Board · Table · Interviews · Insights** (web); Pipeline / Interviews / Insights (mobile). Applications: company, title, JD URL, location, annual package (LPA, stored
in paise), applied date, source, status (`interested → preparing → applied → assessment → interview → selected → offer`, plus `rejected`, `withdrawn`), contact, follow-up
date, resume version, notes, prep checklist (defaults in `DEFAULT_PREP`). Status history is written by a DB trigger. Interviews with round, date-time, mode, link, status;
funnel, sources, salary progression, applications per day/week; follow-ups surface in Upcoming. Board drag-and-drop is web-only.

## 9. Goals & Milestones ✅

Goals with category (Learning, Career, Fitness, Health, Finance, Personal), period (daily…yearly), start/due dates, status (`active`, `completed`, `archived`), and progress
from the best available source (milestones, linked study time, completion, or manual 0–100). Ordered milestones (done/undone, due date). Active and History tabs; overdue
and days-left labels.

## 10. Gym & Fitness ✅ — see [GYM_FITNESS.md](GYM_FITNESS.md)

Tabs **This week · Progress · Routines · History · Exercises · Body**. Weekly plan (routine / rest / flexible per weekday), one-tap today log/rest/skip with undo,
routines, workout logging with sets (reps × kg), history with month calendar, personal records, per-exercise progress chart, body measurements, 876-exercise database
with start/end photos. Cardio workouts add an estimated step count (≈1,300 steps/km or ≈100 steps/min). ❌ **No rest timer between sets.**

## 11. Sleep & Health ✅

Daily log per wake-up date: bedtime, wake time, sleep minutes, water (ml, atomic add), steps, energy 1–5, weight, notes. Week view, history, charts, sleep goal
(Settings; stored in `habit_prefs`), sleep regularity, average energy, "sleep facts", water goal ring/glass, weight trend (Fitness → Body also charts it).
Steps shown include the cardio estimate. Water entries from Food & Nutrition keep this day's total in step.

## 12. Food & Nutrition ✅ — see [FOOD_NUTRITION.md](FOOD_NUTRITION.md)

Tabs **Today · Calendar · Analytics · Foods** (mobile: Today · History · Insights · Foods). Four meals (Breakfast, Lunch, Evening Snacks, Dinner), calorie ring and
protein/carbs/fat/fibre bars, optional daily targets (nothing is assumed), water tracker with presets and undo, 293 built-in Indian foods plus your own, exact-gram
servings, recent/frequent/favourite foods, duplicate-entry, calendar flagging days with nothing logged, daily/weekly/monthly analytics.

## 13. Finance & Expenses ✅

| Sub-feature | Status |
| --- | --- |
| Transactions: type (expense / income / savings), amount (paise), category per type, date, payment method (Cash, UPI, Credit card, Debit card, Bank transfer, Other), note; Duplicate (web) | ✅ |
| Month navigation, filters (type, category, text, dates; chips on mobile), grouped by day, CSV download (web) | ✅ |
| Overall monthly budget with 80 % and over-budget alerts; gauge | ✅ |
| Per-category budgets | 🟡 table supports `category`, UI only sets the overall budget |
| Savings goals with atomic "add funds" (RPC `add_savings`) | ✅ |
| Recurring rules (daily/weekly/monthly/yearly, anchor day clamp, pause/resume, end date); open apps post what is due, back-dated | ✅ |
| Charts: 6-month series, spending by day, category breakdown; custom categories derived from your transactions | ✅ |
| Currency display INR / USD / EUR (amounts always stored as minor units) | ✅ |
| Multi-currency, accounts, bank import, receipts | ❌ |

## 14. Analytics ✅

Range presets Week / Month / Year / Custom; sections for Learning, Jobs, Fitness, Health, Finance, Habits (`features/analytics/*Section.jsx`). Charts carry text summaries
instead of hover tooltips on mobile. Nutrition has its own analytics tab; there is no Nutrition section on the Analytics page 🟡.

## 15. Reports ✅ (web only)

Summary, charts and a daily-activity table for a chosen range (week/month/year/custom); CSV download and print stylesheet. Built by `buildReport()` — only sums, counts and
averages, no AI and no estimates. Reports do not include nutrition 🟡.

## 16. Notifications & Reminders ✅

Inbox (unread count, mark read, clear read), Reminders (kind task/study/workout/habit/bill/custom, date, time, repeat none/daily/weekly/monthly, pause/resume),
Preferences (per-kind switches; mobile adds a per-device push switch). Reminders fire (a) from the server every minute via the Edge Function (🟡 never run live) and (b) as a
fallback from any open app 2 minutes after their time; duplicates are prevented by `dedupe_key`. Local notifications are used only for the focus timer (mobile).

## 17. Settings ✅

Profile (name), Appearance (dark/light/system), Preferences (timezone from a curated list, currency INR/USD/EUR, week starts Monday/Sunday, daily study target, monthly budget,
water goal, steps goal, sleep goal), Daily-score weights, Focus break lengths, Notifications link, Data link, Account (password, sign out, delete). All synced to the account.

## 18. Data Export / Backup / Erase ✅ (web only)

JSON backup of 30 tables and merge-restore, per-table CSV (28 tables, formula-injection safe, BOM for Excel), "Erase all data" (typed `ERASE`) that keeps account and settings.
See [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md).

## 19. Help & Support ✅

Web: searchable help centre with per-module guides ("How it works", "Good to know"), quick-start tiles, FAQ categories and a keyboard-shortcut list (`features/help/HelpPage.jsx`, content in `helpContent.js`). Mobile: `app/(app)/help.tsx`.

## 20. Legal pages ✅ (drafts)

`/privacy` and `/terms` render `docs/legal/*.md`. `scripts/check-legal-ready.mjs` blocks production web and mobile builds while a draft banner or `[placeholder]` remains.
The root `SECURITY.md` still contains `[security contact email]`.

## 21. Cross-cutting capabilities

| # | Capability | Status | Notes |
| --- | --- | --- | --- |
| 1 | Global search / command palette (Ctrl/Cmd + K): pages, tasks, notes, goals, job applications, habits, transactions, quick actions, theme, sign out | ✅ web · ❌ mobile | **Does not search foods, workouts or exercises** 🟡 |
| 2 | Quick actions: Add task, Start study, Log workout, Add expense, Log water, Complete habit, Job application | ✅ | No "Log food" quick action 🟡 |
| 3 | Live sync across devices (Realtime + refetch) with status dot | ✅ | |
| 4 | Theme sync across devices (`user_settings.theme`) and system theme | ✅ | |
| 5 | PWA install, auto-update, shell-only precache | ✅ | Not offline-capable by design |
| 6 | Save-status indicator and leave-page guard | ✅ web | |
| 7 | Discard-changes confirmation on dismissing a dirty form | ✅ | |
| 8 | Celebrations (confetti) for real achievements; reduced-motion aware | ✅ | |
| 9 | Branded loaders and per-page error boundary | ✅ web | |
| 10 | Deep links and push (mobile) | ✅ / 🟡 | Not device-tested |

## Planned / not implemented (verified absent)

Offline editing · rest timer between sets · barcode scanning or an external food API · meal plans/recipes · per-category budgets UI · mobile Reports and Export ·
data import from other apps · sharing/multi-user · web push notifications · calendar integrations · admin console. See [ROADMAP.md](ROADMAP.md) (those items are *suggestions*, not commitments).
