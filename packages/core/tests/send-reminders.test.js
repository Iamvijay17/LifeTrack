import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { timeStrInTz, todayStr } from '@lifetrack/utils'
import { afterFire, dueReminders, KIND_LINK } from '../src/reminders'
import { runReminders } from '../../../supabase/functions/send-reminders/logic.js'
import { expected } from '../../../scripts/sync-function-core.mjs'

const core = { afterFire, dueReminders, KIND_LINK, timeStrInTz, todayStr }
const U1 = 'user-1', U2 = 'user-2'

/** In-memory stand-in for the service-role database, enforcing the notification dedupe key like Postgres does. */
function fakeDb({ reminders, settings = {}, tokens = [] }) {
  const state = { reminders: structuredClone(reminders), notifications: [], tokens: structuredClone(tokens), deleted: [] }
  const db = {
    listActiveReminders: async (maxDate) => state.reminders.filter((r) => r.active && r.remind_date <= maxDate),
    listSettings: async (ids) => new Map(ids.filter((id) => settings[id]).map((id) => [id, settings[id]])),
    insertNotification: async (row) => {
      if (state.notifications.some((n) => n.user_id === row.user_id && n.dedupe_key === row.dedupe_key)) return null
      const n = { id: `n${state.notifications.length + 1}`, body: '', ...row }; state.notifications.push(n); return n
    },
    updateReminder: async (id, patch) => { Object.assign(state.reminders.find((r) => r.id === id), patch) },
    listTokens: async (ids) => state.tokens.filter((t) => ids.includes(t.user_id)),
    deleteTokens: async (toks) => { state.deleted.push(...toks); state.tokens = state.tokens.filter((t) => !toks.includes(t.token)) },
  }
  return { state, db }
}
const okPush = () => { const sent = []; return { sent, push: { send: async (m) => { sent.push(m); return m.map(() => ({ status: 'ok' })) } } } }
const R = (o) => ({ id: 'r1', user_id: U1, kind: 'task', title: 'Pay rent', remind_date: '2026-11-02', remind_time: '09:00', repeat: 'none', active: true, last_fired_on: null, ...o })
const IST = { timezone: 'Asia/Kolkata', notification_prefs: {} }
const tok = (n, user = U1) => ({ user_id: user, token: `ExpoPushToken[${n}]` })
// 09:00 IST on 2 Nov 2026 is 03:30 UTC.
const T_0930_IST = Date.parse('2026-11-02T03:30:00Z')

