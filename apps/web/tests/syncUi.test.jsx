import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const server = vi.hoisted(() => ({ rows: [], online: true, other: null }))
let onLine = true
let AppError
vi.mock('@/services/db', () => {
  const gate = () => {
    if (!server.online) throw new AppError("Can't reach the server.", { isNetwork: true })
  }
  return {
    isDevMode: false,
    db: {
      list: async () => (gate(), structuredClone(server.rows)),
      get: async (_t, id) => (gate(), structuredClone(server.rows.find((r) => r.id === id) ?? null)),
      find: async () => (gate(), []),
      insert: async (_t, rows) => {
        gate()
        const out = rows.map((r) => ({ created_at: 'T0', updated_at: 'T0', ...r }))
        server.rows.push(...out)
        return structuredClone(out)
      },
      update: async (_t, id, patch, { ifUpdatedAt } = {}) => {
        gate()
        const i = server.rows.findIndex((r) => r.id === id)
        if (ifUpdatedAt && server.rows[i].updated_at !== ifUpdatedAt) throw new AppError('changed', { code: 'CONFLICT' })
        server.rows[i] = { ...server.rows[i], ...patch, updated_at: 'T' + Math.random() }
        return structuredClone(server.rows[i])
      },
      remove: async () => gate(),
      subscribe: () => () => {},
    },
  }
})

let mods
beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  onLine = true
  server.rows = []
  server.online = true
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => onLine })
  vi.resetModules()
  AppError = (await import('@/services/errors')).AppError
  const idb = await import('@/sync/idb')
  const vault = await import('@/sync/vault')
  idb._reset()
  vault._reset()
  mods = {
    sync: await import('@/sync'),
    store: await import('@/hooks/store'),
    center: await import('@/components/sync/SyncCenter'),
    ind: await import('@/components/layout/StatusIndicators'),
  }
}, 60_000) // the first import of the dialog and header code is slow on a busy machine
afterEach(() => {
  mods.sync.stop()
  mods.store.resetStore()
})
const go = (online) => {
  onLine = online
  server.online = online
  act(() => void window.dispatchEvent(new Event(online ? 'online' : 'offline')))
}

function Harness() {
  const { SyncPill, Banners } = mods.ind
  const { SyncCenter } = mods.center
  return (
    <>
      <Banners />
      <SyncPill />
      <SyncCenter />
    </>
  )
}

describe('sync indicators', () => {
  it('stay out of the way while everything is saved, show the waiting count offline, and clear once synced', async () => {
    await mods.sync.start('u1')
    await mods.store.load('tasks')
    render(<Harness />)
    await waitFor(() => expect(screen.queryByTestId('sync-pill')).toBeNull())

    go(false)
    expect(screen.getByRole('alert')).toHaveTextContent(/saved on this device and sync/i)
    await act(() => mods.store.insert('tasks', { title: 'Buy milk' }))
    const pill = await screen.findByTestId('sync-pill')
    expect(pill).toHaveAttribute('data-state', 'offline')
    expect(pill).toHaveTextContent(/Offline · 1 saved/)

    go(true)
    await act(() => mods.sync.syncNow())
    await waitFor(() => expect(screen.queryByTestId('sync-pill')).toBeNull())
    expect(server.rows.map((r) => r.title)).toEqual(['Buy milk'])
  })

  it('the Sync Center lists waiting changes in plain words', async () => {
    await mods.sync.start('u1')
    await mods.store.load('tasks')
    render(<Harness />)
    go(false)
    await act(() => mods.store.insert('tasks', { title: 'Call the bank' }))
    await userEvent.click(await screen.findByTestId('sync-pill'))
    const entry = await screen.findByTestId('sync-entry')
    expect(entry).toHaveTextContent('Call the bank')
    expect(entry).toHaveTextContent(/New task/)
    expect(screen.getByRole('button', { name: /sync now/i })).toBeDisabled() // nothing to send without a connection
  })

  it('asks the person to choose when the same field changed on two devices, and keeps the server data until they do', async () => {
    server.rows = [{ id: 'r1', title: 'shared', created_at: 'T0', updated_at: 'T1' }]
    await mods.sync.start('u1')
    await mods.store.load('tasks')
    render(<Harness />)
    go(false)
    await act(() => mods.store.update('tasks', 'r1', { title: 'mine' }))
    server.rows[0] = { ...server.rows[0], title: 'theirs', updated_at: 'T2' } // the other device
    go(true)
    await act(() => mods.sync.syncNow())
    expect(server.rows[0].title).toBe('theirs')
    const pill = await screen.findByTestId('sync-pill')
    expect(pill).toHaveAttribute('data-state', 'attention')
    await userEvent.click(pill)
    const entry = await screen.findByTestId('sync-entry')
    expect(within(entry).getAllByText('mine').length).toBeGreaterThan(0)
    expect(within(entry).getByText('theirs')).toBeInTheDocument()
    await userEvent.click(within(entry).getByRole('button', { name: /keep other device/i }))
    await waitFor(() => expect(screen.queryByTestId('sync-entry')).toBeNull())
    expect(mods.store.peek('tasks')[0].title).toBe('theirs')
  })
})
