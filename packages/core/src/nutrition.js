// Food & nutrition logic shared by web and mobile: nutrition arithmetic, the food catalogue (starter list + the user's own foods),
// search, day/week/month summaries, goals, water and "which days are missing". Pure functions only: no React, no Supabase.
// Dates are 'yyyy-MM-dd' strings in the user's own timezone (chosen by the caller), exactly like every other module.
import { addDays, eachDay, endOfWeek, fmtDay, monthEnd, monthStart, startOfWeek } from '@lifetrack/utils'

export const MEALS = [
  { id: 'breakfast', label: 'Breakfast', hint: 'Morning' },
  { id: 'lunch', label: 'Lunch', hint: 'Midday' },
  { id: 'snack', label: 'Evening Snacks', hint: 'Between meals' },
  { id: 'dinner', label: 'Dinner', hint: 'Night' },
]
export const MEAL_LABEL = Object.fromEntries(MEALS.map((m) => [m.id, m.label]))
export const NUTRIENTS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g']
export const NUTRIENT_LABEL = { kcal: 'Calories', protein_g: 'Protein', carbs_g: 'Carbs', fat_g: 'Fat', fiber_g: 'Fibre' }
export const GOAL_FIELDS = { kcal: 'calorie_goal', protein_g: 'protein_goal_g', carbs_g: 'carbs_goal_g', fat_g: 'fat_goal_g', fiber_g: 'fiber_goal_g' }
/** Energy per gram (Atwater factors). Used only to split calories between the three macros. */
export const KCAL_PER_GRAM = { protein_g: 4, carbs_g: 4, fat_g: 9 }
export const WATER_PRESETS = [250, 500]
export const MAX_WATER_ML = 5000

// ------------------------------------------------------------------ arithmetic
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
/** Rounds to `dp` decimals without the 0.1 + 0.2 style drift (works in integers). */
export const round = (v, dp = 1) => {
  const f = 10 ** dp
  return Math.round(num(v) * f + Math.sign(num(v)) * 1e-9) / f
}
export const emptyNutrition = () => ({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 })
export const pickNutrition = (o) => Object.fromEntries(NUTRIENTS.map((k) => [k, num(o?.[k])]))

/** Nutrition of `quantity` servings, where `per` is the nutrition of ONE serving and `factor` the serving size relative to the base serving. */
export function scaleNutrition(per, quantity = 1, factor = 1) {
  const m = num(quantity) * num(factor)
  return Object.fromEntries(NUTRIENTS.map((k) => [k, round(num(per?.[k]) * m)]))
}

/** Adds up rows' nutrition. Sums tenths as integers, so a day made of 0.1s is exactly right. */
export function sumNutrition(rows) {
  const tenths = Object.fromEntries(NUTRIENTS.map((k) => [k, 0]))
  for (const r of rows) for (const k of NUTRIENTS) tenths[k] += Math.round(num(r?.[k]) * 10)
  return Object.fromEntries(NUTRIENTS.map((k) => [k, tenths[k] / 10]))
}

/** How many kcal each macro supplies and its share of the three, for the macro split. Shares sum to 100 (or are all 0). */
export function macroSplit(totals) {
  const kcal = Object.fromEntries(Object.keys(KCAL_PER_GRAM).map((k) => [k, num(totals?.[k]) * KCAL_PER_GRAM[k]]))
  const sum = Object.values(kcal).reduce((a, b) => a + b, 0)
  return Object.keys(KCAL_PER_GRAM).map((k) => ({ key: k, grams: round(totals?.[k]), kcal: round(kcal[k], 0), percent: sum > 0 ? round((kcal[k] / sum) * 100, 0) : 0 }))
}

// ---------------------------------------------------------------------- goals
/** Share of a goal reached, in percent (not capped), or null when no goal is set: a missing goal is not "0%". */
export const percentOfGoal = (value, goal) => (goal > 0 ? (num(value) / goal) * 100 : null)
/** Goal minus eaten. Negative means over the goal. null without a goal. */
export const remainingOf = (value, goal) => (goal > 0 ? round(goal - num(value)) : null)
/** The user's targets as { kcal, protein_g, ... } (null = not set), from a nutrition_settings row (or undefined). */
export const goalsOf = (settings) => Object.fromEntries(NUTRIENTS.map((k) => [k, settings?.[GOAL_FIELDS[k]] ?? null]))
export const hasGoals = (goals) => NUTRIENTS.some((k) => goals?.[k] > 0)

