# Smart Recovery & Rescheduling (web)

When tasks slip, Smart Recovery finds them, ranks them, and proposes a new time that fits around what is already booked. Nothing changes until you
accept. Route `/recovery` (**Productivity → Smart Recovery**); the Daily Planner shows a banner when something has slipped.
Web only for now: the mobile app has no calendar yet, and recovery builds on it.

No AI, no network calls, no paid service: a short, deterministic rule set (below) that a test pins down.

## 1. What it does

| Need | How |
| --- | --- |
| Detect overdue and incomplete tasks | An **open** task (pending or in progress) dated before today, or a **timed** task today whose end time has passed. Done, skipped and cancelled tasks never appear. |
| Prioritise | Score = priority (urgent 100, high 70, medium 40, low 15) + lateness (6 per day, capped at 24) + earlier slips (5 each, capped at 20) + under way (10). Lateness is capped below the gap between priorities, so it orders tasks *within* a priority and never lifts low work over medium. Each card lists its reasons. |
| Suggest free slots | The earliest 15-minute-aligned slot inside working hours that overlaps nothing, on a day that still has room. Up to four alternatives (one per day) are one click away. |
| Detect overloaded days | A day's load = fixed events and timed tasks + undated tasks (default 60 min each) + habits due (15 min each). Over the daily capacity (default 8 h) is *overloaded*, 85 % is *busy*. For an overloaded day, the least important flexible tasks are offered a move to a later day with room (**Rebalance**). |
| Preserve habits and fixed events | They are never moved or edited. Events (repeating ones expanded with their exceptions), interviews and timed tasks are blockers; habits have no time of day, so they only add load. |
| Accept, reject, adjust | **Accept** applies one suggestion at once (toast with Undo). **Adjust** opens a day / start / length editor that checks the choice as you type. **Not now** hides the task for 3 days. |
| Preview | **Review & apply** lists every move as before → after with the day loads with and without them. Nothing is saved until **Apply**; afterwards it shows what moved, what was skipped and why, and **Undo all**. |
| History | Every move, rejection and undo is kept (the History panel; Undo while the task is still where it was put; *Show again* for a hidden one). A task moved before is marked and ranks higher. |
| No duplicate rescheduling | See §4. |
| Time zones and date boundaries | See §3. |

Rebalancing only touches open, undated tasks that are not urgent, high priority, in progress or part of a repeating series.

## 2. Settings

Under **Settings** on the page, stored in the existing `user_settings.calendar_prefs` JSON (no new column; calendar settings are untouched):
`recovery_work_start` / `recovery_work_end` (`HH:MM`, default 09:00–18:00), `recovery_capacity_hours` (default 8), `recovery_horizon_days`
(how far ahead to look, counting today, default 7, up to 30) and `recovery_skip_weekends`. The length given to an undated task is the calendar's `default_duration`.

## 3. Time zones, days and clock changes

- "Today" and "now" are read in the zone set in Settings, so the day changes at the user's midnight, not the server's or the browser's. A task dated yesterday in that zone is overdue even if it is still the same date in UTC.
- Slots are wall-clock times in that zone. A time that does not exist on a clock-change day (02:30 when clocks jump forward) is never offered, and a manual choice of one is refused. Fixed events are compared as instants, so a 09:00 event stays at 09:00 across the change.
- Tasks store a date and a time of day, as everywhere else in LifeTrack (see [CALENDAR.md](CALENDAR.md) §3).
- Today's slots start at the next free step after now; past times are refused.

## 4. Conflicts, concurrency and failure

`checkPlacement` (packages/core/src/recovery.js) is the single rule for "may this task go here?". It runs while you choose (the card, the Adjust dialog) **and again on fresh data inside the API right before saving**, so a change made on another device in the meantime is caught.

- **Errors (block the change):** overlaps an event, interview or timed task (named in the message); overlaps another change in the same batch; the time has passed; a nonexistent clock time; the task was finished, deleted or already moved; a repeating task would get two occurrences on one day.
- **Warnings (shown, allowed):** outside working hours; the day would go over capacity.
- **No duplicates:** each move writes a history row with a `dedupe_key` (`rs:<task>:<from>:<to>`) that is **unique per user while the move is not undone** (partial unique index). The row is written **first**, as a lock: two devices (or a double click) accepting the same suggestion cannot both succeed, and the loser does nothing. Before any of that the task must still be exactly where the suggestion found it, so an old suggestion cannot be applied twice.
- **Failure leaves nothing behind:** if saving the task fails after the lock was taken, the history row is removed again. One failing change does not stop the others; the result lists each skipped task with the reason.
- **Undo** restores the old date and time only if the task is still where it was put; otherwise it is left alone and the reason is shown. Undoing frees the key, so the same move can be accepted again.

## 5. Data (`supabase/migrations/0016_task_reschedules.sql`, additive)

One new table, `task_reschedules`: `task_id` (cascade), `title` (snapshot), `action` (`rescheduled` / `dismissed`), `source` (`recovery` / `rebalance` / `manual`), `from_*` and `to_*` (date, start, end), `reason`, `batch_id`, `dedupe_key`, `hide_until`, `undone_at`.
RLS `owner_all`, Realtime, `set_updated_at` and the same-owner guard follow the other tables. Tasks keep their existing columns (`due_date`, `start_time`, `end_time`): accepting a suggestion is an ordinary task update, so the Planner, Calendar and dashboard show it at once. **Run `0016_task_reschedules.sql` once** (or paste the regenerated `supabase/setup-all.sql`). Until it is run, the page says which file is missing and the rest of the app is unaffected. The table is included in the backup and CSV export.

## 6. Code map

| Layer | Files |
| --- | --- |
| Rules | `packages/core/src/recovery.js`: `planRecovery`, `checkPlacement`, `importanceScore`, `projectLoads`, `recoveryConfig`, history helpers. Reuses `buildCalendarItems` (events, exceptions, interviews, timed tasks) and the time helpers in `@lifetrack/utils`. |
| Operations | `packages/data/src/api.js`: `applyReschedules`, `undoReschedules`, `dismissRecovery` |
| Schema | `packages/schemas/src/tables.ts`, `packages/constants/src/schema.js` (defaults, unique rule, backup order), `packages/data/src/errors.js` |
| UI | `apps/web/src/features/recovery/*`: `RecoveryPage`, `SuggestionCard`, `AdjustDialog`, `PreviewDialog`, `DayLoadPanel`, `HistoryPanel`, `SettingsDialog`, `RecoveryBanner`, `useRecovery` |
| Tests | `packages/core/tests/recovery.test.js` (rules, time zones, clock changes), `packages/data/tests/recovery.test.js` (apply, duplicates, stale data, rollback, undo), `apps/web/tests/recovery.test.jsx` (the page through the real app), `supabase/tests/pglite` (RLS and constraints through the shared fixtures) |

## 7. Not built

Mobile screen; automatic (unasked) rescheduling; learning from how often you accept; moving timed tasks and events (they are fixed by design); applying a suggestion to a whole repeating series; a notification when tasks slip.
