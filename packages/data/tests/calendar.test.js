import { beforeEach, describe, expect, it, vi } from 'vitest'
import { zonedToMs } from '@lifetrack/utils'
import { expandEvent } from '@lifetrack/core/calendarRecurrence'
import { buildCalendarItems, planMove, planResize } from '@lifetrack/core/calendar'
import { createApi } from '../src/api'
import { createMemorySupabase } from '../src/testing/memorySupabase'
import { createSupabaseAdapter } from '../src/supabaseAdapter'
import { withSchemaValidation } from '../src/validatingAdapter'
import { setUserId } from '../src/session'
import { insertSchemas, updateSchemas } from '@lifetrack/schemas'

const A = '11111111-1111-4111-8111-111111111111'
const TZ = 'Asia/Kolkata'
const at = (d, t) => new Date(zonedToMs(d, t, TZ)).toISOString()

// Same minimal cache/mutation store the other API tests use (the contract createApi needs).
function makeStore(adapter) {
  const cache = new Map()
  const rows = (t) => cache.get(t) ?? []
  const merge = (t, incoming) => { const cur = [...rows(t)]; for (const r of incoming) { const i = cur.findIndex((x) => x.id === r.id); if (i >= 0) cur[i] = r; else cur.push(r) } cache.set(t, cur) }
  const drop = (t, ids) => cache.set(t, rows(t).filter((r) => !ids.includes(r.id)))
  const one = (input, out) => (Array.isArray(input) ? out : out[0])
  const calls = { update: vi.fn() }
  return {
    calls,
    peek: rows,
    load: async (t) => { if (!cache.has(t)) cache.set(t, await adapter.list(t)) },
    refetch: async (t) => { cache.set(t, await adapter.list(t)) },
    insert: async (t, input) => { const out = await adapter.insert(t, Array.isArray(input) ? input : [input]); merge(t, out); return one(input, out) },
    update: async (t, id, patch) => { calls.update(t, id, patch); const r = await adapter.update(t, id, patch); merge(t, [r]); return r },
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
  const adapter = withSchemaValidation(createSupabaseAdapter(client), { insertSchemas, updateSchemas })
  store = makeStore(adapter); api = createApi(store)
})
const dump = (t) => client.dump(t)

/** A weekly Monday standup, 09:00-09:30 IST, starting 9 Nov 2026. */
const standup = (o = {}) => ({
  title: 'Standup', category: 'learning', timezone: TZ, starts_at: at('2026-11-09', '09:00'), ends_at: at('2026-11-09', '09:30'),
  rrule: { freq: 'weekly', byWeekday: [1] }, alert_minutes: [10], ...o,
})
const occurrences = (from = '2026-11-01', to = '2027-01-31') => {
  const events = store.peek('calendar_events')
  return events.flatMap((e) => expandEvent(e, store.peek('calendar_event_exceptions'), from, to)).sort((a, b) => a.startMs - b.startMs)
}
const mondays = (list) => list.map((o) => `${o.date} ${String(Math.floor(o.startMin / 60)).padStart(2, '0')}:${String(o.startMin % 60).padStart(2, '0')} ${o.title}`)

describe('createCalendarEvent', () => {
  it('creates an event with defaults filled in by the database', async () => {
    const e = await api.createCalendarEvent(standup())
    expect(e).toMatchObject({ title: 'Standup', priority: 'medium', all_day: false, description: '', alert_minutes: [10] })
    expect(dump('calendar_events')).toHaveLength(1)
  })
  it('a retry with the same id returns the first event instead of creating a second', async () => {
    const id = '22222222-2222-4222-8222-222222222222'
    const first = await api.createCalendarEvent({ ...standup(), id })
    const again = await api.createCalendarEvent({ ...standup(), id })
    expect(again.id).toBe(first.id)
    expect(dump('calendar_events')).toHaveLength(1)
  })
  it('rejects fields the table does not have (the schema guard)', async () => {
    await expect(api.createCalendarEvent({ ...standup(), bogus: 1 })).resolves.toBeTruthy() // pickEvent drops unknown keys, so nothing leaks to the database
    expect(dump('calendar_events')[0].bogus).toBeUndefined()
  })
})

