// Offline-first: the encrypted store, the outbox, the sync engine (retry, conflicts, duplicates) and the data store working together.
// "Devices" are modelled as a shared in-memory server plus this tab's offline layer; a second device is just another writer on that server.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Errors must come from the same module copy the app code uses (vi.resetModules gives each test a fresh one).
let AppError
const server = vi.hoisted(() => ({ current: null }))
vi.mock('@/services/db', () => ({
  db: new Proxy(
    {},
    {
      get:
        (_, k) =>
        (...a) =>
          server.current[k](...a),
    },
  ),
  isDevMode: false,
}))

const U = '11111111-1111-4111-8111-111111111111'

/** A tiny database with the behaviours the engine relies on: ids, unique ids, a server-owned updated_at, guarded writes, and a network that can drop. */
function makeServer() {
  const tables = {}
  let tick = 0
  const log = []
  const s = {
    online: true,
    failWith: null, // a one-shot error thrown by the next request
    tables,
    log,
    rows: (t) => (tables[t] ??= []),
    now: () => new Date(Date.UTC(2026, 0, 1) + ++tick * 1000).toISOString(),
    gate(name, args) {
      log.push([name, ...args])
      if (!s.online) throw new AppError("Can't reach the server.", { isNetwork: true })
      if (s.failWith) {
        const e = s.failWith
        s.failWith = null
        throw e
      }
    },
    async list(t) {
      s.gate('list', [t])
      return structuredClone(s.rows(t))
    },
    async get(t, id) {
      s.gate('get', [t, id])
      return structuredClone(s.rows(t).find((r) => r.id === id) ?? null)
    },
    async find(t, match) {
      s.gate('find', [t, match])
      return structuredClone(s.rows(t).filter((r) => Object.entries(match).every(([k, v]) => r[k] === v)))
    },
    async insert(t, rows) {
      s.gate('insert', [t, rows])
      for (const r of rows)
        if (r.id && s.rows(t).some((x) => x.id === r.id)) throw new AppError('That record already exists.', { code: '23505' })
      const out = rows.map((r) => ({ id: crypto.randomUUID(), created_at: s.now(), updated_at: s.now(), user_id: U, ...r }))
      s.rows(t).push(...out)
      return structuredClone(out)
    },
    async update(t, id, patch, { ifUpdatedAt } = {}) {
      s.gate('update', [t, id, patch, ifUpdatedAt])
      const i = s.rows(t).findIndex((r) => r.id === id)
      if (i < 0) throw new AppError('not found', { code: 'PGRST116' })
      if (ifUpdatedAt && s.rows(t)[i].updated_at !== ifUpdatedAt) throw new AppError('changed', { code: 'CONFLICT' })
      s.rows(t)[i] = { ...s.rows(t)[i], ...patch, updated_at: s.now() }
      return structuredClone(s.rows(t)[i])
    },
    async upsert(t, rows) {
      return Promise.all(rows.map((r) => s.insert(t, [r]))).then((x) => x.flat())
    },
    async remove(t, id, { ifUpdatedAt } = {}) {
      s.gate('remove', [t, id, ifUpdatedAt])
      const r = s.rows(t).find((x) => x.id === id)
      if (r && ifUpdatedAt && r.updated_at !== ifUpdatedAt) throw new AppError('changed', { code: 'CONFLICT' })
      tables[t] = s.rows(t).filter((x) => x.id !== id)
    },
    async removeMany(t, ids) {
      for (const id of ids) await s.remove(t, id)
    },
    async rpc() {
      s.gate('rpc', [])
    },
    subscribe: () => () => {},
    /** Another device writing directly (no queue, always connected). */
    other: {
      add: (t, row) => {
        const r = { id: crypto.randomUUID(), created_at: s.now(), updated_at: s.now(), user_id: U, ...row }
        s.rows(t).push(r)
        return r
      },
      edit: (t, id, patch) => {
        const i = s.rows(t).findIndex((r) => r.id === id)
        s.rows(t)[i] = { ...s.rows(t)[i], ...patch, updated_at: s.now() }
        return s.rows(t)[i]
      },
      del: (t, id) => void (tables[t] = s.rows(t).filter((r) => r.id !== id)),
    },
  }
  return s
}

let onLine = true
const setOnline = (v) => {
  onLine = v
  server.current.online = v
}

