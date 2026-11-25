import { describe, expect, it } from 'vitest'
import {
  MAX_TERMS,
  PAGE_SIZE,
  SEARCH_TABLES,
  SOURCES,
  buildSuggestions,
  hasCriteria,
  highlightParts,
  normalizeParams,
  parseQuery,
  rankOf,
  resultFromRow,
  searchRows,
  snippetOf,
} from '../src/globalSearch'
import { LOCKABLE_MODULES } from '../src/moduleLocks'

const tables = () => ({
  tasks: [
    {
      id: 't1',
      title: 'Read the React docs',
      notes: 'chapter on hooks',
      category: 'Learning',
      priority: 'high',
      status: 'pending',
      due_date: '2026-11-02',
      updated_at: '2026-11-01T10:00:00Z',
    },
    {
      id: 't2',
      title: 'Buy milk',
      notes: '',
      category: 'Personal',
      priority: 'low',
      status: 'done',
      due_date: '2026-10-01',
      updated_at: '2026-10-01T10:00:00Z',
    },
    {
      id: 't3',
      title: 'Reactor safety review',
      notes: 'unrelated',
      category: 'Job Search',
      priority: 'medium',
      status: 'pending',
      due_date: null,
      updated_at: '2026-12-01T10:00:00Z',
    },
  ],
  notes: [
    {
      id: 'n1',
      title: '',
      body: 'React is a UI library. '.repeat(20),
      category: 'Learning',
      tags: ['ui'],
      pinned: true,
      updated_at: '2026-11-05T10:00:00Z',
    },
  ],
  transactions: [
    {
      id: 'x1',
      type: 'expense',
      category: 'Food',
      note: 'Café lunch',
      txn_date: '2026-11-03',
      amount_paise: 100,
      updated_at: '2026-11-03T10:00:00Z',
    },
  ],
  learning_topics: [
    {
      id: 'l1',
      name: 'React',
      notes: '',
      group_name: 'Frontend',
      archived: false,
      created_at: '2026-11-05T09:00:00Z',
      updated_at: '2026-11-05T09:00:00Z',
    },
  ],
  goals: [
    {
      id: 'g1',
      title: 'Ship the app',
      notes: '',
      category: 'Learning',
      status: 'active',
      due_date: '2026-12-31',
      updated_at: '2026-11-01T00:00:00Z',
    },
  ],
  study_sessions: [
    {
      id: 's1',
      topic_id: 'l1',
      goal_id: null,
      session_date: '2026-11-04',
      status: 'completed',
      source: 'timer',
      notes: 'practised hooks',
      updated_at: '2026-11-04T10:00:00Z',
    },
  ],
})

describe('parseQuery', () => {
  it('splits words, keeps "quoted phrases" whole, lowercases and drops repeats', () => {
    expect(parseQuery('  React   "Daily Standup"  react ')).toEqual(['react', 'daily standup'])
    expect(parseQuery('')).toEqual([])
    expect(parseQuery(null)).toEqual([])
    expect(parseQuery('""')).toEqual([])
  })
  it('limits the number and the length of the terms', () => {
    expect(parseQuery('a b c d e f g h i j')).toHaveLength(MAX_TERMS)
    expect(parseQuery('x'.repeat(500))[0]).toHaveLength(100)
  })
})

describe('normalizeParams', () => {
  it('turns blanks into "no filter" and clamps the page', () => {
    const p = normalizeParams({
      q: 'a',
      modules: [],
      status: ['done', 'done'],
      sort: 'weird',
      limit: 9999,
      offset: -5,
      from: '2026-13',
      to: '',
    })
    expect(p).toMatchObject({
      terms: ['a'],
      modules: null,
      status: ['done'],
      sort: 'relevance',
      limit: 50,
      offset: 0,
      from: null,
      to: null,
    })
    expect(normalizeParams({}).limit).toBe(PAGE_SIZE)
  })
  it('swaps a reversed date range', () => {
    expect(normalizeParams({ from: '2026-11-30', to: '2026-11-01' })).toMatchObject({ from: '2026-11-01', to: '2026-11-30' })
  })
  it('knows whether there is anything to look for', () => {
    expect(hasCriteria({})).toBe(false)
    expect(hasCriteria({ q: '   ' })).toBe(false)
    expect(hasCriteria({ q: 'a' })).toBe(true)
    expect(hasCriteria({ priority: ['high'] })).toBe(true)
  })
})