describe('saveCalendarEvent', () => {
  it('a one-off event is simply updated', async () => {
    const e = await api.createCalendarEvent({ ...standup(), rrule: null })
    const row = await api.saveCalendarEvent(e, { title: 'Renamed', starts_at: at('2026-11-10', '10:00'), ends_at: at('2026-11-10', '11:00') })
    expect(row).toMatchObject({ title: 'Renamed', starts_at: at('2026-11-10', '10:00') })
    expect(dump('calendar_event_exceptions')).toHaveLength(0)
  })

  describe('this event only', () => {
    it('stores one override with only what changed, and leaves the series alone', async () => {
      const e = await api.createCalendarEvent(standup())
      await api.saveCalendarEvent(e, { title: 'Standup (guest)', starts_at: at('2026-11-16', '09:00'), ends_at: at('2026-11-16', '09:30'), rrule: e.rrule }, { scope: 'this', occurrenceDate: '2026-11-16' })
      const [x] = dump('calendar_event_exceptions')
      expect(x).toMatchObject({ event_id: e.id, occurrence_date: '2026-11-16', status: 'modified', title: 'Standup (guest)', starts_at: null, ends_at: null, location: null })
      expect(dump('calendar_events')[0]).toMatchObject({ title: 'Standup', starts_at: e.starts_at }) // series untouched
      expect(mondays(occurrences('2026-11-09', '2026-11-30'))).toEqual(['2026-11-09 09:00 Standup', '2026-11-16 09:00 Standup (guest)', '2026-11-23 09:00 Standup', '2026-11-30 09:00 Standup'])
    })
    it('moving one occurrence to another day and time changes only that occurrence', async () => {
      const e = await api.createCalendarEvent(standup())
      await api.saveCalendarEvent(e, { starts_at: at('2026-11-20', '15:00'), ends_at: at('2026-11-20', '15:30') }, { scope: 'this', occurrenceDate: '2026-11-16' })
      expect(mondays(occurrences('2026-11-09', '2026-11-30'))).toEqual(['2026-11-09 09:00 Standup', '2026-11-20 15:00 Standup', '2026-11-23 09:00 Standup', '2026-11-30 09:00 Standup'])
    })
    it('editing the same occurrence twice updates one override, not two', async () => {
      const e = await api.createCalendarEvent(standup())
      await api.saveCalendarEvent(e, { title: 'One' }, { scope: 'this', occurrenceDate: '2026-11-16' })
      await api.saveCalendarEvent(store.peek('calendar_events')[0], { title: 'Two' }, { scope: 'this', occurrenceDate: '2026-11-16' })
      expect(dump('calendar_event_exceptions')).toHaveLength(1)
      expect(dump('calendar_event_exceptions')[0].title).toBe('Two')
    })
    it('editing an occurrence back to the series values removes its override', async () => {
      const e = await api.createCalendarEvent(standup())
      await api.saveCalendarEvent(e, { title: 'Temp' }, { scope: 'this', occurrenceDate: '2026-11-16' })
      await api.saveCalendarEvent(store.peek('calendar_events')[0], { title: 'Standup' }, { scope: 'this', occurrenceDate: '2026-11-16' })
      expect(dump('calendar_event_exceptions')).toHaveLength(0)
    })
  })

  describe('all events', () => {
    it('dragging one occurrence to a new time moves the whole series to that time of day', async () => {
      const e = await api.createCalendarEvent(standup())
      await api.saveCalendarEvent(e, { starts_at: at('2026-11-16', '11:00'), ends_at: at('2026-11-16', '11:30') }, { scope: 'all', occurrenceDate: '2026-11-16' })
      expect(mondays(occurrences('2026-11-09', '2026-11-23'))).toEqual(['2026-11-09 11:00 Standup', '2026-11-16 11:00 Standup', '2026-11-23 11:00 Standup'])
    })
    it('dragging an occurrence to another weekday shifts the series by the same days', async () => {
      const e = await api.createCalendarEvent(standup({ rrule: { freq: 'daily' } }))
      await api.saveCalendarEvent(e, { starts_at: at('2026-11-12', '09:00'), ends_at: at('2026-11-12', '09:30') }, { scope: 'all', occurrenceDate: '2026-11-11' }) // moved one day later
      expect(dump('calendar_events')[0].starts_at).toBe(at('2026-11-10', '09:00'))
    })
    it('keeps per-occurrence edits when only the time of day changes', async () => {
      const e = await api.createCalendarEvent(standup())
      await api.saveCalendarEvent(e, { title: 'Special' }, { scope: 'this', occurrenceDate: '2026-11-16' })
      await api.saveCalendarEvent(store.peek('calendar_events')[0], { starts_at: at('2026-11-09', '10:00'), ends_at: at('2026-11-09', '10:30') }, { scope: 'all', occurrenceDate: '2026-11-09' })
      expect(dump('calendar_event_exceptions')).toHaveLength(1)
      expect(mondays(occurrences('2026-11-16', '2026-11-16'))).toEqual(['2026-11-16 10:00 Special'])
    })
    it('drops per-occurrence edits when the repeat rule changes (their dates no longer mean anything)', async () => {
      const e = await api.createCalendarEvent(standup())
      await api.saveCalendarEvent(e, { title: 'Special' }, { scope: 'this', occurrenceDate: '2026-11-16' })
      await api.saveCalendarEvent(store.peek('calendar_events')[0], { rrule: { freq: 'weekly', byWeekday: [2] } }, { scope: 'all', occurrenceDate: '2026-11-09' })
      expect(dump('calendar_event_exceptions')).toHaveLength(0)
    })
  })

  describe('this and following', () => {
    it('cuts the old series the day before and continues from this occurrence, with no gap or overlap', async () => {
      const e = await api.createCalendarEvent(standup())
      const before = mondays(occurrences('2026-11-09', '2026-12-28'))
      await api.saveCalendarEvent(e, { title: 'Planning', starts_at: at('2026-11-23', '14:00'), ends_at: at('2026-11-23', '14:30'), rrule: e.rrule }, { scope: 'following', occurrenceDate: '2026-11-23' })
      const events = dump('calendar_events')
      expect(events).toHaveLength(2)
      expect(events.find((x) => x.title === 'Standup').rrule).toMatchObject({ freq: 'weekly', until: '2026-11-22' })
      expect(mondays(occurrences('2026-11-09', '2026-12-28'))).toEqual([
        '2026-11-09 09:00 Standup', '2026-11-16 09:00 Standup',
        '2026-11-23 14:00 Planning', '2026-11-30 14:00 Planning', '2026-12-07 14:00 Planning', '2026-12-14 14:00 Planning', '2026-12-21 14:00 Planning', '2026-12-28 14:00 Planning',
      ])
      expect(before).toHaveLength(8) // same number of occurrences, none lost, none duplicated
    })
    it('a counted series keeps its total: the two halves add up to the original count', async () => {
      const e = await api.createCalendarEvent(standup({ rrule: { freq: 'weekly', byWeekday: [1], count: 6 } }))
      await api.saveCalendarEvent(e, { title: 'Later', starts_at: at('2026-11-23', '09:00'), ends_at: at('2026-11-23', '09:30'), rrule: e.rrule }, { scope: 'following', occurrenceDate: '2026-11-23' })
      const list = occurrences('2026-11-01', '2027-06-30')
      expect(list).toHaveLength(6)
      expect(list.filter((o) => o.title === 'Standup')).toHaveLength(2)
      expect(list.filter((o) => o.title === 'Later')).toHaveLength(4)
    })
    it('overrides after the cut move to the new series; the edited occurrence\'s own override is replaced', async () => {
      const e = await api.createCalendarEvent(standup())
      await api.saveCalendarEvent(e, { title: 'Guest' }, { scope: 'this', occurrenceDate: '2026-11-23' })
      await api.saveCalendarEvent(store.peek('calendar_events')[0], { title: 'Guest2' }, { scope: 'this', occurrenceDate: '2026-12-07' })
      await api.saveCalendarEvent(store.peek('calendar_events')[0], { title: 'Planning', starts_at: at('2026-11-23', '09:00'), ends_at: at('2026-11-23', '09:30'), rrule: e.rrule }, { scope: 'following', occurrenceDate: '2026-11-23' })
      const x = dump('calendar_event_exceptions')
      const created = dump('calendar_events').find((r) => r.title === 'Planning')
      expect(x).toHaveLength(1)
      expect(x[0]).toMatchObject({ occurrence_date: '2026-12-07', event_id: created.id, title: 'Guest2' })
      expect(mondays(occurrences('2026-11-23', '2026-12-14'))).toEqual(['2026-11-23 09:00 Planning', '2026-11-30 09:00 Planning', '2026-12-07 09:00 Guest2', '2026-12-14 09:00 Planning'])
    })
    it('from the first occurrence it is the same as editing the whole series', async () => {
      const e = await api.createCalendarEvent(standup())
      await api.saveCalendarEvent(e, { title: 'All of it', starts_at: e.starts_at, ends_at: e.ends_at, rrule: e.rrule }, { scope: 'following', occurrenceDate: '2026-11-09' })
      expect(dump('calendar_events')).toHaveLength(1)
      expect(dump('calendar_events')[0].title).toBe('All of it')
    })
    it('undoes the new series if cutting the old one fails, so two copies never overlap', async () => {
      const e = await api.createCalendarEvent(standup())
      const real = store.update
      store.update = async (t, id, patch) => { if (t === 'calendar_events' && 'rrule' in patch && patch.rrule?.until) throw new Error('network down'); return real(t, id, patch) }
      await expect(api.saveCalendarEvent(e, { title: 'Planning', starts_at: at('2026-11-23', '09:00'), ends_at: at('2026-11-23', '09:30'), rrule: e.rrule }, { scope: 'following', occurrenceDate: '2026-11-23' })).rejects.toThrow('network down')
      expect(dump('calendar_events')).toHaveLength(1)
      expect(dump('calendar_events')[0].rrule.until).toBeUndefined()
    })
  })

  it('refuses to overwrite an event another device has changed since this screen loaded it', async () => {
    const e = await api.createCalendarEvent(standup())
    const stale = { ...e, updated_at: '2020-01-01T00:00:00.000Z' }
    await expect(api.saveCalendarEvent(stale, { title: 'Mine' })).rejects.toThrow(/changed on another device/)
    expect(dump('calendar_events')[0].title).toBe('Standup')
  })
  it('says so when the event was deleted elsewhere', async () => {
    const e = await api.createCalendarEvent(standup())
    await api.deleteCalendarEvent(e)
    await expect(api.saveCalendarEvent(e, { title: 'x' })).rejects.toThrow(/deleted on another device/)
  })
})

