import { describe, expect, it } from 'vitest'
import { STARTER_FOODS } from '../../constants/src/foods.js'
import {
  analyze, buildCatalog, calendarTotals, dailySeries, dayMeals, dayTotals, duplicateDraft, entryDraftFromFood, entryRow, firstLogDate, foodNutrition,
  frequentFoods, guessMeal, hasGoals, goalsOf, isValidWaterAmount, liveFavorites, macroSplit, missingDays, mealDistribution, percentOfGoal, perServing,
  recentFoods, remainingOf, round, scaleNutrition, searchFoods, servingOptions, standoutDays, sumNutrition, toggleFavorite, topFoods, viewRange, waterDay, weeklyTrend,
} from '../src/nutrition.js'

const L = (date, meal, kcal, o = {}) => ({ id: `${date}-${meal}-${kcal}-${o.name ?? ''}`, created_at: `${date}T08:00:00Z`, log_date: date, log_time: null, meal_type: meal, name: 'Food', quantity: 1, serving_label: '1 serving', kcal, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, food_id: null, base_key: null, ...o })

describe('nutrition arithmetic', () => {
  it('rounds without floating-point drift', () => {
    expect(round(0.1 + 0.2)).toBe(0.3)
    expect(round(1.005, 2)).toBe(1.01)
    expect(round(2.25)).toBe(2.3)
    expect(round(undefined)).toBe(0)
    expect(round('abc')).toBe(0)
  })
  it('scales per-serving nutrition by quantity and serving size', () => {
    const idli = { kcal: 58, protein_g: 2, carbs_g: 12, fat_g: 0.4, fiber_g: 0.6 }
    expect(scaleNutrition(idli, 3)).toEqual({ kcal: 174, protein_g: 6, carbs_g: 36, fat_g: 1.2, fiber_g: 1.8 })
    expect(scaleNutrition(idli, 2, 3)).toEqual({ kcal: 348, protein_g: 12, carbs_g: 72, fat_g: 2.4, fiber_g: 3.6 }) // 2 × "3 idlis"
    expect(scaleNutrition(idli, 0.5)).toMatchObject({ kcal: 29, fat_g: 0.2 })
    expect(scaleNutrition(idli, 0)).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 })
    expect(scaleNutrition({ kcal: 'x' }, 2).kcal).toBe(0)
  })
  it('sums a day exactly (a day of 0.1s is exactly right)', () => {
    const rows = Array.from({ length: 10 }, () => ({ kcal: 0.1, protein_g: 0.1, carbs_g: 0, fat_g: 0, fiber_g: 0 }))
    expect(sumNutrition(rows).kcal).toBe(1)
    expect(sumNutrition([])).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 })
  })
  it('splits calories between macros with 4/4/9 and shares that add to 100', () => {
    const s = macroSplit({ protein_g: 100, carbs_g: 200, fat_g: 50 })
    expect(s.map((m) => m.kcal)).toEqual([400, 800, 450])
    expect(s.map((m) => m.percent)).toEqual([24, 48, 27]) // shares of 1650 kcal, each rounded to a whole percent
    expect(macroSplit({}).every((m) => m.percent === 0)).toBe(true)
  })
})

describe('goals', () => {
  it('a missing goal is null, not 0%', () => {
    expect(percentOfGoal(500, null)).toBeNull()
    expect(percentOfGoal(500, 0)).toBeNull()
    expect(percentOfGoal(500, 2000)).toBe(25)
    expect(percentOfGoal(3000, 2000)).toBe(150) // not capped: callers decide
    expect(remainingOf(500, 2000)).toBe(1500)
    expect(remainingOf(2300, 2000)).toBe(-300)
    expect(remainingOf(100, null)).toBeNull()
  })
  it('reads targets from nutrition_settings', () => {
    expect(goalsOf({ calorie_goal: 1800, protein_goal_g: 90 })).toEqual({ kcal: 1800, protein_g: 90, carbs_g: null, fat_g: null, fiber_g: null })
    expect(hasGoals(goalsOf(undefined))).toBe(false)
    expect(hasGoals(goalsOf({ fat_goal_g: 50 }))).toBe(true)
  })
})

