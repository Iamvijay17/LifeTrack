import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COMPANION,
  WIDGETS,
  companionSnapshot,
  moveWidget,
  normalizeCompanionPrefs,
  toggleWidget,
  visibleWidgets,
} from '../src/companion'

describe('layout preferences', () => {
  it('defaults to every widget, in order', () => {
    expect(normalizeCompanionPrefs(null)).toEqual(DEFAULT_COMPANION)
    expect(DEFAULT_COMPANION.order).toEqual(WIDGETS)
  })
  it('repairs bad values, drops unknown widgets and repeats, and appends widgets it is missing', () => {
    const p = normalizeCompanionPrefs({
      order: ['timer', 'bogus', 'timer', 'add'],
      hidden: ['habits', 'nope', 'habits'],
      theme: 'neon',
      density: 'compact',
      collapsed: 'yes',
    })
    expect(p.order).toEqual(['timer', 'add', 'progress', 'habits', 'upcoming'])
    expect(p.hidden).toEqual(['habits'])
    expect(p.theme).toBe('app')
    expect(p.density).toBe('compact')
    expect(p.collapsed).toBe(false)
  })
  it('moves a widget, stops at the ends, and hidden widgets keep their slot', () => {
    expect(moveWidget(WIDGETS, 'timer', -1).slice(0, 4)).toEqual(['add', 'progress', 'timer', 'habits'])
    expect(moveWidget(WIDGETS, 'add', -1)).toBe(WIDGETS)
    expect(moveWidget(WIDGETS, 'upcoming', 1)).toBe(WIDGETS)
    const hidden = toggleWidget({ ...DEFAULT_COMPANION }, 'habits')
    expect(visibleWidgets(hidden)).toEqual(['add', 'progress', 'timer', 'upcoming'])
    expect(visibleWidgets(toggleWidget(hidden, 'habits'))).toEqual(WIDGETS)
  })
})

const TODAY = '2026-11-16'
const task = (id, extra = {}) => ({
  id,
  title: id,
  status: 'pending',
  priority: 'medium',
  due_date: TODAY,
  created_at: `2026-11-0${id.length}T00:00:00Z`,
  ...extra,
})
const stat = (id, extra = {}) => ({
  habit: { id, name: id, color: '#fff', archived_at: null, ...(extra.habit ?? {}) },
  due: true,
  today: null,
  current: 2,
  unit: 'd',
  ...extra,
})

describe('companionSnapshot', () => {
  const o = { today: TODAY, tz: 'Asia/Kolkata', nowMs: Date.parse('2026-11-16T05:00:00Z') }
  it("counts today's plan, leaving out cancelled and skipped tasks, and lists the open ones with overdue first", () => {
    const s = companionSnapshot(
      {
        tasks: [
          task('a', { status: 'done' }),
          task('bb'),
          task('ccc', { status: 'cancelled' }),
          task('dddd', { due_date: '2026-11-10' }),
          task('eeeee', { status: 'skipped' }),
        ],
      },
      o,
    )
    expect(s.tasks).toMatchObject({ total: 2, done: 1, pct: 0.5, overdue: 1 })
    expect(s.tasks.open.map((t) => t.id)).toEqual(['dddd', 'bb'])
  })
  it('has no percentage when nothing is planned', () => {
    expect(companionSnapshot({ tasks: [] }, o).tasks.pct).toBeNull()
    expect(companionSnapshot({}, o).habits.pct).toBeNull()
  })
  it('shows habits due or done today, hides archived and paused ones', () => {
    const s = companionSnapshot(
      {
        habitStats: [
          stat('read'),
          stat('run', { today: { status: 'done' }, due: false }),
          stat('rest', { due: false }),
          stat('old', { habit: { archived_at: 'x' } }),
          stat('paused', { habit: { pauses: [{ start_date: '2026-11-01', end_date: null }] } }),
        ],
      },
      o,
    )
    expect(s.habits.list.map((h) => h.id)).toEqual(['read', 'run'])
    expect(s.habits).toMatchObject({ done: 1, total: 2, pct: 0.5 })
  })
  it('prefers reminders for the upcoming list, and falls back to other deadlines when there are none', () => {
    const reminders = [{ id: 'r1', title: 'Call mum', active: true, remind_date: '2026-11-17', remind_time: '09:00' }]
    const tasks = [task('t1', { due_date: '2026-11-18' })]
    const a = companionSnapshot({ reminders, tasks }, o)
    expect(a.upcoming.items.map((i) => i.id)).toEqual(['r1'])
    expect(a.upcoming.remindersOnly).toBe(true)
    const b = companionSnapshot({ reminders: [], tasks }, o)
    expect(b.upcoming.items.map((i) => i.id)).toEqual(['t1'])
    expect(b.upcoming.remindersOnly).toBe(false)
  })
  it('limits the lists', () => {
    const tasks = Array.from({ length: 9 }, (_, i) => task(`t${i}x`.repeat(1), { id: `t${i}` }))
    const s = companionSnapshot({ tasks }, { ...o, limit: 3 })
    expect(s.tasks.open).toHaveLength(3)
    expect(s.tasks.more).toBe(6)
  })
})
