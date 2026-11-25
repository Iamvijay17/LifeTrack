// Built-in food list for Indian everyday eating, with special depth in Tamil Nadu and South Indian food. Ships with the apps (no external API,
// works offline). The list is split by area under ./foods/ so it stays easy to review and extend:
//   southIndian.js       tiffin, rice dishes, meals, gravies, sides, non-vegetarian home cooking
//   northIndian.js       breads, paneer and dal dishes, tandoori and curries
//   restaurant.js        biryani, fried rice and noodles, chicken starters, fast food
//   snacks.js            fried snacks, chaat and street food
//   beveragesDesserts.js drinks and sweets
//   staples.js           fruit, vegetables, dairy, eggs, meat, fish, pulses, nuts, cereals
//
// EVERY NUMBER HERE IS AN APPROXIMATE ESTIMATE for a typical serving, rounded from public food-composition references (IFCT, USDA) and
// standard recipes: not a lab measurement. `basis` says how firm each one is (see ESTIMATE_BASIS). The apps label them as approximate and let
// the user edit any food: the edit is saved as the user's own row in `foods` with base_key = the key below, and replaces the built-in entry for
// that user. The built-in list itself is never written to the database, so updating it can never touch anyone's data.
//
// Rules that keep user data safe when this list changes (a test enforces the first three):
//   - a `key` is permanent: never rename, reuse or delete one (logs and edited copies point at it); retire a food by moving it, not removing it
//   - keys and names are unique, and no alias equals another food's name (so a search never has two "different" entries for the same dish)
//   - nutrition is per ONE `serving_label`; `servings` are other sizes as multiples of it; `variants` are preparation styles with their own numbers
//   - `aliases` are other names and spellings (including Tamil script); `tags` are extra categories the food belongs to
import { BEVERAGES, DESSERTS } from './foods/beveragesDesserts.js'
import { NORTH_INDIAN } from './foods/northIndian.js'
import { RESTAURANT } from './foods/restaurant.js'
import { SNACKS } from './foods/snacks.js'
import { SOUTH_INDIAN } from './foods/southIndian.js'
import { STAPLES } from './foods/staples.js'

export { ESTIMATE_BASIS, FOOD_CATEGORIES, FOOD_LIST_VERSION, NUTRITION_SOURCE } from './foods/helpers.js'

export const STARTER_FOODS = [...SOUTH_INDIAN, ...NORTH_INDIAN, ...RESTAURANT, ...SNACKS, ...BEVERAGES, ...DESSERTS, ...STAPLES]

export const STARTER_BY_KEY = Object.fromEntries(STARTER_FOODS.map((f) => [f.key, f]))
