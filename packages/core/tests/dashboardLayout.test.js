import { describe, expect, it } from 'vitest'
import { arrangeWidgets, widgetOrder } from '../src/dashboard'

describe('widgetOrder', () => {
  it('uses the default order when nothing is saved', () => {
    expect(widgetOrder({})[0]).toBe('getting_started')
    expect(widgetOrder(undefined)).toHaveLength(13)
    expect(widgetOrder(undefined)).toContain('nutrition')
  })
  it('keeps the saved order, drops unknown keys and appends widgets the user has not placed yet', () => {
    const order = widgetOrder({ order: ['quick', 'gone', 'today'] })
    expect(order.slice(0, 2)).toEqual(['quick', 'today'])
    expect(order).not.toContain('gone')
    expect(order).toHaveLength(13)
  })
  it('ignores a malformed saved order', () => {
    expect(widgetOrder({ order: 'today' })).toEqual(widgetOrder({}))
  })
})

describe('arrangeWidgets', () => {
  const rows = (items) => {
    const out = []
    let sum = 0
    for (const { span } of items) {
      sum += span
      if (sum === 12) {
        out.push(sum)
        sum = 0
      }
    }
    return { complete: sum === 0, rows: out.length }
  }
  it('fills every row to exactly 12 columns', () => {
    expect(rows(arrangeWidgets(widgetOrder({}))).complete).toBe(true)
  })
  it('stretches a lone widget to the full width when its partner is hidden', () => {
    expect(arrangeWidgets(['today'])).toEqual([{ key: 'today', span: 12 }])
    expect(arrangeWidgets(['goals', 'activity'])).toEqual([
      { key: 'goals', span: 6 },
      { key: 'activity', span: 6 },
    ])
  })
  it('never leaves a hole, in any order', () => {
    const shuffled = ['activity', 'stats', 'today', 'quick', 'goals', 'score', 'weekly']
    expect(rows(arrangeWidgets(shuffled)).complete).toBe(true)
    expect(arrangeWidgets(shuffled).map((x) => x.key)).toEqual(shuffled)
  })
})
