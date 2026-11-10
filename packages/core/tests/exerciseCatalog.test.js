import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATALOG_CATEGORIES, STARTER_ALIASES, catalogIndex, categoryCounts, facetValues, hasImages, imagePair, inLibrary, libraryRowFor, matchCatalog, normalizeName, searchCatalog } from '../src/exerciseCatalog'

const dir = new URL('../../../apps/web/public/exercises/', import.meta.url)
const catalog = JSON.parse(readFileSync(new URL('catalog.json', dir), 'utf8'))
const manifest = JSON.parse(readFileSync(new URL('images.sha256.json', dir), 'utf8'))
const all = catalog.exercises
const index = catalogIndex(all)
// The starter exercises LifeTrack seeds (packages/constants/src/defaults.js).
const STARTERS = ['Barbell Squat', 'Deadlift', 'Bench Press', 'Overhead Press', 'Barbell Row', 'Pull-up', 'Push-up', 'Dip', 'Incline Dumbbell Press', 'Dumbbell Curl', 'Hammer Curl', 'Lateral Raise', 'Tricep Pushdown', 'Lat Pulldown', 'Seated Cable Row', 'Leg Press', 'Leg Curl', 'Leg Extension', 'Romanian Deadlift', 'Lunge', 'Calf Raise', 'Plank', 'Crunch', 'Hanging Leg Raise', 'Face Pull', 'Chest Fly']

describe('imported Free Exercise DB catalog', () => {
  it('keeps source, licence and pinned commit', () => {
    expect(catalog.meta).toMatchObject({ source: 'Free Exercise DB', license: 'Unlicense', repo: 'yuhonas/free-exercise-db', count: 876 })
    expect(catalog.meta.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(catalog.meta.licenseUrl).toContain('free-exercise-db')
    expect(all).toHaveLength(876)
  })
  it('has unique ids and names, and every exercise in exactly one of the eight categories', () => {
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length)
    expect(new Set(all.map((e) => normalizeName(e.name))).size).toBe(all.length)
    expect(catalog.meta.categories).toEqual(CATALOG_CATEGORIES)
    for (const e of all) expect(CATALOG_CATEGORIES).toContain(e.category)
    for (const c of CATALOG_CATEGORIES) expect(all.filter((e) => e.category === c).length).toBeGreaterThan(0)
  })
  it('maps images only to upstream pairs: <id>/0.jpg and <id>/1.jpg, each with a recorded SHA-256', () => {
    for (const e of all) {
      expect([0, 2]).toContain(e.images.length)
      e.images.forEach((rel, i) => {
        expect(rel).toBe(`${e.id}/${i}.jpg`)
        expect(manifest[rel]).toMatch(/^[0-9a-f]{64}$/)
      })
    }
    expect(Object.keys(manifest)).toHaveLength(all.reduce((n, e) => n + e.images.length, 0))
    expect(all.filter((e) => !hasImages(e)).map((e) => e.id).sort()).toEqual(['Kettlebell_Halo', 'Kettlebell_Halo_With_Overhead_Extension', 'Kettlebell_Overhead_Triceps_Extension'])
  })
  it('only uses local relative image paths (no external or other-source URLs)', () => {
    for (const e of all) for (const rel of e.images) expect(rel).not.toMatch(/^[a-z]+:|^\/|\.\./i)
  })
})

describe('imagePair', () => {
  it('returns start then end, or nulls', () => {
    expect(imagePair(index.byId.get('Air_Bike'))).toEqual({ start: 'Air_Bike/0.jpg', end: 'Air_Bike/1.jpg' })
    expect(imagePair(index.byId.get('Kettlebell_Halo'))).toEqual({ start: null, end: null })
    expect(imagePair(undefined)).toEqual({ start: null, end: null })
  })
})

