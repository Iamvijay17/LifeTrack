import { describe, expect, it } from 'vitest'
import { encodeCursor } from '@lifetrack/core/pagination'
import { listPageSupabase } from '../src/pagedQuery'

// A chainable stand-in for the PostgREST builder: it records each call and resolves like a query when awaited.
function fakeSupabase(result = { data: [], error: null, count: null }) {
  const calls = []
  const q = new Proxy(
    {},
    {
      get: (_, name) => {
        if (name === 'then') return (res, rej) => Promise.resolve(result).then(res, rej)
        return (...args) => (calls.push([name, ...args]), q)
      },
    },
  )
  return { calls, from: (t) => (calls.push(['from', t]), q) }
}
const names = (calls) => calls.map((c) => c[0])

describe('listPageSupabase', () => {
  it('offset page: asks for pageSize + 1 rows with a count, ordered with a tiebreak', async () => {
    const sb = fakeSupabase({ data: [{ id: 'a', created_at: '2026-01-02' }, { id: 'b', created_at: '2026-01-01' }], error: null, count: 2 })
    const page = await listPageSupabase(sb, 'tasks', { pageSize: 1 })
    expect(sb.calls.find((c) => c[0] === 'select')[2]).toEqual({ count: 'exact' })
    expect(sb.calls.find((c) => c[0] === 'range').slice(1)).toEqual([0, 1])
    expect(names(sb.calls).filter((n) => n === 'order')).toHaveLength(2)
    expect(page.items).toHaveLength(1)
    expect(page.hasNext).toBe(true)
  })
  it('filters (one value = eq, several = in), search, and a date range', async () => {
    const sb = fakeSupabase()
    await listPageSupabase(sb, 'transactions', { filters: { type: 'expense', category: ['food', 'rent'] }, search: '50%_off, (a)', from: '2026-01-01', to: '2026-02-01' })
    expect(sb.calls).toContainEqual(['eq', 'type', 'expense'])
    expect(sb.calls).toContainEqual(['in', 'category', ['food', 'rent']])
    const like = sb.calls.find((c) => c[0] === 'ilike')
    expect(like[1]).toBe('note')
    expect(like[2]).toBe('%50\\%\\_off   a %')
    expect(sb.calls).toContainEqual(['gte', 'txn_date', '2026-01-01'])
    expect(sb.calls).toContainEqual(['lt', 'txn_date', '2026-02-01'])
  })
  it('cursor pages use the keyset filter and a limit, never a range; "prev" flips the order', async () => {
    const cursor = encodeCursor({ sort: 'created_at', dir: 'desc', values: ['2026-01-01T00:00:00Z', 'id-1'] })
    const next = fakeSupabase()
    await listPageSupabase(next, 'tasks', { cursor, pageSize: 10 })
    expect(names(next.calls)).toContain('or')
    expect(names(next.calls)).not.toContain('range')
    expect(next.calls.find((c) => c[0] === 'limit')[1]).toBe(11)
    expect(next.calls.find((c) => c[0] === 'order')[2]).toEqual({ ascending: false })
    const prev = fakeSupabase()
    await listPageSupabase(prev, 'tasks', { cursor, direction: 'prev', pageSize: 10 })
    expect(prev.calls.find((c) => c[0] === 'order')[2]).toEqual({ ascending: true })
  })
  it('turns a database error into an app error, and treats no rows as an empty page', async () => {
    await expect(listPageSupabase(fakeSupabase({ data: null, error: { message: 'boom', code: 'XX000' }, count: null }), 'tasks', {})).rejects.toBeTruthy()
    const empty = await listPageSupabase(fakeSupabase({ data: null, error: null, count: null }), 'tasks', {})
    expect(empty.items).toEqual([])
  })
  it('refuses a table that is not paged', async () => {
    await expect(listPageSupabase(fakeSupabase(), 'secrets', {})).rejects.toBeTruthy()
  })
})
