import { describe, expect, it } from 'vitest'
import { dailyScore, weightShares, DEFAULT_WEIGHTS } from '../src/score'
import { isKindEnabled, prefEnabled, togglePatch } from '../src/reminders'

const D = '2026-11-02'

describe('score additions from the web work', () => {
  it('weightShares turns weights into whole percentages and is all zeros when every weight is zero', () => {
    expect(weightShares(DEFAULT_WEIGHTS)).toEqual({ learning: 25, career: 25, fitness: 20, habits: 15, health: 15 })
    expect(Object.values(weightShares({ learning: 0, career: 0, fitness: 0, habits: 0, health: 0 }))).toEqual([0, 0, 0, 0, 0])
    expect(weightShares(undefined).learning).toBe(0)
    expect(weightShares({ learning: 1, career: 1, fitness: 1, habits: 0, health: 0 }).learning).toBe(33)
  })
  it('learning tasks and interviews count toward their categories', () => {
    const r = dailyScore({
      date: D,
      tz: 'Asia/Kolkata',
      tasks: [
        { id: 't1', category: 'Learning', status: 'done', due_date: D },
        { id: 't2', category: 'Learning', status: 'pending', due_date: D },
      ],
      interviews: [
        { status: 'completed', scheduled_at: '2026-11-02T05:00:00Z' },
        { status: 'scheduled', scheduled_at: '2026-11-02T06:00:00Z' },
        { status: 'cancelled', scheduled_at: '2026-11-02T07:00:00Z' },
      ],
    })
    const items = (key) => r.categories.find((c) => c.key === key).items
    expect(items('learning').map((i) => i.detail)).toContain('1 / 2')
    expect(items('career').map((i) => i.detail)).toContain('1 / 2') // the cancelled interview is not counted
  })
})

describe('reminder additions', () => {
  it('a kind is on unless explicitly switched off (isKindEnabled is the web name for prefEnabled)', () => {
    expect([isKindEnabled({ bill: false }, 'bill'), isKindEnabled({ bill: false }, 'task'), isKindEnabled(undefined, 'bill')]).toEqual([false, true, true])
    expect(isKindEnabled).toBe(prefEnabled)
  })
  it('switching a reminder on re-arms it; switching it off leaves last_fired_on alone', () => {
    expect(togglePatch({ active: false })).toEqual({ active: true, last_fired_on: null })
    expect(togglePatch({ active: true })).toEqual({ active: false })
  })
})
