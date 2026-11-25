# Gym & Fitness

Web `/fitness` (tabs **This week · Progress · Routines · History · Exercises · Body**) and `/fitness/exercises/:id`; mobile More → Gym & Fitness
(**Week · Routines · History · Exercises · Body**). Logic: `packages/core/src/fitness.js`, `records.js`, `exerciseCatalog.js`. Status: ✅ Implemented on both
platforms, with the differences listed in §9. **A rest timer between sets is ❌ not implemented** (verified: no rest-timer code in the repository; the Focus module's
Pomodoro breaks are a separate feature).

## 1. Data model

| Table | Role | Reference |
| --- | --- | --- |
| `exercises` | The user's own library (name unique per user, muscle group, equipment). Seeded once with 26 defaults by `seedDefaults()` | [DATABASE.md §3.5](DATABASE.md) |
| `routines` | Named templates; `exercises` JSON `[{name, sets, reps, weight_kg}]`; archivable | same |
| `workouts` | One session, or a rest/skip marker (`status` `completed|skipped|rest`); `kind` `strength|cardio|mixed|other`; duration, cardio minutes/distance, notes; optional `routine_id` | same |
| `exercise_logs` | One row per set: `exercise_name`, optional `exercise_id`, `order_index`, `set_number`, `reps`, `weight_kg` | same |
| `body_measurements` | One row per day (chest, waist, hips, arm, thigh, body-fat %) | same |
| `user_settings.workout_plan` | JSON `{"0".."6": routine uuid | "rest" | null}` (0 = Sunday) | [DATABASE.md §3.1](DATABASE.md) |

Body **weight** is stored in `health_logs.weight_kg`, not in `body_measurements`.

## 2. Exercise library (database integration)

The browsable exercise database is the **Free Exercise DB**, committed into the web app and imported by `scripts/sync-exercise-db.mjs`.

| Fact | Value |
| --- | --- |
| Source / licence | https://github.com/yuhonas/free-exercise-db, **Unlicense** (public domain), pinned at commit `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5`; `LICENSE.txt` and `ATTRIBUTION.md` are committed in `apps/web/public/exercises/` and shown in the UI (`catalog/Attribution.jsx`) |
| Exercises | **876** (`catalog.json` → `{meta, exercises}`) |
| Photos | **1,746** JPEGs (`<id>/0.jpg` start, `<id>/1.jpg` end), ≈ 99 MB, byte-for-byte upstream; **3 exercises have none** and show a placeholder |
| Fields per exercise | `id, name, category, primary[], secondary[], equipment, level, type, force, mechanic, instructions[], images[]` |
| Categories (8, derived from the primary muscle; dataset `cardio` ⇒ Cardio) | Legs 284 · Shoulders 137 · Back 114 · Abs 93 · Chest 84 · Biceps 78 · Triceps 72 · Cardio 14 |
| Levels / types / equipment | Beginner 525, Intermediate 294, Expert 57 · Strength 584, Stretching 123, Plyometrics 61, Powerlifting 38, Olympic Weightlifting 35, Strongman 21, Cardio 14 · 13 equipment values |
| Integrity | `images.sha256.json` holds a hash for each image. `pnpm --filter @lifetrack/web exercises:check` verifies offline; `exercises:sync` (also the web `prebuild`) re-downloads any missing or altered image from the pinned commit; `--refresh` rebuilds the catalog; `--report` prints coverage. Nothing is resized, recompressed or cropped, and no other image source is used |
| Delivery | Static files from the web deployment. Web service worker: photos `CacheFirst` (600 entries / 30 days), catalog `StaleWhileRevalidate`. Mobile fetches both from `EXPO_PUBLIC_WEB_URL` (`src/features/fitness/exerciseDb.ts`) |

**Exercises tab** (`LibraryTab`, `catalog/ExerciseBrowser`): "My exercises" grouped by muscle group, and the database with search and filters for category, equipment, level and
type; filters live in the URL (`?q=&cat=&eq=&lvl=&type=`) so Back returns to the same search. **Exercise page** (`ExerciseDetailPage`): start and end photos, primary/secondary
muscles, equipment, level, type, instructions, and an "Add to my exercises" action (replaced by an "in your exercises" state once added). `libraryRowFor()` converts a catalog entry into a library row
(`Abs → Core`, `Body only → Bodyweight`). `matchCatalog()` links a user's exercise to a catalog entry by normalised name, with 19 hand-checked aliases (`STARTER_ALIASES`) for the default
exercises whose names differ (e.g. "Bench Press" → "Barbell Bench Press - Medium Grip").

**Exercise picker** (`catalog/ExercisePicker`, mobile `ExercisePickerField`): in the workout and routine forms, suggestions show the exercise photo beside its name — the user's own
exercises first (≤ 40), then up to 8 database matches (`suggestExercises`); free typing is still allowed.

Not implemented: exercise videos, custom exercise images uploaded by the user, muscle diagrams, substitutions.

