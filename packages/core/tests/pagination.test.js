import { describe, expect, it } from 'vitest'
import { PAGED_TABLES, PAGE_SIZE_MAX, PageError, clampPageSize, decodeCursor, encodeCursor, normalizePageRequest, pageOfRows } from '../src/pagination.js'

const rows = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `id-${String(i).padStart(6, '0')}`,
    title: `Task ${i}`,
    status: ['pending', 'done', 'skipped'][i % 3],
    category: 'Personal',
    // many ties on due_date (every 7 rows share a day) and some nulls, to prove the tiebreak and null handling
    due_date: i % 11 === 0 ? null : `2026-01-${String(1 + Math.floor(i / 7) % 28).padStart(2, '0')}`,
    created_at: `2026-02-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00Z`,
    updated_at: '2026-02-01T00:00:00Z',
  }))

describe('page size and request validation', () => {
  it('caps page sizes and falls back to the default', () => {
    expect(clampPageSize(10_000)).toBe(PAGE_SIZE_MAX)
    expect(clampPageSize(0)).toBe(25)
    expect(clampPageSize('abc')).toBe(25)
    expect(clampPageSize(-5)).toBe(25)
    expect(clampPageSize(40.9)).toBe(40)
    expect(normalizePageRequest('tasks', { pageSize: 9999 }).pageSize).toBe(PAGE_SIZE_MAX)
  })
  it('only accepts whitelisted tables, sorts and filters (never a caller-supplied column)', () => {
    expect(() => normalizePageRequest('auth.users', {})).toThrow(PageError)
    expect(() => normalizePageRequest('tasks', { sort: 'user_id; drop table tasks' })).toThrow(/sort/)
    expect(() => normalizePageRequest('tasks', { filters: { user_id: 'x' } })).toThrow(/filter/)
    expect(() => normalizePageRequest('tasks', { dir: 'sideways' })).toThrow(/direction/)
    expect(() => normalizePageRequest('tasks', { filters: { status: { $gt: 1 } } })).toThrow(/invalid value/)
  })
  it('covers every list the app pages', () => {
    for (const t of ['tasks', 'goals', 'study_sessions', 'job_applications', 'transactions', 'workouts', 'habit_logs', 'calendar_events', 'audit_events', 'notifications'])
      expect(PAGED_TABLES[t]).toBeTruthy()
  })
  it('refuses a cursor that was made for another sort, or that is garbage', () => {
    const c = encodeCursor({ sort: 'created_at', dir: 'desc', values: ['2026-01-01', 'x'] })
    expect(() => normalizePageRequest('tasks', { cursor: c, sort: 'due_date' })).toThrow(/different sort/)
    expect(() => normalizePageRequest('tasks', { cursor: '%%%not-a-cursor' })).toThrow(PageError)
    expect(() => decodeCursor(btoa(JSON.stringify({ v: 9 })))).toThrow(PageError)
    expect(decodeCursor(c).values).toEqual(['2026-01-01', 'x'])
  })
})

describe('offset pages', () => {
  const all = rows(95)
  it('returns the page, the total, next/prev and the page count', () => {
    const p1 = pageOfRows(normalizePageRequest('tasks', { pageSize: 20, page: 1 }), all)
    expect(p1.items).toHaveLength(20)
    expect(p1.total).toBe(95)
    expect(p1.pages).toBe(5)
    expect(p1.hasPrev).toBe(true)
    expect(p1.hasNext).toBe(true)
    const last = pageOfRows(normalizePageRequest('tasks', { pageSize: 20, page: 4 }), all)
    expect(last.items).toHaveLength(15)
    expect(last.hasNext).toBe(false)
    expect(pageOfRows(normalizePageRequest('tasks', { pageSize: 20, page: 99 }), all).items).toEqual([])
  })
  it('filters, searches and sorts; counts follow the filter; count can be skipped', () => {
    const f = pageOfRows(normalizePageRequest('tasks', { filters: { status: 'done' }, pageSize: 100 }), all)
    expect(f.total).toBe(all.filter((r) => r.status === 'done').length)
    expect(f.items.every((r) => r.status === 'done')).toBe(true)
    expect(pageOfRows(normalizePageRequest('tasks', { search: 'task 7', pageSize: 100 }), all).items.every((r) => /task 7/i.test(r.title))).toBe(true)
    expect(pageOfRows(normalizePageRequest('tasks', { count: false }), all).total).toBe(null)
    const asc = pageOfRows(normalizePageRequest('tasks', { sort: 'created_at', dir: 'asc', pageSize: 100 }), all).items
    for (let i = 1; i < asc.length; i++) expect(asc[i - 1].created_at <= asc[i].created_at).toBe(true)
  })
})