// ------------------------------------------------------------------- the catalogue
export const starterRef = (key) => `starter:${key}`
export const customRef = (id) => `custom:${id}`
export const foodRefOf = (entry) => (entry.food_id ? customRef(entry.food_id) : entry.base_key ? starterRef(entry.base_key) : null)

const normalizeServings = (servings) =>
  (Array.isArray(servings) ? servings : []).filter((s) => s && s.label && Number(s.factor) > 0).map((s) => ({ label: String(s.label), factor: Number(s.factor) }))
const normalizeVariants = (variants) =>
  (Array.isArray(variants) ? variants : []).filter((x) => x && x.label).map((x) => ({ label: String(x.label), ...pickNutrition(x) }))

/** A starter or stored food as the one shape the UI works with. */
export function toCatalogFood(raw, source) {
  const starter = source === 'starter'
  const key = starter ? raw.key : raw.base_key
  return {
    ref: starter ? starterRef(raw.key) : customRef(raw.id),
    id: starter ? null : raw.id,
    base_key: key ?? null,
    source: starter ? 'starter' : raw.base_key ? 'edited' : 'custom',
    approximate: starter || !!raw.base_key,
    name: raw.name,
    category: raw.category || 'Other',
    meals: raw.meals ?? [],
    serving_label: raw.serving_label || '1 serving',
    serving_g: raw.serving_g != null ? Number(raw.serving_g) : null,
    ...pickNutrition(raw),
    servings: normalizeServings(raw.servings),
    variants: normalizeVariants(raw.variants),
    notes: raw.notes ?? '',
  }
}

/** Starter foods plus the user's own. A user's edited copy of a starter food replaces that starter food, so nothing shows twice. */
export function buildCatalog(customFoods, starter) {
  const edited = new Map(customFoods.filter((f) => f.base_key).map((f) => [f.base_key, f]))
  const starters = starter.filter((s) => !edited.has(s.key)).map((s) => toCatalogFood(s, 'starter'))
  const mine = customFoods.map((f) => {
    const original = f.base_key ? starter.find((s) => s.key === f.base_key) : null
    return toCatalogFood({ ...f, meals: original?.meals ?? [] }, 'custom')
  })
  return [...mine, ...starters].sort((a, b) => a.name.localeCompare(b.name))
}

/** The starter food a stored copy was made from, so "reset to original" has something to restore. */
export const starterOf = (food, starter) => (food?.base_key ? starter.find((s) => s.key === food.base_key) ?? null : null)

/** Serving sizes to choose from: the base serving first. */
export const servingOptions = (food) => [{ label: food.serving_label, factor: 1 }, ...food.servings.filter((s) => s.label !== food.serving_label)]

/** Nutrition of ONE base serving, with a preparation variant applied if one is chosen. */
export function foodNutrition(food, variantLabel = '') {
  const variant = variantLabel ? food.variants.find((v) => v.label === variantLabel) : null
  return pickNutrition(variant ?? food)
}

/** What the "add a food" form starts from after picking a food: per-serving nutrition for the chosen variant and serving size. */
export function entryDraftFromFood(food, { variant = '', serving = null, quantity = 1, meal, date, time = '' }) {
  const option = serving ?? { label: food.serving_label, factor: 1 }
  const per = scaleNutrition(foodNutrition(food, variant), 1, option.factor)
  return {
    name: variant ? `${food.name} (${variant})` : food.name,
    category: food.category,
    food_id: food.id,
    base_key: food.base_key,
    variant,
    serving_label: option.label,
    quantity,
    per,
    meal_type: meal,
    log_date: date,
    log_time: time,
  }
}

/** The stored row for a draft: nutrition for the whole quantity, rounded to one decimal. */
export function entryRow(draft) {
  const totals = scaleNutrition(draft.per, draft.quantity)
  return {
    log_date: draft.log_date,
    log_time: draft.log_time || null,
    meal_type: draft.meal_type,
    name: draft.name.trim(),
    category: draft.category || 'Other',
    food_id: draft.food_id ?? null,
    base_key: draft.base_key ?? null,
    variant: draft.variant ?? '',
    quantity: round(draft.quantity, 2),
    serving_label: draft.serving_label,
    ...totals,
    notes: draft.notes ?? '',
  }
}

/** A stored entry back to per-serving values (what the edit form shows and rescales). */
export function perServing(entry) {
  const q = num(entry.quantity) || 1
  return Object.fromEntries(NUTRIENTS.map((k) => [k, round(num(entry[k]) / q, 2)]))
}

