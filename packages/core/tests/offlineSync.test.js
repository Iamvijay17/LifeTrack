import { describe, expect, it } from 'vitest'
import { BACKOFF, backoffDelay, classifyError, coalesce, planRemove, planUpdate, resolvePatch } from '../src/offlineSync.js'

describe('classifyError', () => {
  it('sorts failures by what should happen next', () => {
    expect(classifyError({ isNetwork: true })).toBe('network')
    expect(classifyError({ code: 'CONFLICT' })).toBe('conflict')
    expect(classifyError({ code: 'jwt' })).toBe('auth')
    expect(classifyError({ code: 'PGRST301' })).toBe('auth')
    expect(classifyError({ cause: { status: 401 } })).toBe('auth')
    expect(classifyError({ cause: { status: 503 } })).toBe('transient')
    expect(classifyError({ cause: { status: 429 } })).toBe('transient')
    expect(classifyError({ message: 'Request rate limit reached' })).toBe('transient')
    expect(classifyError({ code: '08006' })).toBe('transient')
    expect(classifyError({ code: '23514' })).toBe('permanent')
    expect(classifyError({ code: '42501' })).toBe('permanent')
    expect(classifyError(new Error('boom'))).toBe('permanent')
  })
})

describe('backoffDelay', () => {
  const mid = () => 0.5 // jitter factor exactly 1
  it('doubles from 2s and stops at 5 minutes', () => {
    expect([1, 2, 3, 4].map((n) => backoffDelay(n, mid))).toEqual([2000, 4000, 8000, 16000])
    expect(backoffDelay(30, mid)).toBe(BACKOFF.maxMs)
  })
  it('jitters by at most 20% either way', () => {
    expect(backoffDelay(3, () => 0)).toBe(6400)
    expect(backoffDelay(3, () => 1)).toBe(9600)
  })
})

describe('coalesce', () => {
  const u = (id, patch, extra = {}) => ({
    id: `op-${id}-${Object.keys(patch)}`,
    table: 't',
    kind: 'update',
    rowId: id,
    patch,
    status: 'pending',
    base: { id, a: 1 },
    ...extra,
  })
  it('merges consecutive edits of one row into one request', () => {
    const r = coalesce([u('r1', { a: 2 })], u('r1', { b: 3 }))
    expect(r.merged).toBe(true)
    expect(r.queue).toHaveLength(1)
    expect(r.queue[0].patch).toEqual({ a: 2, b: 3 })
    expect(r.queue[0].base).toEqual({ id: 'r1', a: 1 }) // still the version the first edit started from
  })
  it('folds an edit into the offline-created row', () => {
    const ins = { id: 'i', table: 't', kind: 'insert', rows: [{ id: 'r1', title: 'x' }], status: 'pending' }
    const r = coalesce([ins], u('r1', { title: 'y' }))
    expect(r.queue[0].rows[0]).toEqual({ id: 'r1', title: 'y' })
  })
  it('a row created and deleted offline never reaches the server', () => {
    const ins = { id: 'i', table: 't', kind: 'insert', rows: [{ id: 'r1' }], status: 'pending' }
    const r = coalesce([ins], { id: 'd', table: 't', kind: 'remove', rowId: 'r1' })
    expect(r.queue).toEqual([])
    expect(r.cancelled).toBe(true)
  })
  it('a delete after an edit sends one delete that keeps the original base', () => {
    const r = coalesce([u('r1', { a: 2 })], { id: 'd', table: 't', kind: 'remove', rowId: 'r1', base: { id: 'r1', a: 2 } })
    expect(r.queue).toHaveLength(1)
    expect(r.queue[0].kind).toBe('remove')
    expect(r.queue[0].base).toEqual({ id: 'r1', a: 1 })
  })
  it('never merges into a change that is failed, in conflict, or for another table/row', () => {
    expect(coalesce([u('r1', { a: 2 }, { status: 'conflict' })], u('r1', { b: 1 })).merged).toBe(false)
    expect(coalesce([u('r1', { a: 2 })], u('r2', { a: 1 })).merged).toBe(false)
    expect(coalesce([u('r1', { a: 2 })], { ...u('r1', { a: 1 }), table: 'other' }).merged).toBe(false)
  })
})