describe('starter food database', () => {
  it('has every food the product spec lists, each with usable numbers', () => {
    const names = STARTER_FOODS.map((f) => f.name.toLowerCase()).join('|')
    for (const must of ['idli', 'dosa', 'pongal', 'upma', 'chapati', 'boiled egg', 'bread', 'oats', 'banana', 'white rice', 'brown rice', 'sambar', 'rasam', 'curd rice', 'chicken curry', 'grilled chicken', 'fish', 'dal', 'vegetable poriyal', 'apple', 'almonds', 'peanuts', 'sundal', 'sprouts', 'milk', 'tea', 'coffee', 'paneer', 'vegetable salad'])
      expect(names, must).toContain(must)
    const keys = new Set()
    for (const f of STARTER_FOODS) {
      expect(keys.has(f.key), `duplicate key ${f.key}`).toBe(false)
      keys.add(f.key)
      expect(f.kcal).toBeGreaterThanOrEqual(0)
      expect(f.serving_label.length).toBeGreaterThan(0)
      // Calories should be roughly what the macros supply (Atwater), so a typo in one column is caught. Fibre and rounding allow slack.
      const fromMacros = f.protein_g * 4 + f.carbs_g * 4 + f.fat_g * 9
      if (f.kcal > 20) expect(Math.abs(fromMacros - f.kcal) / f.kcal, `${f.name} macros vs kcal`).toBeLessThan(0.35)
      for (const v of f.variants) if (v.kcal > 20) expect(Math.abs(v.protein_g * 4 + v.carbs_g * 4 + v.fat_g * 9 - v.kcal) / v.kcal, `${f.name} / ${v.label}`).toBeLessThan(0.4)
    }
  })
})

describe('catalogue', () => {
  const custom = [{ id: 'c1', name: 'Mom sambar', category: 'Curries & Dal', serving_label: '1 bowl', serving_g: null, kcal: 70, protein_g: 3, carbs_g: 9, fat_g: 2, fiber_g: 2, servings: [{ label: '2 bowls', factor: 2 }], variants: [], base_key: null }, { id: 'c2', name: 'Idli', category: 'Tiffin', serving_label: '1 idli (45 g)', kcal: 65, protein_g: 2, carbs_g: 13, fat_g: 0.5, fiber_g: 0.6, servings: [], variants: [], base_key: 'idli' }]
  const catalog = buildCatalog(custom, STARTER_FOODS)
  it("an edited copy replaces the starter food, so nothing shows twice; the user's own foods are marked", () => {
    expect(catalog.filter((f) => f.name === 'Idli')).toHaveLength(1)
    expect(catalog.find((f) => f.name === 'Idli')).toMatchObject({ source: 'edited', kcal: 65, ref: 'custom:c2', base_key: 'idli' })
    expect(catalog.find((f) => f.name === 'Mom sambar')).toMatchObject({ source: 'custom', approximate: false })
    expect(catalog.find((f) => f.name === 'Dosa')).toMatchObject({ source: 'starter', approximate: true, ref: 'starter:dosa' })
    expect(catalog).toHaveLength(STARTER_FOODS.length + 1)
  })
  it('an edited starter copy keeps the original meal hints', () => {
    expect(catalog.find((f) => f.name === 'Idli').meals).toContain('breakfast')
  })
  it('serving options start with the base serving; variants swap the nutrition', () => {
    const dosa = catalog.find((f) => f.name === 'Dosa')
    expect(servingOptions(dosa)[0]).toEqual({ label: dosa.serving_label, factor: 1 })
    expect(servingOptions(dosa).map((o) => o.label)).toContain('2 dosas')
    expect(foodNutrition(dosa).kcal).toBe(133)
    expect(foodNutrition(dosa, 'Masala dosa (with potato filling)').kcal).toBe(240)
    expect(foodNutrition(dosa, 'no such variant').kcal).toBe(133)
  })
  it('turns a picked food + choices into a stored row with exact totals', () => {
    const idli = STARTER_FOODS.find((f) => f.key === 'idli')
    const food = buildCatalog([], STARTER_FOODS).find((f) => f.ref === 'starter:idli')
    const serving = servingOptions(food).find((o) => o.label === '3 idlis')
    const draft = entryDraftFromFood(food, { serving, quantity: 1.5, meal: 'breakfast', date: '2026-11-02', time: '08:15' })
    const row = entryRow(draft)
    expect(row).toMatchObject({ name: 'Idli', meal_type: 'breakfast', log_date: '2026-11-02', log_time: '08:15', base_key: 'idli', food_id: null, quantity: 1.5, serving_label: '3 idlis', kcal: 261, protein_g: 9, carbs_g: 54, fat_g: 1.8 })
    expect(idli.kcal * 3 * 1.5).toBeCloseTo(row.kcal, 5)
    const masala = entryDraftFromFood(buildCatalog([], STARTER_FOODS).find((f) => f.ref === 'starter:dosa'), { variant: 'Ghee roast', quantity: 2, meal: 'dinner', date: '2026-11-02' })
    expect(entryRow(masala)).toMatchObject({ name: 'Dosa (Ghee roast)', variant: 'Ghee roast', kcal: 440 })
  })
  it('a stored entry rescales per serving and back without drifting', () => {
    for (const [total, qty] of [[58, 3], [100, 3], [0.7, 7], [348, 2]]) {
      const entry = { quantity: qty, kcal: total, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }
      const back = scaleNutrition(perServing(entry), qty)
      expect(back.kcal).toBe(total)
    }
  })
  it('duplicating copies the food, amounts and nutrition to a new day and meal', () => {
    const e = L('2026-11-01', 'lunch', 390, { name: 'Dal', quantity: 2, serving_label: '1 katori', protein_g: 17, base_key: 'dal', notes: 'x' })
    const d = duplicateDraft(e, { date: '2026-11-02', meal: 'dinner' })
    expect(entryRow(d)).toMatchObject({ log_date: '2026-11-02', meal_type: 'dinner', name: 'Dal', quantity: 2, kcal: 390, protein_g: 17, base_key: 'dal', log_time: null, notes: 'x' })
  })
})