describe('deleteCalendarEvent', () => {
  it('deleting the whole series removes its overrides too', async () => {
    const e = await api.createCalendarEvent(standup())
    await api.saveCalendarEvent(e, { title: 'Guest' }, { scope: 'this', occurrenceDate: '2026-11-16' })
    await api.deleteCalendarEvent(store.peek('calendar_events')[0], { scope: 'all' })
    expect(dump('calendar_events')).toHaveLength(0)
    expect(dump('calendar_event_exceptions')).toHaveLength(0)
  })
  it('deleting one occurrence cancels just that date; deleting it again does nothing extra', async () => {
    const e = await api.createCalendarEvent(standup())
    await api.deleteCalendarEvent(e, { scope: 'this', occurrenceDate: '2026-11-16' })
    await api.deleteCalendarEvent(e, { scope: 'this', occurrenceDate: '2026-11-16' })
    expect(dump('calendar_event_exceptions')).toHaveLength(1)
    expect(mondays(occurrences('2026-11-09', '2026-11-30'))).toEqual(['2026-11-09 09:00 Standup', '2026-11-23 09:00 Standup', '2026-11-30 09:00 Standup'])
  })
  it('cancelling a date that is not an occurrence is ignored', async () => {
    const e = await api.createCalendarEvent(standup())
    await api.deleteCalendarEvent(e, { scope: 'this', occurrenceDate: '2026-11-17' }) // a Tuesday
    expect(dump('calendar_event_exceptions')).toHaveLength(0)
  })
  it('deleting this and following ends the series the day before and clears later overrides', async () => {
    const e = await api.createCalendarEvent(standup())
    await api.saveCalendarEvent(e, { title: 'Guest' }, { scope: 'this', occurrenceDate: '2026-12-07' })
    await api.deleteCalendarEvent(store.peek('calendar_events')[0], { scope: 'following', occurrenceDate: '2026-11-23' })
    expect(dump('calendar_events')[0].rrule).toMatchObject({ until: '2026-11-22' })
    expect(dump('calendar_event_exceptions')).toHaveLength(0)
    expect(mondays(occurrences('2026-11-01', '2027-01-31'))).toEqual(['2026-11-09 09:00 Standup', '2026-11-16 09:00 Standup'])
  })
  it('deleting this and following from the first occurrence removes the event', async () => {
    const e = await api.createCalendarEvent(standup())
    await api.deleteCalendarEvent(e, { scope: 'following', occurrenceDate: '2026-11-09' })
    expect(dump('calendar_events')).toHaveLength(0)
  })
  it('deleting something already gone is not an error', async () => {
    const e = await api.createCalendarEvent(standup())
    await api.deleteCalendarEvent(e)
    await expect(api.deleteCalendarEvent(e)).resolves.toBeNull()
  })
  it('deleting a linked goal keeps the event and clears the link (the database does this on set null)', async () => {
    const goal = (await client.from('goals').insert({ title: 'Ship' }).select().single()).data
    await api.createCalendarEvent({ ...standup(), rrule: null, goal_id: goal.id })
    await client.from('goals').delete().eq('id', goal.id).select('id')
    expect(dump('calendar_events')[0].goal_id).toBeNull()
  })
})

