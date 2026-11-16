# Consistency Protection

Habits that forgive a missed day without lying about it. Web only (Habits → **Consistency**, `/habits?view=consistency`).

## What changed

| | Before | Now |
|---|---|---|
| Schedule | daily, specific days, X times a week | the same, plus **planned rest days** (daily habits) |
| Pausing | none | **Pause / Resume** a habit; days inside a pause are neutral |
| Missed day | silently breaks the streak | listed for the last 7 days with **I did it** (made up) or **Skip day**; nothing happens unless you choose |
| Records | streaks, 30-day rate | + this week's %, month calendar, personal records, recovery history, a "How is this calculated?" panel |

## The rules (printed in the app as well)

1. A day only counts against you when the habit was **expected**: on the schedule, after the start date, not a planned rest day, not inside a pause.
2. A check-in is never edited or hidden. A "done" always counts, even on a rest day.
3. Today is never "missed" until it is over.
4. "X times a week" habits are judged per week against the target; a week that was paused all seven days is skipped.
5. Editing a habit's schedule re-judges history against the *current* schedule (this was already so); the check-ins themselves are untouched.

Everything is computed by pure functions in `packages/core/src/streaks.js` and `consistency.js`; the screen only formats them.

## Recovery, precisely

- `recoverHabitDay` adds a check-in for a **past** day that has **no log at all**, inside the last 7 days, and stamps `recovered_at`. It never overwrites an existing log (not even a skipped one), never touches today or the future, and refuses days before the habit started.
- **Skip day** writes a normal `skipped` log (the existing mechanism). The streak is kept; it is not counted as done.
- The schedule is never changed by recovery.

## Database (`0018_consistency.sql`, additive)

- `habits.rest_days smallint[]` (0 to 6).
- `habit_pauses` (`habit_id`, `start_date`, `end_date null`): at most **one open pause per habit** (partial unique index), RLS, same-owner trigger, realtime.
- `habit_logs.recovered_at timestamptz`.
- If the migration has not been run: habits work exactly as before (pauses are optional data), saving a habit without rest days does not send the new column, and pause / recover say which file to run.

## Limits

Web only (mobile still shows streaks computed with the same engine, but has no pause, rest-day or recovery screens). Weekly habits have no recovery list.
