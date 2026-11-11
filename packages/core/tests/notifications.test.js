import { describe, expect, it } from 'vitest'
import { zonedToMs } from '@lifetrack/utils'
import {
  arrivedMs,
  categoryCounts,
  categoryEnabled,
  countUnread,
  deliveryMessages,
  deliveryStamp,
  dismissPatch,
  filterNotifications,
  fromItemPriority,
  groupByDay,
  handledStamps,
  inInbox,
  inQuietHours,
  isMissed,
  isSnoozed,
  isUnread,
  matchesQuery,
  mayInterrupt,
  normalizePriority,
  notificationSettings,
  planDelivery,
  priorityRank,
  quietEndsAtMs,
  restorePatch,
  safeLink,
  snoozeOptions,
  snoozePatch,
  sortNotifications,
  topPriority,
  validateSettings,
  validateSnooze,
} from '../src/notifications'
import { isReminderOverdue, nextRemindDate, reminderDueMs, reminderNotification, REPEATS, afterFire } from '../src/reminders'

const TZ = 'Asia/Kolkata'
const at = (day, time, tz = TZ) => zonedToMs(day, time, tz)
const NOW = at('2026-11-11', '10:00') // a Wednesday
let seq = 0
const N = (o = {}) => ({
  id: `n${++seq}`,
  kind: 'custom',
  title: 'Pay rent',
  body: '',
  priority: 'normal',
  read_at: null,
  dismissed_at: null,
  snoozed_until: null,
  due_at: null,
  created_at: new Date(NOW - 60_000).toISOString(),
  ...o,
})
const iso = (ms) => new Date(ms).toISOString()

describe('priorities and categories', () => {
  it('unknown priorities count as normal, and the most important one wins', () => {
    expect([
      normalizePriority('urgent'),
      normalizePriority('critical'),
      normalizePriority(undefined),
      normalizePriority(null),
      normalizePriority('toString'),
    ]).toEqual(['urgent', 'normal', 'normal', 'normal', 'normal'])
    expect(priorityRank('low') < priorityRank('normal') && priorityRank('high') < priorityRank('urgent')).toBe(true)
    expect(topPriority(['low', 'high', 'normal'])).toBe('high')
    expect(topPriority([])).toBe('low')
    expect(fromItemPriority('medium')).toBe('normal') // tasks and events say medium
    expect(fromItemPriority('urgent')).toBe('urgent')
  })
  it('a category is on unless switched off', () => {
    expect([categoryEnabled({ bill: false }, 'bill'), categoryEnabled({ bill: false }, 'task'), categoryEnabled(undefined, 'job')]).toEqual(
      [false, true, true],
    )
  })
})

describe('settings', () => {
  it('fills in defaults and repairs anything malformed', () => {
    expect(notificationSettings(undefined)).toEqual({
      quiet: { enabled: false, from: '22:00', to: '07:00', allow_urgent: true },
      desktop: false,
      smart: true,
      morning: '08:00',
      evening: '20:00',
      lead_minutes: 60,
    })
    const s = notificationSettings({
      quiet: { enabled: true, from: '25:00', to: '06:30' },
      morning: '7:00',
      evening: '21:15',
      lead_minutes: 1,
      desktop: 'yes',
      smart: false,
    })
    expect(s.quiet).toEqual({ enabled: true, from: '22:00', to: '06:30', allow_urgent: true })
    expect([s.morning, s.evening, s.lead_minutes, s.desktop, s.smart]).toEqual(['08:00', '21:15', 60, false, false])
    expect(notificationSettings([])).toEqual(notificationSettings({}))
    expect(notificationSettings('x')).toEqual(notificationSettings({}))
  })
  it('validates what a person is about to save', () => {
    const ok = notificationSettings({})
    expect(validateSettings(ok)).toEqual({})
    expect(validateSettings({ ...ok, quiet: { ...ok.quiet, enabled: true, from: '22:00', to: '22:00' } })).toHaveProperty('quiet_to')
    expect(validateSettings({ ...ok, quiet: { ...ok.quiet, from: '' } })).toHaveProperty('quiet_from')
    expect(validateSettings({ ...ok, morning: '09:00', evening: '09:00' })).toHaveProperty('evening')
    expect(validateSettings({ ...ok, morning: '20:00', evening: '08:00' })).toHaveProperty('evening')
    expect(validateSettings({ ...ok, lead_minutes: 0 })).toHaveProperty('lead_minutes')
  })
})

