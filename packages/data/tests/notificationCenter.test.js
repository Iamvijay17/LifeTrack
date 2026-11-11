import { beforeEach, describe, expect, it, vi } from 'vitest'
import { zonedToMs } from '@lifetrack/utils'
import { insertSchemas, updateSchemas } from '@lifetrack/schemas'
import { isUnread, inInbox, isSnoozed } from '@lifetrack/core/notifications'
import { createApi } from '../src/api'
import { createMemorySupabase } from '../src/testing/memorySupabase'
import { createSupabaseAdapter } from '../src/supabaseAdapter'
import { withSchemaValidation } from '../src/validatingAdapter'
import { setUserId } from '../src/session'

const A = '11111111-1111-4111-8111-111111111111'
const TZ = 'Asia/Kolkata'
const NOW = zonedToMs('2026-11-11', '10:00', TZ)
const HOUR = 3_600_000

// The same minimal cache/mutation store the other API tests use (the contract createApi needs).
function makeStore(adapter) {
  const cache = new Map()
  const rows = (t) => cache.get(t) ?? []
  const merge = (t, incoming) => { const cur = [...rows(t)]; for (const r of incoming) { const i = cur.findIndex((x) => x.id === r.id); if (i >= 0) cur[i] = r; else cur.push(r) } cache.set(t, cur) }
  const drop = (t, ids) => cache.set(t, rows(t).filter((r) => !ids.includes(r.id)))
  const one = (input, out) => (Array.isArray(input) ? out : out[0])
  return {
    peek: rows,
    load: async (t) => { if (!cache.has(t)) cache.set(t, await adapter.list(t)) },
    refetch: async (t) => { cache.set(t, await adapter.list(t)) },
    insert: async (t, input) => { const out = await adapter.insert(t, Array.isArray(input) ? input : [input]); merge(t, out); return one(input, out) },
    update: async (t, id, patch) => { const r = await adapter.update(t, id, patch); merge(t, [r]); return r },
    upsert: async (t, input, o) => { const out = await adapter.upsert(t, Array.isArray(input) ? input : [input], o); merge(t, out); return one(input, out) },
    rpc: (fn, args) => adapter.rpc(fn, args),
    patch: (t, incoming) => merge(t, incoming),
    patchGroup: (t, dropFn, incoming) => cache.set(t, [...rows(t).filter((r) => !dropFn(r)), ...incoming]),
    remove: async (t, id) => { await adapter.remove(t, id); drop(t, [id]) },
    removeMany: async (t, ids) => { await adapter.removeMany(t, ids); drop(t, ids) },
  }
}

let client, store, api
beforeEach(() => {
  client = createMemorySupabase(); setUserId(A)
  const adapter = withSchemaValidation(createSupabaseAdapter(client), { insertSchemas, updateSchemas }) // every payload is checked against the table schemas
  store = makeStore(adapter); api = createApi(store)
})
const dump = (t) => client.dump(t)
const seed = (...titles) => store.insert('notifications', titles.map((title) => ({ title })))

