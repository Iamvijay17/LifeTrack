import { describe, expect, it } from 'vitest'
import { cardioSteps, stepsForDay } from '../src/fitness'
import { dailyProgress } from '../src/progress'

const D = '2026-11-10'
const W = (o) => ({ workout_date: D, status: 'completed', cardio_minutes: null, cardio_distance_km: null, ...o })

describe('cardio → steps estimate', () => {
  it('uses distance when logged, else minutes, and ignores other days / non-completed / gym-only', () => {
    expect(cardioSteps([W({ cardio_distance_km: 2, cardio_minutes: 30 })], D)).toBe(2600)
    expect(cardioSteps([W({ cardio_minutes: 30 })], D)).toBe(3000)
    expect(cardioSteps([W({ cardio_minutes: 30, workout_date: '2026-11-09' }), W({ cardio_minutes: 30, status: 'skipped' }), W({})], D)).toBe(0)
  })
  it('adds to manually logged steps', () => {
    expect(stepsForDay({ steps: 1000 }, [W({ cardio_minutes: 20 })], D)).toBe(3000)
    expect(stepsForDay(null, [], D)).toBe(0)
  })
  it('feeds the Today progress card', () => {
    const p = dailyProgress({ date: D, workouts: [W({ cardio_minutes: 40 })], settings: { steps_goal: 8000 } })
    const s = p.items.find((i) => i.key === 'steps')
    expect(s.done).toBeCloseTo(0.5)
    expect(s.detail).toBe('4000/8000 (incl. cardio)')
  })
})