describe('quiet hours', () => {
  const overnight = notificationSettings({ quiet: { enabled: true, from: '22:00', to: '07:00' } })
  const day = notificationSettings({ quiet: { enabled: true, from: '13:00', to: '15:00' } })
  it('an overnight window covers late evening and early morning, and nothing in between', () => {
    const q = (time, s = overnight) => inQuietHours(s, at('2026-11-11', time), TZ)
    expect([q('21:59'), q('22:00'), q('23:59'), q('00:00'), q('06:59'), q('07:00'), q('12:00')]).toEqual([
      false,
      true,
      true,
      true,
      true,
      false,
      false,
    ])
  })
  it('a same-day window includes its start and excludes its end', () => {
    const q = (time) => inQuietHours(day, at('2026-11-11', time), TZ)
    expect([q('12:59'), q('13:00'), q('14:59'), q('15:00')]).toEqual([false, true, true, false])
  })
  it('is off when disabled or when start equals end', () => {
    expect(inQuietHours(notificationSettings({ quiet: { enabled: false } }), at('2026-11-11', '23:00'), TZ)).toBe(false)
    expect(inQuietHours({ quiet: { enabled: true, from: '10:00', to: '10:00' } }, at('2026-11-11', '10:00'), TZ)).toBe(false)
  })
  it('is judged in the person’s timezone, not the device’s', () => {
    const instant = Date.parse('2026-11-11T17:00:00Z') // 22:30 in Kolkata, 09:00 in Los Angeles
    expect(inQuietHours(overnight, instant, 'Asia/Kolkata')).toBe(true)
    expect(inQuietHours(overnight, instant, 'America/Los_Angeles')).toBe(false)
  })
  it('urgent notifications break through unless the person said no', () => {
    const night = at('2026-11-11', '23:00')
    expect(mayInterrupt({ priority: 'normal' }, overnight, night, TZ)).toBe(false)
    expect(mayInterrupt({ priority: 'high' }, overnight, night, TZ)).toBe(false)
    expect(mayInterrupt({ priority: 'urgent' }, overnight, night, TZ)).toBe(true)
    expect(mayInterrupt({ priority: 'urgent' }, { quiet: { ...overnight.quiet, allow_urgent: false } }, night, TZ)).toBe(false)
    expect(mayInterrupt({ priority: 'normal' }, overnight, at('2026-11-11', '12:00'), TZ)).toBe(true)
  })
  it('knows when the window ends, on either side of midnight', () => {
    expect(quietEndsAtMs(overnight, at('2026-11-11', '23:00'), TZ)).toBe(at('2026-11-12', '07:00'))
    expect(quietEndsAtMs(overnight, at('2026-11-11', '03:00'), TZ)).toBe(at('2026-11-11', '07:00'))
    expect(quietEndsAtMs(day, at('2026-11-11', '13:30'), TZ)).toBe(at('2026-11-11', '15:00'))
    expect(quietEndsAtMs(overnight, at('2026-11-11', '12:00'), TZ)).toBeNull()
  })
  it('follows daylight saving: a window that crosses the clocks changing still ends at 07:00 local', () => {
    const la = 'America/Los_Angeles' // clocks go back on 2026-11-01
    const s = notificationSettings({ quiet: { enabled: true, from: '22:00', to: '07:00' } })
    expect(quietEndsAtMs(s, at('2026-10-31', '23:00', la), la)).toBe(at('2026-11-01', '07:00', la))
  })
})

