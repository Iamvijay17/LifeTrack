import { describe, expect, it } from 'vitest'
import { groupTasksForDay, taskFlags, byPriority, isOpen } from '../src/tasks'
import { habitStats, habitSummary, habitHeatmap, levelFor, scheduleLabel, pctText, isScheduledOn } from '../src/habits'

const T = (o) => ({ id: o.id, title: o.id, status: 'pending', priority: 'medium', due_date: '2026-11-02', created_at: '2026-11-01T00:00:00Z', ...o })
const TODAY = '2026-11-02'

describe('groupTasksForDay', () => {
  const tasks = [
    T({ id: 'a', priority: 'low' }), T({ id: 'b', priority: 'high' }), T({ id: 'c' }), T({ id: 'd', priority: 'high', created_at: '2026-11-01T01:00:00Z' }), T({ id: 'e' }),
    T({ id: 'done', status: 'done' }), T({ id: 'skip', status: 'skipped' }), T({ id: 'x', status: 'cancelled' }),
    T({ id: 'old', due_date: '2026-10-30' }), T({ id: 'older', due_date: '2026-10-01' }), T({ id: 'someday', due_date: null, priority: 'high' }),
    T({ id: 'other-day', due_date: '2026-11-03' }), T({ id: 'old-done', due_date: '2026-10-30', status: 'done' }),
  ]
  it('ranks the top three open tasks by priority then age', () => {
    const g = groupTasksForDay(tasks, TODAY, TODAY)
    expect(g.priorities.map((t) => t.id)).toEqual(['b', 'd', 'c'])
    expect(g.pending.map((t) => t.id)).toEqual(['e', 'a'])
    expect(g.done.map((t) => t.id)).toEqual(['done'])
    expect(g.off.map((t) => t.id)).toEqual(['skip', 'x'])
    expect(g.count).toBe(8)
  })
  it('lists overdue (oldest first) only when viewing today, and excludes finished tasks', () => {
    expect(groupTasksForDay(tasks, TODAY, TODAY).overdue.map((t) => t.id)).toEqual(['older', 'old'])
    expect(groupTasksForDay(tasks, '2026-11-03', TODAY).overdue).toEqual([])
  })
  it('collects undated open tasks as someday', () => {
    expect(groupTasksForDay(tasks, TODAY, TODAY).someday.map((t) => t.id)).toEqual(['someday'])
  })
  it('flags overdue/done/inactive', () => {
    expect(taskFlags(T({ id: 'o', due_date: '2026-10-01' }), TODAY)).toEqual({ done: false, inactive: false, overdue: true })
    expect(taskFlags(T({ id: 'o', status: 'done', due_date: '2026-10-01' }), TODAY).overdue).toBe(false)
    expect(isOpen(T({ id: 'p', status: 'in_progress' }))).toBe(true)
    expect(byPriority(T({ id: 'h', priority: 'high' }), T({ id: 'l', priority: 'low' }))).toBeLessThan(0)
  })
})

describe('habit stats', () => {
  const habit = { id: 'h1', name: 'Read', frequency: 'daily', days_of_week: [], weekly_target: 3, start_date: '2026-10-20', archived_at: null }
  const archived = { ...habit, id: 'h2', archived_at: '2026-10-25T00:00:00Z' }
  const logs = ['2026-11-02', '2026-11-01', '2026-10-31'].map((d) => ({ habit_id: 'h1', log_date: d, status: 'done' }))
  const stats = habitStats([habit, archived], logs, TODAY, 1)

  it('computes streaks and attaches logs', () => {
    expect(stats[0].current).toBe(3)
    expect(stats[0].today.log_date).toBe(TODAY)
    expect(stats[1].logs).toEqual([])
  })
  it('summarises active habits only', () => {
    const s = habitSummary(stats, TODAY)
    expect(s.total).toBe(1)
    expect(s.doneToday).toBe(1)
    expect(s.bestCurrent).toBe(3)
    expect(habitSummary(stats, '2026-11-02').avg30).toBeGreaterThan(0)
    expect(habitSummary([], TODAY).avg30).toBeNull()
  })
  it('builds heatmap levels (done days 4, missed scheduled days 0, unscheduled absent)', () => {
    const { levels, titles } = habitHeatmap(habitSummary(stats, TODAY).active, 'all', TODAY)
    expect(levels.get(TODAY)).toBe(4)
    expect(titles.get(TODAY)).toBe('1/1 done')
    expect(levels.get('2026-10-30')).toBe(0)
    expect(levels.has('2026-10-01')).toBe(false) // before start date → not scheduled
  })
  it('labels and formats', () => {
    expect(scheduleLabel({ frequency: 'custom', days_of_week: [1, 3] })).toBe('Mon · Wed')
    expect(scheduleLabel({ frequency: 'weekly', weekly_target: 4 })).toBe('4× / week')
    expect(pctText(0.666)).toBe('67%')
    expect(pctText(null)).toBe('—')
    expect([0, 0.2, 0.5, 0.9, 1].map(levelFor)).toEqual([0, 1, 2, 3, 4])
    expect(isScheduledOn({ frequency: 'weekly' }, TODAY)).toBe(true)
  })
})
