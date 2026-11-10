// Shared vocabulary and builders for the built-in food list. See ../foods.js for the full picture.

export const FOOD_CATEGORIES = [
  'South Indian',
  'North Indian',
  'Non-Vegetarian',
  'Vegetarian',
  'Rice & Biryani',
  'Fast Food',
  'Street Food',
  'Snacks',
  'Fruits',
  'Vegetables',
  'Dairy',
  'Beverages',
  'Desserts',
  'Protein Foods',
  'Other',
]

/**
 * How firm a built-in number is. NONE of them are lab measurements: they are rounded estimates for a typical portion.
 *   reference   a plain ingredient or packaged-style staple (rice, egg, milk, fruit): little spread between sources
 *   recipe      a typical home-cooked dish: depends on the recipe, the oil and the portion
 *   restaurant  a restaurant, street or fast-food dish: oil, sugar and portion size vary a lot, so treat it as a rough guide
 */
export const ESTIMATE_BASIS = {
  reference: { label: 'Typical value', hint: 'A plain staple: values from different sources are close.' },
  recipe: { label: 'Approximate', hint: 'A typical home recipe. Oil, ingredients and portion change the real numbers.' },
  restaurant: { label: 'Rough estimate', hint: 'Restaurant, street or fast food. Oil, sugar and portion size vary a lot between places.' },
}

/** Where the built-in numbers come from, shown wherever they are. */
export const NUTRITION_SOURCE =
  'Estimates compiled from public food-composition references (IFCT, USDA FoodData Central) and typical recipes, rounded for everyday portions. Not lab-measured; edit any food to match yours.'

/** Bump when the list changes in a way worth noting (kept in the docs/changelog). User data never depends on it. */
export const FOOD_LIST_VERSION = 2

/** [kcal, protein g, carbs g, fat g, fibre g] */
const n = ([kcal, protein_g, carbs_g, fat_g, fiber_g]) => ({ kcal, protein_g, carbs_g, fat_g, fiber_g })

/** A preparation variant: its own nutrition for the SAME base serving. */
export const v = (label, nutrition) => ({ label, ...n(nutrition) })
/** Another serving size as a multiple of the base serving. */
export const x = (label, factor) => ({ label, factor })
/** Another serving size by weight (the factor is worked out from the base serving's weight). */
export const w = (label, grams) => ({ label, grams })

const round3 = (value) => Math.round(value * 1000) / 1000

/**
 * One built-in food.
 * @param {string} key      stable id (never change or reuse one: logs and users' edited copies point at it)
 * @param {string} per      what ONE serving is, e.g. '1 idli (40 g)'
 * @param {number|null} g   weight of that serving in grams (null when it is not sensible, e.g. a drink in ml)
 * @param {number[]} nutrition [kcal, protein, carbs, fat, fibre] for ONE serving
 * @param {{ tags?: string[], aka?: string[], meals?: string[], sv?: any[], vr?: any[], basis?: keyof typeof ESTIMATE_BASIS, note?: string }} [o]
 *   tags = extra categories it belongs to; aka = other names and spellings (Tamil too); sv = other servings; vr = variants
 */
export function food(key, name, category, per, g, nutrition, o = {}) {
  const servings = (o.sv ?? []).map((s) => {
    if (s.grams != null) {
      if (!g) throw new Error(`${key}: a weight-based serving needs the base serving weight`)
      return { label: s.label, factor: round3(s.grams / g) }
    }
    return { label: s.label, factor: s.factor }
  })
  return {
    key,
    name,
    category,
    tags: o.tags ?? [],
    aliases: o.aka ?? [],
    meals: o.meals ?? [],
    serving_label: per,
    serving_g: g,
    ...n(nutrition),
    servings,
    variants: o.vr ?? [],
    basis: o.basis ?? 'recipe',
    notes: o.note ?? '',
  }
}

export const B = 'breakfast'
export const L = 'lunch'
export const S = 'snack'
export const D = 'dinner'