describe('snooze', () => {
  const settings = notificationSettings({})
  it('offers short and calendar-based choices, each landing in the future', () => {
    const o = Object.fromEntries(snoozeOptions(NOW, TZ, settings).map((x) => [x.id, x.at]))
    expect(o['10m']).toBe(NOW + 600_000)
    expect(o['1h']).toBe(NOW + 3_600_000)
    expect(o['3h']).toBe(NOW + 3 * 3_600_000)
    expect(o.evening).toBe(at('2026-11-11', '20:00'))
    expect(o.tomorrow).toBe(at('2026-11-12', '08:00'))
    expect(o.nextweek).toBe(at('2026-11-16', '08:00')) // the coming Monday
    expect(o.morning).toBeUndefined() // 08:00 has passed
    for (const at_ of Object.values(o)) expect(at_).toBeGreaterThan(NOW)
  })
  it('leaves out choices that no longer make sense', () => {
    const early = Object.fromEntries(snoozeOptions(at('2026-11-11', '05:00'), TZ, settings).map((x) => [x.id, x.at]))
    expect(early.morning).toBe(at('2026-11-11', '08:00'))
    const late = Object.fromEntries(snoozeOptions(at('2026-11-11', '19:45'), TZ, settings).map((x) => [x.id, x.at]))
    expect(late.evening).toBeUndefined() // less than half an hour away
    expect(late.tomorrow).toBe(at('2026-11-12', '08:00'))
  })
  it('"next week" is always a Monday after today, from any weekday', () => {
    const weekdayOf = (ms) => new Date(ms + 5.5 * 3_600_000).getUTCDay()
    for (let d = 8; d <= 15; d++) {
      const day = `2026-11-${String(d).padStart(2, '0')}`
      const next = snoozeOptions(at(day, '10:00'), TZ, settings).find((x) => x.id === 'nextweek').at
      expect(weekdayOf(next)).toBe(1)
      expect(next).toBeGreaterThan(at(day, '10:00'))
      expect(next - at(day, '10:00')).toBeLessThanOrEqual(8 * 86_400_000)
    }
  })
  it('refuses times in the past, too near, too far, or not a time', () => {
    expect(validateSnooze(NOW + 3_600_000, NOW)).toBeNull()
    expect(validateSnooze(NOW + 30_000, NOW)).toMatch(/future/)
    expect(validateSnooze(NOW - 1, NOW)).toMatch(/future/)
    expect(validateSnooze(NOW + 400 * 86_400_000, NOW)).toMatch(/year/)
    expect(validateSnooze(NaN, NOW)).toMatch(/date and time/)
  })
  it('snoozing hides a notification until its time, then it is back and unread', () => {
    const n = N({ read_at: iso(NOW - 5000) })
    const snoozed = { ...n, ...snoozePatch(NOW + 3_600_000) }
    expect(snoozed.read_at).toBeNull() // so it is noticed when it returns
    expect([inInbox(snoozed, NOW), isSnoozed(snoozed, NOW), isUnread(snoozed, NOW)]).toEqual([false, true, false]) // hidden: not in the badge
    const later = NOW + 3_600_001
    expect([inInbox(snoozed, later), isSnoozed(snoozed, later), isUnread(snoozed, later)]).toEqual([true, false, true])
    expect(arrivedMs(snoozed, later)).toBe(NOW + 3_600_000) // it counts as arriving when it woke
    expect(arrivedMs(snoozed, NOW)).toBe(Date.parse(n.created_at))
  })
  it('dismissing moves it to the history, marks it read and cancels a snooze; restoring brings it back', () => {
    const n = N({ snoozed_until: iso(NOW + 9e6) })
    const gone = { ...n, ...dismissPatch(n, NOW) }
    expect(gone).toMatchObject({ dismissed_at: iso(NOW), snoozed_until: null, read_at: iso(NOW) })
    expect([inInbox(gone, NOW), isUnread(gone, NOW), isSnoozed(gone, NOW)]).toEqual([false, false, false])
    const back = { ...gone, ...restorePatch() }
    expect(inInbox(back, NOW)).toBe(true)
    expect(dismissPatch(N({ read_at: '2026-11-01T00:00:00.000Z' }), NOW).read_at).toBe('2026-11-01T00:00:00.000Z') // an earlier read time is kept
  })
})

