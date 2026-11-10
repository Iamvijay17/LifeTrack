// Starter food reference for Indian everyday eating. Ships with the apps (no external API, works offline).
//
// EVERY NUMBER HERE IS AN APPROXIMATE ESTIMATE for a typical home-cooked or common serving, rounded from public food-composition tables
// (IFCT, USDA) and typical recipes. Real values vary with recipe, oil, portion size and brand, so the apps label them "approximate" and let the
// user edit any food (a user's edited copy is saved in `foods` with base_key = the key below and replaces the starter entry for that user).
//
// Shape: nutrition is per ONE `serving` (serving_label / serving_g). `servings` are other serving sizes as multiples of it.
// `variants` are preparation styles; each has its own nutrition per the same base serving and replaces the base values when chosen.

export const FOOD_CATEGORIES = [
  'Tiffin',
  'Rice & Grains',
  'Roti & Bread',
  'Curries & Dal',
  'Egg, Meat & Fish',
  'Dairy',
  'Vegetables',
  'Fruits',
  'Nuts & Snacks',
  'Beverages',
  'Other',
]

/** [kcal, protein g, carbs g, fat g, fibre g] */
const n = ([kcal, protein_g, carbs_g, fat_g, fiber_g]) => ({ kcal, protein_g, carbs_g, fat_g, fiber_g })
const v = (label, nutrition) => ({ label, ...n(nutrition) })
const s = (label, factor) => ({ label, factor })
const food = (key, name, category, meals, serving_label, serving_g, nutrition, servings = [], variants = []) => ({
  key,
  name,
  category,
  meals,
  serving_label,
  serving_g,
  ...n(nutrition),
  servings,
  variants,
})