describe('search', () => {
  const foods = buildCatalog([], STARTER_FOODS)
  it('finds by name, prefix first, and ignores case and punctuation', () => {
    expect(searchFoods(foods, { query: 'IDLI' })[0].name).toBe('Idli')
    expect(searchFoods(foods, { query: 'rice' }).map((f) => f.name)).toEqual(expect.arrayContaining(['White rice (cooked)', 'Brown rice (cooked)', 'Curd rice']))
    expect(searchFoods(foods, { query: 'rice' })[0].name).not.toBe('Curd rice') // names starting with it come before names containing it as a later word
    expect(searchFoods(foods, { query: 'white  rice,' })).toHaveLength(1)
    expect(searchFoods(foods, { query: 'zzzz' })).toEqual([])
  })
  it('matches preparation names and filters by category', () => {
    expect(searchFoods(foods, { query: 'masala' }).map((f) => f.name)).toContain('Dosa')
    const dairy = searchFoods(foods, { category: 'Dairy' })
    expect(dairy.length).toBeGreaterThan(2)
    expect(dairy.every((f) => f.category === 'Dairy')).toBe(true)
    expect(searchFoods(foods, { query: 'milk', category: 'Dairy' }).map((f) => f.name)).toContain('Milk')
  })
  it('favourites and recent scopes', () => {
    expect(searchFoods(foods, { scope: 'favorites', favorites: ['starter:dal', 'starter:idli'] }).map((f) => f.name)).toEqual(['Dal (toor, cooked)', 'Idli'])
    expect(searchFoods(foods, { scope: 'recent', recentRefs: ['starter:tea', 'starter:apple'] }).map((f) => f.name)).toEqual(['Tea (chai)', 'Apple']) // most recent first
    expect(searchFoods(foods, { scope: 'favorites', favorites: [] })).toEqual([])
  })
  it('favourites toggle and drop foods that no longer exist', () => {
    expect(toggleFavorite([], 'starter:idli')).toEqual(['starter:idli'])
    expect(toggleFavorite(['starter:idli'], 'starter:idli')).toEqual([])
    expect(liveFavorites(['starter:idli', 'custom:gone'], foods)).toEqual(['starter:idli'])
  })
})

