# Food & Nutrition

Daily food logging, nutrition targets, a water tracker, a calendar and analytics, on web (`/nutrition`) and mobile (More → Food & Nutrition).

## Data (migration `0009_nutrition.sql`, additive)

| Table | One row is | Notes |
| --- | --- | --- |
| `food_logs` | one food eaten | Stores the **totals** (quantity already applied), so editing a food later never rewrites history. `log_date` is a plain date in the user's own timezone, like every other `*_date` column. |
| `foods` | a food the user made, or their edited copy of a starter food | `base_key` names the starter food it replaces (unique per user). Nutrition is per ONE `serving_label`; `servings` and `variants` are JSON. |
| `water_logs` | one drink | Written only through `log_water` / `delete_water_log`, which also keep `health_logs.water_ml` (what Sleep & Health shows) equal to the day's total, in one transaction. |
| `nutrition_settings` | the user's targets and favourite foods | One row per user. A null target means "no target": the app never suggests a number. The water goal stays in `user_settings.water_goal_ml`, shared with Sleep & Health. |

All four have RLS (`owner_all`), `force row level security`, the shared `set_updated_at` trigger and realtime. `food_logs.food_id` has the same-owner guard from 0004. Indexes: `food_logs (user_id, log_date desc, log_time)`, `(user_id, updated_at)`, `water_logs (user_id, log_date desc, created_at)`, `foods (user_id, lower(name))`.

## Starter foods

`packages/constants/src/foods.js` ships ~35 everyday Indian foods with serving sizes and preparation variations. **Every number is an approximate estimate** (rounded from public composition tables and typical recipes), is labelled so in the UI, and can be edited by the user (the edit is saved as the user's own copy; deleting the copy restores the original). A test checks each food's calories against what its macros supply, so a typo in one column is caught.

## Logic

All arithmetic and summaries are pure functions in `packages/core/src/nutrition.js` (shared by web and mobile, unit-tested): scaling by serving and quantity, exact sums, the catalogue, search, recent/frequent foods, day/week/month analytics, days with nothing logged, water. Forms and payload mapping are in `packages/schemas/src/forms.ts`. Multi-row operations (`logWater`, `removeWaterLog`, `saveNutritionGoals`, `saveFavoriteFoods`, `saveFoodCopy`, `deleteFood`) are in `packages/data/src/api.js`.

## Known limits

- Like every other module, the apps load a table whole and compute on the device. That is fine for years of normal logging; a server-side range query would be the next step if a user logs hundreds of entries a day.
- Preparation variations of a starter food are used as shipped; the editor changes the base values and serving sizes, not the variation list.
- Favourites are one list on `nutrition_settings`: two devices toggling at the same moment keep the later write.