// ----------------------------------------------------------------------- search
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Finds foods by name (and category/variant words). Names that start with the search come first, then ones with a word that does,
 * then the rest. `scope` is 'all' | 'favorites' | 'recent'.
 * @param {any[]} foods
 * @param {{ query?: string, category?: string, scope?: string, favorites?: string[], recentRefs?: string[] }} [opts]
 */
export function searchFoods(foods, { query = '', category = 'all', scope = 'all', favorites = [], recentRefs = [] } = {}) {
  const q = norm(query)
  const words = q ? q.split(' ') : []
  const fav = new Set(favorites)
  const recent = new Map(recentRefs.map((r, i) => [r, i]))
  const scored = []
  for (const f of foods) {
    if (category !== 'all' && f.category !== category) continue
    if (scope === 'favorites' && !fav.has(f.ref)) continue
    if (scope === 'recent' && !recent.has(f.ref)) continue
    let score = 0
    if (words.length) {
      const name = norm(f.name)
      const hay = `${name} ${norm(f.category)} ${f.variants.map((v) => norm(v.label)).join(' ')}`
      if (!words.every((w) => hay.includes(w))) continue
      score = name.startsWith(q) ? 0 : name.split(' ').some((w) => w.startsWith(words[0])) ? 1 : name.includes(words[0]) ? 2 : 3
    }
    scored.push({ food: f, score, order: scope === 'recent' ? recent.get(f.ref) : 0 })
  }
  scored.sort((a, b) => a.score - b.score || a.order - b.order || a.food.name.localeCompare(b.food.name))
  return scored.map((s) => s.food)
}

/** Foods that suit a meal first (starter foods list the meals they are usually eaten at). */
export const suggestedForMeal = (foods, meal, limit = 8) => foods.filter((f) => f.meals.includes(meal)).slice(0, limit)

// ------------------------------------------------------------------ day / meals
export const entriesOn = (logs, date) => logs.filter((l) => l.log_date === date)

const byTime = (a, b) => (a.log_time ?? '99:99').localeCompare(b.log_time ?? '99:99') || String(a.created_at).localeCompare(String(b.created_at))

/** A day's entries by meal, in the order meals are eaten, each with its own total. */
export function dayMeals(logs, date) {
  const day = entriesOn(logs, date)
  return MEALS.map((meal) => {
    const entries = day.filter((l) => l.meal_type === meal.id).sort(byTime)
    return { ...meal, entries, totals: sumNutrition(entries) }
  })
}
export const dayTotals = (logs, date) => sumNutrition(entriesOn(logs, date))

/** The meal that probably comes next, from the hour of the day in the user's timezone (0-23). Only a default: the form lets you change it. */
export function guessMeal(hour) {
  if (hour < 11) return 'breakfast'
  if (hour < 16) return 'lunch'
  if (hour < 19) return 'snack'
  return 'dinner'
}

// ---------------------------------------------------------- recent / frequent foods
const keyOf = (l) => `${foodRefOf(l) ?? 'name'}|${norm(l.name)}`

/** The foods eaten most recently, once each (newest first), with the entry they came from so it can be logged again in one tap. */
export function recentFoods(logs, limit = 8) {
  const seen = new Set()
  const out = []
  const newest = [...logs].sort((a, b) => b.log_date.localeCompare(a.log_date) || String(b.created_at).localeCompare(String(a.created_at)))
  for (const l of newest) {
    const k = keyOf(l)
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ key: k, ref: foodRefOf(l), name: l.name, entry: l })
    if (out.length >= limit) break
  }
  return out
}

/** The foods logged most often (ties broken by recency), with how many times and the latest entry. */
export function frequentFoods(logs, limit = 8, minCount = 2) {
  const map = new Map()
  for (const l of logs) {
    const k = keyOf(l)
    const cur = map.get(k)
    const newer = !cur || l.log_date > cur.entry.log_date || (l.log_date === cur.entry.log_date && String(l.created_at) > String(cur.entry.created_at))
    map.set(k, { key: k, ref: foodRefOf(l), name: l.name, count: (cur?.count ?? 0) + 1, entry: newer ? l : cur.entry })
  }
  return [...map.values()]
    .filter((f) => f.count >= minCount)
    .sort((a, b) => b.count - a.count || b.entry.log_date.localeCompare(a.entry.log_date))
    .slice(0, limit)
}

