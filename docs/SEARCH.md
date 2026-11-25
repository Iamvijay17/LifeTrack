# Global search & data explorer

`/search` finds anything the signed-in person has saved, in one place. No AI and no paid service: it is plain database text search.

## What is searched
Tasks, goals, habits, transactions (expenses, income, savings), workouts, study sessions (named after their topic), calendar events, notes, journal entries,
job applications, reminders, food log and learning topics. The list lives in `packages/core/src/globalSearch.js` (`SOURCES`) and is mirrored by the SQL function.

## How a query works
- Words are all required (in the title or the text, any order); `"quoted words"` must appear together.
- Rank: exact title 100, title starts with it 85, a word starts with it 70, contains 55, every word in the title 40, text only 20. Ties go to the newer record.
- Filters narrow the result: module, date range (the record's own date: due date, transaction date, workout date, event start, …), status or type, category, priority. A kind with no such field is left out when that filter is used.
- With no text, any filter browses the data, newest first.
- Sorting: most relevant, newest, oldest. Paging: 20 per page, up to 50 in the API.

## Where the work happens
- **Supabase:** `public.global_search(...)` (migration `0022_global_search.sql`) — one round trip, `SECURITY INVOKER`, so row-level security and the module locks decide what it sees, plus an explicit `user_id = auth.uid()` on every branch. `pg_trgm` indexes are created when the extension is available; `(user_id, updated_at / date)` indexes support newest/oldest and the date filter.
- **In-browser dev backend:** `searchRows` runs the same rules over the local tables (and also ignores accents).
- The SQL does not fold accents; the in-browser search does.

## Page
`apps/web/src/features/search/`. The address is the state (`q`, `m`, `st`, `cat`, `pr`, `from`, `to`, `sort`, `page`). Each result is a real link to the record's page
(`/notes?note=<id>`, `/jobs?app=<id>`, planner and calendar by date, finance by month, otherwise the module's page). Recent searches and recently viewed records are kept per
account in this browser (`lifetrack:search:queries:<uid>`, `lifetrack:recents:<uid>`, shared with the command palette). Locked modules are left out and the page says so.

## Not covered
Exercise catalog, foods database, health logs and body measurements; the mobile app; opening a record straight to its row on pages that have no deep link for it.