## 3. Exercise categories

Two vocabularies coexist: the **library** groups (`MUSCLE_GROUPS`: Chest, Back, Legs, Shoulders, Biceps, Triceps, Core, Cardio, Full body) and the **database** categories (the 8
above, with Abs instead of Core). `libraryRowFor` translates database → library; user rows keep whatever group the user chose.

## 4. Workout routines

- Create/edit/archive routines in **Routines** (`RoutineDialog`): name, notes, exercises with planned sets, reps and weight (validation reports the first invalid cell).
- **Weekly plan** (`WeeklyPlan`, stored in `user_settings.workout_plan`): per weekday choose a routine, *Rest day* or *Flexible*; the tiles on **This week** show planned vs done/rest/skipped.
- "Start workout" from a routine opens the workout form pre-filled with one set row per planned set (`routineToExercises`).
- Deleting a routine keeps logged workouts (`routine_id` is set null).

## 5. Workout logging

Flow: [DATA_FLOW.md §5](DATA_FLOW.md).

| Capability | Detail |
| --- | --- |
| Log a workout | Date, name, kind, duration (0–1440 min), cardio minutes, cardio distance (km), notes, and any number of exercises each with any number of sets |
| Sets, reps, weights | `reps` integer ≥ 0, `weight` kg ≥ 0 (decimals allowed, `numeric(6,2)`), both ≤ 1000 in the form; bodyweight exercises use weight 0 |
| Edit | `saveWorkout` updates the workout, then `replace_exercise_logs` swaps all sets in one transaction (no duplicates on retry) |
| Create | Inserts the workout then its sets; if the sets fail the workout is removed again ("no half-saved workouts") |
| Today card | One-tap *log*, *rest day*, *skipped*, with Undo (`offDayWorkout` creates the marker row) |
| Delete | Deleting a workout deletes its sets (cascade) |
| Cardio → steps | `cardioSteps()` adds ≈ 1,300 steps per km, or ≈ 100 steps per minute (cardio minutes, or Duration for a `cardio` workout) to the day's steps shown in Sleep & Health and the score |
| **Rest timer** | ❌ Not implemented |
| Supersets, tempo, RPE, set types (warm-up/drop), plate calculator | ❌ Not implemented |

## 6. Workout history

`HistoryTab`: workouts newest first with date, duration, set count and total volume (Σ reps × kg); tap to see each exercise's sets (`summarizeSets`, e.g. `10×60kg, 8×62.5kg`);
month calendar (`WorkoutCalendar`) showing trained / rest / skipped days (web). Edit and delete from the row menu.

## 7. Progress analytics

All computed on read from logged sets of **completed** workouts (sets with no reps never count), so editing a workout corrects them (`records.js`).

| Metric | Definition |
| --- | --- |
| Personal record | Per exercise: heaviest set; at equal weight more reps win (so bodyweight exercises get a record). Sorted by most recent record. `recordText`: "60 kg × 8" or "12 reps" |
| Per-exercise progress | One point per training day: heaviest set, top reps, total volume (`exerciseProgress`) — chart on **Progress** (web) |
| Weekly stats | Workouts this week, planned vs hit days, minutes, cardio minutes, volume (`fitnessWeek`) |
| 8-week trend | Workouts and volume per week |
| Weight trend | From `health_logs.weight_kg`, last 40 points (`weightHistory`); shown in **Body** and Sleep & Health |
| Body measurements | One entry per day; `measurementLine` summarises Chest · Waist · Hips · Arm · Thigh · BF% |
| Dashboard / Analytics | Workout state on the Dashboard (`gymState`), Fitness section on Analytics, Reports totals |

Not implemented: estimated 1RM, muscle-group volume balance, goal-weight targets, progress photos.

## 8. Related modules

Planner tasks with category *Gym*, the *workout* reminder kind (links to `/fitness`) and the Fitness part of the daily score (planned workout, steps, Gym tasks; rest and skipped days are
not penalised) all read the same tables.

## 9. Platform differences

| Feature | Web | Mobile |
| --- | --- | --- |
| Progress tab with per-exercise chart | ✅ | ❌ (records at the top of History) |
| Month calendar of workouts | ✅ | ❌ |
| Exercise detail | ✅ own route `/fitness/exercises/:id` | ✅ bottom sheet (photos, instructions, Add) from the exercise database list; no own route |
| Exercise database: search, category, equipment filters, photos, add to library | ✅ (also level and type filters) | ✅ (search, categories, equipment) |

## 10. Known limits

- Exercise logs reference exercises by **name**; `exercise_id` is only set when the typed name matches the user's library case-insensitively. Renaming a library exercise does not rename past sets.
- The catalog (876) is a snapshot; updating it needs `exercises:sync --refresh`, a commit and a release (the 99 MB of photos are in git).
- The exercise database is served by the web deployment, so the mobile exercise tab depends on the web app being reachable.
