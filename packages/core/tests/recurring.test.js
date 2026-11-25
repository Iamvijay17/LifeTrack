import { describe, expect, it } from 'vitest'
import { afterPost, dueOccurrences, dueRules, MAX_CATCH_UP, nextRecurringDate, occurrenceRow, ruleSchedule, ruleStatus, ruleTitle, sortRules, togglePatch } from '../src/recurring'
import { dashboardData } from '../src/dashboard'
import { upcomingItems } from '../src/upcoming'

const rule = (o = {}) => ({ id: 'r1', type: 'expense', amount_paise: 2500000, category: 'Bills', payment_method: 'UPI', note: 'Rent', frequency: 'monthly', anchor_day: Number((o.next_date ?? '2026-11-01').slice(8)), next_date: '2026-11-01', end_date: null, active: true, ...o })
/** Every occurrence from `start`, the way a rule walks through them over time. */
const walk = (start, frequency, anchor, n) => {
  const out = [start]
  while (out.length < n) out.push(nextRecurringDate(out.at(-1), frequency, anchor))
  return out
}

describe('nextRecurringDate', () => {
  it('daily and weekly cross month and year ends', () => {
    expect(walk('2026-12-30', 'daily', 30, 3)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01'])
    expect(walk('2026-12-28', 'weekly', 28, 2)).toEqual(['2026-12-28', '2027-01-04'])
  })
  it('month-end: a rule on the 31st clamps to short months and comes back, never sticking to the 28th', () => {
    expect(walk('2027-01-31', 'monthly', 31, 5)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31'])
  })
  it('month-end: the 29th and 30th clamp in February, in a leap year too', () => {
    expect(walk('2027-01-30', 'monthly', 30, 3)).toEqual(['2027-01-30', '2027-02-28', '2027-03-30'])
    expect(walk('2028-01-31', 'monthly', 31, 3)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31'])
    expect(walk('2028-01-29', 'monthly', 29, 3)).toEqual(['2028-01-29', '2028-02-29', '2028-03-29'])
  })
  it('monthly crosses the year end', () => {
    expect(walk('2026-12-15', 'monthly', 15, 2)).toEqual(['2026-12-15', '2027-01-15'])
  })
  it('yearly: 29 Feb falls on the 28th until the next leap year', () => {
    expect(walk('2028-02-29', 'yearly', 29, 5)).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'])
  })
})

describe('dueOccurrences', () => {
  it('nothing before the date; the occurrence is due on the day itself', () => {
    expect(dueOccurrences(rule({ next_date: '2026-11-05' }), '2026-11-04')).toEqual([])
    expect(dueOccurrences(rule({ next_date: '2026-11-05' }), '2026-11-05')).toEqual(['2026-11-05'])
  })
  it('missed days each get their own date, oldest first', () => {
    expect(dueOccurrences(rule({ next_date: '2026-08-31' }), '2026-11-04')).toEqual(['2026-08-31', '2026-09-30', '2026-10-31'])
    expect(dueOccurrences(rule({ next_date: '2026-11-01', frequency: 'daily' }), '2026-11-03')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
  })
  it('a paused rule owes nothing', () => {
    expect(dueOccurrences(rule({ active: false }), '2026-12-01')).toEqual([])
  })
  it('stops at the end date, which is inclusive', () => {
    expect(dueOccurrences(rule({ next_date: '2026-09-01', end_date: '2026-10-01' }), '2026-12-01')).toEqual(['2026-09-01', '2026-10-01'])
    expect(dueOccurrences(rule({ next_date: '2026-11-01', end_date: '2026-10-31' }), '2026-12-01')).toEqual([])
  })
  it('a long gap is capped per run, and the next run carries on where it stopped', () => {
    const r = rule({ next_date: '2020-01-01', frequency: 'daily', anchor_day: 1 })
    const first = dueOccurrences(r, '2026-11-04')
    expect(first).toHaveLength(MAX_CATCH_UP)
    const after = afterPost(r, first.at(-1))
    expect(after.next_date).toBe(nextRecurringDate(first.at(-1), 'daily', 1))
    expect(dueOccurrences({ ...r, ...after }, '2026-11-04')[0]).toBe(after.next_date)
  })
  it('dueRules keeps only the rules owing something', () => {
    const rules = [rule({ id: 'due' }), rule({ id: 'later', next_date: '2027-01-01' }), rule({ id: 'off', active: false })]
    expect(dueRules(rules, '2026-11-04').map((r) => r.id)).toEqual(['due'])
  })
})

describe('after posting', () => {
  it('moves to the next occurrence, keeping the intended day of the month', () => {
    const r = rule({ next_date: '2027-02-28', anchor_day: 31 })
    expect(afterPost(r, '2027-02-28')).toEqual({ next_date: '2027-03-31' })
  })
  it('switches the rule off once nothing is left before its end date', () => {
    const r = rule({ next_date: '2026-11-01', end_date: '2026-11-15' })
    expect(afterPost(r, '2026-11-01')).toEqual({ next_date: '2026-12-01', active: false })
    expect(ruleStatus({ ...r, next_date: '2026-12-01', active: false })).toBe('ended')
  })
  it('posting the same occurrence again changes nothing: both devices write the same next_date', () => {
    const r = rule()
    expect(afterPost(r, '2026-11-01')).toEqual(afterPost(r, '2026-11-01'))
  })
  it('the transaction keeps the rule fields and is dated on the occurrence', () => {
    expect(occurrenceRow(rule(), '2026-11-01')).toEqual({ type: 'expense', amount_paise: 2500000, category: 'Bills', payment_method: 'UPI', note: 'Rent', txn_date: '2026-11-01', recurring_rule_id: 'r1', recurring_date: '2026-11-01' })
  })
})

describe('pause and resume', () => {
  it('pausing keeps the schedule', () => {
    expect(togglePatch(rule(), '2026-11-04')).toEqual({ active: false })
  })
  it('resuming skips what fell due during the pause, and keeps a charge falling today', () => {
    const paused = rule({ active: false, next_date: '2026-08-31', anchor_day: 31 })
    expect(togglePatch(paused, '2026-11-04')).toEqual({ active: true, next_date: '2026-11-30' })
    expect(togglePatch(rule({ active: false, next_date: '2026-10-04' }), '2026-11-04')).toEqual({ active: true, next_date: '2026-11-04' })
  })
  it('resuming before the next date leaves it alone', () => {
    expect(togglePatch(rule({ active: false, next_date: '2026-12-01' }), '2026-11-04')).toEqual({ active: true, next_date: '2026-12-01' })
  })
})

describe('presentation', () => {
  it('status, title and order', () => {
    expect(ruleStatus(rule())).toBe('active')
    expect(ruleStatus(rule({ active: false }))).toBe('paused')
    expect(ruleTitle(rule({ note: '' }))).toBe('Bills')
    const sorted = sortRules([rule({ id: 'ended', end_date: '2026-10-01' }), rule({ id: 'paused', active: false, next_date: '2026-01-01' }), rule({ id: 'b', next_date: '2026-12-01' }), rule({ id: 'a', next_date: '2026-11-10' })])
    expect(sorted.map((r) => r.id)).toEqual(['a', 'b', 'paused', 'ended'])
    expect(ruleSchedule(rule({ next_date: '2026-12-01' }))).toBe('Next 1 Dec 2026')
    expect(ruleSchedule(rule({ next_date: '2026-12-01', end_date: '2027-03-31' }))).toBe('Next 1 Dec 2026 · until 31 Mar 2027')
    expect(ruleSchedule(rule({ active: false }))).toBe('Paused')
    expect(ruleSchedule(rule({ next_date: '2026-12-01', end_date: '2026-11-15', active: false }))).toBe('Ended 15 Nov 2026')
  })
})

describe('Upcoming widget', () => {
  const opts = { today: '2026-11-04', tz: 'Asia/Kolkata', nowMs: Date.parse('2026-11-04T06:30:00Z') }
  it('shows the next charge of a rule inside the window, with its amount', () => {
    const { items } = upcomingItems({ recurring: [rule({ next_date: '2026-11-08' })] }, opts)
    expect(items).toEqual([{ id: 'r1', kind: 'recurring', refId: 'r1', title: 'Rent', date: '2026-11-08', amount_paise: 2500000, txnType: 'expense' }])
  })
  it('a charge due today still shows until it posts', () => {
    expect(upcomingItems({ recurring: [rule({ next_date: '2026-11-04' })] }, opts).items).toHaveLength(1)
  })
  it('leaves out paused and ended rules and charges past the window', () => {
    const recurring = [rule({ id: 'off', next_date: '2026-11-05', active: false }), rule({ id: 'over', next_date: '2026-11-05', end_date: '2026-11-01' }), rule({ id: 'far', next_date: '2026-12-01' })]
    expect(upcomingItems({ recurring }, opts).items).toEqual([])
  })
  it('a daily rule takes one row, not seven', () => {
    expect(upcomingItems({ recurring: [rule({ next_date: '2026-11-05', frequency: 'daily' })] }, opts).items).toHaveLength(1)
  })
  it('the dashboard passes its rules through, and works without any', () => {
    const base = { tasks: [], studySessions: [], workouts: [], healthLogs: [], transactions: [], applications: [], history: [], interviews: [], goals: [], milestones: [], habits: [], habitLogs: [], budgets: [], reminders: [] }
    const settings = { timezone: 'Asia/Kolkata', week_starts_on: 1, monthly_budget_paise: 0, currency: 'INR', score_weights: { learning: 25, career: 25, fitness: 20, habits: 15, health: 15 }, workout_plan: {} }
    const on = (d) => dashboardData(d, { settings, today: opts.today, nowMs: opts.nowMs }).upcoming.items.map((x) => x.kind)
    expect(on(base)).toEqual([])
    expect(on({ ...base, recurringRules: [rule({ next_date: '2026-11-08' })] })).toEqual(['recurring'])
  })
})
