# Challenges

`/challenges` (Productivity → Challenges). Time-boxed personal commitments: a start, an end and a result. A habit repeats forever; a challenge finishes, and is remembered with what was achieved.

## What it adds, and what it reuses

| New (`0023_challenges.sql`) | Holds |
|---|---|
| `challenges` | the commitment: kind, target, unit, dates, status, colour, optional milestones, pause windows and a linked habit |
| `challenge_checkins` | one row per challenge **per day**: amount, note, up to five evidence links |
| `challenge_templates` | the person's own reusable definitions (the built-in ones live in code) |

Reused rather than rebuilt: the person's timezone and week start (`user_settings`), the date helpers in `@lifetrack/utils`, the animated `CheckButton`, confetti and sound, the heatmap and month-calendar components, the Calendar page (challenges are an extra layer), backup/restore and CSV export (the three tables are in `TABLES`), and **habits**: a challenge can *count* a habit, so its done days are check-ins and nothing is logged twice. Habit streak maths is not duplicated; challenges have their own rules because they are bounded.

## The three kinds

| Kind | Meaning | 100% means |
|---|---|---|
| Daily | `target` units every day (target 1 = a yes/no day) | every counted day reached the target |
| Weekly | `target` check-in days in each 7-day block counted from the start date | every block met its need (a short last block needs no more than its days) |
| Total | reach `target` units by the end date, in any pattern | the amounts add up to the target |

All the rules are pure functions in `packages/core/src/challenges.js`, shared with mobile later.

## Rules worth knowing

- **One check-in per challenge per day.** Refused on screen with a clear message, and by a unique constraint in the database, so two devices cannot both succeed. A day is topped up (`addToCheckin`), never duplicated.
- **Days are the person's days.** "Today" comes from the timezone in Settings. The database guard uses the same zone, so a check-in made after midnight in Chennai is for the new day whatever the server clock says; a day that has not started yet is refused.
- **Pause is neutral.** Paused days are not expected, never missed and keep streaks alive. They shrink the goal rather than extend the end date. Pausing and resuming on the same day leaves no trace.
- **Percent never rounds up to 100.** 249 of 250 shows 99%.
- **Closing.** A total challenge completes the moment its target is reached. Daily and weekly ones close the day after the end date (the last day can still be checked in), recording `final_pct`. This happens when the Challenges page opens, on any device, and is safe to repeat. A check-in never closes a challenge because time ran out, so several missed days can still be filled in one after another.
- **Cancel keeps history.** A cancelled or completed challenge cannot be changed; Delete removes it and its check-ins for good (after a confirmation).
- **Evidence is links, not files.** Up to five `http(s)` addresses with an optional label per check-in. The database rejects any other scheme, and links open with `rel="noopener noreferrer nofollow"`. LifeTrack has no file storage, so nothing is uploaded.

## Views

Active (cards with a ring, rhythm, pace badge, streak, a day-by-day timeline with milestone flags and today's check-in), Calendar (every running challenge on one month), Analytics (success rate, best streak, check-ins per week, progress per challenge, activity heatmap), History (what each finished challenge achieved, with "Run again"), Templates. Opening a card shows its own progress calendar, milestones with the day each was reached, and every check-in with its note and evidence.

On the main **Calendar**, each running challenge adds an all-day item per counted day (ticked once covered, flagged when missed). If migration 0023 has not been run, the Calendar simply shows none.

## Security

All three tables have RLS (`user_id = auth.uid()`, forced), a trigger that refuses a link to another person's habit or challenge, and are included in the RLS suite through `supabase/tests/pglite/fixtures.ts`.

## Not built

Reminders for check-ins, sharing a challenge with other people, file attachments, and a mobile screen.

## Tests

`packages/core/tests/challenges.test.js` (rules, timezones, milestones, settlement), `packages/data/tests/challenges.test.js` (operations, duplicates, privacy), `supabase/tests/pglite/challenges.test.ts` (constraints, timezone guard, evidence, isolation) and `apps/web/tests/challenges.test.jsx` (the screens).
