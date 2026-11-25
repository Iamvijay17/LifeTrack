import { describe, expect, it } from 'vitest'
import {
  MODULE_CHOICES,
  STEPS,
  answeredSteps,
  isNewAccount,
  normalizeAnswers,
  normalizeOnboarding,
  planApply,
  progressOf,
} from '@/lib/onboarding'
import { TOURS, findTarget, placePopover, tourByKey, tourForRoute } from '@/lib/tours'
import { parseMoney } from '@/lib/money'

describe('normalizeOnboarding', () => {
  it('turns anything into a valid object and leaves an undecided account undecided', () => {
    for (const bad of [null, undefined, 5, 'x', [], { status: 'bogus', step: 99 }]) {
      const n = normalizeOnboarding(bad)
      expect(n.status).toBeUndefined()
      expect(n.step).toBeGreaterThanOrEqual(0)
      expect(n.step).toBeLessThan(STEPS.length)
      expect(n.answers).toEqual({})
    }
  })
  it('keeps valid status, tours and offered flags, drops the rest', () => {
    const n = normalizeOnboarding({ status: 'later', step: 3, tours: { finance: 'done', x: 'weird' }, offered: { calendar: true, y: 1 } })
    expect(n).toMatchObject({ status: 'later', step: 3, tours: { finance: 'done' }, offered: { calendar: true } })
  })
})

describe('normalizeAnswers', () => {
  it('drops invalid values and clamps lists', () => {
    const a = normalizeAnswers({
      name: '  Sam  ',
      study_minutes: '99999',
      water_goal_ml: '2500',
      sleep_hours: '3',
      currency: 'GBP',
      monthly_budget: '30000.5',
      week_starts_on: 2,
      wake: '25:00',
      bedtime: '22:30',
      modules: ['habits', 'nope', 'finance', 'goals', 'notes', 'jobs'],
    })
    expect(a).toEqual({
      name: 'Sam',
      water_goal_ml: 2500,
      monthly_budget: '30000.5',
      bedtime: '22:30',
      modules: ['habits', 'finance', 'goals', 'notes'],
    })
  })
})

describe('planApply', () => {
  it('writes only what was answered, so skipped steps change nothing', () => {
    const plan = planApply({}, { habit_prefs: { x: 1 } }, parseMoney)
    expect(plan).toMatchObject({ settings: {}, appearance: {}, pinned: undefined })
  })
  it('maps answers onto settings, preserving existing habit prefs', () => {
    const plan = planApply(
      {
        name: 'Sam',
        currency: 'USD',
        monthly_budget: '1500',
        sleep_hours: '7.5',
        wake: '06:30',
        bedtime: '23:00',
        accent: 'emerald',
        modules: ['habits', 'finance'],
        theme: 'light',
        week_starts_on: 0,
      },
      { habit_prefs: { keep: true } },
      parseMoney,
    )
    expect(plan.name).toBe('Sam')
    expect(plan.settings).toMatchObject({ currency: 'USD', monthly_budget_paise: 150000, theme: 'light', week_starts_on: 0 })
    expect(plan.settings.habit_prefs).toEqual({ keep: true, sleep_goal_minutes: 450, routine: { wake: '06:30', bedtime: '23:00' } })
    expect(plan.appearance).toEqual({ accent: 'emerald' })
    expect(plan.pinned).toEqual(['/habits', '/finance'])
  })
  it('derives a sleep goal from bedtime and wake time when no hours are given', () => {
    expect(planApply({ wake: '06:00', bedtime: '22:00' }, {}, parseMoney).settings.habit_prefs.sleep_goal_minutes).toBe(480)
  })
  it('ignores an impossible derived sleep goal', () => {
    expect(planApply({ wake: '06:00', bedtime: '05:00' }, {}, parseMoney).settings.habit_prefs.sleep_goal_minutes).toBeUndefined()
  })
})

describe('misc onboarding helpers', () => {
  it('detects brand-new accounts', () => {
    expect(isNewAccount(null)).toBe(true)
    expect(isNewAccount({ defaults_seeded: false })).toBe(true)
    expect(isNewAccount({ defaults_seeded: true })).toBe(false)
  })
  it('reports progress and answered steps', () => {
    expect(progressOf(0)).toBe(0)
    expect(progressOf(STEPS.length - 1)).toBe(100)
    expect(answeredSteps({ currency: 'INR' })).toMatchObject({ finance: true, fitness: false })
  })
  it('every module choice points at a real route', () => {
    for (const c of MODULE_CHOICES) expect(c.to.startsWith('/')).toBe(true)
  })
})

describe('tours', () => {
  it('has a tour for each major module with at least one step', () => {
    for (const k of ['dashboard', 'learning', 'fitness', 'finance', 'calendar', 'settings'])
      expect(tourByKey(k)?.steps.length).toBeGreaterThan(0)
    expect(tourForRoute('/finance').key).toBe('finance')
    expect(new Set(TOURS.map((t) => t.key)).size).toBe(TOURS.length)
  })
  it('finds the first visible target and survives a bad selector', () => {
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>'
    const size = { width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10 }
    document.getElementById('b').getBoundingClientRect = () => size
    expect(findTarget(['!!bad', '#a', '#b']).id).toBe('b')
    expect(findTarget(['#nope'])).toBeNull()
  })
  it('places the popover below, above or centred', () => {
    const view = { w: 1000, h: 800 }
    expect(placePopover({ left: 100, top: 100, width: 100, height: 40, bottom: 140 }, view).top).toBe(154)
    expect(placePopover({ left: 100, top: 700, width: 100, height: 40, bottom: 740 }, view).top).toBeLessThan(700)
    expect(placePopover(null, view).centred).toBe(true)
  })
})
