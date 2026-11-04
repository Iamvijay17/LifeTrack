# Changelog

All notable changes to LifeTrack. Versions follow `MAJOR.MINOR.PATCH` (`apps/mobile/app.config.ts` `version`, mirrored in `apps/web/package.json`);
store build numbers are auto-incremented by EAS. Add new entries under **Unreleased** in every pull request.

## [Unreleased]
See `docs/UX_AUDIT.md` for the full audit behind these changes.
### Added
- Dashboard: Upcoming deadlines (interviews, follow-ups, goals, milestones, reminders, overdue tasks), a getting-started guide for new accounts, stat cards that open their module, and Undo after completing a task.
- Fitness: personal records, per-exercise progress chart, month calendar in History.
- Health: a sleep goal in Settings (used by the score and the charts), and sleep regularity and energy averages. The goal is stored in the existing `habit_prefs` settings column; no migration.
- Finance: budget alert at 80% and when over budget, Duplicate on a transaction, and filters collapsed behind a button on phones.
- Finance: recurring rules for rent, EMI and subscriptions (web and mobile). Daily, weekly, monthly or yearly, with pause, resume and an end date; shown in the dashboard's Upcoming. Open apps post what is due, dated the day it fell due, once across devices. **Needs migration `0008_recurring_rules.sql` applied before release.**
- Planner: "Move to today" for overdue tasks; overdue tasks shown first on phones. Tap the date to jump with a calendar (Planner, Habits, Notes, Health).
- Learning: revision dates are picked from a calendar instead of typed.
- Global search opens the application, day or month you picked. Each page has its own browser title.
### Fixed
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
