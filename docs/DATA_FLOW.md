# Data flow

How data moves through LifeTrack. System context is in [ARCHITECTURE.md](ARCHITECTURE.md); error handling is in [ERROR_HANDLING.md](ERROR_HANDLING.md).

## 1. Read path (every module)

```mermaid
sequenceDiagram
  participant Page as Page component
  participant Store as hooks/store.js (cache)
  participant Adapter as supabaseAdapter.list
  participant API as PostgREST
  Page->>Store: useTables('tasks', 'habits')
  Store->>Store: status idle → loading
  Store->>Adapter: list(table)
  loop pages of 1000 rows
    Adapter->>API: GET /rest/v1/table?select=*&order=created_at.asc&order=id.asc (Range)
    API-->>Adapter: rows (RLS-filtered to the user)
  end
  Adapter-->>Store: all rows
  alt a local write happened while fetching
    Store->>Store: discard snapshot, refetch (max 3 attempts)
  else clean
    Store-->>Page: status ready, rows
  end
  Page->>Page: derive with @lifetrack/core (pure functions) and render
```

- **Whole-table loads.** Each module loads the complete table(s) it needs, then filters and aggregates on the device (`packages/core`). Pagination exists only
  to get past PostgREST's 1,000-row cap. See [PERFORMANCE.md](PERFORMANCE.md).
- A failed *background* refresh keeps the data on screen; only a failed *first* load becomes an error state with a Retry button.
- Date columns are plain `yyyy-MM-dd`; "today" is computed on the device in the account's timezone (`useToday`).

## 2. Write path

```mermaid
flowchart LR
  F["Form (React Hook Form + Zod)"] --> A["useAction<br/>(pending flag, toast, error mapping)"]
  A --> API["services/api.js → createApi(store)"]
  API --> S["store.insert / update / upsert / remove / rpc"]
  S --> AD["supabaseAdapter"]
  AD --> R[("Postgres via PostgREST<br/>RLS + CHECK + triggers")]
  R -- "confirmed row(s)" --> S
  S --> C["cache patched from the response<br/>(never optimistically)"]
  C --> UI["UI re-renders; header shows Saving → Saved"]
  R -- "error code" --> E["toAppError → friendly message; form stays open"]
```

Rules enforced in code:

1. `user_id` is never sent: the adapter strips it and the column default `auth.uid()` fills it; RLS rejects anything else.
2. Writes are **not optimistic**: the cache is updated from the confirmed response, so what you see is what the database holds.
3. Multi-row/counter operations are single database calls (`rpc`) so retries and concurrent devices cannot corrupt data.
4. Forms stay open on failure and a leave-page prompt appears while a save is in flight (`docs/SETUP.md` "Design notes").

## 3. Synchronisation between devices

```mermaid
sequenceDiagram
  participant A as Device A
  participant DB as Postgres
  participant RT as Realtime
  participant B as Device B
  A->>DB: INSERT task
  DB-->>A: confirmed row → cache patched
  DB->>RT: WAL change (published tables)
  RT-->>B: postgres_changes INSERT (filter user_id=eq.me)
  B->>B: applyChange: patch cache directly (own echoes ignored)
  Note over B: DELETE events carry only the primary key (unfiltered subscription) → remove by id, else refetch
  Note over B: On focus, reconnect, online, and every 90 s (web), tables are refetched as a safety net
```

- One channel, `lifetrack-changes`, with an INSERT/UPDATE/DELETE binding for each of the 30 published tables (`ALL_TABLES`).
- Web: events go to `applyChange`; an older `updated_at` than the cached row is ignored. Mobile: events call `store.invalidate(table)`, and the channel is
  torn down in background and rebuilt on foreground (`apps/mobile/src/providers/RealtimeSync.tsx`).
- The header "Live sync" dot reflects the channel status (`StatusIndicators.jsx`).

## 4. Food logging flow