describe('missed notifications', () => {
  it('one created long after it was due is missed; on time, or without a due time, is not', () => {
    const due = NOW - 3 * 3_600_000
    expect(isMissed(N({ due_at: iso(due), created_at: iso(NOW) }))).toBe(true)
    expect(isMissed(N({ due_at: iso(NOW - 120_000), created_at: iso(NOW) }))).toBe(false)
    expect(isMissed(N({ due_at: iso(NOW - 15 * 60_000), created_at: iso(NOW) }))).toBe(false) // exactly the grace period
    expect(isMissed(N({ due_at: null }))).toBe(false)
    expect(isMissed(N({ due_at: iso(NOW + 1000), created_at: iso(NOW) }))).toBe(false) // made early (a heads-up)
  })
})

describe('filtering, searching and sorting', () => {
  const list = [
    N({ id: 'a', kind: 'bill', title: 'Electricity bill due', priority: 'high', created_at: iso(NOW - 3_600_000) }),
    N({
      id: 'b',
      kind: 'habit',
      title: '2 habits left today',
      body: 'Meditate · Read',
      created_at: iso(NOW - 7_200_000),
      read_at: iso(NOW),
    }),
    N({ id: 'c', kind: 'task', title: '3 tasks due today', priority: 'urgent', created_at: iso(NOW - 10_800_000) }),
    N({ id: 'd', kind: 'custom', title: 'Call mom', created_at: iso(NOW - 86_400_000), dismissed_at: iso(NOW - 80_000_000) }),
    N({ id: 'e', kind: 'custom', title: 'Stretch', created_at: iso(NOW - 600_000), snoozed_until: iso(NOW + 3_600_000) }),
  ]
  const ids = (f) =>
    filterNotifications(list, f, NOW)
      .map((n) => n.id)
      .sort()
  it('the inbox hides dismissed and snoozed; other views show them', () => {
    expect(ids({ status: 'inbox' })).toEqual(['a', 'b', 'c'])
    expect(ids({ status: 'unread' })).toEqual(['a', 'c'])
    expect(ids({ status: 'read' })).toEqual(['b'])
    expect(ids({ status: 'snoozed' })).toEqual(['e'])
    expect(ids({ status: 'dismissed' })).toEqual(['d'])
    expect(ids({ status: 'all' })).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
  it('narrows by category and priority', () => {
    expect(ids({ status: 'all', kind: 'custom' })).toEqual(['d', 'e'])
    expect(ids({ status: 'all', priority: 'urgent' })).toEqual(['c'])
    expect(ids({ status: 'all', kind: 'bill', priority: 'urgent' })).toEqual([])
  })
  it('searches title, text, category and priority; every word must match, case does not matter', () => {
    expect(ids({ status: 'all', query: 'ELECTRICITY' })).toEqual(['a'])
    expect(ids({ status: 'all', query: 'meditate' })).toEqual(['b']) // body
    expect(ids({ status: 'all', query: 'finance' })).toEqual(['a']) // category label
    expect(ids({ status: 'all', query: 'urgent' })).toEqual(['c']) // priority label
    expect(ids({ status: 'all', query: 'tasks today' })).toEqual(['c'])
    expect(ids({ status: 'all', query: 'tasks banana' })).toEqual([])
    expect(ids({ status: 'all', query: '   ' })).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(matchesQuery({ title: 'x' }, undefined)).toBe(true)
  })
  it('sorts newest first or by priority, without changing the list', () => {
    const before = list.map((n) => n.id)
    expect(sortNotifications(list, 'newest', NOW).map((n) => n.id)).toEqual(
      ['e', 'a', 'b', 'c', 'd'].sort((x, y) =>
        list.find((n) => n.id === y).created_at.localeCompare(list.find((n) => n.id === x).created_at),
      ),
    )
    expect(sortNotifications(list.slice(0, 3), 'priority', NOW).map((n) => n.id)).toEqual(['c', 'a', 'b'])
    expect(list.map((n) => n.id)).toEqual(before)
  })
  it('counts per category for the chips, ignoring the chosen category', () => {
    expect(categoryCounts(list, { status: 'inbox', kind: 'bill' }, NOW)).toEqual({ all: 3, bill: 1, habit: 1, task: 1 })
    expect(countUnread(list, NOW)).toBe(2) // a and c: b is read, d is dismissed, e is snoozed
  })
  it('groups by local day: today, yesterday, this week, older', () => {
    const items = [
      N({ id: '1', created_at: iso(at('2026-11-11', '09:00')) }),
      N({ id: '2', created_at: iso(at('2026-11-10', '23:30')) }),
      N({ id: '3', created_at: iso(at('2026-11-07', '12:00')) }),
      N({ id: '4', created_at: iso(at('2026-10-01', '12:00')) }),
    ]
    const g = groupByDay(items, { tz: TZ, nowMs: NOW })
    expect(g.map((x) => [x.label, x.items.map((n) => n.id)])).toEqual([
      ['Today', ['1']],
      ['Yesterday', ['2']],
      ['Earlier this week', ['3']],
      ['Older', ['4']],
    ])
    expect(groupByDay([items[0]], { tz: TZ, nowMs: NOW }).map((x) => x.key)).toEqual(['today']) // empty groups are left out
    // The same instants read differently in another zone: it is still the evening of the 10th in Los Angeles, so that item is from "today" there.
    expect(groupByDay([items[1]], { tz: 'America/Los_Angeles', nowMs: NOW })[0].key).toBe('today')
  })
})

describe('delivering', () => {
  const settings = notificationSettings({ quiet: { enabled: true, from: '22:00', to: '07:00' } })
  const none = () => ({ announced: new Set(), held: new Set() })
  const plan = (rows, o = {}) => planDelivery(rows, { ...none(), nowMs: NOW, tz: TZ, settings, prefs: {}, ...o })
  const fresh = (o = {}) => N({ created_at: iso(NOW - 20_000), ...o })

  it('announces a fresh unread notification once', () => {
    const n = fresh()
    expect(plan([n]).announce).toEqual([n])
    expect(plan([n], { announced: new Set([deliveryStamp(n)]) }).announce).toEqual([])
  })
  it('does not announce read, dismissed, snoozed or old notifications (opening the app late is not an arrival)', () => {
    expect(plan([fresh({ read_at: iso(NOW) })]).announce).toEqual([])
    expect(plan([fresh({ dismissed_at: iso(NOW) })]).announce).toEqual([])
    expect(plan([fresh({ snoozed_until: iso(NOW + 60_000) })]).announce).toEqual([])
    const old = N({ created_at: iso(NOW - 3_600_000) })
    const p = plan([old])
    expect(p.announce).toEqual([])
    expect(p.ignore).toEqual([old]) // marked handled so it never fires later
    expect(plan([fresh({ created_at: iso(NOW + 5 * 60_000) })]).announce).toEqual([]) // a clock that runs ahead: wait
  })
  it('a category that is switched off is handled silently', () => {
    const n = fresh({ kind: 'bill' })
    const p = plan([n], { prefs: { bill: false } })
    expect(p.announce).toEqual([])
    expect(p.ignore).toEqual([n])
  })
  it('a snoozed notification that wakes is a new arrival, announced again', () => {
    const n = fresh({ created_at: iso(NOW - 86_400_000), snoozed_until: iso(NOW - 30_000) })
    expect(plan([n]).announce).toEqual([n])
    const once = new Set([deliveryStamp(n)])
    expect(plan([n], { announced: once }).announce).toEqual([])
    expect(deliveryStamp({ ...n, snoozed_until: iso(NOW + 1) })).not.toBe(deliveryStamp(n)) // snoozing it again makes a new stamp
  })
  it('quiet hours hold it, then release it when they end', () => {
    const night = at('2026-11-11', '23:00')
    const n = N({ created_at: iso(night - 10_000) })
    const p = planDelivery([n], { ...none(), nowMs: night, tz: TZ, settings, prefs: {} })
    expect(p.announce).toEqual([])
    expect(p.hold).toEqual([n])
    expect(handledStamps(p)).toEqual([]) // still waiting
    const morning = at('2026-11-12', '07:01')
    const later = planDelivery([n], {
      announced: new Set(),
      held: new Set([deliveryStamp(n)]),
      nowMs: morning,
      tz: TZ,
      settings,
      prefs: {},
    })
    expect(later.release).toEqual([n]) // far older than the fresh window, but it was held on purpose
    const stillQuiet = planDelivery([n], {
      announced: new Set(),
      held: new Set([deliveryStamp(n)]),
      nowMs: at('2026-11-12', '03:00'),
      tz: TZ,
      settings,
      prefs: {},
    })
    expect(stillQuiet.release).toEqual([])
  })
  it('an urgent notification is announced through quiet hours', () => {
    const night = at('2026-11-11', '23:00')
    const n = N({ priority: 'urgent', created_at: iso(night - 10_000) })
    expect(planDelivery([n], { ...none(), nowMs: night, tz: TZ, settings, prefs: {} }).announce).toEqual([n])
  })
  it('one message each for a few, a single summary for many; released ones are summed up', () => {
    const rows = (k, o = {}) => Array.from({ length: k }, (_, i) => fresh({ title: `T${i}`, ...o }))
    expect(deliveryMessages({ announce: rows(2), hold: [], release: [], ignore: [] })).toHaveLength(2)
    const burst = deliveryMessages({ announce: rows(5), hold: [], release: [], ignore: [] })
    expect(burst).toHaveLength(1)
    expect(burst[0]).toMatchObject({ title: '5 new notifications', link: '/notifications' })
    expect(burst[0].body).toBe('T0 · T1 · T2 · +2 more')
    const away = deliveryMessages({ announce: [], hold: [], release: rows(3, { priority: 'high' }), ignore: [] })
    expect(away[0]).toMatchObject({ title: '3 notifications while you were away', priority: 'high' })
    expect(deliveryMessages({ announce: [], hold: [], release: rows(1), ignore: [] })[0].title).toBe('T0')
    expect(deliveryMessages({ announce: [], hold: [], release: [], ignore: rows(4) })).toEqual([])
    const [one] = deliveryMessages({
      announce: [fresh({ link: '/finance', title: 'Bill', body: 'Rent' })],
      hold: [],
      release: [],
      ignore: [],
    })
    expect(one).toMatchObject({ title: 'Bill', body: 'Rent', link: '/finance', priority: 'normal' })
    expect(deliveryMessages({ announce: [fresh({ link: '' })], hold: [], release: [], ignore: [] })[0].link).toBe('/notifications')
  })
  it('only ever links to a page inside the app', () => {
    expect(
      [
        '/finance',
        '/calendar?view=day&date=2026-11-11',
        '/',
        'https://evil.example',
        '//evil.example',
        '/\\evil.example',
        'javascript:alert(1)',
        '',
        null,
        undefined,
      ].map(safeLink),
    ).toEqual([
      '/finance',
      '/calendar?view=day&date=2026-11-11',
      '/',
      '/notifications',
      '/notifications',
      '/notifications',
      '/notifications',
      '/notifications',
      '/notifications',
      '/notifications',
    ])
    expect(deliveryMessages({ announce: [fresh({ link: 'https://evil.example' })], hold: [], release: [], ignore: [] })[0].link).toBe(
      '/notifications',
    )
  })
})

describe('reminders: repeats, due time and the notification they become', () => {
  it('knows six repeat choices', () => {
    expect(REPEATS.map((r) => r.value)).toEqual(['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'])
  })
  it('weekdays skips the weekend', () => {
    expect(nextRemindDate('2026-11-12', 'weekdays')).toBe('2026-11-13') // Thu → Fri
    expect(nextRemindDate('2026-11-13', 'weekdays')).toBe('2026-11-16') // Fri → Mon
    expect(nextRemindDate('2026-11-14', 'weekdays')).toBe('2026-11-16') // Sat → Mon
    expect(nextRemindDate('2026-11-15', 'weekdays')).toBe('2026-11-16') // Sun → Mon
  })
  it('yearly keeps the day, and 29 Feb becomes 28 Feb in a common year', () => {
    expect(nextRemindDate('2026-11-11', 'yearly')).toBe('2027-11-11')
    expect(nextRemindDate('2028-02-29', 'yearly')).toBe('2029-02-28')
    expect(nextRemindDate('2026-11-11', 'none')).toBeNull()
  })
  it('a missed repeating reminder jumps to the next occurrence after today', () => {
    expect(afterFire({ repeat: 'weekdays', remind_date: '2026-11-05' }, '2026-11-11')).toEqual({
      last_fired_on: '2026-11-11',
      remind_date: '2026-11-12',
    })
    expect(afterFire({ repeat: 'yearly', remind_date: '2024-11-11' }, '2026-11-11')).toEqual({
      last_fired_on: '2026-11-11',
      remind_date: '2027-11-11',
    })
  })
  it('works out the instant a reminder is due in the person’s timezone', () => {
    const r = { remind_date: '2026-11-11', remind_time: '09:00:00' }
    expect(reminderDueMs(r, 'Asia/Kolkata')).toBe(Date.parse('2026-11-11T03:30:00Z'))
    expect(reminderDueMs(r, 'America/Los_Angeles')).toBe(Date.parse('2026-11-11T17:00:00Z'))
  })
  it('turns a reminder into a notification that carries its priority, note and due time', () => {
    const r = {
      id: 'r1',
      kind: 'bill',
      title: 'Pay rent',
      body: 'Flat 4B',
      priority: 'high',
      remind_date: '2026-11-11',
      remind_time: '09:00',
    }
    expect(reminderNotification(r, '2026-11-11', 'Asia/Kolkata')).toEqual({
      kind: 'bill',
      title: 'Pay rent',
      body: 'Flat 4B',
      priority: 'high',
      link: '/finance',
      due_at: '2026-11-11T03:30:00.000Z',
      dedupe_key: 'reminder:r1:2026-11-11',
    })
    // an older row from before priorities existed, and no timezone known
    expect(
      reminderNotification({ id: 'r2', kind: 'custom', title: 'x', remind_date: '2026-11-11', remind_time: '09:00' }, '2026-11-11'),
    ).toMatchObject({ body: '', priority: 'normal', due_at: null })
  })
  it('spots a reminder whose time has passed', () => {
    const r = { active: true, remind_date: '2026-11-11', remind_time: '09:00:00' }
    expect([
      isReminderOverdue(r, '2026-11-11', '09:00'),
      isReminderOverdue(r, '2026-11-11', '08:59'),
      isReminderOverdue(r, '2026-11-12', '00:01'),
      isReminderOverdue({ ...r, active: false }, '2026-11-12', '10:00'),
    ]).toEqual([true, false, true, false])
  })
})
