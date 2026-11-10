// Pure logic for the Free Exercise DB catalog (apps/web/public/exercises/catalog.json): search, filters, matching a
// user's own exercise to a catalog entry, and turning a catalog entry into a library row. No React, no network.

/** The eight browse categories, in display order. Derived from each exercise's primary muscle (Cardio: dataset category). */
export const CATALOG_CATEGORIES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Abs', 'Cardio']

/** LifeTrack's own library says "Core" where the catalog says "Abs"; keep the user's vocabulary when adding. */
const GROUP_FOR_CATEGORY = { Abs: 'Core' }
const EQUIPMENT_FOR_LIBRARY = { 'Body only': 'Bodyweight', 'No equipment': '', Kettlebells: 'Kettlebell' }

/**
 * LifeTrack's starter exercises whose names differ from Free Exercise DB's, by hand-checked target.
 * (Barbell Squat, Incline Dumbbell Press, Leg Press, Romanian Deadlift, Plank, Hanging Leg Raise and Face Pull match by name.)
 */
export const STARTER_ALIASES = {
  deadlift: 'Barbell Deadlift',
  'bench press': 'Barbell Bench Press - Medium Grip',
  'overhead press': 'Standing Military Press',
  'barbell row': 'Bent Over Barbell Row',
  'pull up': 'Pullups',
  'push up': 'Pushups',
  dip: 'Dips - Triceps Version',
  'dumbbell curl': 'Dumbbell Bicep Curl',
  'hammer curl': 'Hammer Curls',
  'lateral raise': 'Side Lateral Raise',
  'tricep pushdown': 'Triceps Pushdown',
  'lat pulldown': 'Wide-Grip Lat Pulldown',
  'seated cable row': 'Seated Cable Rows',
  'leg curl': 'Lying Leg Curls',
  'leg extension': 'Leg Extensions',
  lunge: 'Dumbbell Lunges',
  'calf raise': 'Standing Calf Raises',
  crunch: 'Crunches',
  'chest fly': 'Cable Crossover',
}

/** "Pull-up" and "pull up " compare equal. */
export const normalizeName = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Lookup tables over a catalog's exercise list. Build once, reuse. */
export function catalogIndex(exercises) {
  const byId = new Map(),
    byName = new Map()
  for (const e of exercises) {
    byId.set(e.id, e)
    byName.set(normalizeName(e.name), e)
  }
  return { byId, byName }
}

/** The catalog entry for a user's exercise name (exact name first, then a starter alias), or null. */
export function matchCatalog(index, name) {
  const key = normalizeName(name)
  if (!key) return null
  const direct = index.byName.get(key)
  if (direct) return direct
  const alias = STARTER_ALIASES[key]
  return alias ? (index.byName.get(normalizeName(alias)) ?? null) : null
}

/** Start/end image paths (relative to /exercises/), or nulls when the exercise has none. Order is upstream's. */
export const imagePair = (e) => ({ start: e?.images?.[0] ?? null, end: e?.images?.[1] ?? null })
export const hasImages = (e) => Boolean(e?.images?.length)

const haystack = (e) => normalizeName([e.name, ...e.primary, ...e.secondary, e.equipment, e.category, e.type].join(' '))

/**
 * Exercises matching a free-text query and filters. Every query word must appear in the name, muscles, equipment,
 * category or type; ranking puts exact and prefix name matches first. Filters are exact ('' or undefined = any).
 * `muscle` matches primary or secondary muscle.
 */
export function searchCatalog(exercises, { query = '', category, equipment, level, type, muscle } = {}) {
  const words = normalizeName(query).split(' ').filter(Boolean)
  const q = words.join(' ')
  const scored = []
  for (const e of exercises) {
    if (category && e.category !== category) continue
    if (equipment && e.equipment !== equipment) continue
    if (level && e.level !== level) continue
    if (type && e.type !== type) continue
    if (muscle && !e.primary.includes(muscle) && !e.secondary.includes(muscle)) continue
    let score = 0
    if (words.length) {
      const name = normalizeName(e.name),
        all = haystack(e)
      if (!words.every((w) => all.includes(w))) continue
      score = name === q ? 100 : name.startsWith(q) ? 60 : words.every((w) => name.includes(w)) ? 40 : 10
    }
    scored.push([score, e])
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name)).map(([, e]) => e)
}

/** Distinct values of a field, most common first: facetValues(list, 'equipment') -> [['Barbell', 170], ...]. */
export function facetValues(exercises, field) {
  const n = new Map()
  for (const e of exercises) n.set(e[field], (n.get(e[field]) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/** How many exercises each category holds under the other filters (so chips show what a click would give). */
export function categoryCounts(exercises, filters) {
  const rest = { ...filters, category: undefined }
  const matches = searchCatalog(exercises, rest)
  return Object.fromEntries(CATALOG_CATEGORIES.map((c) => [c, matches.filter((e) => e.category === c).length]))
}

/** A catalog entry -> the row for the user's `exercises` table. */
export const libraryRowFor = (e) => ({
  name: e.name,
  muscle_group: GROUP_FOR_CATEGORY[e.category] ?? e.category,
  equipment: EQUIPMENT_FOR_LIBRARY[e.equipment] ?? e.equipment,
})

/** Is this catalog entry already in the user's library (same normalised name)? */
export function inLibrary(entry, library) {
  const key = normalizeName(entry.name)
  return (library ?? []).find((l) => normalizeName(l.name) === key) ?? null
}

/**
 * Suggestions for an exercise-name field: the user's own exercises that match `query` (all of them when it is empty), each with its
 * catalog entry for the photo, then up to `dbLimit` more exercises from the database (only once 2+ characters are typed) that the user
 * does not already have. Each item: { kind: 'mine' | 'database', key, name, detail, entry }.
 */
export function suggestExercises({ library, catalog, query = '', dbLimit = 8, mineLimit = 40 }) {
  const q = normalizeName(query)
  const index = catalog ? catalogIndex(catalog) : null
  const mine = (library ?? [])
    .filter((l) => !q || normalizeName(l.name).includes(q))
    .slice(0, mineLimit)
    .map((l) => ({
      kind: 'mine',
      key: `m${l.id}`,
      name: l.name,
      detail: [l.muscle_group, l.equipment].filter(Boolean).join(' · '),
      entry: index ? matchCatalog(index, l.name) : null,
    }))
  if (!catalog || q.length < 2) return mine
  const known = new Set((library ?? []).map((l) => normalizeName(l.name)))
  for (const m of mine) if (m.entry) known.add(normalizeName(m.entry.name))
  const db = searchCatalog(catalog, { query })
    .filter((e) => !known.has(normalizeName(e.name)))
    .slice(0, dbLimit)
    .map((e) => ({ kind: 'database', key: `d${e.id}`, name: e.name, detail: `${e.category} · ${e.equipment}`, entry: e }))
  return [...mine, ...db]
}
