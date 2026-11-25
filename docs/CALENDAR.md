# Calendar & Timeline (web)

One calendar for everything that has a date: **tasks**, **events**, **interviews**, **reminders** and **deadlines**. Day, Week, Month and Agenda views, drag and
drop that is saved to the database, repeating events with per-occurrence exceptions, alerts, search, filters and settings.
Route `/calendar`. Web only: the mobile app has no calendar screen yet.

## 1. How it fits the existing app

LifeTrack has no app server: the apps talk to Supabase (RLS) and shared packages hold the rules. The calendar follows that and **links to existing records
instead of copying them**:

| On the calendar | Comes from | Drag / resize | Edit / delete here |
| --- | --- | --- | --- |
| Task | `tasks` (the same rows the Planner shows; now with an optional time of day) | move, resize if timed | yes, tick to complete |
| Event | `calendar_events` (+ `calendar_event_exceptions`) | move, resize | yes, with repeat scopes |
| Interview | `interview_events` | move (changes `scheduled_at`) | open Job Switch |
| Reminder | `reminders` (active ones) | move (changes `remind_date` / `remind_time`, re-arms it) | open Notifications |
| Goal due, milestone, follow-up, bill, revision | `goals`, `milestones`, `job_applications`, `recurring_rules`, `learning_topics` | no | open their page |

Nothing is duplicated: a task made in the calendar is a Planner task, and completing it anywhere completes it everywhere.

## 2. Using it

- **Create**: click an empty slot, drag out a stretch of time, **New**, or press `N` (task: `Shift N`). A bare click on a month cell's **+** makes an all-day event.
- **Move**: drag to another day or time (snaps to 15 minutes). Drop an item on the all-day lane to make it all-day; drop an all-day item on the grid to give it a time.
- **Resize**: drag the top or bottom edge. Never shorter than 15 minutes.
- **Plan a task**: drag it from **Unscheduled** (open tasks with no date) onto a day or time.
- **Repeat**: every day, weekday, week, month, year, or custom (every N days/weeks/months/years, chosen weekdays, "the second Tuesday"), ending never, on a date, or after N times.
  Editing, moving or deleting a repeating event asks: **this event**, **this and following**, or **all events**.
- **Alerts**: up to five per item ("10 minutes before", "1 day before"…). Default alert and everything else are under **Calendar settings**.
- **Find**: search (titles, notes, places, categories; a year either side of today), filters for category, priority and status, **Today**, jump to any date.
- **Touch**: press and hold an item for about a third of a second, then drag. Scrolling is never hijacked. The resize grips start at once.
- **Keyboard**: `T` today, `D W M A` views, `J K` or arrows to page, `N` new, `/` search, `G` go to date, `?` list. Alt + arrows move the focused item; Shift Alt + ↑↓ resizes it.

## 3. Data model (`0011_calendar.sql`, additive)

- `tasks` gains `start_time`, `end_time` (both or neither, end after start, needs a date), `color`, `location`, `alert_minutes`. Priority gains `urgent`, categories gain
  `Routine` and `Custom`, repeat gains `yearly`. A task without `start_time` is exactly what it was.
- `calendar_events`: `starts_at` / `ends_at` (`timestamptz`, **UTC instants**), `timezone` (IANA), `all_day`, `rrule` (JSON), `alert_minutes`, `category`, `priority`,
  `color`, `location`, `description`, and optional links `goal_id`, `topic_id`, `application_id`, `routine_id` (same-owner guard like every other link).
  An all-day event runs from local midnight to the local midnight after its last day.
- `calendar_event_exceptions`: one row per changed or cancelled occurrence, **unique `(event_id, occurrence_date)`**. `occurrence_date` is the local date the series
  generated, so it never changes when the occurrence is moved. Null columns inherit from the series.
- `user_settings.calendar_prefs` (JSON: `time_format`, `default_view`, `default_duration`, `default_alert`, `show_weekends`, `browser_notifications`).
  The week start is the app-wide `week_starts_on`. `notifications.kind` gains `event`.
