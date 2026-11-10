import { describe, expect, it } from 'vitest'
import { ESTIMATE_BASIS, FOOD_CATEGORIES, STARTER_BY_KEY, STARTER_FOODS } from '../../constants/src/foods.js'
import {
  buildCatalog, canonicalCategory, categoriesInUse, customServing, entryDraftFromFood, entryRow, findDuplicateFood, normalizeAliases, scaleNutrition, searchFoods,
  servingOptions, servingUnit, supportsCustomWeight,
} from '../src/nutrition.js'

const catalog = buildCatalog([], STARTER_FOODS)
const norm = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9஀-௿ ]+/g, ' ').replace(/\s+/g, ' ').trim()
const top = (query, n = 3) => searchFoods(catalog, { query }).slice(0, n).map((f) => f.base_key)

// Every dish the product brief names, searched exactly as a person would type it, with the food that must come back in the first results.
const REQUIRED = [
  // breakfast
  ['Idli', 'idli'], ['Mini Idli', 'mini-idli'], ['Sambar Idli', 'sambar-idli'],
  ['Plain Dosa', 'dosa'], ['Masala Dosa', 'masala-dosa'], ['Ghee Dosa', 'ghee-dosa'], ['Onion Dosa', 'onion-dosa'], ['Rava Dosa', 'rava-dosa'], ['Podi Dosa', 'podi-dosa'], ['Egg Dosa', 'egg-dosa'],
  ['Pongal', 'pongal'], ['Ven Pongal', 'pongal'], ['Sweet Pongal', 'sweet-pongal'],
  ['Poori', 'poori'], ['Chapati', 'chapati'], ['Parotta', 'parotta'], ['Appam', 'appam'], ['Idiyappam', 'idiyappam'], ['Puttu', 'puttu'], ['Upma', 'upma'], ['Kichadi', 'kichadi'], ['Adai', 'adai'],
  // lunch and meals
  ['White Rice', 'rice-white'], ['Brown Rice', 'rice-brown'], ['Sambar Rice', 'sambar-rice'], ['Curd Rice', 'curd-rice'], ['Lemon Rice', 'lemon-rice'], ['Tomato Rice', 'tomato-rice'],
  ['Tamarind Rice', 'tamarind-rice'], ['Coconut Rice', 'coconut-rice'], ['Full Meals', 'south-indian-meals'], ['South Indian Meals', 'south-indian-meals'],
  ['Sambar', 'sambar'], ['Rasam', 'rasam'], ['Kootu', 'kootu'], ['Poriyal', 'poriyal'], ['Potato Fry', 'potato-fry'], ['Brinjal Curry', 'brinjal-curry'],
  ['Fish Curry', 'fish'], ['Chicken Curry', 'chicken-curry'], ['Mutton Curry', 'mutton-curry'],
  // non-vegetarian and restaurant
  ['Chicken Biryani', 'chicken-biryani'], ['Mutton Biryani', 'mutton-biryani'], ['Beef Biryani', 'beef-biryani'], ['Egg Biryani', 'egg-biryani'], ['Chicken 65', 'chicken-65'],
  ['Chicken Lollipop', 'chicken-lollipop'], ['Chicken Fry', 'chicken-fry'], ['Tandoori Chicken', 'tandoori-chicken'], ['Grilled Chicken', 'chicken-grilled'], ['Butter Chicken', 'butter-chicken'],
  ['Chicken Tikka', 'chicken-tikka'], ['Pepper Chicken', 'pepper-chicken'], ['Chilli Chicken', 'chilli-chicken'], ['Chicken Fried Rice', 'chicken-fried-rice'], ['Egg Fried Rice', 'egg-fried-rice'],
  ['Mixed Fried Rice', 'mixed-fried-rice'], ['Chicken Noodles', 'chicken-noodles'], ['Egg Noodles', 'egg-noodles'], ['Mutton Chukka', 'mutton-chukka'], ['Fish Fry', 'fish-fry'], ['Fish 65', 'fish-65'],
  ['Prawn Fry', 'prawn-fry'], ['Fish Biryani', 'fish-biryani'], ['Shawarma', 'shawarma'], ['Chicken Burger', 'chicken-burger'], ['Chicken Pizza', 'chicken-pizza'],
  // snacks and street food
  ['Samosa', 'samosa'], ['Bajji', 'bajji'], ['Bonda', 'bonda'], ['Vada', 'medu-vada'], ['Masala Vada', 'masala-vada'], ['Pani Puri', 'pani-puri'], ['Bhel Puri', 'bhel-puri'], ['Pav Bhaji', 'pav-bhaji'],
  ['Kothu Parotta', 'kothu-parotta'], ['Chicken Kothu Parotta', 'chicken-kothu-parotta'], ['Egg Kothu Parotta', 'egg-kothu-parotta'], ['Veg Puff', 'veg-puff'], ['Chicken Puff', 'chicken-puff'],
  ['French Fries', 'french-fries'], ['Sandwich', 'sandwich'], ['Momos', 'momos'], ['Popcorn', 'popcorn'],
  // north indian
  ['Roti', 'roti'], ['Naan', 'naan'], ['Butter Naan', 'butter-naan'], ['Kulcha', 'kulcha'], ['Paneer Butter Masala', 'paneer-butter-masala'], ['Dal Makhani', 'dal-makhani'], ['Chole Bhature', 'chole-bhature'],
  ['Rajma Chawal', 'rajma-chawal'], ['Palak Paneer', 'palak-paneer'], ['Aloo Paratha', 'aloo-paratha'], ['Chicken Tikka Masala', 'chicken-tikka-masala'], ['Tandoori Roti', 'tandoori-roti'],
  // beverages and desserts
  ['Tea', 'tea'], ['Coffee', 'coffee'], ['Milk', 'milk'], ['Filter Coffee', 'filter-coffee'], ['Badam Milk', 'badam-milk'], ['Fresh Juice', 'orange-juice'], ['Coconut Water', 'coconut-water'],
  ['Buttermilk', 'buttermilk'], ['Lassi', 'lassi'], ['Milkshake', 'milkshake'], ['Gulab Jamun', 'gulab-jamun'], ['Jalebi', 'jalebi'], ['Laddu', 'laddu'], ['Payasam', 'payasam'],
  ['Ice Cream', 'ice-cream'], ['Cake', 'cake'], ['Brownie', 'brownie'],
]