describe('rankOf (mirrors 0022_global_search.sql)', () => {
  it('orders exact, prefix, word start, contains, every term, body only', () => {
    const r = (title, terms) => rankOf(terms, title)
    expect(r('React', ['react'])).toBe(100)
    expect(r('React hooks', ['react'])).toBe(85)
    expect(r('Read the React docs', ['react'])).toBe(70)
    expect(r('Reactor', ['react'])).toBe(85)
    expect(r('Overreact', ['react'])).toBe(55)
    expect(r('Docs for React', ['react', 'docs'])).toBe(40)
    expect(r('Unrelated', ['react'])).toBe(20)
    expect(rankOf([], 'anything')).toBe(0)
  })
})

describe('snippetOf and highlightParts', () => {
  it('cuts around the first match and marks every term, ignoring case and accents', () => {
    const text = 'x'.repeat(200) + ' the Café menu ' + 'y'.repeat(200)
    const s = snippetOf(text, ['cafe'])
    expect(s.startsWith('…')).toBe(true)
    expect(s).toContain('Café')
    expect(s.length).toBeLessThanOrEqual(163)
    expect(
      highlightParts('Café and CAFE and tea', ['cafe'])
        .filter((p) => p.hit)
        .map((p) => p.text),
    ).toEqual(['Café', 'CAFE'])
    expect(highlightParts('plain', [])).toEqual([{ text: 'plain', hit: false }])
    expect(snippetOf('', ['a'])).toBe('')
    expect(snippetOf('short text', ['zzz'])).toBe('short text')
  })
})

describe('searchRows', () => {
  const find = (params, opts) => searchRows(tables(), params, opts)
  it('finds across tables and ranks the best title first', () => {
    const r = find({ q: 'react' })
    expect(r.total).toBe(r.rows.length)
    expect(r.rows[0]).toMatchObject({ kind: 'topic', title: 'React', rank: 100 })
    expect(r.rows.map((x) => x.kind).sort()).toEqual(['note', 'study', 'task', 'task', 'topic'])
    const ranks = r.rows.map((x) => x.rank)
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a))
  })
  it('requires every term, in the title or the text', () => {
    expect(
      find({ q: 'react hooks' })
        .rows.map((x) => x.id)
        .sort(),
    ).toEqual(['s1', 't1'])
    expect(find({ q: 'react zzz' }).total).toBe(0)
  })
  it('ignores case and accents here, and finds a quoted phrase', () => {
    expect(find({ q: 'CAFE' }).rows.map((x) => x.id)).toEqual(['x1'])
    expect(find({ q: '"docs" "react"' }).rows.map((x) => x.id)).toEqual(['t1'])
    expect(find({ q: '"react docs"' }).rows.map((x) => x.id)).toEqual(['t1'])
    expect(find({ q: '"docs react"' }).total).toBe(0) // a phrase must appear as written
  })
  it('names a study session after its topic', () => {
    expect(find({ q: 'practised' }).rows[0]).toMatchObject({ kind: 'study', title: 'React' })
  })
  it('filters by module, dates, status, category and priority', () => {
    expect(
      find({ q: 'react', modules: ['planner'] })
        .rows.map((x) => x.id)
        .sort(),
    ).toEqual(['t1', 't3'])
    expect(
      find({ q: 'react', from: '2026-11-03', to: '2026-11-30' })
        .rows.map((x) => x.id)
        .sort(),
    ).toEqual(['l1', 'n1', 's1'])
    expect(find({ status: ['done'] }).rows.map((x) => x.id)).toEqual(['t2'])
    expect(
      find({ q: 'react', category: ['Learning'] })
        .rows.map((x) => x.id)
        .sort(),
    ).toEqual(['n1', 't1'])
    expect(
      find({ priority: ['low', 'high'] })
        .rows.map((x) => x.id)
        .sort(),
    ).toEqual(['t1', 't2'])
    // a row with no date never matches a date filter
    expect(find({ q: 'reactor', from: '2026-01-01' }).total).toBe(0)
  })
  it('sorts newest and oldest by the record date, and browses by filters alone', () => {
    const days = (sort) => find({ q: 'react', sort }).rows.map((x) => x.day)
    expect(days('newest')).toEqual([...days('newest')].sort().reverse())
    expect(days('oldest')).toEqual([...days('oldest')].sort())
    // no text to rank by: newest first, a record with no date counting from when it last changed
    expect(find({ modules: ['planner'] }).rows.map((x) => x.id)).toEqual(['t3', 't1', 't2'])
  })
  it('pages without gaps or repeats', () => {
    const all = find({ q: 'react', limit: 50 })
    const pages = [0, 2, 4].map((offset) => find({ q: 'react', limit: 2, offset }))
    expect(pages.every((p) => p.total === all.total)).toBe(true)
    expect(pages.flatMap((p) => p.rows).map((x) => x.id)).toEqual(all.rows.map((x) => x.id))
    expect(find({ q: 'react', offset: 100 })).toEqual({ total: all.total, rows: [] })
  })
  it('leaves out locked modules and their tables', () => {
    expect(find({ q: 'react' }, { closed: ['notes'] }).rows.some((x) => x.kind === 'note')).toBe(false)
    expect(find({ q: 'cafe' }, { closed: ['finance'] }).total).toBe(0)
  })
  it('opens each record where it lives', () => {
    const to = Object.fromEntries(find({ q: 'react', limit: 50 }).rows.map((x) => [x.id, x.to]))
    expect(to).toMatchObject({ t1: '/planner?date=2026-11-02', t3: '/planner', n1: '/notes?note=n1', l1: '/learning', s1: '/learning' })
    expect(find({ q: 'cafe' }).rows[0].to).toBe('/finance?month=2026-11-01')
  })
})