- RLS `owner_all`, Realtime, `set_updated_at` and indexes follow the other tables.

**Timezones and daylight saving.** Items are stored as instants plus the zone they were planned in, and recurrence runs on the *wall clock* in that zone, so a 09:00
event stays at 09:00 across a clock change. A time that does not exist (02:30 when clocks jump forward) moves forward (03:30); a repeated time uses its first occurrence.
Everything is shown in the zone set in Settings. Month-end clamps (the 31st falls on the 30th or 28th in shorter months and returns); 29 February repeats on the 28th in other years.

## 4. Code map

| Layer | Files |
| --- | --- |
| Time helpers | `packages/utils/src/dates.ts` (`zonedToMs`, `localDayMinutes`, `fmtClock`…) |
| Recurrence | `packages/core/src/calendarRecurrence.js`: rule generation, `expandEvent` with exceptions, series splitting |
| View model | `packages/core/src/calendar.js`: items from all sources, filters, overlap layout, `planMove` / `planResize` / `planSchedule`, agenda, alert schedule |
| Operations | `packages/data/src/api.js`: `createCalendarEvent`, `saveCalendarEvent`, `deleteCalendarEvent`, `applyCalendarChange`, `raiseCalendarAlert` |
| Schemas | `packages/schemas/src/tables.ts` (`calendar_events`, `calendar_event_exceptions`, `rruleSchema`) |
| UI | `apps/web/src/features/calendar/*` (page, `TimeGrid`, `MonthView`, `AgendaView`, `dnd.jsx`, `ItemDialog`, `ItemDetails`, `ScopePrompt`, settings, tray, alerts) |

The drag engine (`dnd.jsx`) only works out *where the pointer is* (date and snapped minutes); what that means for the data is decided by the pure planners in core.

## 5. Saving, concurrency and failure

- **Optimistic**: a dropped item shows at its new place at once; if the save fails it snaps back with the reason, and the table is refetched.
- **No blind overwrites**: editing a series row first checks it is the version the screen loaded (another device may have changed or deleted it).
- **No duplicates**: events are created with an id made when the form opens, so a retry or double submit cannot create two (the database's primary key refuses the second).
  Exceptions are unique per occurrence, so two devices editing the same occurrence update one row.
- **Multi-row scopes** (this and following) write the new series first, then cut the old one, and delete the new one again if the cut fails.
- **Alerts** are notifications with `dedupe_key = cal:<event|task>:<id>:<occurrence date>:<offset>` (unique per user). With the app open on several devices only the
  first insert wins, and only that device shows the browser notification. An alert more than 15 minutes late is skipped, not replayed.
  The browser is asked for notification permission only when you press the button in Calendar settings.

## 6. Setup

Run `supabase/migrations/0011_calendar.sql` once (or paste the regenerated `supabase/setup-all.sql` into a new project). It is additive and safe to re-run.
No new dependencies, environment variables or Edge Function changes.

## 7. Tests

`packages/utils/tests/zoned.test.ts` (daylight saving), `packages/core/tests/calendarRecurrence.test.js` and `calendar.test.js`, `packages/data/tests/calendar.test.js`,
`supabase/tests/pglite/calendar.test.ts` (constraints on the real schema; RLS and ownership come from the generic suite and `fixtures.ts`),
`apps/web/tests/calendarForm.test.js`, `calendarDnd.test.jsx`, `calendarPage.test.jsx`, and Playwright `e2e/calendar.spec.js` (real mouse drags that are checked after a reload)
and `e2e/calendar-responsive.spec.js` (Pixel 7: no horizontal overflow, bottom sheet, real touch long-press drag, scrolling does not drag).

## 8. Known limits

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) (Calendar). In short: alerts only fire while LifeTrack is open (no server push for events); web only; the whole `calendar_events`
table is loaded and expanded on the device (paged 1000 rows at a time, fine for thousands of events, not tens of thousands); overlaps are shown side by side, not forbidden.
