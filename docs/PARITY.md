# Web ↔ Mobile feature parity

Both apps share the same Supabase backend, data models (`@lifetrack/schemas`), business logic (`@lifetrack/core`) and
data operations (`@lifetrack/data`). Numbers are guaranteed identical by a golden dataset
(`packages/core/tests/parity.test.js`, `apps/mobile/tests/parity.test.ts`). This file records what each platform does,
and every **deliberate** difference. Anything not listed as a difference is expected to behave the same.

| Web route | Mobile screen | Status | Deliberate differences |
|---|---|---|---|
| `/` Dashboard | Dashboard tab | ✅ | Quick actions open the same forms in sheets; no global FAB. Upcoming links open the module rather than the exact record. No Undo toast after completing a task. The Today list is the same on both; on mobile a ticked task can be un-ticked in the list. |
| `/planner` | Planner tab | ✅ | Sectioned list; actions via a sheet instead of a hover menu. "Move to today" and jump-to-date are web-only for now. |
| `/habits` | Habits tab | ✅ | Heatmap shows 20 weeks (web 26) to fit a phone; scrolls horizontally. |
| `/focus` | More → Focus Timer | ✅ | Timer state is per device (as on web). The end of a timer also sends a local notification when the app is not open. |
| `/learning` | More → Career & Learning | ✅ | — |
| `/goals` | More → Goals & Milestones | ✅ | — |
| `/jobs` | More → Job Switch | ✅ | Pipeline list with status filter chips instead of a drag-and-drop board; interviews as an agenda list instead of a month calendar. |
| `/fitness` | More → Gym & Fitness | ✅ | Personal records sit at the top of History. Per-exercise chart and month calendar are web-only for now. |
| `/health` | More → Sleep & Health | ✅ | Same sleep goal, regularity and energy numbers (shared logic). |
| `/finance` | Finance tab | ✅ | Filters are chips (no from/to date inputs); CSV download and Duplicate are web-only. |
| `/notes` | More → Notes & Journal | ✅ | No `?note=` deep link from global search. |
| `/analytics` | More → Analytics | ✅ | Charts have accessibility summaries instead of hover tooltips. |
| `/settings` | More → Settings | ✅ | Includes in-app account deletion (App Store requirement). |
| `/reports` | — | ⏸ not built | Planned as a light add-on (folded into Analytics). |
| `/export` (JSON backup/restore, CSV) | — | ⏸ not built | Desktop-oriented; planned as a later add-on. |
| `/notifications` (inbox, reminders, preferences) | More → Notifications & Reminders | 🟡 | Adds a per-device **push** toggle (see `docs/NATIVE.md`). The web **Notification Center** (drawer, priorities, snooze/dismiss/history, search, quiet hours, nudges from other modules, see `docs/NOTIFICATIONS.md`) is not on mobile; mobile pushes honour quiet hours (server side). |
| Global search (Ctrl+K) | — | ⏸ not built | Mobile uses per-screen search (Notes, Jobs, Finance). |
| `/login` `/register` `/forgot-password` `/reset-password` | Sign-in, Sign-up, Forgot, Reset | ✅ | Mobile uses PKCE deep links (`lifetrack://…`). The new-password strength rules are web-only for now. |
| `/security` (app lock, fingerprint / face unlock, change password, sessions) | More → Security & Privacy (App lock, Fingerprint & face unlock, Where you're signed in) | ✅ except change password | The phone has the same app lock: a lock screen **instead of** the app, PIN keypad, auto-lock (leaving the app, idle, coming back), heartbeat, *Lock now*, *Forgot PIN*, the session list, and it unlocks **its own session**, so a phone no longer needs to be marked *trusted*. Fingerprint / face unlock uses the platform's primitives (Android BiometricPrompt + Keystore, iOS LocalAuthentication + Keychain) through the `device-key` Edge Function, **not** WebAuthn passkeys: a web passkey does not unlock a phone and a phone's key does not unlock a browser. Differences: **change password** (current password checked, strength meter, other devices signed out) is web-only; there is no *Trust* button on the phone (it is not needed; an existing *trusted* mark can be withdrawn); the biometric key is released into the app's memory to sign ([APP_SECURITY.md](APP_SECURITY.md) §9.2). Built and tested without a device; not yet run on one (§9.3). |

## Not verified without a device
Layout, keyboard behaviour in sheets, native date/time pickers, SecureStore session persistence, deep links and
Realtime sync have only been verified by typecheck, unit/flow tests and Metro bundling — not on a phone.