/** An existing entry as a draft for a new one (duplicate a previous entry): same food and amounts, new day/meal, no time. */
export function duplicateDraft(entry, { date, meal = entry.meal_type, time = '' }) {
  return {
    name: entry.name,
    category: entry.category,
    food_id: entry.food_id ?? null,
    base_key: entry.base_key ?? null,
    variant: entry.variant ?? '',
    serving_label: entry.serving_label,
    quantity: Number(entry.quantity) || 1,
    per: perServing(entry),
    meal_type: meal,
    log_date: date,
    log_time: time,
    notes: entry.notes ?? '',
  }
}

// ------------------------------------------------------------------ favourites
export const toggleFavorite = (favorites, ref) => (favorites.includes(ref) ? favorites.filter((r) => r !== ref) : [...favorites, ref])
/** Favourites that still point at a food that exists (a deleted custom food leaves nothing behind in the list). */
export const liveFavorites = (favorites, foods) => {
  const refs = new Set(foods.map((f) => f.ref))
  return favorites.filter((r) => refs.has(r))
}

// ------------------------------------------------------------------------ water
/**
 * A day's water: the total is what Sleep & Health holds for the day (so water typed there counts too), the entries are the drinks logged
 * here, and `other` is any part of the total that has no entry (typed in Sleep & Health) so the list always adds up to the total.
 */
export function waterDay(waterLogs, healthLog, date) {
  const entries = waterLogs.filter((w) => w.log_date === date).sort(byTime)
  const logged = entries.reduce((a, w) => a + num(w.amount_ml), 0)
  const total = Math.max(num(healthLog?.water_ml), logged)
  return { entries, total, logged, other: total - logged, last: entries.at(-1) ?? null }
}
export const isValidWaterAmount = (n) => Number.isFinite(n) && Number.isInteger(n) && n >= 1 && n <= MAX_WATER_ML

// ----------------------------------------------------------------- series & analytics
/** One point per day from..to, with that day's totals, and whether anything was logged. */
export function dailySeries(logs, from, to) {
  const byDay = new Map()
  for (const l of logs) {
    if (l.log_date < from || l.log_date > to) continue
    const list = byDay.get(l.log_date)
    if (list) list.push(l)
    else byDay.set(l.log_date, [l])
  }
  return eachDay(from, to).map((d) => {
    const entries = byDay.get(d) ?? []
    return { d, label: fmtDay(d, 'd MMM'), short: fmtDay(d, 'EEE'), day: Number(d.slice(8)), logged: entries.length > 0, count: entries.length, ...sumNutrition(entries) }
  })
}

const avg = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

/** Average per LOGGED day (a day with nothing logged is unknown, not zero, so it must not drag the average down). */
export function averages(series) {
  const days = series.filter((p) => p.logged)
  const out = { loggedDays: days.length, days: series.length }
  for (const k of NUTRIENTS) {
    const a = avg(days.map((p) => p[k]))
    out[k] = a == null ? null : round(a, k === 'kcal' ? 0 : 1)
  }
  return out
}

/** Weekly trend: the average per logged day for each of the `weeks` weeks ending with the week of `end`. */
export function weeklyTrend(logs, end, weeks = 8, weekStartsOn = 1) {
  const lastStart = startOfWeek(end, weekStartsOn)
  const out = []
  for (let i = weeks - 1; i >= 0; i--) {
    const from = addDays(lastStart, -7 * i)
    const to = endOfWeek(from, weekStartsOn)
    const series = dailySeries(logs, from, to > end ? end : to)
    const a = averages(series)
    out.push({ from, to, label: fmtDay(from, 'd MMM'), loggedDays: a.loggedDays, kcal: a.kcal, protein_g: a.protein_g, carbs_g: a.carbs_g, fat_g: a.fat_g, fiber_g: a.fiber_g })
  }
  return out
}

/** Calories by meal over a range, with each meal's share of the total. */
export function mealDistribution(logs, from, to) {
  const inRange = logs.filter((l) => l.log_date >= from && l.log_date <= to)
  const rows = MEALS.map((m) => ({ id: m.id, label: m.label, kcal: sumNutrition(inRange.filter((l) => l.meal_type === m.id)).kcal }))
  const total = rows.reduce((a, r) => a + r.kcal, 0)
  return rows.map((r) => ({ ...r, percent: total > 0 ? round((r.kcal / total) * 100, 0) : 0 }))
}