describe('planUpdate (never overwrite newer server data silently)', () => {
  const base = { id: 'r', title: 'old', notes: 'n', priority: 1, updated_at: 'T1' }
  it('sends the edit when the row is unchanged since it was seen', () => {
    expect(planUpdate({ base, patch: { title: 'mine' }, server: { ...base } })).toEqual({
      action: 'apply',
      patch: { title: 'mine' },
      ifUpdatedAt: 'T1',
    })
  })
  it('sends it when the server changed OTHER fields (safe merge), guarded by the newer timestamp', () => {
    const server = { ...base, notes: 'theirs', updated_at: 'T2' }
    expect(planUpdate({ base, patch: { title: 'mine' }, server })).toEqual({ action: 'apply', patch: { title: 'mine' }, ifUpdatedAt: 'T2' })
  })
  it('is a no-op when the server already has these values', () => {
    const server = { ...base, title: 'mine', updated_at: 'T2' }
    expect(planUpdate({ base, patch: { title: 'mine' }, server }).action).toBe('noop')
  })
  it('only sends the fields that still differ', () => {
    const server = { ...base, title: 'mine', updated_at: 'T2' }
    const plan = planUpdate({ base, patch: { title: 'mine', priority: 3 }, server })
    expect(plan).toEqual({ action: 'apply', patch: { priority: 3 }, ifUpdatedAt: 'T2' })
  })
  it('reports a conflict when both sides changed the same field to different values', () => {
    const server = { ...base, title: 'theirs', updated_at: 'T2' }
    const plan = planUpdate({ base, patch: { title: 'mine', priority: 3 }, server })
    expect(plan.action).toBe('conflict')
    expect(plan.reason).toBe('edited')
    expect(plan.fields).toEqual([{ key: 'title', mine: 'mine', theirs: 'theirs', base: 'old' }])
  })
  it('reports a conflict when the row was deleted elsewhere', () => {
    const plan = planUpdate({ base, patch: { title: 'mine' }, server: null })
    expect(plan).toMatchObject({ action: 'conflict', reason: 'deleted' })
  })
  it('without a remembered version it applies (the row was not on this device)', () => {
    expect(planUpdate({ base: null, patch: { title: 'x' }, server: { ...base } }).action).toBe('apply')
  })
  it('ignores server-owned columns in the patch', () => {
    expect(planUpdate({ base, patch: { updated_at: 'Z', title: 'mine' }, server: { ...base } }).patch).toEqual({ title: 'mine' })
  })
})

describe('planRemove', () => {
  const base = { id: 'r', title: 'a', updated_at: 'T1' }
  it('is done when the row is already gone', () => expect(planRemove({ base, server: null }).action).toBe('noop'))
  it('deletes an unchanged row, guarded by its timestamp', () =>
    expect(planRemove({ base, server: { ...base } })).toEqual({ action: 'apply', ifUpdatedAt: 'T1' }))
  it('refuses to delete a row that was edited elsewhere', () => {
    const plan = planRemove({ base, server: { ...base, title: 'edited', updated_at: 'T2' } })
    expect(plan.action).toBe('conflict')
    expect(plan.fields[0]).toMatchObject({ key: 'title', theirs: 'edited' })
  })
})

describe('resolvePatch', () => {
  it('takes each field from the side the person picked (mine by default)', () => {
    const fields = [
      { key: 'a', mine: 1 },
      { key: 'b', mine: 2 },
      { key: 'c', mine: 3 },
    ]
    expect(resolvePatch(fields, { b: 'theirs', c: 'mine' })).toEqual({ a: 1, c: 3 })
  })
})