describe('a day and its meals', () => {
  const logs = [L('2026-11-02', 'lunch', 400, { log_time: '13:00' }), L('2026-11-02', 'breakfast', 200, { log_time: '09:00', name: 'B2' }), L('2026-11-02', 'breakfast', 100, { log_time: '08:00', name: 'B1' }), L('2026-11-02', 'snack', 150), L('2026-11-03', 'dinner', 500)]
  it('groups by meal in eating order, with totals, and sorts entries by time', () => {
    const meals = dayMeals(logs, '2026-11-02')
    expect(meals.map((m) => m.id)).toEqual(['breakfast', 'lunch', 'snack', 'dinner'])
    expect(meals[0].entries.map((e) => e.name)).toEqual(['B1', 'B2'])
    expect(meals[0].totals.kcal).toBe(300)
    expect(meals[3].entries).toEqual([])
    expect(dayTotals(logs, '2026-11-02').kcal).toBe(850)
    expect(dayTotals(logs, '2026-12-01').kcal).toBe(0)
  })
  it('suggests a meal from the hour of the day', () => {
    expect([5, 10, 11, 15, 16, 18, 19, 23].map(guessMeal)).toEqual(['breakfast', 'breakfast', 'lunch', 'lunch', 'snack', 'snack', 'dinner', 'dinner'])
  })
})

describe('recent and frequent foods', () => {
  const logs = [L('2026-11-01', 'lunch', 100, { name: 'Dal', base_key: 'dal' }), L('2026-11-02', 'lunch', 110, { name: 'Dal', base_key: 'dal' }), L('2026-11-03', 'lunch', 120, { name: 'Dal', base_key: 'dal' }), L('2026-11-02', 'snack', 50, { name: 'Tea', base_key: 'tea' }), L('2026-11-03', 'snack', 60, { name: 'Tea', base_key: 'tea' }), L('2026-11-03', 'dinner', 30, { name: 'Salad', base_key: 'salad' })]
  it('recent = newest first, once each, carrying the latest entry', () => {
    const r = recentFoods(logs, 5)
    expect(r.map((x) => x.name).sort()).toEqual(['Dal', 'Salad', 'Tea'])
    expect(recentFoods([L('2026-11-01', 'lunch', 1, { name: 'Old' }), L('2026-11-09', 'lunch', 1, { name: 'New' })]).map((x) => x.name)).toEqual(['New', 'Old'])
    expect(r.find((x) => x.name === 'Dal').entry.kcal).toBe(120)
    expect(recentFoods(logs, 1)).toHaveLength(1)
  })
  it('frequent = most logged first, only foods logged at least twice', () => {
    const f = frequentFoods(logs)
    expect(f.map((x) => [x.name, x.count])).toEqual([['Dal', 3], ['Tea', 2]])
    expect(f[0].entry.kcal).toBe(120)
    expect(frequentFoods(logs, 8, 1).map((x) => x.name)).toContain('Salad')
  })
})

describe('water', () => {
  const entries = [{ id: 'w1', log_date: '2026-11-02', log_time: '09:00', amount_ml: 250, created_at: '1' }, { id: 'w2', log_date: '2026-11-02', log_time: '13:00', amount_ml: 500, created_at: '2' }, { id: 'w3', log_date: '2026-11-03', log_time: null, amount_ml: 250, created_at: '3' }]
  it("the total is the day's health log, entries are the drinks, and any difference is shown as logged elsewhere", () => {
    const d = waterDay(entries, { water_ml: 750 }, '2026-11-02')
    expect(d).toMatchObject({ total: 750, logged: 750, other: 0 })
    expect(d.last.id).toBe('w2')
    expect(waterDay(entries, { water_ml: 1000 }, '2026-11-02')).toMatchObject({ total: 1000, other: 250 })
    expect(waterDay(entries, undefined, '2026-11-02')).toMatchObject({ total: 750, other: 0 }) // never below what was logged here
    expect(waterDay(entries, { water_ml: 0 }, '2026-11-09')).toMatchObject({ total: 0, last: null, entries: [] })
  })
  it('validates amounts', () => {
    expect([0, 1, 250, 5000, 5001, 1.5, NaN, -5].map(isValidWaterAmount)).toEqual([false, true, true, true, false, false, false, false])
  })
})

