import { describe, expect, it } from 'vitest'
import {
  CREATE_KEYS,
  CREATE_TARGETS,
  GO_KEYS,
  RECENTS_MAX,
  captureRow,
  contextActions,
  filterCommands,
  highlightParts,
  isTypingTarget,
  parseCapture,
  parseWhen,
  pushRecent,
  sanitizeRecents,
  scoreMatch,
  searchData,
} from '@/features/command/model'
import { searchAll } from '@/components/layout/GlobalSearch'
import { NAV } from '@/lib/nav'

const TODAY = '2026-11-16' // a Monday

describe('scoreMatch', () => {
  it('ranks prefix above word-start above mid-word, and needs every term', () => {
    const prefix = scoreMatch('plan', 'Planner')
    const word = scoreMatch('plan', 'Daily Planner')
    const mid = scoreMatch('plan', 'Airplane')
    expect(prefix).toBeGreaterThan(word)
    expect(word).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(0)
    expect(scoreMatch('daily zzz', 'Daily Planner')).toBe(0)
    expect(scoreMatch('planner daily', 'Daily Planner')).toBeGreaterThan(0)
  })
  it('ignores case and accents, and an empty query matches nothing', () => {
    expect(scoreMatch('CAFE', 'Café notes')).toBeGreaterThan(0)
    expect(scoreMatch('', 'x')).toBe(0)
    expect(scoreMatch('x', null, undefined)).toBe(0)
  })
})

describe('highlightParts', () => {
  it('marks every term, case-blind, and the parts rejoin to the original text', () => {
    const parts = highlightParts('Buy Milk and milk', 'milk buy')
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(['Buy', 'Milk', 'milk'])
    expect(parts.map((p) => p.text).join('')).toBe('Buy Milk and milk')
  })
  it('returns the text unmarked for an empty query', () => {
    expect(highlightParts('Hello', '')).toEqual([{ text: 'Hello', hit: false }])
    expect(highlightParts('', 'x')).toEqual([{ text: '', hit: false }])
  })
})

describe('searchData', () => {
  const data = {
    tasks: [
      { id: 't1', title: 'Quarterly report', due_date: '2026-11-20', status: 'pending' },
      { id: 't2', title: 'Buy milk', due_date: null, status: 'done' },
    ],
    notes: [{ id: 'n1', title: '', body: 'Quarterly goals brainstorm', category: 'Ideas', tags: [] }],
    reminders: [{ id: 'r1', title: 'Quarterly tax', remind_date: '2026-12-01' }],
    calendar_events: [{ id: 'e1', title: 'Quarterly review', starts_at: '2026-11-25T09:00:00Z' }],
    food_logs: [{ id: 'f1', name: 'Quarter pounder', log_date: '2026-11-15', meal_type: 'lunch' }],
    workouts: [{ id: 'w1', name: 'Leg day', workout_date: '2026-11-14' }],
    transactions: [{ id: 'x1', note: 'Rent', category: 'Housing', txn_date: '2026-11-01' }],
  }
  it('groups matches across modules with deep links', () => {
    const groups = searchData('quarter', data)
    const by = Object.fromEntries(groups.map((g) => [g.key, g.items]))
    expect(by.task[0]).toMatchObject({ id: 't1', to: '/planner?date=2026-11-20', kind: 'task' })
    expect(by.note[0].to).toBe('/notes?note=n1')
    expect(by.event[0].to).toBe('/calendar?date=2026-11-25')
    expect(by.reminder).toBeTruthy()
    expect(by.food).toBeTruthy()
    expect(by.workout).toBeUndefined()
  })
  it('lists pages and finds a transaction month', () => {
    expect(searchData('goals', {})[0].items[0]).toMatchObject({ kind: 'page', to: '/goals' })
    expect(searchData('rent', data)[0].items[0].to).toBe('/finance?month=2026-11-01')
  })
  it('limits each group', () => {
    const many = { tasks: Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, title: `Task ${i}`, status: 'pending' })) }
    expect(searchData('task', many, { limit: 3 }).find((g) => g.key === 'task').items).toHaveLength(3)
  })
  it('leaves out locked modules, their pages and their data', () => {
    const groups = searchData('quarter', data, { closed: ['planner', 'finance', 'nutrition'] })
    expect(groups.find((g) => g.key === 'task')).toBeUndefined()
    expect(groups.find((g) => g.key === 'food')).toBeUndefined()
    expect(groups.find((g) => g.key === 'note')).toBeDefined()
    expect(searchData('finance', {}, { closed: ['finance'] })).toEqual([])
  })
  it('is empty for a blank query, and searchAll still works', () => {
    expect(searchData('   ', data)).toEqual([])
    expect(searchAll('focus', {})[0].items[0].to).toBe('/focus')
  })
})

describe('filterCommands', () => {
  const items = [
    { label: 'Add task', keywords: 'todo' },
    { label: 'Log food', keywords: 'meal' },
  ]
  it('keeps all for an empty query, filters by label and keywords otherwise', () => {
    expect(filterCommands(items, '')).toHaveLength(2)
    expect(filterCommands(items, 'meal').map((i) => i.label)).toEqual(['Log food'])
    expect(filterCommands(items, 'zzz')).toEqual([])
  })
})