describe('matching a user exercise to the catalog', () => {
  it('normalises case and punctuation', () => {
    expect(normalizeName('  Pull-up ')).toBe('pull up')
    expect(matchCatalog(index, 'pushups')?.id).toBe('Pushups')
    expect(matchCatalog(index, 'PLANK')?.name).toBe('Plank')
    expect(matchCatalog(index, '')).toBeNull()
    expect(matchCatalog(index, 'Underwater basket weaving')).toBeNull()
  })
  it('every starter exercise resolves, and every alias points at a real exercise', () => {
    for (const s of STARTERS) expect(matchCatalog(index, s), s).not.toBeNull()
    for (const [k, target] of Object.entries(STARTER_ALIASES)) expect(index.byName.get(normalizeName(target)), `${k} → ${target}`).toBeTruthy()
    expect(STARTERS.filter((s) => index.byName.has(normalizeName(s)))).toHaveLength(7) // the rest rely on aliases
  })
})

describe('searchCatalog', () => {
  it('ranks exact then prefix name matches ahead of muscle/equipment-only hits', () => {
    const r = searchCatalog(all, { query: 'plank' })
    expect(r[0].name).toBe('Plank')
    const sq = searchCatalog(all, { query: 'squat' })
    expect(sq[0].name.toLowerCase().startsWith('squat') || sq[0].name.toLowerCase().includes('squat')).toBe(true)
  })
  it('requires every word and also searches muscles and equipment', () => {
    const r = searchCatalog(all, { query: 'barbell triceps' })
    expect(r.length).toBeGreaterThan(5)
    expect(r.every((e) => e.equipment === 'Barbell' || /barbell/i.test(e.name))).toBe(true)
    expect(searchCatalog(all, { query: 'zzzz' })).toEqual([])
  })
  it('filters by category, equipment, level, type and muscle, combined', () => {
    const chest = searchCatalog(all, { category: 'Chest' })
    expect(chest.every((e) => e.category === 'Chest')).toBe(true)
    const both = searchCatalog(all, { category: 'Chest', equipment: 'Dumbbell', level: 'Beginner' })
    expect(both.length).toBeGreaterThan(0)
    expect(both.every((e) => e.category === 'Chest' && e.equipment === 'Dumbbell' && e.level === 'Beginner')).toBe(true)
    expect(searchCatalog(all, { type: 'Stretching' }).every((e) => e.type === 'Stretching')).toBe(true)
    expect(searchCatalog(all, { muscle: 'Biceps' }).some((e) => e.category !== 'Biceps')).toBe(true) // secondary-muscle hits
  })
  it('with no query lists alphabetically; with no filters returns everything', () => {
    const r = searchCatalog(all, {})
    expect(r).toHaveLength(876)
    expect(r.map((e) => e.name)).toEqual([...r.map((e) => e.name)].sort((a, b) => a.localeCompare(b)))
  })
  it('categoryCounts ignores the category filter itself and sums to the matches', () => {
    const counts = categoryCounts(all, { category: 'Chest', equipment: 'Dumbbell' })
    expect(Object.keys(counts)).toEqual(CATALOG_CATEGORIES)
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(searchCatalog(all, { equipment: 'Dumbbell' }).length)
  })
  it('facetValues counts, most common first', () => {
    const eq = facetValues(all, 'equipment')
    expect(eq.reduce((n, [, c]) => n + c, 0)).toBe(876)
    expect(eq[0][1]).toBeGreaterThanOrEqual(eq.at(-1)[1])
  })
})

describe('adding to the library', () => {
  it('uses LifeTrack vocabulary (Abs → Core, Body only → Bodyweight)', () => {
    expect(libraryRowFor(index.byId.get('Plank'))).toEqual({ name: 'Plank', muscle_group: 'Core', equipment: 'Bodyweight' })
    expect(libraryRowFor(index.byId.get('Barbell_Deadlift'))).toEqual({ name: 'Barbell Deadlift', muscle_group: 'Back', equipment: 'Barbell' })
  })
  it('detects an exercise already in the library, ignoring case and punctuation', () => {
    expect(inLibrary(index.byId.get('Pushups'), [{ id: 'a', name: 'PUSH-UPS' }])).toBeNull() // different words — not the same exercise
    expect(inLibrary(index.byId.get('Pushups'), [{ id: 'a', name: 'pushups' }])?.id).toBe('a')
    expect(inLibrary(index.byId.get('Plank'), [])).toBeNull()
    expect(inLibrary(index.byId.get('Plank'), undefined)).toBeNull()
  })
})
