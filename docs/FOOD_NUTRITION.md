# Food & Nutrition

Daily food logging, nutrition targets, a water tracker, a calendar and analytics — web `/nutrition` (tabs Today · Calendar · Analytics · Foods) and mobile
More → Food & Nutrition (Today · History · Insights · Foods). Status: ✅ Implemented on both platforms. Migrations: `0009_nutrition.sql`, `0010_food_database.sql`
([DATABASE.md §7](DATABASE.md)). All arithmetic is in `packages/core/src/nutrition.js`, shared by both apps.

## 1. Data model

| Table | One row is | Notes |
| --- | --- | --- |
| `food_logs` | One food eaten | Stores **totals** (quantity already applied) plus a snapshot of name, category, variant and serving, so editing a food never rewrites history. `log_date` is a plain date in the user's timezone |
| `foods` | A food the user created, or the user's edited copy of a built-in food | `base_key` names the built-in food it replaces (unique per user). Nutrition is per **one** `serving_label`; `servings` and `variants` are JSON; `aliases` (≤ 12) and `source` (free text) added in 0010 |
| `water_logs` | One drink | Written only via RPC `log_water` / `delete_water_log`, which also keep `health_logs.water_ml` equal to the day's total |
| `nutrition_settings` | The user's targets and favourites | One row per user; a `null` target means "no target" — the app never suggests a number. The water goal stays in `user_settings.water_goal_ml` (shared with Sleep & Health) |

Column ranges and indexes: [DATABASE.md §3.6](DATABASE.md). All four tables have RLS `owner_all`, the `updated_at` trigger and Realtime; `food_logs.food_id` has the same-owner guard.

## 2. Built-in food database

**Where the foods live.** In code, not the database: `packages/constants/src/foods.js` assembles `STARTER_FOODS` from six area files in `packages/constants/src/foods/`
(`southIndian`, `northIndian`, `restaurant`, `snacks`, `beveragesDesserts`, `staples`; builder and vocabulary in `helpers.js`). It ships with both apps, works offline and is never
copied into a user's account, so growing it can never alter user data. `FOOD_LIST_VERSION` is `2`.

| Fact (computed from the current source) | Value |
| --- | --- |
| Built-in foods | **293** |
| Foods with an extra-serving list / with preparation variants | 165 / 84 |
| Foods that know their serving weight (all of them) → can be logged by exact grams/ml | 293 (33 are drinks measured in ml) |
| Other names and spellings in total (Tamil script included) | 1,594; 261 foods have at least one Tamil-script name |
| Estimate basis | `recipe` 101 · `restaurant` 122 · `reference` 70 |

**Categories** (`FOOD_CATEGORIES`, 15 including *Other*) with the number of foods whose primary category it is: South Indian 57, North Indian 33, Non-Vegetarian 27,
Rice & Biryani 26, Beverages 24, Street Food 21, Fast Food 20, Snacks 17, Fruits 15, Desserts 14, Protein Foods 13, Vegetables 12, Vegetarian 6, Dairy 6, Other 2.
A food also carries `tags` (extra categories), so Chicken Biryani is under Rice & Biryani *and* found under Non-Vegetarian. Categories used before the expansion
(Tiffin, Rice & Grains, Roti & Bread, Curries & Dal, Egg Meat & Fish, Nuts & Snacks) are mapped on read by `canonicalCategory`; nothing is rewritten.

**A built-in food looks like this** (`idli`):

```js
{ key: 'idli', name: 'Idli', category: 'South Indian', tags: ['Vegetarian'],
  aliases: ['idly', 'itli', 'eddli', 'steamed rice cake', 'இட்லி'], meals: ['breakfast', 'dinner'],
  serving_label: '1 idli (40 g)', serving_g: 40, kcal: 58, protein_g: 2, carbs_g: 12, fat_g: 0.4, fiber_g: 0.6,
  servings: [{ label: '2 idlis', factor: 2 }, { label: '3 idlis', factor: 3 }, { label: '4 idlis', factor: 4 }],
  variants: [], basis: 'recipe', notes: '' }
```