describe('parseWhen', () => {
  it('reads a day word and a clock time out of the title', () => {
    expect(parseWhen('call mum tomorrow 5pm', TODAY)).toEqual({ title: 'call mum', date: '2026-11-17', time: '17:00' })
    expect(parseWhen('standup today at 9:30am', TODAY)).toMatchObject({ date: TODAY, time: '09:30', title: 'standup' })
    expect(parseWhen('ship it 2026-12-01 at 17:45', TODAY)).toMatchObject({ date: '2026-12-01', time: '17:45', title: 'ship it' })
  })
  it('finds the next weekday, never today', () => {
    expect(parseWhen('gym fri', TODAY).date).toBe('2026-11-20')
    expect(parseWhen('review monday', TODAY).date).toBe('2026-11-23')
  })
  it('leaves text alone when there is no date or an impossible time', () => {
    expect(parseWhen('read 50 pages', TODAY)).toEqual({ title: 'read 50 pages', date: null, time: null })
    expect(parseWhen('meet 13pm', TODAY).time).toBeNull()
  })
})

describe('parseCapture and captureRow', () => {
  it('reads the kind from a prefix', () => {
    expect(parseCapture('task: buy milk')).toEqual({ kind: 'task', text: 'buy milk' })
    expect(parseCapture('t: buy milk')).toEqual({ kind: 'task', text: 'buy milk' })
    expect(parseCapture('note idea for later')).toEqual({ kind: 'note', text: 'idea for later' })
    expect(parseCapture('remind: pay rent 5pm')).toEqual({ kind: 'reminder', text: 'pay rent 5pm' })
  })
  it('offers every kind for plain text, and a lone letter is not a prefix without a colon', () => {
    expect(parseCapture('buy milk')).toEqual({ kind: null, text: 'buy milk' })
    expect(parseCapture('t shirt sizes')).toEqual({ kind: null, text: 't shirt sizes' })
    expect(parseCapture('task:')).toEqual({ kind: null, text: 'task:' })
    expect(parseCapture('   ')).toBeNull()
  })
  it('builds the rows the dialogs would save', () => {
    const task = captureRow('task', 'call bank tomorrow', TODAY)
    expect(task).toMatchObject({
      table: 'tasks',
      row: { title: 'call bank', due_date: '2026-11-17', category: 'Personal', priority: 'medium', recurrence: 'none' },
    })
    const rem = captureRow('reminder', 'pay rent 5pm', TODAY)
    expect(rem.row).toMatchObject({ title: 'pay rent', remind_date: TODAY, remind_time: '17:00', repeat: 'none', active: true })
    expect(captureRow('reminder', 'stretch', TODAY).row.remind_time).toBe('09:00')
    expect(captureRow('note', 'one line', TODAY).row).toMatchObject({ title: '', body: 'one line', category: 'Quick' })
    expect(captureRow('note', 'Title\nbody text', TODAY).row).toMatchObject({ title: 'Title', body: 'body text' })
    expect(captureRow('task', '   ', TODAY)).toBeNull()
    expect(captureRow('task', 'x'.repeat(300), TODAY).row.title).toHaveLength(120)
  })
})

describe('contextActions', () => {
  it('offers what suits the page', () => {
    expect(contextActions('/nutrition').map((a) => a.label)).toContain('Log food')
    expect(contextActions('/fitness')[0]).toMatchObject({ quick: 'workout' })
    expect(contextActions('/focus')[0].to).toBe('/focus?start=1')
    expect(contextActions('/finance?month=2026-11-01')[0].quick).toBe('expense')
    expect(contextActions('/analytics')).toEqual([])
    expect(contextActions('/')[0].quick).toBe('task')
  })
})

describe('recents', () => {
  const e = (id, kind = 'task') => ({ id, kind, label: id, to: `/x/${id}` })
  it('moves a repeat to the front, without duplicates, and caps the list', () => {
    expect(pushRecent([e('a'), e('b')], e('b')).map((x) => x.id)).toEqual(['b', 'a'])
    expect(pushRecent([e('a')], e('a', 'note'))).toHaveLength(2) // same id, other kind
    let list = []
    for (let i = 0; i < RECENTS_MAX + 5; i++) list = pushRecent(list, e(String(i)))
    expect(list).toHaveLength(RECENTS_MAX)
    expect(list[0].id).toBe(String(RECENTS_MAX + 4))
  })
  it('discards malformed or off-site stored entries', () => {
    expect(sanitizeRecents('nope')).toEqual([])
    const clean = sanitizeRecents([
      e('ok'),
      { id: 1, kind: 'task', label: 'x', to: '/x' },
      { id: 'a', kind: 'task', label: 'x', to: 'https://evil.example' },
      null,
    ])
    expect(clean.map((x) => x.id)).toEqual(['ok'])
  })
})

describe('shortcut tables', () => {
  it('every go key leads to a real page and every create key has a target', () => {
    const pages = new Set(NAV.map((n) => n.to))
    for (const to of Object.values(GO_KEYS)) expect(pages.has(to)).toBe(true)
    for (const kind of Object.values(CREATE_KEYS)) expect(CREATE_TARGETS[kind]).toBeTruthy()
  })
})

describe('isTypingTarget', () => {
  const el = (html) => {
    const d = document.createElement('div')
    d.innerHTML = html
    document.body.append(d)
    return d.firstElementChild
  }
  it('is true for fields people type in and false for the rest', () => {
    expect(isTypingTarget(el('<input type="text">'))).toBe(true)
    expect(isTypingTarget(el('<input type="search">'))).toBe(true)
    expect(isTypingTarget(el('<textarea></textarea>'))).toBe(true)
    expect(isTypingTarget(el('<select></select>'))).toBe(true)
    expect(isTypingTarget(el('<div contenteditable="true"></div>'))).toBe(true)
    expect(isTypingTarget(el('<input type="checkbox">'))).toBe(false)
    expect(isTypingTarget(el('<button>x</button>'))).toBe(false)
    expect(isTypingTarget(document.body)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
