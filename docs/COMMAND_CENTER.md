# Command Center (web)

The global palette: **Ctrl+K** (Windows/Linux), **⌘K** (macOS), `/`, or the search button in the header. Code lives in `apps/web/src/features/command/`
(`model.js` pure logic, `CommandCenter.jsx` provider and UI, `useRecents.js` recents and action usage, `useShortcuts.js` global keys).

## What it does
- **Search** pages, tasks, notes, goals, job applications, habits, transactions, reminders, events, food log, workouts and learning topics; matches are highlighted, accent- and case-blind, every word must match.
- **Quick actions**: add task, log food, record workout, start focus, new note, new reminder, add expense, log water, create habit, add calendar event, complete habit, start study, add job application, switch theme, shortcut sheet, sign out. Forms are the existing ones: quick-add dialogs, or deep links that open a page's own form (`/nutrition?add=1`, `/notes?new=1`, `/habits?new=1`, `/calendar?new=1`, `/focus?start=1`, `/notifications?tab=reminders&new=1`).
- **Quick capture**: `task: pay rent tomorrow`, `note: …`, `remind: call mum 5pm`, saved through `createTask` / the store.
- **Smart start**: recent pages and items, recent actions, frequently used actions (run twice or more), actions specific to the current page.
- **States**: loading, no results (still offers capture), error with retry, locked modules hidden.

## Keyboard
`↑ ↓` move · `Enter` run · `Tab` / `Shift+Tab` next / previous group · `Esc` clear, go back, close · `?` shortcut sheet · `g` then a key goes to a page · `c` then a key creates (`c h` habit, `c v` event, plus task, workout, food, note, reminder, expense, focus).

## Storage
Per device and account in localStorage only: `lifetrack:recents:<userId>` and `lifetrack:usage:<userId>`. Nothing is synced; the palette works without them.

## Not built
Mobile app palette; creating a calendar event from typed text (the event form opens instead); searching the exercise catalog or foods database.

## Tests
`tests/commandModel.test.js`, `tests/commandPalette.test.jsx` (run with blank `VITE_SUPABASE_*`).