describe('food database: coverage', () => {
  it('has a large catalogue, every food in a known category, and the 14 requested categories all in use', () => {
    expect(STARTER_FOODS.length).toBeGreaterThanOrEqual(280)
    const wanted = ['South Indian', 'North Indian', 'Non-Vegetarian', 'Vegetarian', 'Rice & Biryani', 'Fast Food', 'Street Food', 'Snacks', 'Fruits', 'Vegetables', 'Dairy', 'Beverages', 'Desserts', 'Protein Foods']
    expect(FOOD_CATEGORIES.slice(0, 14)).toEqual(wanted)
    for (const f of STARTER_FOODS) expect(FOOD_CATEGORIES, `${f.key} category`).toContain(f.category)
    for (const f of STARTER_FOODS) for (const t of f.tags) expect(FOOD_CATEGORIES, `${f.key} tag ${t}`).toContain(t)
    expect(categoriesInUse(catalog, FOOD_CATEGORIES).slice(0, 14)).toEqual(wanted)
  })

  it.each(REQUIRED)('"%s" is found, and %s comes up first', (query, key) => {
    expect(top(query), `${query} -> ${top(query, 6)}`).toContain(key)
  })

  it('ranks the exact dish ahead of looser matches', () => {
    expect(top('masala dosa', 1)).toEqual(['masala-dosa'])
    expect(top('chicken biryani', 1)).toEqual(['chicken-biryani'])
    expect(top('idli', 1)).toEqual(['idli'])
    expect(top('kothu parotta', 1)).toEqual(['kothu-parotta'])
  })
})