| Concern | Rule |
| --- | --- |
| Identity | Every built-in food has a permanent slug `key`. A test (`packages/core/tests/foodDatabase.test.js`) keeps keys unique and keeps every key from the first release, so old logs and edited copies keep pointing at a food. **Never rename, reuse or delete a key**; retire a food by moving it |
| System vs user | Built-in foods are `source: 'starter'`; user rows are `'custom'` (new) or `'edited'` (has `base_key`). Only user rows are in the database |
| Edited copy | Replaces the built-in entry for that user (`buildCatalog`), keeping the built-in's other names, tags, usual meals and estimate basis. Deleting the copy brings the original back. Saved through `saveFoodCopy` (one copy per built-in; a concurrent second insert is converted to an update) |
| Duplicates | Tests fail on a repeated key/name or an alias equal to another food's name. At runtime `findDuplicateFood` refuses a new or renamed food whose name or other name already exists (case, marks and spacing ignored) and points to the existing one |
| Estimate honesty | `basis` is `reference` ("Typical value"), `recipe` ("Approximate") or `restaurant` ("Rough estimate"); the UI shows it. `NUTRITION_SOURCE` states the provenance. Tests check restaurant/street foods are marked rough |
| Consistency check | A test requires calories to agree with protein/carbs/fat at 4/4/9 kcal per gram (within the spread rounding allows) for every food and variation |

### Sources and licensing

- The source states the numbers are **"estimates compiled from public food-composition references (IFCT, USDA FoodData Central) and typical recipes, rounded for everyday portions.
  Not lab-measured"** (`packages/constants/src/foods/helpers.js`). They are not a line-by-line copy of either table, and no external food API is called at runtime.
- USDA FoodData Central is published by the US government as public domain (CC0). The terms of the Indian Food Composition Tables (IFCT) were **not** reviewed in this
  audit; because the values are rounded estimates rather than a reproduction of the tables this is probably low risk, but confirm before commercial distribution.
- The repository contains no dedicated licence file for the food list itself. The exercise database, by contrast, is Unlicense with a committed `LICENSE.txt`
  ([GYM_FITNESS.md](GYM_FITNESS.md)).
- Tamil names and spellings cover common usage; a missing one can be added to the user's own copy ("Other names").

## 3. Calculations

All functions are pure and unit-tested (`packages/core/tests/nutrition.test.js`, `foodDatabase.test.js`).

| Function | Formula / behaviour |
| --- | --- |
| `scaleNutrition(per, quantity, factor)` | each nutrient = `round(per × quantity × factor, 1)` |
| `servingOptions(food)` | base serving first, the food's own sizes, then **100 g (100 ml for drinks)** with `factor = round(100 / serving_g, 4)` |
| `customServing(food, amount)` | exact weight: `factor = round(amount / serving_g, 4)`, label `"<amount> g"`; refused for amounts ≤ 0 or > 50,000 |
| `entryRow(draft)` | stored totals = `scaleNutrition(per, quantity)`; `quantity` rounded to 2 dp |
| `perServing(entry)` | totals ÷ quantity (to 2 dp) when an entry is edited or duplicated |
| `sumNutrition(rows)` | adds in integer tenths, so a day of 0.1 values is exact |
| `macroSplit(totals)` | kcal per macro with Atwater factors protein 4, carbs 4, fat 9; shares of the three sum to 100 |
| `percentOfGoal` / `remainingOf` | `null` when no goal is set (a missing target is not "0 %"); negative remaining means over the goal |

Worked example (Idli, base 58 kcal per 40 g):

| Choice | Factor × quantity | Calories |
| --- | --- | --- |
| "3 idlis", quantity 1 | 3 × 1 | 174 |
| "1 idli (40 g)", quantity 2 | 1 × 2 | 116 |
| Custom weight 150 g | 150 / 40 = 3.75 | 217.5 |
| "100 grams" | 100 / 40 = 2.5 | 145 |

## 4. Search

`searchFoods(foods, {query, category, scope, favorites, recentRefs})` (client-side over the whole catalogue — a few hundred foods, instant).

1. The query is normalised (lower-case, accents stripped, punctuation removed; Tamil script kept) and split into words; **every word must match**.
2. A word is matched per field with a cost: exact word < starts-with < contains (≥ 2 chars) < spelling-tolerant, and fields rank *name* < *other names* < *category / tags /
   variation words*. Spelling tolerance uses a phonetic skeleton (`zh→l`, `th→t`, `ee→i`, `w→v`, repeated letters collapsed…) and a bounded edit distance (1 for words ≥ 4
   letters, 2 for ≥ 8), so `thosai`/`dosai`, `briyani`/`biryani`, `kulambu`/`kuzhambu` and `idly`/`idli` land together.
3. Squashed fallback: `panipuri` finds *Pani puri*, `chicken65` finds *Chicken 65*.
4. Ranking bonuses: exact name −100, exact alias −80, name starts-with −50, alias starts-with −30; ties by name.
5. `scope` = `all` | `favorites` | `recent`; `category` filters on primary category **or** tag.

Not implemented: ranked full-text search, search over ingredients, fuzzy matching of Tamil script spelling variants.

## 5. Food logging