```mermaid
flowchart TD
  S["Food & Nutrition → Today<br/>(a meal's Add button, or the quick-add chips)"] --> P["Pick a food<br/>FoodPickerDialog / QuickAdd chips"]
  P --> Cat["buildCatalog(user foods, 293 built-in foods)<br/>searchFoods(): words, aliases (Tamil), spelling variants"]
  Cat --> Opt["Choose variant, serving size or custom grams, quantity, meal, date, time<br/>entryDraftFromFood()"]
  Opt --> Calc["scaleNutrition(per, quantity, factor)<br/>round to 1 dp"]
  Calc --> Row["entryRow(draft): totals for the whole entry<br/>(snapshot of name, category, serving, kcal, macros)"]
  Row --> Save["saveRow('food_logs') → INSERT"]
  Save --> DB[("food_logs<br/>CHECK ranges, same-owner food_id trigger")]
  DB --> Toast["Toast 'Added X to Lunch' with Undo → DELETE"]
  Toast --> Views["Today ring, Calendar, Analytics, Dashboard 'Food' widget<br/>all recomputed from food_logs"]
```

Water: `logWater(date, ml, time)` → RPC `log_water` inserts a `water_logs` row **and** adds to `health_logs.water_ml` in one transaction, returning both
rows; `removeWaterLog` → RPC `delete_water_log` reverses it. Details in [FOOD_NUTRITION.md](FOOD_NUTRITION.md).

## 5. Workout logging flow

```mermaid
flowchart TD
  S["Fitness → This week / Routines / Quick action 'Log workout'"] --> D["WorkoutDialog (date, name, kind, duration, cardio, notes)"]
  D --> R{"Start from a routine?"}
  R -- yes --> T["routineToFormExercises(routine): one set row per planned set"]
  R -- no --> X["Add exercises via ExercisePicker<br/>(my exercises first, then Free Exercise DB matches)"]
  T --> E["Edit sets: reps × weight (kg)"]
  X --> E
  E --> V["Zod validation (reps/weight ≥ 0, ≤ 1000)"]
  V --> W{"Existing workout?"}
  W -- new --> I["INSERT workouts → INSERT exercise_logs (rolls back the workout if sets fail)"]
  W -- edit --> U["UPDATE workouts → RPC replace_exercise_logs (one transaction)"]
  I --> DB[("workouts + exercise_logs")]
  U --> DB
  DB --> Derived["History, week tiles, personal records, per-exercise progress,<br/>steps estimate from cardio, daily score (all derived on read)"]
```

`workoutRows()` links each set to a library exercise by case-insensitive name (`exercise_id` stays `null` when the name came from the database catalog and
has not been added to "My exercises"). Details in [GYM_FITNESS.md](GYM_FITNESS.md).

## 6. Reminder and notification flow

```mermaid
sequenceDiagram
  participant Cron as pg_cron (every minute)
  participant EF as send-reminders (Edge Function)
  participant DB as Postgres
  participant Expo as Expo push
  participant Phone as Phone
  participant App as Open web/mobile app
  Cron->>EF: POST, Authorization: Bearer CRON_SECRET
  EF->>DB: active reminders with remind_date ≤ UTC today + 1, user timezones/prefs
  EF->>EF: dueReminders() in each user's timezone
  EF->>DB: INSERT notifications (dedupe_key reminder:id:date) → 23505 = already sent
  EF->>DB: UPDATE reminder via afterFire() (one-off → inactive, repeating → next date)
  EF->>Expo: batches of 100 messages for new rows only
  Expo-->>Phone: push (DeviceNotRegistered tokens are deleted)
  Note over App: Fallback: useReminderRunner ticks every 60 s and fires reminders 2 minutes after their time,<br/>de-duplicated by the same dedupe_key
```

## 7. Recurring transactions flow

`useRecurringRunner` (web, every 60 s) and `RecurringRunner` (mobile) call `postDueRecurring(today)`: re-read rules, compute every missed occurrence
(`dueOccurrences`, capped by `MAX_CATCH_UP`), insert each as a `transactions` row **dated the day it fell due**, then advance `next_date`. The unique index
`transactions_recurring_occurrence_uq` makes concurrent devices safe. Nothing posts while no device has the app open.

## 8. Backup / restore flow

Export reads every table straight from the database (not the cache) into `{app, version, exported_at, tables}`. Restore validates the envelope with Zod
(≤ 50 MB, ≤ 200,000 rows per table), re-stamps ownership, merges rows by `id` in parent-before-child order (`TABLES`), remaps foreign keys for tables with a
natural unique key (topics, exercises, foods) and never deletes. See [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md).