describe('cursor (keyset) pages', () => {
  const walk = (table, all, params) => {
    const seen = []
    let page = pageOfRows(normalizePageRequest(table, params), all)
    for (let guard = 0; guard < 5000; guard++) {
      seen.push(...page.items)
      if (!page.nextCursor) break
      page = pageOfRows(normalizePageRequest(table, { ...params, cursor: page.nextCursor }), all)
    }
    return seen
  }
  for (const [sort, dir] of [['created_at', 'desc'], ['created_at', 'asc'], ['due_date', 'desc'], ['due_date', 'asc']]) {
    it(`walks 10,000 rows by ${sort} ${dir}: every row once, in the database order, ties and NULLs included`, () => {
      const all = rows(10_000)
      const seen = walk('tasks', all, { sort, dir, pageSize: 100, count: false })
      expect(seen).toHaveLength(10_000)
      expect(new Set(seen.map((r) => r.id)).size).toBe(10_000)
      // equals the offset walk of the same request
      const viaOffset = []
      for (let p = 0; p < 100; p++) viaOffset.push(...pageOfRows(normalizePageRequest('tasks', { sort, dir, pageSize: 100, page: p }), all).items)
      expect(seen.map((r) => r.id)).toEqual(viaOffset.map((r) => r.id))
    }, 60_000)
  }
  it('is stable while rows are inserted between pages (offset paging would repeat or skip)', () => {
    const all = rows(300)
    const spec = { sort: 'created_at', dir: 'desc', pageSize: 50 }
    const p1 = pageOfRows(normalizePageRequest('tasks', spec), all)
    const newest = { id: 'zzz-new', title: 'New', status: 'pending', category: 'Personal', due_date: null, created_at: '2099-01-01T00:00:00Z', updated_at: '' }
    const p2 = pageOfRows(normalizePageRequest('tasks', { ...spec, cursor: p1.nextCursor }), [newest, ...all])
    const ids1 = new Set(p1.items.map((r) => r.id))
    expect(p2.items.some((r) => ids1.has(r.id))).toBe(false) // nothing repeated
    expect(p2.items.some((r) => r.id === 'zzz-new')).toBe(false) // the new row is above the cursor, as it should be
  })
  it('walks backwards with prev and lands on the same pages', () => {
    const all = rows(230)
    const spec = { sort: 'created_at', dir: 'desc', pageSize: 50, count: false }
    const p1 = pageOfRows(normalizePageRequest('tasks', spec), all)
    const p2 = pageOfRows(normalizePageRequest('tasks', { ...spec, cursor: p1.nextCursor }), all)
    const p3 = pageOfRows(normalizePageRequest('tasks', { ...spec, cursor: p2.nextCursor }), all)
    const back = pageOfRows(normalizePageRequest('tasks', { ...spec, cursor: p3.prevCursor, direction: 'prev' }), all)
    expect(back.items.map((r) => r.id)).toEqual(p2.items.map((r) => r.id))
    expect(back.hasPrev).toBe(true)
    const back2 = pageOfRows(normalizePageRequest('tasks', { ...spec, cursor: back.prevCursor, direction: 'prev' }), all)
    expect(back2.items.map((r) => r.id)).toEqual(p1.items.map((r) => r.id))
    expect(back2.hasPrev).toBe(false)
  })
  it('the last page has no next cursor and an empty list has neither', () => {
    const all = rows(30)
    const p = pageOfRows(normalizePageRequest('tasks', { pageSize: 50, sort: 'created_at' }), all)
    expect(p.nextCursor).toBe(null)
    const none = pageOfRows(normalizePageRequest('tasks', { pageSize: 50 }), [])
    expect(none).toMatchObject({ items: [], nextCursor: null, prevCursor: null, total: 0 })
  })
  it('date range filters apply on tables that declare one', () => {
    const tx = Array.from({ length: 50 }, (_, i) => ({ id: `t${i}`, type: 'expense', category: 'Food', note: '', txn_date: `2026-03-${String(1 + (i % 28)).padStart(2, '0')}`, created_at: '2026-03-01T00:00:00Z', amount_paise: 100 + i }))
    const r = pageOfRows(normalizePageRequest('transactions', { from: '2026-03-10', to: '2026-03-15', pageSize: 100 }), tx)
    expect(r.items.every((x) => x.txn_date >= '2026-03-10' && x.txn_date < '2026-03-15')).toBe(true)
    expect(r.items.length).toBeGreaterThan(0)
  })
})