describe('sources', () => {
  it('cover every searched table once per kind, and the module locks line up', () => {
    expect(new Set(SOURCES.map((s) => s.kind)).size).toBe(SOURCES.length)
    expect(SEARCH_TABLES.length).toBeGreaterThanOrEqual(12)
    // a table the app can lock must belong to a module that can be locked: nothing is searchable that the lock list does not know about
    const locked = new Map(LOCKABLE_MODULES.flatMap((m) => m.tables.map((t) => [t, m.key])))
    for (const s of SOURCES)
      if (locked.has(s.table)) expect(['finance', 'notes', 'health', 'fitness', 'nutrition', 'jobs']).toContain(locked.get(s.table))
  })
  it("maps the database function's rows to results", () => {
    const r = resultFromRow({
      kind: 'note',
      id: 'n9',
      title: 'T',
      snippet: 's',
      status: null,
      category: 'General',
      priority: null,
      day: '2026-11-01',
      updated_at: 'x',
      rank: 85,
    })
    expect(r).toMatchObject({ kind: 'note', module: 'notes', to: '/notes?note=n9', rank: 85 })
    expect(resultFromRow({ kind: 'nope' })).toBeNull()
  })
})

describe('buildSuggestions', () => {
  const results = [{ title: 'Read the React docs' }, { title: 'React' }, { title: 'Overreact' }, { title: 'React' }]
  it('puts matching earlier searches first, then titles that start, then contain, with no repeats', () => {
    expect(buildSuggestions('rea', results, ['react hooks', 'tea'])).toEqual([
      { text: 'react hooks', type: 'recent' },
      { text: 'React', type: 'title' },
      { text: 'Read the React docs', type: 'title' },
      { text: 'Overreact', type: 'title' },
    ])
  })
  it('suggests nothing for nothing, and never the exact text typed', () => {
    expect(buildSuggestions('  ', results)).toEqual([])
    expect(buildSuggestions('react', results).map((s) => s.text)).not.toContain('React')
    expect(buildSuggestions('rea', results, [], 2)).toHaveLength(2)
  })
})
