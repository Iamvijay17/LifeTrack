# Changelog

All notable changes to LifeTrack. Versions follow `MAJOR.MINOR.PATCH` (`apps/mobile/app.config.ts` `version`, mirrored in `apps/web/package.json`);
store build numbers are auto-incremented by EAS. Add new entries under **Unreleased** in every pull request.

## [Unreleased]

## [1.0.0] - first release (release candidate)
### Added
- Web app (PWA) with 12 modules: planner, learning, jobs, fitness, health, finance, habits, focus, notes, goals, analytics, notifications.
- iOS and Android app (Expo) sharing the same Supabase backend and the same domain logic as the web app.
- Push reminders (Edge Function + Expo push), per-device opt-in, wall-clock reminders in the user's time zone.
- In-app account deletion; JSON/CSV export on web; public privacy policy and terms pages.
### Security
- Row Level Security on every user-owned table with an automated isolation suite; cross-table ownership triggers (migration 0005).
- Atomic water and savings counters (migration 0006).
### Known limitations
- Online-first (no offline editing); Reports, Export/Import and global search are web-only.
