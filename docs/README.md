# LifeTrack documentation

LifeTrack is a private, cloud-first "life operating system": one account, one Supabase backend, a web app (PWA) and an iOS/Android app that
track planning, habits, learning, job search, fitness, sleep and health, food and nutrition, finance, notes, goals and reminders.

> **Status legend used in every document:** ✅ Implemented · 🟡 Partially implemented · 📋 Planned · ❌ Not implemented.
> Everything below was written from the source code in this repository. Where something could not be verified (it needs a live account, a device or a
> hosted environment), the document says so.

## Purpose

- Keep a person's whole day in one place (tasks, habits, focus, study, workouts, meals, sleep, money, notes) and show how they are doing.
- Be the owner's own data: row-level security in the database, JSON backup/restore and CSV export, in-app account deletion.
- Compute every number from records that were really entered. There is no estimation and no AI feature (`README.md`, `packages/core/src/report.js`).

## Technology at a glance

| Layer | Technology | Where |
| --- | --- | --- |
| Web app | React 18, Vite 8, Tailwind CSS 3, React Router 7, React Hook Form + Zod, Recharts, Motion, Radix Dialog, Sonner, `vite-plugin-pwa` | `apps/web` |
| Mobile app | Expo SDK 58, React Native 0.88, React 19, Expo Router, TanStack Query, SecureStore, `expo-notifications` | `apps/mobile` |
| Shared code | Plain JS/TS workspace packages: domain rules, data layer, Zod schemas, constants, tokens, utils | `packages/*` |
| Backend | Supabase: Postgres + Row Level Security, Auth, Realtime, one Edge Function (Deno). **No custom API server.** | `supabase/` |
| Tooling | pnpm 10 workspaces, Vitest, Jest (jest-expo), Playwright, Maestro, PGlite, GitHub Actions | repo root |

Money is stored as integer paise, dates as `yyyy-MM-dd` strings in the user's own time zone, enums as `text` + `CHECK`.

## Current implementation status

| Area | Status | Notes |
| --- | --- | --- |
| 18 web routes behind sign-in (19 counting the exercise detail page) | ✅ | `apps/web/src/App.jsx` |
| 13 product modules on mobile, 5 tabs + "More" | ✅ | Reports, Export/Import, global search are web-only (`PARITY.md`) |
| Food & Nutrition (293 built-in foods) | ✅ | Web and mobile; migrations 0009/0010 |
| Exercise database (876 exercises, 1,746 photos; 3 exercises have none) | ✅ | Web and mobile |
| Server-side reminder push | 🟡 | Written and unit-tested; never run against a live project (`README.md` "Honest status") |
| Offline editing | ❌ | Online-first by design |
| Rest timer between sets, nutrition-aware scoring, barcode scan, meal plans | ❌ / 📋 | See [ROADMAP.md](ROADMAP.md) |
| Admin console | ❌ | None exists, so there is no ADMIN_GUIDE |

## Document map

**Start here**

| Document | What it covers |
| --- | --- |
| [../README.md](../README.md) | Project introduction and quick start |
| [INSTALLATION.md](INSTALLATION.md) | Prerequisites, install, environment, running, troubleshooting |
| [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) | Every top-level folder and what lives in it |
| [USER_GUIDE.md](USER_GUIDE.md) | How to use the product |
| [FAQ.md](FAQ.md) | Common questions |

**Design and internals**

| Document | What it covers |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System, frontend, backend, auth flow (Mermaid diagrams) |
| [DATA_FLOW.md](DATA_FLOW.md) | Read/write/sync paths, food logging and workout logging flows |
| [DATABASE.md](DATABASE.md) | All 32 tables, relationships, indexes, constraints, functions, migrations |
| [API.md](API.md) | Supabase REST/RPC/Auth/Realtime surface and the Edge Function |
| [ERROR_HANDLING.md](ERROR_HANDLING.md) | How errors are normalised, shown and recovered from |
| [PERFORMANCE.md](PERFORMANCE.md) | Measured numbers, caching, known costs |
| [UI_UX.md](UI_UX.md) | Design system, themes, layout, accessibility (see also [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)) |

**Features**

| Document | What it covers |
| --- | --- |
| [FEATURES.md](FEATURES.md) | Every module, sub-feature and its status |
| [FOOD_NUTRITION.md](FOOD_NUTRITION.md) | Food database, search, calculations, logging, analytics |
| [GYM_FITNESS.md](GYM_FITNESS.md) | Exercise library, routines, workout logging, progress |
| [NOTIFICATIONS.md](NOTIFICATIONS.md) | Notification & Reminder Center: inbox, drawer, snooze/dismiss, quiet hours, desktop notifications, nudges from modules |

**Operations**

| Document | What it covers |
| --- | --- |
| [SECURITY.md](SECURITY.md) | Authentication, RLS, input handling, limitations ([../SECURITY.md](../SECURITY.md) is the disclosure policy) |
| [APP_SECURITY.md](APP_SECURITY.md) | Security & Privacy: password rules, PIN app lock, fingerprint / face unlock (WebAuthn), sessions, how the lock is enforced, deployment, mobile plan |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Build, host, database, functions, mobile; runbooks in [DEPLOY.md](DEPLOY.md), [RELEASE.md](RELEASE.md) |
| [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md) | Backup, restore, erase, account deletion |
| [TESTING.md](TESTING.md) | All test layers and how to run them |
| [CI.md](CI.md) | Workflow map |
| [DEPENDENCIES.md](DEPENDENCIES.md) | Packages, versions, unused and risky dependencies |

**Project management**

| Document | What it covers |
| --- | --- |
| [ROADMAP.md](ROADMAP.md) | Done, in progress, missing, priorities |
| [CHANGELOG.md](CHANGELOG.md) | Change summary (the authoritative log is [../CHANGELOG.md](../CHANGELOG.md)) |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Bugs, debt, risks and documentation drift found during this audit |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Conventions, workflow, how to add a table / food / module |

**Pre-existing documents kept as they were** (specialised runbooks and audits):
[SETUP.md](SETUP.md), [QUICKSTART.md](QUICKSTART.md), [NATIVE.md](NATIVE.md), [PARITY.md](PARITY.md), [RELEASE.md](RELEASE.md),
[RELEASE_AUDIT.md](RELEASE_AUDIT.md), [UX_AUDIT.md](UX_AUDIT.md), [DEPLOY.md](DEPLOY.md), [CI.md](CI.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md),
[legal/](legal), [store/](store). Some of these have drifted from the code; the differences are listed in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Not documented, and why

- **Admin guide**: there is no admin role, console or back-office in the code. The only privileged code is the `send-reminders` Edge Function.
- **Screenshots**: the repository contains store-listing instructions (`docs/store/SCREENSHOTS.md`) but no screenshot image files.
- **Hosted environment values**: Supabase project URL/keys, EAS ids and signing keys live outside the repo and are intentionally absent from all documents.
