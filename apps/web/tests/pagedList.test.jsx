import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { localAdapter } from '@/services/localAdapter'
import { setUserId } from '@/services/session'
import { clearPagedCache, fetchPage, pagedCacheStats } from '@/services/pagedList'
import { usePagedList } from '@/hooks/usePagedList'
import * as store from '@/hooks/store'

const seed = async (n, prefix = 'Task') => {
  const rows = Array.from({ length: n }, (_, i) => ({ title: `${prefix} ${i}`, status: i % 2 ? 'done' : 'pending', category: 'Personal' }))
  for (let i = 0; i < rows.length; i += 200) await localAdapter.insert('tasks', rows.slice(i, i + 200))
}
beforeEach(() => {
  localStorage.clear()
  clearPagedCache()
  setUserId('user-a')
})

describe('paged reads through the data adapter', () => {
  it('caps the page size and reports counts, next and prev', async () => {
    await seed(130)
    const p = await localAdapter.listPage('tasks', { pageSize: 10_000, page: 0 })
    expect(p.items).toHaveLength(100)
    expect(p.total).toBe(130)
    expect(p.hasNext).toBe(true)
    const p2 = await localAdapter.listPage('tasks', { pageSize: 100, page: 1 })
    expect(p2.items).toHaveLength(30)
    expect(p2.hasNext).toBe(false)
    expect(p2.hasPrev).toBe(true)
  })
  it('walks 1,000 rows by cursor: each once, nothing repeated', async () => {
    await seed(1000)
    const ids = []
    let page = await localAdapter.listPage('tasks', { pageSize: 100, sort: 'created_at', dir: 'asc', count: false })
    for (;;) {
      ids.push(...page.items.map((r) => r.id))
      if (!page.nextCursor) break
      page = await localAdapter.listPage('tasks', { pageSize: 100, sort: 'created_at', dir: 'asc', cursor: page.nextCursor, count: false })
    }
    expect(ids).toHaveLength(1000)
    expect(new Set(ids).size).toBe(1000)
  })
  it('filters and searches, and refuses anything off the whitelist', async () => {
    await seed(40)
    expect((await localAdapter.listPage('tasks', { filters: { status: 'done' }, pageSize: 100 })).total).toBe(20)
    expect((await localAdapter.listPage('tasks', { search: 'task 3', pageSize: 100 })).items.every((r) => /task 3/i.test(r.title))).toBe(
      true,
    )
    await expect(localAdapter.listPage('tasks', { sort: 'user_id' })).rejects.toThrow(/sort/)
    await expect(localAdapter.listPage('users', {})).rejects.toThrow(/pages/)
  })
})

describe('paged-list cache', () => {
  it("serves repeats from the cache, keeps people apart, and drops a table's pages when it is written", async () => {
    await seed(30)
    const spy = vi.spyOn(localAdapter, 'listPage')
    const a1 = await fetchPage('tasks', { pageSize: 10 })
    await fetchPage('tasks', { pageSize: 10 })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(pagedCacheStats().hits).toBeGreaterThan(0)
    // another person asking the same thing is not served person A's page
    setUserId('user-b')
    const b = await fetchPage('tasks', { pageSize: 10 })
    expect(spy).toHaveBeenCalledTimes(2)
    expect(b.total).toBe(0)
    setUserId('user-a')
    // a write invalidates: the next read goes to the database again
    await act(async () => {
      await store.insert('tasks', [{ title: 'Fresh', status: 'pending', category: 'Personal' }])
    })
    const a2 = await fetchPage('tasks', { pageSize: 10 })
    expect(spy).toHaveBeenCalledTimes(3)
    expect(a2.total).toBe(a1.total + 1)
    spy.mockRestore()
  })
  it('money lists are never served stale after a failure', async () => {
    await localAdapter.insert('transactions', [{ type: 'expense', amount_paise: 500, category: 'Food', txn_date: '2026-01-01', note: '' }])
    await fetchPage('transactions', { pageSize: 10 })
    await new Promise((r) => setTimeout(r, 5))
    const spy = vi.spyOn(localAdapter, 'listPage').mockRejectedValue(new Error('db down'))
    await expect(fetchPage('transactions', { pageSize: 10 }, { force: true })).rejects.toThrow('db down')
    spy.mockRestore()
  })
})

describe('usePagedList', () => {
  it('walks forward and back by cursor and restarts when the filter changes', async () => {
    await seed(25)
    const { result, rerender } = renderHook(({ params }) => usePagedList('tasks', params), {
      initialProps: { params: { pageSize: 10, sort: 'created_at', dir: 'asc', count: false } },
    })
    await waitFor(() => expect(result.current.items).toHaveLength(10))
    const first = result.current.items.map((r) => r.id)
    expect(result.current.hasPrev).toBe(false)
    await act(async () => result.current.next())
    await waitFor(() => expect(result.current.items.map((r) => r.id)).not.toEqual(first))
    expect(result.current.hasPrev).toBe(true)
    await act(async () => result.current.prev())
    await waitFor(() => expect(result.current.items.map((r) => r.id)).toEqual(first))
    rerender({ params: { pageSize: 10, sort: 'created_at', dir: 'asc', count: false, filters: { status: 'done' } } })
    await waitFor(() => expect(result.current.items.every((r) => r.status === 'done')).toBe(true))
    expect(result.current.hasPrev).toBe(false)
  })
})
