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

## Food database (migration `0010_food_database.sql`, additive)

**Where the foods live.** The built-in list is a versioned dataset that ships with the apps (`packages/constants/src/foods.js`, split by area under `foods/`); it is **not** copied into anyone's database. That is what makes it safe to grow: no migration or release can rewrite user data, there is nothing to seed or keep in step, and it works offline. The user's own rows live in `foods`: their custom foods, and edited copies of built-in ones (`base_key` = the built-in food's key, unique per user), which replace the built-in entry in that user's catalogue.

| Concern | How |
| --- | --- |
| Identity | Every built-in food has a permanent slug `key` (`chicken-biryani`). A test keeps keys unique and keeps every key from the first release, so old logs and edited copies keep pointing at a food. Never rename, reuse or delete a key. |
| System vs user | Built-in foods are `source: 'starter'`; user rows are `'custom'` or `'edited'`. Only the user's rows are in the database. |
| Categories | 14 categories (South Indian, North Indian, Non-Vegetarian, Vegetarian, Rice & Biryani, Fast Food, Street Food, Snacks, Fruits, Vegetables, Dairy, Beverages, Desserts, Protein Foods) plus Other. A food has one primary `category` and optional `tags` (extra categories), so Chicken Biryani is under Rice & Biryani and also found under Non-Vegetarian. Categories saved before the expansion (Tiffin, Rice & Grains, ...) map onto today's (`canonicalCategory`); nothing is rewritten. |
| Nutrition and servings | Calories, protein, carbs, fat and fibre per ONE `serving_label`, plus `serving_g`. `servings` are other sizes (piece, cup, plate, bowl, glass) as multiples; a 100 g (100 ml for drinks) size is added automatically when the serving weight is known, and **Custom weight** takes any grams (factor = grams / serving weight). `variants` are preparation styles with their own numbers. |
| Estimate metadata | `basis` says how firm a number is: `reference` (plain staple, "Typical value"), `recipe` ("Approximate"), `restaurant` ("Rough estimate": oil, sugar and portion vary a lot). `NUTRITION_SOURCE` states where numbers come from. None is a lab measurement, and the UI says so. User foods carry an optional free-text `source` ("packet label", "my recipe"). |
| Search | `searchFoods` matches names, other names (`aliases`, Tamil script included), category and variation words. All words must match; partial words work; near-misses are forgiven (spelling-aware, `kuzhambu`/`kulambu`, `briyani`/`biryani`, `idly`/`idli`), and `panipuri` finds `Pani puri`. Exact names rank first, then names starting with the search, then other names, then the rest. |
| Duplicates | A test fails on a repeated key or name, and on an alias that is another food's name. At runtime `findDuplicateFood` refuses a new or renamed food whose name (or other name) already exists, on web and mobile, and points to the existing food. An edited copy replaces its built-in food, so a dish is never listed twice. |
| User data | Migration 0010 adds `foods.aliases` (other names, at most 12) and `foods.source`, plus indexes on `foods (user_id, category)`, a GIN index on `aliases`, and `food_logs (user_id, base_key)`. Existing rows get empty defaults. A log entry is a snapshot of its nutrition, so no list change alters history. |

### Adding or changing a built-in food

Edit the file for its area under `packages/constants/src/foods/` and use the `food(...)` builder. Check: the key is new and permanent, nutrition is per the stated serving, `basis` is honest (restaurant dishes are `'restaurant'`), and add Tamil and spelling variants to `aka`. `pnpm test` then checks keys, names, aliases, serving data, that calories agree with protein, carbs and fat (4/4/9 kcal per gram), and that every dish in the product brief is found by search. To retire or merge a food, keep its key and move it (do not delete it).

### Audit that led to this (before the expansion)

The first release shipped 30 foods in 6 categories with no other names and no Tamil names. Search matched only the name, category and variation words, so "thosai", "briyani" or "இட்லி" found nothing. Several requested dishes existed only as variations of another food (masala dosa, ghee roast, sweet pongal, tandoori chicken), so they could not be found by name; they are now foods of their own and the overlapping variations were removed from the original foods (history is unaffected: entries are snapshots). No duplicates existed; the duplicate checks above stop them being introduced.

## Logic

All arithmetic and summaries are pure functions in `packages/core/src/nutrition.js` (shared by web and mobile, unit-tested): scaling by serving and quantity, exact sums, the catalogue, search, recent/frequent foods, day/week/month analytics, days with nothing logged, water. Forms and payload mapping are in `packages/schemas/src/forms.ts`. Multi-row operations (`logWater`, `removeWaterLog`, `saveNutritionGoals`, `saveFavoriteFoods`, `saveFoodCopy`, `deleteFood`) are in `packages/data/src/api.js`.

## Known limits

- Like every other module, the apps load a table whole and compute on the device. That is fine for years of normal logging; a server-side range query would be the next step if a user logs hundreds of entries a day.
- Preparation variations of a built-in food are used as shipped; the editor changes the base values and serving sizes, not the variation list.
- Built-in values are my best estimates from typical recipes and published ranges, not a line-by-line copy of IFCT or USDA tables. Treat them as a starting point and edit the ones you eat often. Restaurant dishes (biryani, chicken 65, kothu parotta, shawarma, fast food) vary most.
- Tamil names and spellings cover the common ones; a name that is missing can be added to your own copy of the food (Other names).
- Search is client-side over the whole catalogue (a few hundred foods), which is instant; it is not a ranked full-text index.
- Favourites are one list on `nutrition_settings`: two devices toggling at the same moment keep the later write.