describe('snooze, dismiss and restore', () => {
  it('snoozing hides a notification until the chosen time and makes it unread again', async () => {
    const [n] = await seed('Stretch')
    await api.markNotificationRead(n)
    const snoozed = await api.snoozeNotification(store.peek('notifications')[0], NOW + HOUR, NOW)
    expect(snoozed).toMatchObject({ snoozed_until: new Date(NOW + HOUR).toISOString(), read_at: null, dismissed_at: null })
    expect(isSnoozed(snoozed, NOW)).toBe(true)
    expect(isUnread(snoozed, NOW)).toBe(false) // hidden: not in the badge
    expect(isUnread(snoozed, NOW + HOUR + 1)).toBe(true) // back, unread
  })
  it('refuses a snooze that is in the past, too soon, or absurdly far', async () => {
    const [n] = await seed('x')
    await expect(api.snoozeNotification(n, NOW - HOUR, NOW)).rejects.toThrow(/future/)
    await expect(api.snoozeNotification(n, NOW + 10_000, NOW)).rejects.toThrow(/future/)
    await expect(api.snoozeNotification(n, NOW + 500 * 86_400_000, NOW)).rejects.toThrow(/year/)
    await expect(api.snoozeNotification(n, Number.NaN, NOW)).rejects.toThrow(/date and time/)
    expect(dump('notifications')[0].snoozed_until).toBeNull() // nothing was written
  })
  it('dismissing moves it out of the inbox and marks it read; restoring puts it back', async () => {
    const [n] = await seed('Call mom')
    const gone = await api.dismissNotification(n, NOW)
    expect(gone).toMatchObject({ dismissed_at: new Date(NOW).toISOString(), read_at: new Date(NOW).toISOString() })
    expect(inInbox(gone, NOW)).toBe(false)
    const back = await api.restoreNotification(gone)
    expect([back.dismissed_at, back.snoozed_until]).toEqual([null, null])
    expect(inInbox(back, NOW)).toBe(true)
  })
  it('dismissing a snoozed notification cancels the snooze', async () => {
    const [n] = await seed('x')
    const snoozed = await api.snoozeNotification(n, NOW + HOUR, NOW)
    const gone = await api.dismissNotification(snoozed, NOW)
    expect(gone.snoozed_until).toBeNull()
  })
  it('dismisses several at once, and deletes from the history for good', async () => {
    const rows = await seed('a', 'b', 'c')
    expect(await api.dismissNotifications(rows.slice(0, 2), NOW)).toBe(2)
    expect(dump('notifications').filter((r) => r.dismissed_at)).toHaveLength(2)
    expect(await api.deleteNotifications(rows.slice(0, 2).map((r) => r.id))).toBe(2)
    expect(dump('notifications').map((r) => r.title)).toEqual(['c'])
    expect(await api.deleteNotifications([])).toBe(0)
  })
  it('marks read and unread; marking read twice writes nothing', async () => {
    const [n] = await seed('x')
    const read = await api.markNotificationRead(n)
    expect(read.read_at).toBeTruthy()
    expect(await api.markNotificationRead(read)).toBe(read)
    const unread = await api.markNotificationUnread(read)
    expect(unread.read_at).toBeNull()
    expect(await api.markNotificationUnread(unread)).toBe(unread)
  })
  it('"mark all read" only touches what you can see: a snoozed notification stays unread for when it returns', async () => {
    const [a, b, c, d] = await seed('a', 'b', 'c', 'd')
    await api.snoozeNotification(b, Date.now() + HOUR)
    await api.dismissNotification(c)
    await api.markNotificationRead(d)
    expect(await api.markAllRead()).toBe(1) // only a
    const byTitle = Object.fromEntries(dump('notifications').map((r) => [r.title, r]))
    expect(byTitle.a.read_at).toBeTruthy()
    expect(byTitle.b.read_at).toBeNull()
  })
})

describe('raiseNotification', () => {
  const base = { key: 'src:tasks-today:2026-11-11', kind: 'task', title: '3 tasks due today', body: 'a · b · c', link: '/planner', priority: 'high' }
  it('creates the notification once however many devices or tabs try', async () => {
    const results = await Promise.all([api.raiseNotification(base), api.raiseNotification(base), api.raiseNotification(base)])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(dump('notifications')).toHaveLength(1)
    expect(dump('notifications')[0]).toMatchObject({ kind: 'task', priority: 'high', title: '3 tasks due today', dedupe_key: base.key, due_at: null })
  })
  it('a new day (a new key) is a new notification', async () => {
    await api.raiseNotification(base)
    await api.raiseNotification({ ...base, key: 'src:tasks-today:2026-11-12' })
    expect(dump('notifications')).toHaveLength(2)
  })
  it('stores the due time, caps the title, and every payload passes the table schema', async () => {
    const n = await api.raiseNotification({ ...base, title: 'x'.repeat(400), dueAt: new Date(NOW).toISOString() })
    expect(n.title).toHaveLength(200)
    expect(n.due_at).toBe(new Date(NOW).toISOString())
    await expect(api.raiseNotification({ ...base, key: 'k2', kind: 'nonsense' })).rejects.toThrow(/Invalid insert payload/)
    await expect(api.raiseNotification({ ...base, key: 'k3', priority: 'critical' })).rejects.toThrow(/Invalid insert payload/)
  })
  it('other errors are not swallowed', async () => {
    const boom = Object.assign(new Error('offline'), { code: '08006' })
    const spy = vi.spyOn(store, 'insert').mockRejectedValueOnce(boom)
    await expect(api.raiseNotification(base)).rejects.toThrow('offline')
    spy.mockRestore()
  })
  it('calendar alerts still work and now carry a priority', async () => {
    const n = await api.raiseCalendarAlert({ key: 'cal:event:e1:2026-11-11:10', title: 'Standup starts in 10 minutes', link: '/calendar', priority: 'urgent' })
    expect(n).toMatchObject({ kind: 'event', priority: 'urgent', dedupe_key: 'cal:event:e1:2026-11-11:10' })
    expect(await api.raiseCalendarAlert({ key: 'cal:event:e1:2026-11-11:10', title: 'again' })).toBeNull()
  })
})