let store, sync, vault, idbMod
beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  onLine = true
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => onLine })
  vi.resetModules()
  AppError = (await import('@/services/errors')).AppError
  server.current = makeServer()
  idbMod = await import('@/sync/idb')
  vault = await import('@/sync/vault')
  sync = await import('@/sync')
  store = await import('@/hooks/store')
  idbMod._reset()
  vault._reset()
})
afterEach(() => {
  sync.stop()
  store.resetStore()
  vi.useRealTimers()
})

const boot = async () => {
  await sync.start(U)
  expect(sync.isEnabled()).toBe(true)
  await sync.syncNow() // the first-visit send has finished before the test acts
}
const loaded = async (table) => {
  await store.load(table)
  return store.peek(table)
}

describe('vault (encryption at rest)', () => {
  it('round-trips data and never stores it readable', async () => {
    const blob = await vault.seal({ secret: 'my diary entry' }, 'k1')
    expect(await vault.open(blob, 'k1')).toEqual({ secret: 'my diary entry' })
    expect(JSON.stringify(Array.from(new Uint8Array(blob.ct)))).not.toContain('diary')
  })
  it('refuses a blob moved to a different entry or tampered with', async () => {
    const blob = await vault.seal({ a: 1 }, 'k1')
    expect(await vault.open(blob, 'k2')).toBeUndefined()
    const bad = { ...blob, ct: new Uint8Array(blob.ct).map((b, i) => (i === 0 ? b ^ 1 : b)).buffer }
    expect(await vault.open(bad, 'k1')).toBeUndefined()
  })
  it('keeps the key non-extractable and holds no sign-in token anywhere in the database', async () => {
    await vault.seal({ x: 1 }, 'k')
    const key = await idbMod.idb.get('keys', 'device-key-v1')
    expect(key.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toBeTruthy()
    for (const store of idbMod.STORES) {
      const dump = JSON.stringify(await idbMod.idb.entries(store))
      expect(dump).not.toMatch(/access_token|refresh_token|eyJ[A-Za-z0-9_-]{10,}/)
    }
  })
})

describe('working offline', () => {
  it('a task created offline stays on screen, is saved on the device, and reaches the server once when back online', async () => {
    await boot()
    await loaded('tasks')
    setOnline(false)
    const row = await store.insert('tasks', { title: 'Buy milk' })
    expect(row.id).toBeTruthy()
    expect(store.peek('tasks').map((r) => r.title)).toEqual(['Buy milk'])
    expect(sync.getStatus()).toMatchObject({ state: 'offline', pending: 1 })
    expect(server.current.rows('tasks')).toHaveLength(0)

    setOnline(true)
    await sync.syncNow()
    expect(server.current.rows('tasks').map((r) => r.title)).toEqual(['Buy milk'])
    expect(server.current.rows('tasks')[0].id).toBe(row.id) // the stand-in IS the row
    expect(sync.getStatus()).toMatchObject({ state: 'synced', pending: 0, total: 0 })
    expect(store.peek('tasks')).toHaveLength(1)
  })

  it('a burst of offline edits to one row is sent as ONE request', async () => {
    const r = server.current.other.add('tasks', { title: 'a', notes: '' })
    await boot()
    await loaded('tasks')
    setOnline(false)
    await store.update('tasks', r.id, { title: 'b' })
    await store.update('tasks', r.id, { notes: 'n' })
    await store.update('tasks', r.id, { title: 'c' })
    expect(sync.entries()).toHaveLength(1)
    setOnline(true)
    server.current.log.length = 0
    await sync.syncNow()
    const updates = server.current.log.filter((l) => l[0] === 'update')
    expect(updates).toHaveLength(1)
    expect(server.current.rows('tasks')[0]).toMatchObject({ title: 'c', notes: 'n' })
  })

  it('a row created and deleted offline never reaches the server', async () => {
    await boot()
    await loaded('tasks')
    setOnline(false)
    const row = await store.insert('tasks', { title: 'temp' })
    await store.remove('tasks', row.id)
    expect(sync.entries()).toHaveLength(0)
    expect(store.peek('tasks')).toHaveLength(0)
    setOnline(true)
    await sync.syncNow()
    expect(server.current.log.filter((l) => l[0] === 'insert')).toHaveLength(0)
  })

  it('deleting an existing row offline hides it, and deletes it on the server later', async () => {
    const r = server.current.other.add('tasks', { title: 'gone' })
    await boot()
    await loaded('tasks')
    setOnline(false)
    await store.remove('tasks', r.id)
    expect(store.peek('tasks')).toHaveLength(0)
    setOnline(true)
    await sync.syncNow()
    expect(server.current.rows('tasks')).toHaveLength(0)
  })

  it('a refresh while changes are waiting does not make them vanish', async () => {
    await boot()
    await loaded('tasks')
    setOnline(false)
    await store.insert('tasks', { title: 'queued' })
    setOnline(true)
    server.current.failWith = new AppError('x', { isNetwork: true }) // the first request after reconnect still fails
    await store.refetch('tasks')
    expect(store.peek('tasks').map((r) => r.title)).toContain('queued')
  })

  it('a server rejection (not a connection problem) is still reported at once and rolled back', async () => {
    await boot()
    await loaded('tasks')
    server.current.failWith = new AppError('One of the values is not allowed.', { code: '23514' })
    await expect(store.insert('tasks', { title: 'bad' })).rejects.toThrow(/not allowed/)
    expect(store.peek('tasks')).toHaveLength(0)
    expect(sync.entries()).toHaveLength(0)
  })

  it('writes that need the server to compute (database functions) say so instead of pretending', async () => {
    await boot()
    setOnline(false)
    await expect(store.rpc('add_water', {})).rejects.toMatchObject({ isNetwork: true })
  })

  it('without IndexedDB the app is online-only exactly as before: a dropped write is rolled back, not queued', async () => {
    globalThis.indexedDB = undefined
    idbMod._reset()
    vault._reset()
    await sync.start(U)
    expect(sync.isEnabled()).toBe(false)
    await loaded('tasks')
    setOnline(false)
    await expect(store.insert('tasks', { title: 'x' })).rejects.toMatchObject({ isNetwork: true })
    expect(store.peek('tasks')).toHaveLength(0)
  })
})

describe('surviving a restart', () => {
  it('queued changes are read back from the device after the page is closed and reopened', async () => {
    await boot()
    await loaded('tasks')
    setOnline(false)
    const row = await store.insert('tasks', { title: 'survives' })
    await outbox_settled()
    // "Close the tab": forget everything in memory, keep the IndexedDB.
    sync.stop()
    store.resetStore()
    vi.resetModules()
    const again = await import('@/sync')
    await again.start(U)
    expect(again.entries().map((o) => o.rows[0].id)).toEqual([row.id])
    setOnline(true)
    await again.syncNow()
    expect(server.current.rows('tasks').map((r) => r.title)).toEqual(['survives'])
    again.stop()
  })

  it('a page opened before still opens offline from the encrypted copy, with the waiting changes on top', async () => {
    server.current.other.add('tasks', { title: 'from server' })
    await boot()
    await loaded('tasks')
    await new Promise((r) => setTimeout(r, 700)) // the copy is written shortly after the data arrives
    setOnline(false)
    sync.stop()
    store.resetStore()
    vi.resetModules()
    const s2 = await import('@/sync')
    const st2 = await import('@/hooks/store')
    await s2.start(U)
    await st2.load('tasks')
    expect(st2.peek('tasks').map((r) => r.title)).toEqual(['from server'])
    await st2.insert('tasks', { title: 'offline add' })
    expect(
      st2
        .peek('tasks')
        .map((r) => r.title)
        .sort(),
    ).toEqual(['from server', 'offline add'])
    s2.stop()
  })

  it('the offline copy is wiped on lock / sign-out, and is invisible to another user', async () => {
    server.current.other.add('tasks', { title: 'private' })
    await boot()
    await loaded('tasks')
    await new Promise((r) => setTimeout(r, 700))
    expect(await sync.hydrate('tasks')).toMatchObject({ rows: [expect.objectContaining({ title: 'private' })] })
    await sync.forgetCache()
    expect(await sync.hydrate('tasks')).toBeNull()
    expect(JSON.stringify(await idbMod.idb.entries('snapshots'))).not.toContain('private')
  })

  it("one person's unsent changes are never sent under another account", async () => {
    await boot()
    await loaded('tasks')
    setOnline(false)
    await store.insert('tasks', { title: 'mine' })
    await outbox_settled()
    sync.stop()
    await sync.start('22222222-2222-4222-8222-222222222222')
    expect(sync.entries()).toHaveLength(0)
    sync.stop()
    await sync.start(U)
    expect(sync.entries()).toHaveLength(1)
  })
})

async function outbox_settled() {
  await new Promise((r) => setTimeout(r, 50))
}

describe('duplicate prevention', () => {
  it('a request that succeeded but whose answer was lost is not applied twice', async () => {
    await boot()
    await loaded('tasks')
    setOnline(false)
    const row = await store.insert('tasks', { title: 'once' })
    // The server already has it (the earlier request got through, the reply never came back).
    server.current
      .rows('tasks')
      .push({ id: row.id, title: 'once', created_at: server.current.now(), updated_at: server.current.now(), user_id: U })
    setOnline(true)
    await sync.syncNow()
    expect(server.current.rows('tasks')).toHaveLength(1)
    expect(sync.entries()).toHaveLength(0)
  })

  it('two flushes at once send each change once', async () => {
    await boot()
    await loaded('tasks')
    setOnline(false)
    await store.insert('tasks', { title: 'x' })
    setOnline(true)
    server.current.log.length = 0
    await Promise.all([sync.syncNow(), sync.syncNow(), sync.syncNow()])
    expect(server.current.log.filter((l) => l[0] === 'insert')).toHaveLength(1)
    expect(server.current.rows('tasks')).toHaveLength(1)
  })
})

describe('retry with backoff', () => {
  it('a server hiccup keeps the change and retries later, with growing delays', async () => {
    await boot()
    await loaded('tasks')
    setOnline(false)
    await store.insert('tasks', { title: 'flaky' })
    setOnline(true)
    const bump = () => (server.current.failWith = Object.assign(new AppError('Service unavailable'), { cause: { status: 503 } }))
    bump()
    await sync.syncNow()
    let [op] = sync.entries()
    expect(op).toMatchObject({ status: 'pending', attempts: 1 })
    const first = op.nextAt - Date.now()
    expect(first).toBeGreaterThan(1000)
    bump()
    await sync.syncNow() // forced: ignores the wait, fails again
    ;[op] = sync.entries()
    expect(op.attempts).toBe(2)
    expect(op.nextAt - Date.now()).toBeGreaterThan(first * 1.2) // longer than the first wait
    await sync.syncNow() // now it works
    expect(server.current.rows('tasks')).toHaveLength(1)
    expect(sync.entries()).toHaveLength(0)
  })

  it('a change the server will never accept stops retrying, is kept, and can be retried or discarded by the person', async () => {
    await boot()
    await loaded('tasks')
    setOnline(false)
    await store.insert('tasks', { title: 'refused' })
    setOnline(true)
    server.current.failWith = new AppError('One of the values is not allowed.', { code: '23514' })
    await sync.syncNow()
    expect(sync.entries()[0]).toMatchObject({ status: 'failed' })
    expect(sync.getStatus().state).toBe('attention')
    expect(store.peek('tasks')).toHaveLength(1) // still on screen: not lost
    await sync.retry(sync.entries()[0].id)
    expect(server.current.rows('tasks')).toHaveLength(1)
    expect(sync.entries()).toHaveLength(0)
  })

  it('discarding a failed change removes it and the row it showed', async () => {
    await boot()
    await loaded('tasks')
    setOnline(false)
    await store.insert('tasks', { title: 'refused' })
    setOnline(true)
    server.current.failWith = new AppError('no', { code: '23514' })
    await sync.syncNow()
    sync.discard(sync.entries()[0].id)
    await store.refetch('tasks')
    expect(store.peek('tasks')).toHaveLength(0)
  })

  it('an expired session pauses sending without losing anything, then resumes', async () => {
    await boot()
    await loaded('tasks')
    setOnline(false)
    await store.insert('tasks', { title: 'later' })
    setOnline(true)
    server.current.failWith = new AppError('Your session has expired.', { code: 'jwt' })
    await sync.syncNow()
    expect(sync.getStatus()).toMatchObject({ state: 'signin', pending: 1 })
    await sync.resumeAfterSignIn()
    expect(server.current.rows('tasks')).toHaveLength(1)
    expect(sync.getStatus().state).toBe('synced')
  })

  it('losing the connection mid-way stops the round and keeps the rest in order', async () => {
    await boot()
    await loaded('tasks')
    setOnline(false)
    await store.insert('tasks', { title: '1' })
    await store.insert('tasks', { title: '2' })
    setOnline(true)
    server.current.failWith = new AppError('drop', { isNetwork: true })
    await sync.syncNow()
    expect(sync.entries()).toHaveLength(2)
    expect(sync.entries()[0]).toMatchObject({ attempts: 0 }) // a dropped connection is not the change's fault
    await sync.syncNow()
    expect(server.current.rows('tasks').map((r) => r.title)).toEqual(['1', '2'])
  })
})

describe('conflicts between devices', () => {
  const setup = async () => {
    const r = server.current.other.add('tasks', { title: 'shared', notes: 'n0', priority: 'low' })
    await boot()
    await loaded('tasks')
    return r
  }

  it('another device changed a DIFFERENT field: both edits are kept, nothing is lost', async () => {
    const r = await setup()
    setOnline(false)
    await store.update('tasks', r.id, { title: 'my title' })
    server.current.other.edit('tasks', r.id, { notes: 'their notes' })
    setOnline(true)
    await sync.syncNow()
    expect(server.current.rows('tasks')[0]).toMatchObject({ title: 'my title', notes: 'their notes' })
    expect(sync.entries()).toHaveLength(0)
  })

  it('both devices changed the SAME field: nothing is overwritten, the person is asked', async () => {
    const r = await setup()
    setOnline(false)
    await store.update('tasks', r.id, { title: 'mine' })
    server.current.other.edit('tasks', r.id, { title: 'theirs' })
    setOnline(true)
    await sync.syncNow()
    expect(server.current.rows('tasks')[0].title).toBe('theirs') // the newer server data was NOT overwritten
    const [op] = sync.entries()
    expect(op.status).toBe('conflict')
    expect(op.conflict.fields).toEqual([{ key: 'title', mine: 'mine', theirs: 'theirs', base: 'shared' }])
    expect(sync.getStatus().state).toBe('attention')
    expect(store.peek('tasks')[0].title).toBe('mine') // this device keeps showing what the person did until they choose
  })

  it('choosing "keep other device" drops the change and shows the server version', async () => {
    const r = await setup()
    setOnline(false)
    await store.update('tasks', r.id, { title: 'mine' })
    server.current.other.edit('tasks', r.id, { title: 'theirs' })
    setOnline(true)
    await sync.syncNow()
    await sync.resolve(sync.entries()[0].id, 'theirs')
    expect(sync.entries()).toHaveLength(0)
    expect(store.peek('tasks')[0].title).toBe('theirs')
    expect(server.current.rows('tasks')[0].title).toBe('theirs')
  })

  it('choosing "mine" sends it, still guarded against an even newer edit', async () => {
    const r = await setup()
    setOnline(false)
    await store.update('tasks', r.id, { title: 'mine' })
    server.current.other.edit('tasks', r.id, { title: 'theirs' })
    setOnline(true)
    await sync.syncNow()
    await sync.resolve(sync.entries()[0].id, 'mine')
    expect(server.current.rows('tasks')[0].title).toBe('mine')
    expect(sync.entries()).toHaveLength(0)
  })

  it('per-field choice: keeps theirs for one field and mine for another', async () => {
    const r = await setup()
    setOnline(false)
    await store.update('tasks', r.id, { title: 'mine', notes: 'my notes' })
    server.current.other.edit('tasks', r.id, { title: 'theirs', notes: 'their notes' })
    setOnline(true)
    await sync.syncNow()
    await sync.resolve(sync.entries()[0].id, { title: 'theirs', notes: 'mine' })
    expect(server.current.rows('tasks')[0]).toMatchObject({ title: 'theirs', notes: 'my notes' })
  })

  it('edited here, deleted elsewhere: asks, and can restore this version', async () => {
    const r = await setup()
    setOnline(false)
    await store.update('tasks', r.id, { title: 'mine' })
    server.current.other.del('tasks', r.id)
    setOnline(true)
    await sync.syncNow()
    expect(sync.entries()[0].conflict.reason).toBe('deleted')
    expect(server.current.rows('tasks')).toHaveLength(0)
    await sync.resolve(sync.entries()[0].id, 'mine')
    expect(server.current.rows('tasks')[0]).toMatchObject({ id: r.id, title: 'mine' })
  })

  it('deleted here, edited elsewhere: the delete waits for the person', async () => {
    const r = await setup()
    setOnline(false)
    await store.remove('tasks', r.id)
    server.current.other.edit('tasks', r.id, { title: 'important edit' })
    setOnline(true)
    await sync.syncNow()
    expect(server.current.rows('tasks')).toHaveLength(1)
    expect(sync.entries()[0]).toMatchObject({ status: 'conflict', kind: 'remove' })
    await sync.resolve(sync.entries()[0].id, 'theirs')
    expect(store.peek('tasks')[0].title).toBe('important edit')
    expect(server.current.rows('tasks')).toHaveLength(1)
  })

  it('deleted here and already deleted elsewhere: done, no error', async () => {
    const r = await setup()
    setOnline(false)
    await store.remove('tasks', r.id)
    server.current.other.del('tasks', r.id)
    setOnline(true)
    await sync.syncNow()
    expect(sync.entries()).toHaveLength(0)
  })

  it('a conflicting row blocks later edits of the same row only; other rows keep syncing', async () => {
    const r = await setup()
    const other = server.current.other.add('tasks', { title: 'other', notes: '' })
    await store.refetch('tasks')
    setOnline(false)
    await store.update('tasks', r.id, { title: 'mine' })
    await store.update('tasks', other.id, { notes: 'fine' })
    server.current.other.edit('tasks', r.id, { title: 'theirs' })
    setOnline(true)
    await sync.syncNow()
    expect(server.current.rows('tasks').find((x) => x.id === other.id).notes).toBe('fine')
    expect(sync.entries().map((o) => o.status)).toEqual(['conflict'])
  })

  it('realtime events do not overwrite a row that has a change waiting', async () => {
    const r = await setup()
    setOnline(false)
    await store.update('tasks', r.id, { title: 'mine' })
    store.applyChange('tasks', {
      eventType: 'UPDATE',
      new: { ...r, title: 'theirs', updated_at: '2999-01-01T00:00:00Z' },
      old: { id: r.id },
    })
    expect(store.peek('tasks')[0].title).toBe('mine')
  })
})

describe('upserts offline', () => {
  it('a new keyed row is created, and an existing one edited, with the same conflict rules', async () => {
    const existing = server.current.other.add('journal_entries', { entry_date: '2026-11-01', content: 'old' })
    await boot()
    await loaded('journal_entries')
    setOnline(false)
    await store.upsert('journal_entries', { entry_date: '2026-11-01', content: 'new text' }, { onConflict: 'user_id,entry_date' })
    await store.upsert('journal_entries', { entry_date: '2026-11-02', content: 'second' }, { onConflict: 'user_id,entry_date' })
    expect(sync.entries()).toHaveLength(2)
    setOnline(true)
    await sync.syncNow()
    const rows = server.current.rows('journal_entries')
    expect(rows.find((r) => r.id === existing.id).content).toBe('new text')
    expect(rows.find((r) => r.entry_date === '2026-11-02').content).toBe('second')
  })

  it('does not silently overwrite an entry another device created for the same day', async () => {
    await boot()
    await loaded('journal_entries')
    setOnline(false)
    await store.upsert('journal_entries', { entry_date: '2026-11-05', content: 'written offline' }, { onConflict: 'user_id,entry_date' })
    server.current.other.add('journal_entries', { entry_date: '2026-11-05', content: 'written on the phone' })
    setOnline(true)
    await sync.syncNow()
    expect(server.current.rows('journal_entries')[0].content).toBe('written on the phone')
    expect(sync.entries()[0].status).toBe('conflict')
  })
})

describe('status for the UI', () => {
  it('moves through offline → waiting → synced', async () => {
    await boot()
    await loaded('tasks')
    expect(sync.getStatus().state).toBe('synced')
    setOnline(false)
    window.dispatchEvent(new Event('offline'))
    expect(sync.getStatus().state).toBe('offline')
    await store.insert('tasks', { title: 'a' })
    expect(sync.getStatus()).toMatchObject({ state: 'offline', total: 1 })
    setOnline(true)
    await sync.syncNow()
    expect(sync.getStatus().state).toBe('synced')
    expect(sync.getStatus().lastSyncAt).toBeTruthy()
  })
})
