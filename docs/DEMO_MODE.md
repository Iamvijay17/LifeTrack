# Demo mode

Settings → Setup & tours → **Demo mode → Start demo** runs the whole app on realistic, generated sample data: tasks, habits, study sessions, workouts, sleep and steps, spending and budgets, job applications, goals, notes and calendar events.

## Why it cannot mix with real data

- `services/db.js` is the only door to the database. While demo mode is on, every call is routed to a **separate in-memory database** (`services/demoAdapter.js`, the same engine as the dev backend, `services/localCore.js`). A method the demo database lacks throws; it never falls through to the real adapter.
- The offline layer is stopped (`sync.stop()`): nothing is cached on disk or queued for the server. It restarts on exit with whatever was waiting before.
- Live updates from the real database are ignored (`applyChange`), and the data store is cleared on entering and leaving, so no row of the other database is ever on screen.
- The demo lives in tab memory. **Reloading, signing out or leaving the app ends it.** (So navigate inside the app; opening a link in a new tab starts without it.)
- A banner across every page and a "Demo" chip in the header say so. Account deletion is disabled while it runs.
- **Reset demo data** rebuilds the sample set from scratch; edits are discarded.

## Data

`lib/demoData.js` is deterministic for a given day (seeded generator) and validated against the real table schemas in `tests/demoMode.test.js`. Names, companies and amounts are invented.

## Known limits

- Server-side search (`global_search`) and other server functions are unavailable in the demo (they fail with "Not available in demo mode").
- Browser notifications for demo reminders are not suppressed.
- Exports and backups taken in the demo contain demo data.
- The exercise library and food catalogue are not seeded in the demo.
- Security-page actions (password, sessions) still act on the real account; only deletion is blocked.