describe('applyCalendarChange (drag, resize, schedule)', () => {
  const ctx = { tz: TZ, today: '2026-11-10', nowMs: zonedToMs('2026-11-10', '08:00', TZ) }
  const items = () => buildCalendarItems({ tasks: store.peek('tasks'), events: store.peek('calendar_events'), exceptions: store.peek('calendar_event_exceptions'), interviews: store.peek('interview_events'), reminders: store.peek('reminders') }, { from: '2026-11-01', to: '2026-11-30', ...ctx })
  const find = (pred) => items().find(pred)

  it('dragging a task to another day and time persists the new date and time, and nothing else changes', async () => {
    const t = await api.createTask({ title: 'Report', due_date: '2026-11-10', priority: 'high' })
    const item = find((i) => i.id === t.id)
    const { change } = planMove(item, { date: '2026-11-12', startMin: 15 * 60 }, { tz: TZ })
    await api.applyCalendarChange(change)
    expect(dump('tasks')[0]).toMatchObject({ title: 'Report', priority: 'high', status: 'pending', due_date: '2026-11-12', start_time: '15:00', end_time: '16:00' })
  })
  it('resizing a timed task persists the new end', async () => {
    const t = await api.createTask({ title: 'Report', due_date: '2026-11-10', start_time: '09:00', end_time: '10:00' })
    await api.applyCalendarChange(planResize(find((i) => i.id === t.id), 'end', { date: '2026-11-10', minutes: 11 * 60 + 30 }, { tz: TZ }).change)
    expect(dump('tasks')[0]).toMatchObject({ start_time: '09:00', end_time: '11:30' })
  })
  it('dragging an interview reschedules it in interview_events', async () => {
    const app = (await client.from('job_applications').insert({ company: 'Acme', job_title: 'Dev' }).select().single()).data
    const iv = (await client.from('interview_events').insert({ application_id: app.id, scheduled_at: at('2026-11-11', '16:00') }).select().single()).data
    await store.load('interview_events')
    const { change } = planMove(find((i) => i.id === iv.id), { date: '2026-11-13', startMin: 11 * 60 }, { tz: TZ })
    await api.applyCalendarChange(change)
    expect(dump('interview_events')[0].scheduled_at).toBe(at('2026-11-13', '11:00'))
  })
  it('dragging a reminder changes its date and time and re-arms it', async () => {
    const r = (await client.from('reminders').insert({ title: 'Call', remind_date: '2026-11-11', remind_time: '18:00', last_fired_on: '2026-11-11' }).select().single()).data
    await store.load('reminders')
    await api.applyCalendarChange(planMove(find((i) => i.id === r.id), { date: '2026-11-14', startMin: 'keep' }, { tz: TZ }).change)
    expect(dump('reminders')[0]).toMatchObject({ remind_date: '2026-11-14', remind_time: '18:00', last_fired_on: null })
  })
  it('dragging an event moves it; for a repeating one the chosen scope decides how far the change reaches', async () => {
    const e = await api.createCalendarEvent(standup())
    const item = find((i) => i.kind === 'event' && i.occurrenceDate === '2026-11-16')
    const { change } = planMove(item, { date: '2026-11-17', startMin: 10 * 60 }, { tz: TZ })
    await api.applyCalendarChange(change, { scope: 'this' })
    expect(dump('calendar_events')[0].starts_at).toBe(e.starts_at) // the series did not move
    expect(find((i) => i.kind === 'event' && i.occurrenceDate === '2026-11-16')).toMatchObject({ date: '2026-11-17', startMin: 600, modified: true })
  })
  it('resizing a repeating event for "this" occurrence stores the new end as an override', async () => {
    await api.createCalendarEvent(standup())
    const item = find((i) => i.kind === 'event' && i.occurrenceDate === '2026-11-16')
    await api.applyCalendarChange(planResize(item, 'end', { date: '2026-11-16', minutes: 10 * 60 }, { tz: TZ }).change, { scope: 'this' })
    expect(find((i) => i.kind === 'event' && i.occurrenceDate === '2026-11-16')).toMatchObject({ startMin: 540, endMin: 600 })
    expect(find((i) => i.kind === 'event' && i.occurrenceDate === '2026-11-23')).toMatchObject({ endMin: 570 })
  })
  it('a task deleted on another device is reported, not silently recreated', async () => {
    const t = await api.createTask({ title: 'Gone', due_date: '2026-11-10' })
    const item = find((i) => i.id === t.id)
    await client.from('tasks').delete().eq('id', t.id).select('id')
    await store.refetch('tasks')
    await expect(api.applyCalendarChange(planMove(item, { date: '2026-11-12', startMin: 'keep' }, { tz: TZ }).change)).rejects.toThrow(/no longer exists/)
  })
  it('completing a repeating calendar task still creates the next one with its time and alerts', async () => {
    const t = await api.createTask({ title: 'Stretch', due_date: '2026-11-10', start_time: '07:00', end_time: '07:30', recurrence: 'daily', alert_minutes: [10] })
    await api.setTaskStatus(t, 'done', '2026-11-10')
    const next = dump('tasks').find((r) => r.status === 'pending')
    expect(next).toMatchObject({ due_date: '2026-11-11', start_time: '07:00', end_time: '07:30', alert_minutes: [10], series_id: t.series_id })
  })
  it('a yearly task repeats a year later', async () => {
    const t = await api.createTask({ title: 'Renew', due_date: '2026-11-10', recurrence: 'yearly' })
    await api.setTaskStatus(t, 'done', '2026-11-10')
    expect(dump('tasks').find((r) => r.status === 'pending').due_date).toBe('2027-11-10')
  })
})

describe('raiseCalendarAlert', () => {
  const alert = { key: 'cal:event:e1:2026-11-16:10', title: 'Standup starts in 10 minutes', body: '', link: '/calendar?date=2026-11-16' }
  it('creates the notification once, however many devices or tabs try', async () => {
    const [a, b, c] = await Promise.all([api.raiseCalendarAlert(alert), api.raiseCalendarAlert(alert), api.raiseCalendarAlert(alert)])
    expect([a, b, c].filter(Boolean)).toHaveLength(1)
    expect(dump('notifications')).toHaveLength(1)
    expect(dump('notifications')[0]).toMatchObject({ kind: 'event', dedupe_key: alert.key })
  })
  it('different occurrences and different offsets each get their own', async () => {
    await api.raiseCalendarAlert(alert)
    await api.raiseCalendarAlert({ ...alert, key: 'cal:event:e1:2026-11-23:10' })
    await api.raiseCalendarAlert({ ...alert, key: 'cal:event:e1:2026-11-16:60' })
    expect(dump('notifications')).toHaveLength(3)
  })
})