describe('analytics', () => {
  const logs = [
    L('2026-11-01', 'breakfast', 300, { protein_g: 10, carbs_g: 40, fat_g: 8 }),
    L('2026-11-01', 'dinner', 700, { protein_g: 30, carbs_g: 80, fat_g: 20 }),
    L('2026-11-03', 'lunch', 1500, { protein_g: 60, carbs_g: 150, fat_g: 40 }),
    L('2026-11-05', 'snack', 500, { protein_g: 5, carbs_g: 60, fat_g: 10 }),
  ]
  it('builds one point per day and counts only logged days in averages', () => {
    const s = dailySeries(logs, '2026-11-01', '2026-11-05')
    expect(s.map((p) => [p.d, p.logged, p.kcal])).toEqual([['2026-11-01', true, 1000], ['2026-11-02', false, 0], ['2026-11-03', true, 1500], ['2026-11-04', false, 0], ['2026-11-05', true, 500]])
    const a = analyze(logs, '2026-11-01', '2026-11-05', { kcal: 1200 })
    expect(a.averages).toMatchObject({ loggedDays: 3, days: 5, kcal: 1000 }) // not 600: the two empty days are unknown, not zero
    expect(a.totals.kcal).toBe(3000)
    expect(a.meals.find((m) => m.id === 'lunch')).toMatchObject({ kcal: 1500, percent: 50 })
    expect(a.meals.reduce((s2, m) => s2 + m.percent, 0)).toBe(100)
    expect(a.macros.map((m) => m.key)).toEqual(['protein_g', 'carbs_g', 'fat_g'])
  })
  it('standout days: closest to the goal (only with a goal), highest and lowest', () => {
    const s = dailySeries(logs, '2026-11-01', '2026-11-05')
    expect(standoutDays(s, 1200)).toMatchObject({ closest: { d: '2026-11-01' }, highest: { d: '2026-11-03' }, lowest: { d: '2026-11-05' } })
    expect(standoutDays(s, null).closest).toBeNull()
    expect(standoutDays(dailySeries([], '2026-11-01', '2026-11-05'), 1200)).toEqual({ closest: null, highest: null, lowest: null })
  })
  it('weekly trend averages per logged day and never looks past today', () => {
    const w = weeklyTrend(logs, '2026-11-05', 2, 1) // weeks of Mon 2026-10-26 and Mon 2026-11-02
    expect(w).toHaveLength(2)
    expect(w[0]).toMatchObject({ from: '2026-10-26', loggedDays: 1, kcal: 1000 })
    expect(w[1]).toMatchObject({ from: '2026-11-02', loggedDays: 2, kcal: 1000 })
  })
  it('meal distribution of an empty range is all zero, and food history counts repeats', () => {
    expect(mealDistribution([], '2026-11-01', '2026-11-05').every((m) => m.kcal === 0 && m.percent === 0)).toBe(true)
    const rep = [L('2026-11-01', 'lunch', 100, { name: 'Dal' }), L('2026-11-02', 'lunch', 120, { name: 'dal' }), L('2026-11-02', 'snack', 80, { name: 'Tea' })]
    expect(topFoods(rep, '2026-11-01', '2026-11-30')[0]).toMatchObject({ count: 2, kcal: 220, last: '2026-11-02' })
  })
  it('daily, weekly and monthly ranges', () => {
    expect(viewRange('daily', '2026-11-10')).toEqual({ from: '2026-10-28', to: '2026-11-10' })
    expect(viewRange('weekly', '2026-11-10', 1)).toEqual({ from: '2026-09-21', to: '2026-11-10' })
    expect(viewRange('monthly', '2026-02-14')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})

describe('calendar: days with nothing logged', () => {
  const logs = [L('2026-11-02', 'lunch', 500), L('2026-11-04', 'lunch', 600)]
  it('flags empty days between the first log and today, never days before you started or after today', () => {
    expect(firstLogDate(logs)).toBe('2026-11-02')
    expect(missingDays(logs, '2026-11-01', '2026-11-30', '2026-11-06')).toEqual(['2026-11-03', '2026-11-05', '2026-11-06'])
    expect(missingDays(logs, '2026-11-01', '2026-11-03', '2026-11-10')).toEqual(['2026-11-03'])
    expect(missingDays([], '2026-11-01', '2026-11-30', '2026-11-06')).toEqual([])
    expect(missingDays(logs, '2026-12-01', '2026-12-31', '2026-11-06')).toEqual([])
  })
  it('calories per day for the month grid', () => {
    expect(calendarTotals(logs, '2026-11-01', '2026-11-30')).toEqual({ '2026-11-02': { kcal: 500, count: 1 }, '2026-11-04': { kcal: 600, count: 1 } })
  })
})
