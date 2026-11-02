# Web ↔ Mobile feature parity

Both apps share the same Supabase backend, data models (`@lifetrack/schemas`), business logic (`@lifetrack/core`) and
data operations (`@lifetrack/data`). Numbers are guaranteed identical by a golden dataset
(`packages/core/tests/parity.test.js`, `apps/mobile/tests/parity.test.ts`). This file records what each platform does,
and every **deliberate** difference. Anything not listed as a difference is expected to behave the same.

| Web route | Mobile screen | Status | Deliberate differences |
|---|---|---|---|
| `/` Dashboard | Dashboard tab | ✅ | Quick actions open the same forms in sheets; no global FAB. |
| `/planner` | Planner tab | ✅ | Sectioned list; actions via a sheet instead of a hover menu. |
| `/habits` | Habits tab | ✅ | Heatmap shows 20 weeks (web 26) to fit a phone; scrolls horizontally. |
| `/focus` | More → Focus Timer | ✅ | Timer state is per device (as on web). The end of a timer also sends a local notification when the app is not open. |
| `/learning` | More → Career & Learning | ✅ | — |
| `/goals` | More → Goals & Milestones | ✅ | — |
| `/jobs` | More → Job Switch | ✅ | Pipeline list with status filter chips instead of a drag-and-drop board; interviews as an agenda list instead of a month calendar. |
| `/fitness` | More → Gym & Fitness | ✅ | — |
| `/health` | More → Sleep & Health | ✅ | — |
| `/finance` | Finance tab | ✅ | Filters are chips (no from/to date inputs); CSV download is web-only. |
| `/notes` | More → Notes & Journal | ✅ | No `?note=` deep link from global search. |
| `/analytics` | More → Analytics | ✅ | Charts have accessibility summaries instead of hover tooltips. |
| `/settings` | More → Settings | ✅ | Includes in-app account deletion (App Store requirement). |
| `/reports` | — | ⏸ not built | Planned as a light add-on (folded into Analytics). |
| `/export` (JSON backup/restore, CSV) | — | ⏸ not built | Desktop-oriented; planned as a later add-on. |
| `/notifications` (inbox, reminders, preferences) | More → Notifications & Reminders | ✅ | Adds a per-device **push** toggle (see `docs/NATIVE.md`). |
| Global search (Ctrl+K) | — | ⏸ not built | Mobile uses per-screen search (Notes, Jobs, Finance). |
| `/login` `/register` `/forgot-password` `/reset-password` | Sign-in, Sign-up, Forgot, Reset | ✅ | Mobile uses PKCE deep links (`lifetrack://…`). |

## Not verified without a device
Layout, keyboard behaviour in sheets, native date/time pickers, SecureStore session persistence, deep links and
Realtime sync have only been verified by typecheck, unit/flow tests and Metro bundling — not on a phone.
