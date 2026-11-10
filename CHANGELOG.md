# Changelog

All notable changes to LifeTrack. Versions follow `MAJOR.MINOR.PATCH` (`apps/mobile/app.config.ts` `version`, mirrored in `apps/web/package.json`);
store build numbers are auto-incremented by EAS. Add new entries under **Unreleased** in every pull request.

## [Unreleased]
See `docs/UX_AUDIT.md` for the full audit behind these changes, and `docs/DESIGN_SYSTEM.md` for the design and motion system.
### Changed
- **A full visual redesign, on web and mobile.** Dark-first, with violet and indigo accents, new surfaces and elevation, and rounder corners. Every module now has its own colour and character: the whole app, including charts and progress, takes on the colour of the module you're in. No feature, API or data changes.
- Motion throughout, using Motion on the web and React Native's own Animated on mobile (no new native module): page transitions, a sliding navigation indicator, staggered content, numbers that count up, rings and bars that fill, animated dialogs, tabs, checkboxes and switches, and bottom sheets you can drag to dismiss. Everything respects the reduced-motion setting.
- Charts: gradient fills, softer grids, a shared 650 ms rhythm instead of the 1.5 s default.
### Added
- Dashboard: a **Food today** widget (calories against your target, protein, carbs and fat) on web and mobile. It joins the widget list, so it can be hidden or moved in Customize. No migration.
- Log workout and routines (web and mobile): the exercise picker now shows each exercise's photo next to its name, your own exercises first and then matches from the exercise database. You can still type any name.
- Fitness → Exercises: an exercise database of 876 exercises from [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) (Unlicense, public domain) with start and end demonstration photos, instructions, muscles and equipment. Search, filter by Chest / Back / Shoulders / Biceps / Triceps / Legs / Abs / Cardio, equipment, level and type, open an exercise's own page, and add it to your exercises. Photos are hosted by LifeTrack, shown unaltered in one consistent frame, with a placeholder when none exists; your own exercises link to their demonstration. Mobile has the same database (search, categories, equipment filter, photos, add to your exercises), loading the catalog and each photo from the web app at `EXPO_PUBLIC_WEB_URL`. The photos (about 99 MB) are committed under `apps/web/public/exercises`; `exercises:check` verifies them against SHA-256 hashes and `exercises:sync` repairs any that are missing.
- Dashboard: a hero with a live clock, a 12-column layout, small seven-day charts on the tiles, and widgets you can drag into your own order (saved to your account; arrows on mobile).
- Command palette (Ctrl/Cmd + K): the search box now also runs quick actions, jumps to any page and switches the theme.
- Celebrations for real achievements: finishing the day's habits or the whole agenda, streak milestones, completing a goal or a focus block, reaching a savings target, landing an offer.
- Habits and Planner: a week strip to see and jump between days. Habits show the last seven days on each row.
- Job Switch: a pipeline bar, cards that glide between board columns. Fitness: a week of day tiles. Health: a night-sky sleep card and a water glass that fills. Finance: a ledger hero, a budget gauge and transactions grouped by day.
- Dashboard: **Today**, one ordered list of the whole day (interviews and reminders by time, then tasks, habits, the planned workout, revisions, follow-ups and bills due, finished items below). Tasks and habits can be ticked from it. Web and mobile; no migration.
- Dashboard: Upcoming deadlines (interviews, follow-ups, goals, milestones, reminders, overdue tasks), a getting-started guide for new accounts, stat cards that open their module, and Undo after completing a task.
- Fitness: personal records, per-exercise progress chart, month calendar in History.
- Health: a sleep goal in Settings (used by the score and the charts), and sleep regularity and energy averages. The goal is stored in the existing `habit_prefs` settings column; no migration.
- Finance: budget alert at 80% and when over budget, Duplicate on a transaction, and filters collapsed behind a button on phones.
- Finance: recurring rules for rent, EMI and subscriptions (web and mobile). Daily, weekly, monthly or yearly, with pause, resume and an end date; shown in the dashboard's Upcoming. Open apps post what is due, dated the day it fell due, once across devices. **Needs migration `0008_recurring_rules.sql` applied before release.**
- Planner: "Move to today" for overdue tasks; overdue tasks shown first on phones. Tap the date to jump with a calendar (Planner, Habits, Notes, Health).
- Learning: revision dates are picked from a calendar instead of typed.
- Global search opens the application, day or month you picked. Each page has its own browser title.
### Fixed
- Data export: CSV now covers the Food & Nutrition tables, learning topics, your exercises, routines and notifications, and the amount column is named after your currency instead of always INR.
- Backup restore: restoring into an account that already has nutrition targets or its own copy of a starter food no longer stops with "That record already exists"; food log entries follow the existing copy.
- Daily score: Personal, Finance, Gym and Health tasks now count (in Habits, Fitness and Sleep & Health); before, only Learning and Job Search tasks did. The default 120-minute study target applies only once you have studied in the last 14 days, so someone who doesn't study is no longer scored zero every day (the Today's progress list follows the same rule).
- Savings goals on web: adding money now happens inside the database, like mobile, so two devices can't overwrite each other's deposit.
- A long title made Dashboard and Planner wider than the screen on phones and tablets; the Fitness plan overflowed on phones.
- Calendars and menus were cut off inside dialogs and tables. Popups now draw above their container.
- Escape on an open dropdown or calendar closed the whole form and lost what was typed.
- The dashboard ignored a month's own budget and could disagree with Finance (web and mobile).
- Custom finance categories only existed in one browser; they now come from your transactions, so every device has them.
- Daily score and health chart used different sleep targets (7.5 h and 8 h).
- Purple focus line around the page after navigating; dialogs jumping while opening.
### Accessibility
- Colour contrast now meets WCAG AA in both themes (design tokens changed on web and mobile; new `primarySolid` and `dangerSolid`).
- Keyboard support in menus and tabs; job table rows reachable by keyboard; labelled heatmap; correct heading order; invalid fields marked; hints announced; chart summaries; 40–44px touch targets on phones; global reduced-motion support.
### Changed
- Typing into a form and dismissing it by accident (Esc, X, clicking outside) now asks before discarding.
- New accounts no longer seed a topic named after a personal project (existing accounts are unchanged).

## [1.0.0] - first release (release candidate)
### Added
- Web app (PWA) with 12 modules: planner, learning, jobs, fitness, health, finance, habits, focus, notes, goals, analytics, notifications.
- iOS and Android app (Expo) sharing the same Supabase backend and the same domain logic as the web app.
- Push reminders (Edge Function + Expo push), per-device opt-in, wall-clock reminders in the user's time zone.
- In-app account deletion; JSON/CSV export on web; public privacy policy and terms pages.
### Security
- Row Level Security on every user-owned table with an automated isolation suite; cross-table ownership triggers (migrations 0004/0005).
- Atomic water and savings counters (`add_water` in 0004, `add_savings` in 0007).
### Known limitations
- Online-first (no offline editing); Reports, Export/Import and global search are web-only.