/** The days worth pointing out: closest to the calorie goal (only with a goal), highest and lowest calories. Days with no entries are not candidates. */
export function standoutDays(series, goal = null) {
  const days = series.filter((p) => p.logged && p.kcal > 0)
  if (!days.length) return { closest: null, highest: null, lowest: null }
  const pick = (cmp) => days.reduce((best, p) => (cmp(p, best) ? p : best))
  return {
    closest: goal > 0 ? pick((p, b) => Math.abs(p.kcal - goal) < Math.abs(b.kcal - goal)) : null,
    highest: pick((p, b) => p.kcal > b.kcal),
    lowest: pick((p, b) => p.kcal < b.kcal),
  }
}

/** Foods eaten most in a range: count of entries and calories, for the food history list. */
export function topFoods(logs, from, to, limit = 8) {
  const map = new Map()
  for (const l of logs) {
    if (l.log_date < from || l.log_date > to) continue
    const k = norm(l.name)
    const cur = map.get(k) ?? { name: l.name, count: 0, kcal: 0, last: l.log_date }
    cur.count += 1
    cur.kcal = round(cur.kcal + num(l.kcal))
    if (l.log_date > cur.last) cur.last = l.log_date
    map.set(k, cur)
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.kcal - a.kcal).slice(0, limit)
}

/** Everything the analytics page shows for one range. */
export function analyze(logs, from, to, goals = {}) {
  const series = dailySeries(logs, from, to)
  const a = averages(series)
  const totals = sumNutrition(logs.filter((l) => l.log_date >= from && l.log_date <= to))
  return {
    from,
    to,
    series,
    averages: a,
    totals,
    macros: macroSplit({ protein_g: a.protein_g ?? 0, carbs_g: a.carbs_g ?? 0, fat_g: a.fat_g ?? 0 }),
    meals: mealDistribution(logs, from, to),
    days: standoutDays(series, goals.kcal),
    top: topFoods(logs, from, to),
  }
}

/** The range an analytics view covers, ending at `anchor`: 'daily' = 14 days, 'weekly' = 8 weeks, 'monthly' = the calendar month of `anchor`. */
export function viewRange(view, anchor, weekStartsOn = 1) {
  if (view === 'monthly') return { from: monthStart(anchor), to: monthEnd(anchor) }
  if (view === 'weekly') return { from: addDays(startOfWeek(anchor, weekStartsOn), -49), to: anchor }
  return { from: addDays(anchor, -13), to: anchor }
}

// ------------------------------------------------------------ calendar / missing days
/** The first day anything was logged, or null. Days before it are "before you started", never "missing". */
export const firstLogDate = (logs) => logs.reduce((m, l) => (m == null || l.log_date < m ? l.log_date : m), null)

/** Days from..to (never after `today`, never before the first log) with no food logged. */
export function missingDays(logs, from, to, today) {
  const first = firstLogDate(logs)
  if (first == null) return []
  const start = from > first ? from : first
  const end = to > today ? today : to
  if (start > end) return []
  const logged = new Set(logs.map((l) => l.log_date))
  return eachDay(start, end).filter((d) => !logged.has(d))
}

/** Calories per day for the calendar grid: { 'yyyy-MM-dd': { kcal, count } } for the days that have entries. */
export function calendarTotals(logs, from, to) {
  const out = {}
  for (const p of dailySeries(logs, from, to)) if (p.logged) out[p.d] = { kcal: p.kcal, count: p.count }
  return out
}

/**
 * What the dashboard shows for a day: totals, targets and how far along the calorie target is. `percent` / `remaining` are null without a
 * calorie target (a missing target is not "0%"). `logged` is false until something has been eaten that day.
 */
export function dayStatus(logs, settingsRow, date) {
  const entries = entriesOn(logs, date)
  const totals = sumNutrition(entries)
  const goals = goalsOf(settingsRow)
  return {
    count: entries.length,
    logged: entries.length > 0,
    totals,
    goals,
    hasCalorieGoal: goals.kcal > 0,
    percent: percentOfGoal(totals.kcal, goals.kcal),
    remaining: remainingOf(totals.kcal, goals.kcal),
    macros: macroSplit(totals),
  }
}

// -------------------------------------------------------------------- formatting
export const fmtKcal = (n) => `${Math.round(num(n)).toLocaleString('en-IN')} kcal`
export const fmtGrams = (n) => `${round(n).toLocaleString('en-IN', { maximumFractionDigits: 1 })} g`
export const fmtMl = (n) => `${Math.round(num(n)).toLocaleString('en-IN')} ml`