describe('reminders: priority, notes, repeats and rescheduling', () => {
  const TODAY = '2026-11-11'
  it('a fired reminder carries its priority and note, and records when it was due', async () => {
    await store.insert('reminders', [{ kind: 'bill', title: 'Pay rent', body: 'Flat 4B', priority: 'urgent', remind_date: TODAY, remind_time: '09:00' }])
    expect(await api.fireDueReminders(TODAY, '10:00', {}, { tz: TZ })).toBe(1)
    expect(dump('notifications')[0]).toMatchObject({ kind: 'bill', title: 'Pay rent', body: 'Flat 4B', priority: 'urgent', due_at: new Date(zonedToMs(TODAY, '09:00', TZ)).toISOString() })
  })
  it('an old reminder (no priority, no timezone given) still fires', async () => {
    await store.insert('reminders', [{ title: 'Old style', remind_date: TODAY, remind_time: '09:00' }])
    expect(await api.fireDueReminders(TODAY, '10:00', {})).toBe(1)
    expect(dump('notifications')[0]).toMatchObject({ priority: 'normal', due_at: null, body: '' })
  })
  it('a reminder missed for days fires once, keeps the time it was meant for, and a weekday reminder skips the weekend', async () => {
    await store.insert('reminders', [{ title: 'Standup notes', remind_date: '2026-11-06', remind_time: '09:00', repeat: 'weekdays' }]) // Friday; today is Wednesday
    expect(await api.fireDueReminders(TODAY, '10:00', {}, { tz: TZ })).toBe(1)
    expect(dump('notifications')[0].due_at).toBe(new Date(zonedToMs('2026-11-06', '09:00', TZ)).toISOString())
    expect(dump('reminders')[0]).toMatchObject({ remind_date: '2026-11-12', last_fired_on: TODAY })
    await store.insert('reminders', [{ title: 'Friday one', remind_date: '2026-11-13', remind_time: '09:00', repeat: 'weekdays' }])
    expect(await api.fireDueReminders('2026-11-13', '10:00', {}, { tz: TZ })).toBe(2) // both are due on Friday
    expect(dump('reminders').find((r) => r.title === 'Friday one').remind_date).toBe('2026-11-16') // Monday, not Saturday
  })
  it('reschedules a reminder and arms it again', async () => {
    const [r] = await store.insert('reminders', [{ title: 'x', remind_date: '2026-11-01', remind_time: '09:00', active: false, last_fired_on: '2026-11-01' }])
    const moved = await api.rescheduleReminder(r, { date: '2026-11-12', time: '18:30', tz: TZ, nowMs: NOW })
    expect(moved).toMatchObject({ remind_date: '2026-11-12', remind_time: '18:30', active: true, last_fired_on: null })
  })
  it('refuses to reschedule into the past or to something that is not a date and time', async () => {
    const [r] = await store.insert('reminders', [{ title: 'x', remind_date: '2026-11-20', remind_time: '09:00' }])
    await expect(api.rescheduleReminder(r, { date: '2026-11-11', time: '09:00', tz: TZ, nowMs: NOW })).rejects.toThrow(/future/)
    await expect(api.rescheduleReminder(r, { date: '2026-02-30', time: '09:00', tz: TZ, nowMs: NOW })).rejects.toThrow(/Pick a date/)
    await expect(api.rescheduleReminder(r, { date: '2026-11-12', time: '9am', tz: TZ, nowMs: NOW })).rejects.toThrow(/Pick a time/)
    expect(dump('reminders')[0].remind_date).toBe('2026-11-20')
  })
  it('judges "the past" in the person’s timezone', async () => {
    const [r] = await store.insert('reminders', [{ title: 'x', remind_date: '2026-11-20', remind_time: '09:00' }])
    // 06:00 on the 11th: in Kolkata it is 10:00 on the 11th already, in Los Angeles it is still 16:30 on the 10th.
    const now = Date.parse('2026-11-11T04:30:00Z')
    await expect(api.rescheduleReminder(r, { date: '2026-11-11', time: '08:00', tz: 'Asia/Kolkata', nowMs: now })).rejects.toThrow(/future/)
    await expect(api.rescheduleReminder(r, { date: '2026-11-11', time: '08:00', tz: 'America/Los_Angeles', nowMs: now })).resolves.toBeTruthy()
  })
})