describe('send-reminders pipeline', () => {
  it('fires a due reminder: saves the notification (dedupe key + link), pushes to every device, then advances the reminder', async () => {
    const { state, db } = fakeDb({ reminders: [R()], settings: { [U1]: IST }, tokens: [tok('a'), tok('b')] })
    const { sent, push } = okPush()
    const stats = await runReminders({ db, push, core, nowMs: T_0930_IST })
    expect(state.notifications).toHaveLength(1)
    expect(state.notifications[0]).toMatchObject({ kind: 'task', title: 'Pay rent', link: '/planner', dedupe_key: 'reminder:r1:2026-11-02' })
    expect(sent.flat().map((m) => m.to)).toEqual(['ExpoPushToken[a]', 'ExpoPushToken[b]'])
    expect(sent[0][0]).toMatchObject({ title: 'Pay rent', channelId: 'reminders', sound: 'default', data: { kind: 'task', link: '/planner', notificationId: 'n1' } })
    expect(state.reminders[0]).toMatchObject({ active: false, last_fired_on: '2026-11-02' })
    expect(stats).toMatchObject({ checked: 1, fired: 1, pushed: 2, pushErrors: 0 })
  })
  it('does nothing before the reminder time', async () => {
    const { state, db } = fakeDb({ reminders: [R()], settings: { [U1]: IST }, tokens: [tok('a')] })
    const { sent, push } = okPush()
    await runReminders({ db, push, core, nowMs: T_0930_IST - 60_000 })
    expect(state.notifications).toHaveLength(0)
    expect(sent).toHaveLength(0)
    expect(state.reminders[0].active).toBe(true)
  })
  it("uses each user's own timezone for the same wall-clock reminder", async () => {
    const reminders = [R({ id: 'ist', user_id: U1 }), R({ id: 'la', user_id: U2 })]
    const settings = { [U1]: IST, [U2]: { timezone: 'America/Los_Angeles', notification_prefs: {} } }
    // 03:30Z: 09:00 in Kolkata, but still the evening of 1 Nov in Los Angeles → only U1 is due.
    const a = fakeDb({ reminders, settings, tokens: [tok('i', U1), tok('l', U2)] })
    await runReminders({ db: a.db, push: okPush().push, core, nowMs: T_0930_IST })
    expect(a.state.notifications.map((n) => n.user_id)).toEqual([U1])
    // 17:05Z: 22:35 IST (same day, long past) and 09:05 PST (UTC-8 in November) → U2 now fires, U1 does not repeat.
    await runReminders({ db: a.db, push: okPush().push, core, nowMs: Date.parse('2026-11-02T17:05:00Z') })
    expect(a.state.notifications.map((n) => n.user_id)).toEqual([U1, U2])
    // 16:55Z is 08:55 PST: not yet.
    const b = fakeDb({ reminders: [R({ user_id: U2 })], settings, tokens: [] })
    await runReminders({ db: b.db, push: okPush().push, core, nowMs: Date.parse('2026-11-02T16:55:00Z') })
    expect(b.state.notifications).toHaveLength(0)
  })
  it('a user with notifications switched off for that kind gets no notification or push, but the reminder still advances', async () => {
    const { state, db } = fakeDb({ reminders: [R()], settings: { [U1]: { timezone: 'Asia/Kolkata', notification_prefs: { task: false } } }, tokens: [tok('a')] })
    const { sent, push } = okPush()
    const stats = await runReminders({ db, push, core, nowMs: T_0930_IST })
    expect(state.notifications).toHaveLength(0)
    expect(sent).toHaveLength(0)
    expect(state.reminders[0].active).toBe(false)
    expect(stats.skippedByPrefs).toBe(1)
  })
  it('is idempotent: running twice in the same minute notifies once; an already-notified day is not pushed again', async () => {
    const { state, db } = fakeDb({ reminders: [R({ repeat: 'daily' })], settings: { [U1]: IST }, tokens: [tok('a')] })
    const { sent, push } = okPush()
    await runReminders({ db, push, core, nowMs: T_0930_IST })
    await runReminders({ db, push, core, nowMs: T_0930_IST })
    expect(state.notifications).toHaveLength(1)
    expect(sent.flat()).toHaveLength(1)
    // The web app already created today's notification, then this job runs: duplicate → no second push.
    const d = fakeDb({ reminders: [R()], settings: { [U1]: IST }, tokens: [tok('a')] })
    d.state.notifications.push({ id: 'web', user_id: U1, dedupe_key: 'reminder:r1:2026-11-02' })
    const p = okPush()
    const stats = await runReminders({ db: d.db, push: p.push, core, nowMs: T_0930_IST })
    expect(stats).toMatchObject({ fired: 0, duplicates: 1, pushed: 0 })
    expect(p.sent).toHaveLength(0)
    expect(d.state.reminders[0].active).toBe(false)
  })
  it('repeating reminders move to their next date', async () => {
    const { state, db } = fakeDb({ reminders: [R({ repeat: 'weekly' })], settings: { [U1]: IST } })
    await runReminders({ db, push: okPush().push, core, nowMs: T_0930_IST })
    expect(state.reminders[0]).toMatchObject({ active: true, remind_date: '2026-11-09', last_fired_on: '2026-11-02' })
  })
  it('a missed reminder (app/server was down) still fires late, once', async () => {
    const { state, db } = fakeDb({ reminders: [R({ remind_date: '2026-10-30' })], settings: { [U1]: IST }, tokens: [tok('a')] })
    await runReminders({ db, push: okPush().push, core, nowMs: T_0930_IST })
    expect(state.notifications).toHaveLength(1)
    expect(state.notifications[0].dedupe_key).toBe('reminder:r1:2026-11-02')
  })
  it('saves the notification even when the user has no devices registered', async () => {
    const { state, db } = fakeDb({ reminders: [R()], settings: { [U1]: IST }, tokens: [] })
    const { sent, push } = okPush()
    const stats = await runReminders({ db, push, core, nowMs: T_0930_IST })
    expect(state.notifications).toHaveLength(1)
    expect(sent).toHaveLength(0)
    expect(stats).toMatchObject({ fired: 1, pushed: 0 })
  })
  it('removes tokens Expo says are dead, keeps others, and survives a failing push service', async () => {
    const { state, db } = fakeDb({ reminders: [R()], settings: { [U1]: IST }, tokens: [tok('dead'), tok('good'), tok('flaky')] })
    const push = { send: async (m) => m.map((x) => (x.to.includes('dead') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : x.to.includes('flaky') ? { status: 'error', details: { error: 'MessageRateExceeded' } } : { status: 'ok' })) }
    const stats = await runReminders({ db, push, core, nowMs: T_0930_IST })
    expect(state.deleted).toEqual(['ExpoPushToken[dead]'])
    expect(state.tokens.map((t) => t.token).sort()).toEqual(['ExpoPushToken[flaky]', 'ExpoPushToken[good]'])
    expect(stats).toMatchObject({ pushed: 1, pushErrors: 2, tokensRemoved: 1 })
    const down = fakeDb({ reminders: [R()], settings: { [U1]: IST }, tokens: [tok('a')] })
    const s2 = await runReminders({ db: down.db, push: { send: async () => { throw new Error('Expo down') } }, core, nowMs: T_0930_IST })
    expect(down.state.notifications).toHaveLength(1) // the inbox row is the source of truth
    expect(s2.pushErrors).toBe(1)
  })
  it('sends in batches of at most 100', async () => {
    const reminders = Array.from({ length: 3 }, (_, i) => R({ id: `r${i}`, title: `T${i}` }))
    const tokens = Array.from({ length: 84 }, (_, i) => tok(`d${i}`)) // 3 notifications × 84 devices = 252 messages
    const { db } = fakeDb({ reminders, settings: { [U1]: IST }, tokens })
    const { sent, push } = okPush()
    const stats = await runReminders({ db, push, core, nowMs: T_0930_IST })
    expect(sent.map((b) => b.length)).toEqual([100, 100, 52])
    expect(stats.pushed).toBe(252)
  })
  it('falls back to IST when a user has no settings row yet', async () => {
    const { state, db } = fakeDb({ reminders: [R()], settings: {}, tokens: [] })
    await runReminders({ db, push: okPush().push, core, nowMs: T_0930_IST })
    expect(state.notifications).toHaveLength(1)
  })
})

describe('Edge Function shared code stays in sync with the app packages', () => {
  it('supabase/functions/_shared copies equal their sources (run `node scripts/sync-function-core.mjs`)', () => {
    for (const [file, content] of expected()) expect(readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8'), file).toBe(content)
  })
})
