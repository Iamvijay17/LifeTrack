import { beforeEach, describe, expect, it } from 'vitest'
import { insertSchemas } from '@lifetrack/schemas'
import { demoStages, rng } from '@/lib/demoData'
import { localAdapter } from '@/services/localAdapter'
import { db } from '@/services/db'
import { enterDemo, exitDemo, isDemo, resetDemo } from '@/services/demo'
import { setUserId } from '@/services/session'
import { resetStore } from '@/hooks/store'

const TODAY = '2026-11-24'
const fakeMade = () =>
  new Proxy({}, { get: () => Array.from({ length: 12 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` })) })

describe('demo data generator', () => {
  it('is deterministic for a given day', () => {
    const a = rng(5)
    const b = rng(5)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    const rows = (s) => demoStages(s).map((st) => (typeof st.rows === 'function' ? st.rows(fakeMade()) : st.rows))
    expect(rows(TODAY)).toEqual(rows(TODAY))
  })
  it('every row passes the real table schemas, so the demo cannot hold something the app would reject', () => {
    for (const { table, rows } of demoStages(TODAY)) {
      const list = typeof rows === 'function' ? rows(fakeMade()) : rows
      expect(list.length, table).toBeGreaterThan(0)
      for (const row of list) {
        const r = insertSchemas[table].safeParse(row)
        expect(r.success, `${table}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true)
      }
    }
  })
  it('covers the major modules', () => {
    const tables = demoStages(TODAY).map((s) => s.table)
    for (const t of [
      'tasks',
      'habits',
      'study_sessions',
      'workouts',
      'health_logs',
      'transactions',
      'job_applications',
      'goals',
      'calendar_events',
      'notes',
    ])
      expect(tables).toContain(t)
  })
})

describe('demo mode isolation', () => {
  beforeEach(async () => {
    await exitDemo()
    localStorage.clear()
    resetStore()
    setUserId('real-user')
  })

  it('reads sample data while on, never mixes it with real rows, and leaves the real database untouched', async () => {
    await localAdapter.insert('tasks', [{ title: 'My real task', due_date: TODAY }])
    const before = localStorage.getItem('lifetrack-dev:db:real-user')

    await enterDemo()
    expect(isDemo()).toBe(true)
    const inDemo = await db.list('tasks')
    expect(inDemo.length).toBeGreaterThan(3)
    expect(inDemo.some((t) => t.title === 'My real task')).toBe(false)

    await db.insert('tasks', [{ title: 'Typed in the demo', due_date: TODAY }])
    await db.removeMany(
      'tasks',
      inDemo.slice(0, 2).map((t) => t.id),
    )
    expect(localStorage.getItem('lifetrack-dev:db:real-user')).toBe(before) // not one byte of the real store changed

    await exitDemo()
    expect(isDemo()).toBe(false)
    const real = await db.list('tasks')
    expect(real.map((t) => t.title)).toEqual(['My real task'])
  })

  it('writes nothing to storage while on, and starts from a clean copy after a reset', async () => {
    await enterDemo()
    const keys = () => Object.keys(localStorage)
    const first = keys()
    const [one] = await db.list('tasks')
    await db.update('tasks', one.id, { title: 'Edited' })
    await db.insert('notes', [{ title: 'scratch' }])
    expect(keys()).toEqual(first)
    await resetDemo()
    const after = await db.list('tasks')
    expect(after.some((t) => t.title === 'Edited')).toBe(false)
    expect((await db.list('notes')).some((n) => n.title === 'scratch')).toBe(false)
    await exitDemo()
  })

  it('refuses an adapter method the demo database does not have instead of falling through to real data', async () => {
    await enterDemo()
    expect(() => db.somethingOnlyTheRealAdapterHas).toThrow(/demo mode/)
    await exitDemo()
  })
})