Flow: [DATA_FLOW.md §4](DATA_FLOW.md). Components: `FoodPickerDialog`, `QuickAdd` (recent/frequent/favourite chips), `FoodEntryFlow`, `FoodEntryForm`, `MealSection`,
`logEntry` (save + Undo toast). Mobile: `FoodPicker`, `EntryForm`, `FoodForm`, `GoalsForm`, `WaterCard`, `useNutrition`.

| Capability | Status |
| --- | --- |
| Four meals: Breakfast, Lunch, Evening Snacks (`snack`), Dinner; default meal guessed from the hour (`guessMeal`: <11 breakfast, <16 lunch, <19 snack, else dinner) | ✅ |
| Pick from catalogue; choose variant, serving size, custom grams, quantity (0–1000), meal, date, time, notes | ✅ |
| Type a food from scratch (nutrition per serving; live total shown) | ✅ |
| Edit, delete, **duplicate** an entry (to another day/meal) | ✅ |
| Undo toast after adding (web) | ✅ |
| Recent foods, frequent foods (≥ 2 times), favourites (`nutrition_settings.favorite_foods`, ≤ 200) | ✅ |
| Suggested foods per meal (`suggestedForMeal` from the built-in `meals`) | ✅ |
| Logging a food from Quick actions / global search | ❌ |
| Barcode / photo / voice logging, external food database lookup, recipes, meal plans | ❌ / 📋 |

## 6. Custom foods

Create a food (name 1–80, category, serving label, grams/ml, kcal and macros per serving, extra serving sizes ≤ 12, variants ≤ 12, other names ≤ 12, source note, notes) or edit
a built-in one (stored as your copy). Deleting a custom food keeps entries already logged with it (`food_id` becomes `null`; the snapshot remains). Built-in variants are used as
shipped — the editor changes base values and serving sizes, not the variant list.

## 7. Water

`WATER_PRESETS = [250, 500]` plus a custom amount (1–5000 ml). `logWater` → RPC `log_water` inserts a `water_logs` row and raises `health_logs.water_ml` for the day in one
transaction; Undo → `delete_water_log`. `waterDay()` treats `health_logs.water_ml` as the day's total and shows any part with no entry (typed in Sleep & Health) as "other",
so the list always adds up.

## 8. History, calendar and analytics

| View | What it shows | Function |
| --- | --- | --- |
| Today | Calorie ring, nutrient bars vs targets, water, quick-add, meals | `dayMeals`, `dayStatus` |
| Calendar / History | Month grid with calories per day; **days with nothing logged flagged** (only after your first log and never in the future); selected day's meals editable | `calendarTotals`, `missingDays` |
| Analytics / Insights | Daily (14 days), weekly (8 weeks), monthly (calendar month) views: averages **per logged day** (unlogged days are unknown, not zero), macro split, calories by meal, standout days (closest to target, highest, lowest), top foods, weekly trend | `analyze`, `viewRange`, `weeklyTrend`, `mealDistribution`, `standoutDays`, `topFoods` |
| Dashboard "Food" widget | Calories against target, protein, carbs, fat | `dayStatus` |

Targets (all optional): calories 500–10000, protein, carbs, fat, fibre; the water goal is shared with Sleep & Health.

## 9. Backup, CSV and integration

- JSON backup includes `foods`, `food_logs`, `water_logs`, `nutrition_settings`; restore merges custom copies by `base_key` and remaps `food_id`s
  ([BACKUP_RECOVERY.md](BACKUP_RECOVERY.md)). CSV export covers the same four tables with friendly names.
- The built-in list is **not** in the backup (it ships with the app); only the user's copies and logs are.
- Food data does not feed the daily score, Reports, the Analytics page, global search or Quick actions ([KNOWN_ISSUES.md](KNOWN_ISSUES.md)).

## 10. Adding or changing a built-in food

Edit the file for its area under `packages/constants/src/foods/` with the `food(key, name, category, per, grams, [kcal, protein, carbs, fat, fibre], options)` builder.
Checklist: the key is new and permanent · nutrition is per the stated serving · `basis` is honest (restaurant dishes are `'restaurant'`) · add Tamil names and spellings to
`aka` · extra sizes with `x(label, factor)` or `w(label, grams)` · `pnpm test` (checks keys, names, aliases, serving data, 4/4/9 agreement and brief-listed dishes).

## 11. Known limits

- Apps load whole tables and compute on the device: fine for years of normal logging; a server-side range query would be the next step beyond hundreds of entries a day.
- Built-in values are best estimates, not lab data; restaurant dishes vary most. Edit the ones you eat often.
- Favourites are one JSON list: two devices toggling at the same moment keep the later write.
- Editing a food does not change past entries (by design).
- Search is not a ranked full-text index.