export const STARTER_FOODS = [
  // ---------------------------------------------------------------- breakfast & tiffin
  food('idli', 'Idli', 'Tiffin', ['breakfast', 'dinner'], '1 idli (40 g)', 40, [58, 2, 12, 0.4, 0.6], [s('2 idlis', 2), s('3 idlis', 3), s('4 idlis', 4)], [
    v('Rava idli', [75, 2.2, 12.5, 2, 1]),
    v('Ragi idli', [60, 1.8, 12, 0.5, 1.4]),
  ]),
  food('dosa', 'Dosa', 'Tiffin', ['breakfast', 'dinner'], '1 medium dosa (80 g)', 80, [133, 2.7, 25, 2.6, 1], [s('2 dosas', 2)], [
    v('Masala dosa (with potato filling)', [240, 5, 35, 9, 2.5]),
    v('Ghee roast', [220, 3.5, 27, 10, 1]),
    v('Rava dosa', [160, 3.5, 26, 4.5, 1.2]),
    v('Ragi dosa', [125, 3, 22, 2.5, 2]),
    v('Set dosa (1 piece)', [100, 2.2, 18, 2, 0.8]),
  ]),
  food('pongal', 'Pongal (ven pongal)', 'Tiffin', ['breakfast'], '1 katori (200 g)', 200, [230, 5.5, 34, 8, 1.5], [s('1 plate (300 g)', 1.5)], [
    v('Sakkarai pongal (sweet)', [330, 5, 58, 9, 1.5]),
  ]),
  food('upma', 'Upma', 'Tiffin', ['breakfast'], '1 katori (150 g)', 150, [200, 4.5, 30, 6.5, 2], [s('1 plate (250 g)', 1.67)], [v('Vegetable upma', [210, 5, 31, 7, 3])]),
  food('chapati', 'Chapati', 'Roti & Bread', ['breakfast', 'lunch', 'dinner'], '1 medium chapati (40 g)', 40, [110, 3.2, 19.5, 2.4, 2.7], [s('2 chapatis', 2), s('3 chapatis', 3)], [
    v('With ghee or oil', [140, 3.2, 19.5, 5, 2.7]),
    v('Phulka (small, no oil)', [80, 2.5, 15, 1.2, 2]),
  ]),
  food('egg-boiled', 'Boiled egg', 'Egg, Meat & Fish', ['breakfast', 'snack'], '1 large egg (50 g)', 50, [78, 6.3, 0.6, 5.3, 0], [s('2 eggs', 2), s('3 eggs', 3)], [
    v('Egg white only', [17, 3.6, 0.2, 0.1, 0]),
    v('Omelette (1 egg, with oil)', [105, 6.5, 1, 8, 0]),
  ]),
  food('bread', 'Bread', 'Roti & Bread', ['breakfast', 'snack'], '1 slice (30 g)', 30, [79, 2.7, 14.7, 1, 0.8], [s('2 slices', 2), s('3 slices', 3)], [
    v('Brown / whole wheat', [74, 3, 13.5, 1, 1.8]),
    v('Toasted with butter', [115, 2.7, 14.7, 4.8, 0.8]),
  ]),
  food('oats', 'Oats', 'Rice & Grains', ['breakfast'], '1 bowl, cooked with water (40 g dry)', 40, [150, 5.3, 27, 2.6, 4], [], [
    v('Cooked with milk', [250, 10, 33, 8, 4]),
    v('Savoury oats (vegetables)', [170, 5.5, 28, 3.8, 4.5]),
  ]),
  food('banana', 'Banana', 'Fruits', ['breakfast', 'snack'], '1 medium banana (118 g)', 118, [105, 1.3, 27, 0.4, 3.1], [s('1 small banana (80 g)', 0.7), s('1 large banana', 1.2)]),
  food('curd', 'Curd (dahi)', 'Dairy', ['breakfast', 'lunch', 'dinner'], '1 katori (100 g)', 100, [60, 3.5, 4.7, 3.3, 0], [s('1 large bowl (200 g)', 2)], [
    v('Low fat', [45, 4, 5, 1, 0]),
  ]),

  // ------------------------------------------------------------------------------ lunch
  food('rice-white', 'White rice (cooked)', 'Rice & Grains', ['lunch', 'dinner'], '1 katori (150 g)', 150, [195, 4, 43, 0.4, 0.6], [s('1 cup (200 g)', 1.33), s('1 plate (300 g)', 2), s('Small katori (100 g)', 0.67)]),
  food('rice-brown', 'Brown rice (cooked)', 'Rice & Grains', ['lunch', 'dinner'], '1 katori (150 g)', 150, [165, 3.8, 34.5, 1.3, 2.7], [s('1 cup (200 g)', 1.33), s('1 plate (300 g)', 2)]),
  food('sambar', 'Sambar', 'Curries & Dal', ['breakfast', 'lunch', 'dinner'], '1 katori (150 ml)', 150, [85, 4, 12, 2.5, 3], [s('1 cup (240 ml)', 1.6)]),
  food('rasam', 'Rasam', 'Curries & Dal', ['lunch', 'dinner'], '1 katori (150 ml)', 150, [40, 1.5, 6, 1.2, 1], [s('1 cup (240 ml)', 1.6)]),
  food('curd-rice', 'Curd rice', 'Rice & Grains', ['lunch', 'dinner'], '1 katori (200 g)', 200, [240, 7, 38, 6.5, 0.8], [s('1 plate (300 g)', 1.5)]),
  food('chicken-curry', 'Chicken curry', 'Egg, Meat & Fish', ['lunch', 'dinner'], '1 katori (150 g, with gravy)', 150, [240, 19, 6, 15, 1.2], [s('2 katoris', 2)], [
    v('Boneless', [270, 26, 6, 16, 1.2]),
    v('Restaurant style (oily)', [340, 20, 8, 25, 1.2]),
  ]),
  food('chicken-grilled', 'Grilled chicken breast', 'Egg, Meat & Fish', ['lunch', 'dinner'], '100 g cooked', 100, [165, 31, 0, 3.6, 0], [s('150 g', 1.5), s('200 g', 2)], [
    v('With skin', [205, 30, 0, 9, 0]),
    v('Tandoori', [190, 27, 3, 7, 0.4]),
  ]),
  food('fish', 'Fish curry', 'Egg, Meat & Fish', ['lunch', 'dinner'], '1 katori (150 g, 2 pieces)', 150, [190, 20, 4, 10, 0.5], [], [
    v('Fried (about 100 g)', [250, 21, 7, 15, 0.4]),
    v('Grilled or baked (100 g)', [140, 24, 0, 4.5, 0]),
  ]),
  food('dal', 'Dal (toor, cooked)', 'Curries & Dal', ['lunch', 'dinner'], '1 katori (150 g)', 150, [160, 8.5, 22, 4, 5], [s('1 large bowl (250 g)', 1.67)], [
    v('Moong dal', [130, 8.5, 19, 2.5, 4.5]),
    v('Dal tadka (with ghee)', [200, 8.5, 22, 8.5, 5]),
  ]),
  food('poriyal', 'Vegetable poriyal', 'Vegetables', ['lunch', 'dinner'], '1 katori (100 g)', 100, [90, 2, 9, 5, 3.5], [s('Small katori (60 g)', 0.6)], [
    v('Light oil, no coconut', [60, 2, 8, 2.5, 3]),
  ]),

  // ----------------------------------------------------------------------------- snacks
  food('apple', 'Apple', 'Fruits', ['snack', 'breakfast'], '1 medium apple (180 g)', 180, [95, 0.5, 25, 0.3, 4.4], [s('1 small apple', 0.75), s('1 large apple', 1.3)]),
  food('almonds', 'Almonds', 'Nuts & Snacks', ['snack', 'breakfast'], '10 almonds (12 g)', 12, [70, 2.5, 2.6, 6, 1.5], [s('5 almonds', 0.5), s('20 almonds', 2), s('1 handful (28 g)', 2.33)]),
  food('peanuts', 'Peanuts (roasted)', 'Nuts & Snacks', ['snack'], '1 handful (28 g)', 28, [164, 7.3, 4.6, 14, 2.4], [s('Half handful (14 g)', 0.5), s('2 handfuls', 2)], [
    v('Boiled', [95, 4.3, 6.5, 6.2, 2.5]),
  ]),
  food('sundal', 'Sundal (chickpea)', 'Nuts & Snacks', ['snack'], '1 katori (100 g)', 100, [165, 8, 22, 5, 6.5], [s('Small katori (60 g)', 0.6)]),
  food('sprouts', 'Sprouts (moong)', 'Nuts & Snacks', ['snack', 'breakfast'], '1 katori (100 g)', 100, [85, 7, 13, 0.5, 3], [s('Small katori (60 g)', 0.6)], [
    v('Sprouts salad (with onion, tomato, lemon)', [95, 7, 15, 0.8, 3.5]),
  ]),
  food('milk', 'Milk', 'Dairy', ['breakfast', 'snack', 'dinner'], '1 glass (200 ml)', 200, [130, 6.5, 9.5, 7, 0], [s('1 cup (150 ml)', 0.75), s('1 large glass (300 ml)', 1.5)], [
    v('Toned (3% fat)', [120, 6.2, 9.4, 6, 0]),
    v('Skimmed', [70, 6.5, 10, 0.3, 0]),
    v('Buffalo (full fat)', [220, 9, 10, 14, 0]),
  ]),
  food('tea', 'Tea (chai)', 'Beverages', ['breakfast', 'snack'], '1 cup (150 ml, milk and sugar)', 150, [70, 1.5, 10, 2.5, 0], [s('1 small cup (100 ml)', 0.67), s('2 cups', 2)], [
    v('Without sugar', [40, 1.5, 3, 2.5, 0]),
    v('Black tea (no milk, no sugar)', [2, 0, 0.5, 0, 0]),
  ]),
  food('coffee', 'Coffee', 'Beverages', ['breakfast', 'snack'], '1 cup (150 ml, milk and sugar)', 150, [80, 2, 10, 3, 0], [s('1 small cup (100 ml)', 0.67), s('2 cups', 2)], [
    v('Without sugar', [45, 2, 3.5, 3, 0]),
    v('Black coffee', [3, 0.2, 0.4, 0, 0]),
  ]),

  // ---------------------------------------------------------------------------- dinner
  food('paneer', 'Paneer', 'Dairy', ['lunch', 'dinner'], '100 g (about 5 cubes)', 100, [265, 18, 1.2, 20, 0], [s('50 g', 0.5), s('150 g', 1.5)], [
    v('Paneer curry (1 katori, 150 g)', [320, 14, 9, 26, 1.5]),
    v('Grilled paneer tikka', [240, 17, 4, 17, 0.5]),
    v('Paneer bhurji (1 katori)', [290, 16, 6, 22, 1]),
  ]),
  food('salad', 'Vegetable salad', 'Vegetables', ['lunch', 'dinner', 'snack'], '1 bowl (150 g)', 150, [45, 2, 9, 0.4, 3], [s('Small bowl (80 g)', 0.53), s('Large bowl (250 g)', 1.67)], [
    v('With dressing / oil', [90, 2, 9, 5.5, 3]),
  ]),
]

export const STARTER_BY_KEY = Object.fromEntries(STARTER_FOODS.map((f) => [f.key, f]))