describe('food database: integrity', () => {
  it('keys are unique and stable-looking slugs', () => {
    const keys = STARTER_FOODS.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k, k).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('keeps every key from the first release, so earlier logs and edited copies still point at a food', () => {
    const first = 'idli dosa pongal upma chapati egg-boiled bread oats banana curd rice-white rice-brown sambar rasam curd-rice chicken-curry chicken-grilled fish dal poriyal apple almonds peanuts sundal sprouts milk tea coffee paneer salad'.split(' ')
    for (const k of first) expect(STARTER_BY_KEY[k], k).toBeTruthy()
  })

  it('has no two foods with the same name, and no food whose other name is another food\'s name', () => {
    const names = new Map()
    for (const f of STARTER_FOODS) {
      const n = norm(f.name)
      expect(names.has(n), `${f.key} duplicates the name of ${names.get(n)}`).toBe(false)
      names.set(n, f.key)
    }
    for (const f of STARTER_FOODS) {
      for (const a of f.aliases) {
        const owner = names.get(norm(a))
        expect(owner === undefined || owner === f.key, `alias "${a}" of ${f.key} is the name of ${owner}`).toBe(true)
      }
    }
  })

  it('every food has complete, sane nutrition and serving data', () => {
    for (const f of STARTER_FOODS) {
      const label = f.key
      expect(f.name.length, label).toBeGreaterThan(1)
      expect(f.serving_label.length, label).toBeGreaterThan(2)
      expect(Object.keys(ESTIMATE_BASIS), label).toContain(f.basis)
      for (const k of ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g']) {
        expect(Number.isFinite(f[k]) && f[k] >= 0, `${label}.${k}`).toBe(true)
      }
      expect(f.kcal, label).toBeLessThanOrEqual(1500)
      expect(f.protein_g + f.carbs_g + f.fat_g, `${label} macro grams vs serving weight`).toBeLessThanOrEqual((f.serving_g ?? 2000) * 1.05)
      if (f.serving_g != null) expect(f.serving_g, label).toBeGreaterThan(0)
      const labels = new Set([f.serving_label])
      for (const s of f.servings) {
        expect(s.factor, `${label} / ${s.label}`).toBeGreaterThan(0)
        expect(labels.has(s.label), `${label} repeats serving "${s.label}"`).toBe(false)
        labels.add(s.label)
      }
      expect(f.servings.length, label).toBeLessThanOrEqual(11)
      expect(f.variants.length, label).toBeLessThanOrEqual(12)
      expect(f.aliases.length, label).toBeLessThanOrEqual(24)
      const vl = new Set()
      for (const v of f.variants) {
        expect(vl.has(v.label), `${label} repeats variant "${v.label}"`).toBe(false)
        vl.add(v.label)
        expect(v.kcal, `${label} / ${v.label}`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('calories agree with protein, carbs and fat (4/4/9 kcal per gram) for every food and variation, within the spread rounding allows', () => {
    const off = []
    const check = (label, o) => {
      const calc = o.protein_g * 4 + o.carbs_g * 4 + o.fat_g * 9
      if (Math.abs(o.kcal - calc) > Math.max(25, o.kcal * 0.15)) off.push(`${label}: ${o.kcal} kcal vs ${Math.round(calc)} from macros`)
    }
    for (const f of STARTER_FOODS) {
      check(f.key, f)
      for (const v of f.variants) check(`${f.key} / ${v.label}`, v)
    }
    expect(off).toEqual([])
  })

  it('is honest about uncertainty: restaurant and street foods are marked as rough, staples as typical', () => {
    expect(STARTER_BY_KEY['chicken-biryani'].basis).toBe('restaurant')
    expect(STARTER_BY_KEY['chicken-65'].basis).toBe('restaurant')
    expect(STARTER_BY_KEY['rice-white'].basis).toBe('reference')
    expect(catalog.every((f) => f.approximate)).toBe(true)
  })
})

describe('food database: search', () => {
  it('finds foods by other names and spellings', () => {
    expect(top('thosai')).toContain('dosa')
    expect(top('dosai')).toContain('dosa')
    expect(top('idly')).toContain('idli')
    expect(top('kaapi')).toContain('coffee')
    expect(top('paratha')).toEqual(expect.arrayContaining(['parotta']))
    expect(top('briyani')).toContain('chicken-biryani')
    expect(top('biriyani')).toContain('chicken-biryani')
    expect(top('kozhi kulambu')).toContain('chicken-curry')
    expect(top('meen kuzhambu')).toContain('fish')
    expect(top('muttai')).toEqual(expect.arrayContaining(['egg-boiled']))
    expect(top('thayir sadam')).toContain('curd-rice')
    expect(top('puliyodarai')).toContain('tamarind-rice')
    expect(top('golgappa')).toContain('pani-puri')
    expect(top('sapadu')).toContain('south-indian-meals')
  })

  it('finds foods by their Tamil names, whole or partly typed', () => {
    expect(top('இட்லி')).toContain('idli')
    expect(top('தோசை')).toContain('dosa')
    expect(top('பொங்கல்')).toContain('pongal')
    expect(top('பிரியாணி')).toEqual(expect.arrayContaining(['chicken-biryani']))
    expect(top('சாம்பார்')).toContain('sambar')
    expect(top('பரோட்டா')).toContain('parotta')
    expect(top('கொத்து பரோட்டா')).toContain('kothu-parotta')
    expect(top('மீன் குழம்பு')).toContain('fish')
    expect(top('இளநீர்')).toContain('coconut-water')
    expect(top('பாயசம்')).toContain('payasam')
    expect(top('சாப்பாடு')).toContain('south-indian-meals')
    expect(top('இட்')).toContain('idli')
  })

  it('supports partial words, mixed case, and spacing differences', () => {
    expect(top('chick').every((k) => k)).toBe(true)
    expect(searchFoods(catalog, { query: 'chick' }).length).toBeGreaterThan(15)
    expect(top('PANI PURI', 1)).toEqual(['pani-puri'])
    expect(top('panipuri')).toContain('pani-puri')
    expect(top('chicken65')).toContain('chicken-65')
    expect(top('  idli  ', 1)).toEqual(['idli'])
    expect(top('bir')).toEqual(expect.arrayContaining([]))
    expect(searchFoods(catalog, { query: 'biry' }).map((f) => f.base_key)).toEqual(expect.arrayContaining(['chicken-biryani', 'mutton-biryani']))
  })

  it('does not return unrelated foods for a nonsense search', () => {
    expect(searchFoods(catalog, { query: 'qzxwv' })).toEqual([])
    expect(searchFoods(catalog, { query: 'xyzzy plugh' })).toEqual([])
  })

  it('filters by a category or by an extra category a food is tagged with', () => {
    const biryanis = searchFoods(catalog, { category: 'Rice & Biryani', query: 'biryani' })
    expect(biryanis.map((f) => f.base_key)).toEqual(expect.arrayContaining(['chicken-biryani', 'veg-biryani']))
    const nonVeg = searchFoods(catalog, { category: 'Non-Vegetarian' }).map((f) => f.base_key)
    expect(nonVeg).toEqual(expect.arrayContaining(['chicken-biryani', 'egg-dosa', 'mutton-curry']))
    const veg = searchFoods(catalog, { category: 'Vegetarian' }).map((f) => f.base_key)
    expect(veg).toEqual(expect.arrayContaining(['idli', 'sambar']))
    expect(veg).not.toContain('chicken-biryani')
    for (const c of FOOD_CATEGORIES.slice(0, 14)) expect(searchFoods(catalog, { category: c }).length, c).toBeGreaterThanOrEqual(5)
  })

  it('keeps the user\'s own foods searchable by their own other names, and an edited starter keeps the original\'s names', () => {
    const mine = [{ id: 'u1', name: 'Amma sambar', category: 'Tiffin', serving_label: '1 bowl', kcal: 70, protein_g: 3, carbs_g: 9, fat_g: 2, fiber_g: 2, aliases: ['அம்மா சாம்பார்', 'home sambar'] },
      { id: 'u2', name: 'Idli', category: 'South Indian', serving_label: '1 idli (45 g)', kcal: 65, protein_g: 2, carbs_g: 13, fat_g: 0.5, fiber_g: 0.6, base_key: 'idli' }]
    const c = buildCatalog(mine, STARTER_FOODS)
    expect(searchFoods(c, { query: 'அம்மா' })[0].ref).toBe('custom:u1')
    expect(searchFoods(c, { query: 'home sambar' })[0].ref).toBe('custom:u1')
    expect(searchFoods(c, { query: 'idly' })[0].ref).toBe('custom:u2')
    expect(searchFoods(c, { query: 'இட்லி' })[0].ref).toBe('custom:u2')
    expect(c.find((f) => f.ref === 'custom:u2').tags).toContain('Vegetarian')
  })

  it('maps categories saved before the expansion onto today\'s', () => {
    expect(canonicalCategory('Tiffin')).toBe('South Indian')
    expect(canonicalCategory('Egg, Meat & Fish')).toBe('Non-Vegetarian')
    expect(canonicalCategory('Nuts & Snacks')).toBe('Snacks')
    expect(canonicalCategory('Fruits')).toBe('Fruits')
    expect(canonicalCategory(undefined)).toBe('Other')
    const c = buildCatalog([{ id: 'x', name: 'Old tiffin', category: 'Tiffin', serving_label: '1', kcal: 1 }], STARTER_FOODS)
    expect(searchFoods(c, { query: 'old tiffin', category: 'South Indian' })).toHaveLength(1)
  })
})

describe('food database: servings and quantity', () => {
  const idli = catalog.find((f) => f.base_key === 'idli')
  const biryani = catalog.find((f) => f.base_key === 'chicken-biryani')
  const tea = catalog.find((f) => f.base_key === 'tea')

  it('offers a 100 g serving for every food that knows its weight, and its nutrition is that of 100 g', () => {
    for (const f of catalog) {
      if (!supportsCustomWeight(f)) continue
      const opts = servingOptions(f)
      const opt = opts.find((o) => o.label === '100 grams' || o.label === '100 ml') ?? (f.serving_g === 100 ? opts[0] : null)
      expect(opt, f.ref).toBeTruthy()
      expect(opt.factor * f.serving_g, f.ref).toBeCloseTo(100, 1)
    }
    const hundred = servingOptions(idli).find((o) => o.label === '100 grams')
    expect(scaleNutrition(idli, 1, hundred.factor).kcal).toBeCloseTo(145, 0) // 58 kcal per 40 g idli
    expect(servingOptions(tea).map((o) => o.label)).toContain('100 ml')
    expect(servingUnit(tea)).toBe('ml')
    expect(servingUnit(idli)).toBe('g')
  })

  it('has at least the common household sizes across the list (piece, cup, plate, bowl, glass)', () => {
    const labels = catalog.flatMap((f) => [f.serving_label, ...f.servings.map((s) => s.label)]).join(' | ').toLowerCase()
    for (const word of ['piece', 'cup', 'plate', 'bowl', 'glass']) expect(labels, word).toContain(word)
  })

  it('converts weight-based servings exactly (weight / serving weight)', () => {
    const plate = servingOptions(catalog.find((f) => f.base_key === 'rice-white')).find((o) => o.label === '1 plate (300 g)')
    expect(plate.factor).toBe(2)
    expect(scaleNutrition(catalog.find((f) => f.base_key === 'rice-white'), 1, plate.factor).kcal).toBe(390)
  })

  it('a custom weight scales every nutrient in proportion', () => {
    const s = customServing(biryani, 175)
    expect(s).toMatchObject({ label: '175 g', factor: 0.5, custom: true })
    const draft = entryDraftFromFood(biryani, { serving: s, quantity: 1, meal: 'lunch', date: '2026-11-02' })
    expect(entryRow(draft)).toMatchObject({ serving_label: '175 g', kcal: 310, protein_g: 15, carbs_g: 37, fat_g: 11, quantity: 1 })
    expect(customServing(tea, 250)).toMatchObject({ label: '250 ml' })
    expect(customServing(biryani, 0)).toBeNull()
    expect(customServing(biryani, -5)).toBeNull()
    expect(customServing({ serving_g: null, serving_label: '1 serving' }, 100)).toBeNull()
  })

  it('quantity multiplies the totals, and halving then doubling returns the same numbers', () => {
    const one = entryRow(entryDraftFromFood(idli, { quantity: 1, meal: 'breakfast', date: '2026-11-02' }))
    const three = entryRow(entryDraftFromFood(idli, { quantity: 3, meal: 'breakfast', date: '2026-11-02' }))
    const half = entryRow(entryDraftFromFood(idli, { quantity: 0.5, meal: 'breakfast', date: '2026-11-02' }))
    expect(three.kcal).toBe(one.kcal * 3)
    expect(half.kcal).toBe(one.kcal / 2)
    expect(three.protein_g).toBeCloseTo(one.protein_g * 3, 5)
  })

  it('a preparation variant swaps the numbers for the same serving', () => {
    const chicken65 = catalog.find((f) => f.base_key === 'chicken-65')
    const boneless = entryRow(entryDraftFromFood(chicken65, { variant: 'Boneless', quantity: 1, meal: 'snack', date: '2026-11-02' }))
    expect(boneless).toMatchObject({ kcal: 340, variant: 'Boneless', name: 'Chicken 65 (Boneless)' })
  })
})

describe('food database: duplicates', () => {
  it('a new food that repeats a built-in name or other name is caught, ignoring case, spelling marks and spacing', () => {
    expect(findDuplicateFood(catalog, 'idli')?.base_key).toBe('idli')
    expect(findDuplicateFood(catalog, '  IDLI  ')?.base_key).toBe('idli')
    expect(findDuplicateFood(catalog, 'Thosai')?.base_key).toBe('dosa')
    expect(findDuplicateFood(catalog, 'இட்லி')?.base_key).toBe('idli')
    expect(findDuplicateFood(catalog, 'Chicken-Biryani')?.base_key).toBe('chicken-biryani')
    expect(findDuplicateFood(catalog, 'Grandma\'s special biryani')).toBeNull()
  })

  it('the food being edited can keep its own name, but cannot take another food\'s', () => {
    const idli = catalog.find((f) => f.base_key === 'idli')
    expect(findDuplicateFood(catalog, 'Idli', { exceptRef: idli.ref })).toBeNull()
    expect(findDuplicateFood(catalog, 'Plain dosa', { exceptRef: idli.ref })?.base_key).toBe('dosa')
  })

  it('an edited copy replaces its built-in food: never two entries for one dish', () => {
    const c = buildCatalog([{ id: 'e1', name: 'Idli', serving_label: '1 idli', kcal: 60, base_key: 'idli' }], STARTER_FOODS)
    expect(c.filter((f) => f.base_key === 'idli')).toHaveLength(1)
    expect(c).toHaveLength(STARTER_FOODS.length)
    const names = c.map((f) => norm(f.name))
    expect(new Set(names).size).toBe(names.length)
  })

  it('other names are trimmed, de-duplicated and capped', () => {
    expect(normalizeAliases(' a, A ,b\n c,, ')).toEqual(['a', 'b', 'c'])
    expect(normalizeAliases(['x', 'X', ' y '])).toEqual(['x', 'y'])
    expect(normalizeAliases(null)).toEqual([])
    expect(normalizeAliases(Array.from({ length: 30 }, (_, i) => `n${i}`))).toHaveLength(12)
  })
})

describe('food database: history stays valid', () => {
  it('a log saved before the expansion (old name, old category, old variant) is untouched by the new list', () => {
    const old = { id: 'l1', log_date: '2026-10-30', meal_type: 'breakfast', name: 'Dosa (Ghee roast)', category: 'Tiffin', base_key: 'dosa', variant: 'Ghee roast', quantity: 2, serving_label: '1 medium dosa (80 g)', kcal: 440, protein_g: 7, carbs_g: 54, fat_g: 20, fiber_g: 2, food_id: null }
    // entries are snapshots: the totals shown never depend on what the list says today
    expect(old.kcal).toBe(440)
    expect(STARTER_BY_KEY[old.base_key]).toBeTruthy()
    expect(canonicalCategory(old.category)).toBe('South Indian')
  })
})
