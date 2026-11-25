import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_TEMPLATES,
  calendarMarkers,
  challengeAnalytics,
  challengeCards,
  challengeFromTemplate,
  challengeProblems,
  challengeProgress,
  challengeToday,
  checkinProblem,
  dayState,
  effectiveCheckins,
  effectiveMilestones,
  historyEntries,
  milestoneStatus,
  monthCells,
  normalizeMilestones,
  openPause,
  pauseWindows,
  rhythmText,
  settlement,
  templateFromChallenge,
  totalForecast,
  weekBlocks,
  withPause,
  withResume,
} from '../src/challenges'

const base = {
  id: 'c1',
  title: 'Read',
  description: '',
  kind: 'daily',
  target: 1,
  unit: '',
  start_date: '2026-11-01',
  end_date: '2026-11-10',
  status: 'active',
  category: 'Learning',
  color: '#8B5CF6',
  habit_id: null,
  milestones: [],
  pauses: [],
  created_at: '2026-11-01T00:00:00Z',
}
const daily = (o = {}) => ({ ...base, ...o })
const weekly = (o = {}) => ({ ...base, id: 'w1', kind: 'weekly', target: 3, start_date: '2026-11-02', end_date: '2026-11-22', ...o }) // 3 weeks, Mon..Sun
const total = (o = {}) => ({ ...base, id: 't1', kind: 'total', target: 100, unit: 'pages', start_date: '2026-11-01', end_date: '2026-11-10', ...o })
const ck = (c, day, amount = 1) => ({ id: `${c.id}-${day}`, challenge_id: c.id, checkin_date: day, amount, note: '', evidence: [] })
const days = (c, ...ds) => ds.map((d) => ck(c, `2026-11-${d}`))

describe('daily challenges', () => {
  it('count one unit per fully completed day', () => {
    const c = daily()
    const p = challengeProgress(c, days(c, '01', '02', '03'), [], '2026-11-04')
    expect(p.units).toBe(3)
    expect(p.goal).toBe(10)
    expect(p.pct).toBe(30)
    expect(p.phase).toBe('running')
  })
  it('need the full daily target: a partial day is not done and does not count', () => {
    const c = daily({ target: 20, unit: 'pages' })
    const checkins = [ck(c, '2026-11-01', 20), ck(c, '2026-11-02', 12), ck(c, '2026-11-03', 25)]
    const p = challengeProgress(c, checkins, [], '2026-11-04')
    expect(p.units).toBe(2) // 20 and 25 count, 12 does not
    expect(dayState(c, '2026-11-02', p.map, '2026-11-04')).toBe('partial')
    expect(dayState(c, '2026-11-03', p.map, '2026-11-04')).toBe('done')
  })
  it('only reports 100% when every day is done, never earlier by rounding', () => {
    const c = daily({ end_date: '2026-11-03' })
    expect(challengeProgress(c, days(c, '01', '02'), [], '2026-11-03').pct).toBe(66)
    const p = challengeProgress(c, days(c, '01', '02', '03'), [], '2026-11-03')
    expect(p.pct).toBe(100)
    const near = daily({ start_date: '2026-11-01', end_date: '2026-12-10' }) // 40 days
    expect(challengeProgress(near, days(near, '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30'), [], '2026-12-01').pct).toBe(75)
  })
  it('never lets 99.6% round up to 100', () => {
    const c = daily({ start_date: '2026-01-01', end_date: '2026-09-07' }) // 250 days
    const all = Array.from({ length: 249 }, (_, i) => ck(c, new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)))
    const p = challengeProgress(c, all, [], '2026-09-07')
    expect(p.units).toBe(249)
    expect(p.pct).toBe(99)
  })
  it('does not call today missed until it has passed', () => {
    const c = daily()
    const p = challengeProgress(c, days(c, '01', '02'), [], '2026-11-03')
    expect(p.pace).toBe('on_track')
    expect(p.missed).toBe(0)
    expect(dayState(c, '2026-11-03', p.map, '2026-11-03')).toBe('open')
  })
  it('is ahead once today is done, behind after a missed day', () => {
    const c = daily()
    expect(challengeProgress(c, days(c, '01', '02', '03'), [], '2026-11-03').pace).toBe('ahead')
    const p = challengeProgress(c, days(c, '01', '03'), [], '2026-11-04')
    expect(p.pace).toBe('behind')
    expect(p.missed).toBe(1)
    expect(dayState(c, '2026-11-02', p.map, '2026-11-04')).toBe('missed')
  })
  it('tracks current and best streaks; today being open does not break the run', () => {
    const c = daily()
    const p = challengeProgress(c, days(c, '01', '02', '03', '05', '06'), [], '2026-11-07')
    expect(p.bestStreak).toBe(3)
    expect(p.streak).toBe(2)
    expect(challengeProgress(c, days(c, '05', '06'), [], '2026-11-07').streak).toBe(2)
    expect(challengeProgress(c, days(c, '04', '05'), [], '2026-11-07').streak).toBe(0) // yesterday (6th) missed
  })
  it('knows a challenge that has not started or has ended', () => {
    const c = daily()
    expect(challengeProgress(c, [], [], '2026-10-30').phase).toBe('upcoming')
    expect(challengeProgress(c, [], [], '2026-10-30').pace).toBe('upcoming')
    expect(challengeProgress(c, [], [], '2026-10-30').daysLeft).toBe(10) // the whole challenge is still ahead
    const ended = challengeProgress(c, days(c, '01'), [], '2026-11-12')
    expect(ended.phase).toBe('ended')
    expect(ended.daysLeft).toBe(0)
  })
  it('ignores check-ins outside the challenge dates and from other challenges', () => {
    const c = daily()
    const stray = [ck(c, '2026-10-31'), ck(c, '2026-11-11'), { ...ck(c, '2026-11-02'), challenge_id: 'other' }, ck(c, '2026-11-02')]
    expect(challengeProgress(c, stray, [], '2026-11-05').units).toBe(1)
  })
})

describe('paused days', () => {
  const paused = (o = {}) => daily({ pauses: [{ from: '2026-11-03', to: '2026-11-05' }], ...o })
  it('are neutral: not expected, never missed, and shrink the goal', () => {
    const c = paused()
    const p = challengeProgress(c, days(c, '01', '02', '06'), [], '2026-11-07')
    expect(p.goal).toBe(7)
    expect(p.missed).toBe(0)
    expect(p.pace).toBe('on_track')
    expect(dayState(c, '2026-11-04', p.map, '2026-11-07')).toBe('paused')
  })
  it('keep the streak alive across the break', () => {
    const c = paused()
    expect(challengeProgress(c, days(c, '01', '02', '06', '07'), [], '2026-11-07').streak).toBe(4)
  })
  it('stack through an open pause: pausing today and resuming today leaves nothing behind', () => {
    const c = daily()
    const open = { ...c, pauses: withPause(c, '2026-11-04') }
    expect(openPause(open)).toEqual({ from: '2026-11-04', to: null })
    expect(withPause(open, '2026-11-05')).toEqual(open.pauses) // a second pause is a no-op
    expect(withResume(open, '2026-11-04')).toEqual([])
    expect(withResume(open, '2026-11-07')).toEqual([{ from: '2026-11-04', to: '2026-11-06' }])
  })
  it('drops invalid windows', () => {
    expect(pauseWindows({ pauses: [{ from: 'nope', to: null }, { from: '2026-11-05', to: '2026-11-04' }, { from: '2026-11-02', to: '2026-11-03' }] })).toEqual([{ from: '2026-11-02', to: '2026-11-03' }])
  })
  it('refuse a check-in on a paused day', () => {
    const c = paused()
    expect(checkinProblem(c, '2026-11-04', '2026-11-07', effectiveCheckins(c, [], []))).toMatch(/paused/)
  })
})

describe('weekly challenges', () => {
  it('count check-in days up to each week’s need, so extra days do not carry over', () => {
    const c = weekly() // weeks start 2, 9, 16 Nov
    const checkins = days(c, '02', '03', '04', '05', '09') // 4 days in week 1 (need 3), 1 in week 2
    const p = challengeProgress(c, checkins, [], '2026-11-10')
    expect(p.goal).toBe(9)
    expect(p.units).toBe(4) // 3 + 1
    const w = weekBlocks(c, p.map, '2026-11-10')
    expect(w.map((b) => b.state)).toEqual(['met', 'open', 'upcoming'])
    expect(w[0].extra).toBe(1)
  })
  it('mark a week short when it can no longer be met, and report the shortfall', () => {
    const c = weekly()
    const w = weekBlocks(c, effectiveCheckins(c, days(c, '02'), []), '2026-11-08') // Sunday of week 1: 1 done, only one day left
    expect(w[0].state).toBe('short')
    const p = challengeProgress(c, days(c, '02'), [], '2026-11-10')
    expect(p.pace).toBe('behind')
    expect(p.behindBy).toBe(2)
  })
  it('streak counts consecutive met weeks; the open week neither breaks nor extends it', () => {
    const c = weekly()
    const checkins = days(c, '02', '03', '04', '09', '10', '11')
    const p = challengeProgress(c, checkins, [], '2026-11-16')
    expect(p.streak).toBe(2)
    expect(p.bestStreak).toBe(2)
    const broken = challengeProgress(c, days(c, '02', '03', '04'), [], '2026-11-17')
    expect(broken.streak).toBe(0) // week 2 was missed
  })
  it('a shorter last week needs no more than its days', () => {
    const c = weekly({ start_date: '2026-11-02', end_date: '2026-11-16', target: 5 }) // last block is one day
    const w = weekBlocks(c, new Map(), '2026-11-02')
    expect(w[2]).toMatchObject({ from: '2026-11-16', to: '2026-11-16', need: 1 })
  })
})

describe('total challenges', () => {
  it('add up the amounts', () => {
    const c = total()
    const p = challengeProgress(c, [ck(c, '2026-11-01', 30), ck(c, '2026-11-02', 25)], [], '2026-11-03')
    expect(p.units).toBe(55)
    expect(p.pct).toBe(55)
    expect(p.remaining).toBe(45)
  })
  it('stay at 99% until the target is truly met, then show 100% even when exceeded', () => {
    const c = total({ target: 1000 })
    expect(challengeProgress(c, [ck(c, '2026-11-01', 999)], [], '2026-11-02').pct).toBe(99)
    expect(challengeProgress(c, [ck(c, '2026-11-01', 1500)], [], '2026-11-02').pct).toBe(100)
  })
  it('compare against an even spread to say ahead / on track / behind', () => {
    const c = total() // 10 days, 10 per day
    expect(challengeProgress(c, [ck(c, '2026-11-01', 5)], [], '2026-11-04').pace).toBe('behind') // should have 30 by end of the 3rd
    expect(challengeProgress(c, [ck(c, '2026-11-01', 30)], [], '2026-11-04').pace).toBe('on_track')
    expect(challengeProgress(c, [ck(c, '2026-11-01', 40)], [], '2026-11-04').pace).toBe('ahead')
  })
  it('forecasts what is needed per day and when the current pace would finish', () => {
    const c = total()
    const p = challengeProgress(c, [ck(c, '2026-11-01', 20), ck(c, '2026-11-02', 20)], [], '2026-11-03')
    const f = totalForecast(c, p, '2026-11-03')
    expect(f.perDay).toBe(Math.ceil(60 / 8)) // 8 counted days left, from the 3rd to the 10th
    expect(f.finishOn).toBe('2026-11-08') // 40 units in 3 days = 13.3/day; 60 more needs 5 days from the 3rd
    expect(f.onTime).toBe(true)
  })
})

describe('linked habit', () => {
  const habitLog = (d, status = 'done') => ({ habit_id: 'h1', log_date: d, status })
  it('lends its done days to a daily challenge, once each', () => {
    const c = daily({ habit_id: 'h1' })
    const map = effectiveCheckins(c, [ck(c, '2026-11-02')], [habitLog('2026-11-01'), habitLog('2026-11-02'), habitLog('2026-11-03', 'skipped')])
    expect([...map.keys()].sort()).toEqual(['2026-11-01', '2026-11-02'])
    expect(map.get('2026-11-01').source).toBe('habit')
    expect(map.get('2026-11-02').source).toBe('checkin') // a real check-in wins
  })
  it('gives a habit day the full daily target and refuses a second check-in for it', () => {
    const c = daily({ habit_id: 'h1', target: 20 })
    const map = effectiveCheckins(c, [], [habitLog('2026-11-01')])
    expect(challengeProgress(c, [], [habitLog('2026-11-01')], '2026-11-02').units).toBe(1)
    expect(checkinProblem(c, '2026-11-01', '2026-11-02', map)).toMatch(/linked habit/)
  })
  it('is ignored for total challenges and for other habits', () => {
    expect(effectiveCheckins(total({ habit_id: 'h1' }), [], [habitLog('2026-11-01')]).size).toBe(0)
    expect(effectiveCheckins(daily({ habit_id: 'h2' }), [], [habitLog('2026-11-01')]).size).toBe(0)
  })
})

describe('check-in rules', () => {
  const c = daily()
  const none = effectiveCheckins(c, [], [])
  it('allow today and any earlier day inside the challenge', () => {
    expect(checkinProblem(c, '2026-11-04', '2026-11-04', none)).toBeNull()
    expect(checkinProblem(c, '2026-11-02', '2026-11-04', none)).toBeNull()
  })
  it('refuse a second check-in for the same day', () => {
    const map = effectiveCheckins(c, days(c, '04'), [])
    expect(checkinProblem(c, '2026-11-04', '2026-11-04', map)).toMatch(/already checked in/)
  })
  it('refuse the future, outside dates, bad amounts and closed or paused challenges', () => {
    expect(checkinProblem(c, '2026-11-05', '2026-11-04', none)).toMatch(/not started/)
    expect(checkinProblem(c, '2026-10-31', '2026-11-04', none)).toMatch(/before/)
    expect(checkinProblem(c, '2026-11-11', '2026-11-12', none)).toMatch(/after/)
    expect(checkinProblem(c, '2026-11-04', '2026-11-04', none, 0)).toMatch(/whole amount/)
    expect(checkinProblem(c, '2026-11-04', '2026-11-04', none, 1.5)).toMatch(/whole amount/)
    expect(checkinProblem({ ...c, status: 'paused' }, '2026-11-04', '2026-11-04', none)).toMatch(/Resume/)
    expect(checkinProblem({ ...c, status: 'completed' }, '2026-11-04', '2026-11-04', none)).toMatch(/completed/)
    expect(checkinProblem({ ...c, status: 'cancelled' }, '2026-11-04', '2026-11-04', none)).toMatch(/cancelled/)
    expect(checkinProblem(c, 'not-a-day', '2026-11-04', none)).toMatch(/valid day/)
  })
})

describe('timezones', () => {
  // 2026-11-10 19:30 UTC is already the 11th in Kolkata (01:00) and still the 10th in Los Angeles (11:30).
  const instant = new Date('2026-11-10T19:30:00Z')
  it('puts the same instant on different days for different people', () => {
    expect(challengeToday('Asia/Kolkata', instant)).toBe('2026-11-11')
    expect(challengeToday('America/Los_Angeles', instant)).toBe('2026-11-10')
    expect(challengeToday('UTC', instant)).toBe('2026-11-10')
  })
  it('lets a check-in for the local "today" through and refuses the next local day', () => {
    const c = daily()
    const none = effectiveCheckins(c, [], [])
    expect(checkinProblem(c, '2026-11-10', challengeToday('America/Los_Angeles', instant), none)).toBeNull()
    expect(checkinProblem(c, '2026-11-11', challengeToday('America/Los_Angeles', instant), none)).toMatch(/not started/)
  })
  it('decides "missed" from the person’s own midnight', () => {
    const c = daily()
    const kolkata = challengeProgress(c, [], [], challengeToday('Asia/Kolkata', instant))
    const la = challengeProgress(c, [], [], challengeToday('America/Los_Angeles', instant))
    expect(kolkata.missed).toBe(10) // the 11th: every earlier day (1-10) is over
    expect(la.missed).toBe(9)
  })
  it('handles a daylight-saving change without skipping or doubling a day', () => {
    // US clocks went back on 2026-11-01: that Sunday has 25 hours.
    expect(challengeToday('America/New_York', new Date('2026-11-01T04:30:00Z'))).toBe('2026-11-01') // 00:30 EDT
    expect(challengeToday('America/New_York', new Date('2026-11-02T04:30:00Z'))).toBe('2026-11-01') // 23:30 EST, still the 1st
    expect(challengeToday('America/New_York', new Date('2026-11-02T05:30:00Z'))).toBe('2026-11-02')
  })
})

describe('milestones', () => {
  it('default to quarters, and custom ones are cleaned', () => {
    expect(effectiveMilestones(daily()).map((m) => m.pct)).toEqual([25, 50, 75, 100])
    expect(normalizeMilestones([{ pct: 50, title: ' Half ' }, { pct: 50, title: 'dup' }, { pct: 0, title: 'x' }, { pct: 101 }, { pct: 20 }])).toEqual([
      { pct: 20, title: '20% reached' },
      { pct: 50, title: 'Half' },
    ])
    expect(effectiveMilestones(daily({ milestones: [{ pct: 40, title: 'Warm' }] }))).toEqual([{ pct: 40, title: 'Warm' }])
  })
  it('are reached on the day the running total crossed them', () => {
    const c = total() // target 100
    const p = challengeProgress(c, [ck(c, '2026-11-01', 20), ck(c, '2026-11-02', 35), ck(c, '2026-11-04', 50)], [], '2026-11-05')
    const m = milestoneStatus(c, p)
    expect(m.map((x) => [x.pct, x.reached, x.reachedOn])).toEqual([
      [25, true, '2026-11-02'],
      [50, true, '2026-11-02'],
      [75, true, '2026-11-04'],
      [100, true, '2026-11-04'],
    ])
  })
  it('stay unreached until the units are there', () => {
    const c = daily()
    const p = challengeProgress(c, days(c, '01', '02'), [], '2026-11-03')
    expect(milestoneStatus(c, p).map((x) => x.reached)).toEqual([false, false, false, false])
    const p3 = challengeProgress(c, days(c, '01', '02', '03'), [], '2026-11-04')
    expect(milestoneStatus(c, p3)[0]).toMatchObject({ pct: 25, need: 3, reached: true, reachedOn: '2026-11-03' })
  })
})

describe('settlement', () => {
  it('completes a total challenge the moment the target is reached', () => {
    const c = total()
    expect(settlement(c, [ck(c, '2026-11-01', 99)], [], '2026-11-02')).toBeNull()
    expect(settlement(c, [ck(c, '2026-11-01', 100)], [], '2026-11-02')).toEqual({ status: 'completed', final_pct: 100 })
  })
  it('completes a daily challenge only after its last day, with what was achieved', () => {
    const c = daily()
    const all = days(c, '01', '02', '03', '04', '05', '06', '07', '08', '09', '10')
    expect(settlement(c, all, [], '2026-11-10')).toBeNull() // the last day is still open for check-ins
    expect(settlement(c, all, [], '2026-11-11')).toEqual({ status: 'completed', final_pct: 100 })
    expect(settlement(c, days(c, '01', '02', '03', '04', '05'), [], '2026-11-11')).toEqual({ status: 'completed', final_pct: 50 })
  })
  it('does not complete early because an open pause shrank the goal', () => {
    const c = daily({ pauses: [{ from: '2026-11-04', to: null }] })
    expect(settlement(c, days(c, '01', '02', '03'), [], '2026-11-05')).toBeNull()
  })
  it('leaves closed challenges alone', () => {
    expect(settlement({ ...daily(), status: 'cancelled' }, [], [], '2026-12-01')).toBeNull()
    expect(settlement({ ...daily(), status: 'completed' }, [], [], '2026-12-01')).toBeNull()
  })
  it('settles a paused challenge that ran out of time', () => {
    expect(settlement(daily({ status: 'paused', pauses: [{ from: '2026-11-04', to: null }] }), days(daily(), '01'), [], '2026-11-12')).toMatchObject({ status: 'completed' })
  })
})

describe('validation', () => {
  const ok = { title: 'Run', kind: 'daily', target: 1, unit: '', start_date: '2026-11-01', end_date: '2026-11-30', color: '#8B5CF6' }
  it('accepts a good challenge', () => expect(challengeProblems(ok)).toEqual({}))
  it('names every problem', () => {
    const bad = challengeProblems({ title: '  ', kind: 'monthly', target: 0, start_date: 'x', end_date: '2026-11-30', color: 'red' })
    expect(Object.keys(bad).sort()).toEqual(['color', 'kind', 'start_date', 'target', 'title'])
  })
  it('checks the dates against each other and the longest allowed run', () => {
    expect(challengeProblems({ ...ok, end_date: '2026-10-31' }).end_date).toMatch(/before/)
    expect(challengeProblems({ ...ok, end_date: '2029-01-01' }).end_date).toMatch(/two years/)
    expect(challengeProblems({ ...ok, kind: 'weekly', target: 3, end_date: '2026-11-04' }).end_date).toMatch(/full week/)
  })
  it('keeps weekly targets within a week and habits off total challenges', () => {
    expect(challengeProblems({ ...ok, kind: 'weekly', target: 8 }).target).toMatch(/7 days/)
    expect(challengeProblems({ ...ok, kind: 'total', target: 10, habit_id: 'h1' }).habit_id).toBeTruthy()
    expect(challengeProblems({ ...ok, target: 1.5 }).target).toBeTruthy()
  })
})

describe('templates', () => {
  it('fill a challenge from a built-in template, ending on the right day', () => {
    const t = BUILT_IN_TEMPLATES.find((x) => x.key === 'read-30')
    const c = challengeFromTemplate(t, '2026-12-01')
    expect(c).toMatchObject({ title: '30 days of reading', kind: 'daily', target: 20, unit: 'pages', start_date: '2026-12-01', end_date: '2026-12-30', template_key: 'read-30' })
  })
  it('all built-ins are valid challenges', () => {
    for (const t of BUILT_IN_TEMPLATES) expect(challengeProblems(challengeFromTemplate(t, '2026-12-01')), t.key).toEqual({})
  })
  it('turn a challenge into a reusable template and back, keeping its length', () => {
    const c = weekly({ title: 'Gym', milestones: [{ pct: 50, title: 'Half' }] })
    const t = templateFromChallenge(c)
    expect(t).toMatchObject({ name: 'Gym', kind: 'weekly', target: 3, duration_days: 21, milestones: [{ pct: 50, title: 'Half' }] })
    const again = challengeFromTemplate(t, '2027-01-04')
    expect(again.end_date).toBe('2027-01-24')
  })
})

describe('lists, history and analytics', () => {
  const a = daily({ id: 'a', title: 'A' })
  const b = total({ id: 'b', status: 'completed', final_pct: 100, completed_at: '2026-11-09T10:00:00Z' })
  const x = daily({ id: 'x', status: 'cancelled', cancelled_at: '2026-11-05T10:00:00Z' })
  const d = daily({ id: 'd', status: 'completed', final_pct: 60, completed_at: '2026-11-11T10:00:00Z' })
  const all = [a, b, x, d]
  const checkins = [...days(a, '01', '02'), ck(b, '2026-11-02', 100), ck(d, '2026-11-01')]
  it('say what each finished challenge achieved, newest first', () => {
    const h = historyEntries(challengeCards(all, checkins, [], '2026-11-12'))
    expect(h.map((e) => [e.challenge.id, e.outcome, e.pct])).toEqual([['d', 'finished', 60], ['b', 'achieved', 100], ['x', 'cancelled', 0]])
  })
  it('summarise everything', () => {
    const s = challengeAnalytics(all, checkins, [], '2026-11-12')
    expect(s).toMatchObject({ total: 4, active: 1, completed: 2, cancelled: 1, achieved: 1, successRate: 50, checkins: 4, activeDays: 2, checkedInToday: 0 })
    expect(s.activity).toHaveLength(8)
    expect(s.activity.slice(-3).map((w) => w.count)).toEqual([2, 2, 0]) // 1 Nov is in the week of 26 Oct; 2 Nov starts the next week
    expect(s.categories[0]).toMatchObject({ name: 'Learning' })
  })
  it('handle having no challenges at all', () => {
    const s = challengeAnalytics([], [], [], '2026-11-12')
    expect(s).toMatchObject({ total: 0, active: 0, successRate: null, averageProgress: null, bestStreak: 0 })
  })
})

describe('calendar', () => {
  it('draws one marker per counted day of a running challenge, flagged done or missed', () => {
    const c = daily({ pauses: [{ from: '2026-11-04', to: '2026-11-04' }] })
    const m = calendarMarkers([c], days(c, '01', '03'), [], { from: '2026-11-01', to: '2026-11-06', today: '2026-11-06' })
    expect(m.map((x) => [x.day, x.state])).toEqual([
      ['2026-11-01', 'done'],
      ['2026-11-02', 'missed'],
      ['2026-11-03', 'done'],
      ['2026-11-05', 'missed'],
      ['2026-11-06', 'open'],
    ])
    expect(m[0].first).toBe(true)
  })
  it('stays inside the visible range, and skips closed challenges', () => {
    const c = daily()
    expect(calendarMarkers([c], [], [], { from: '2026-11-08', to: '2026-11-20', today: '2026-11-08' }).map((x) => x.day)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10'])
    expect(calendarMarkers([{ ...c, status: 'completed' }], [], [], { from: '2026-11-01', to: '2026-11-10', today: '2026-11-08' })).toEqual([])
  })
  it('lays a month out in weeks with leading blanks', () => {
    const c = daily()
    const cells = monthCells(c, new Map(), '2026-11-05', '2026-11-15', 1) // 1 Nov 2026 is a Sunday: six blanks on a Monday-first grid
    expect(cells.slice(0, 6).every((x) => x === null)).toBe(true)
    expect(cells[6].day).toBe('2026-11-01')
    expect(cells.filter(Boolean)).toHaveLength(30)
  })
})

describe('wording', () => {
  it('describes the rhythm', () => {
    expect(rhythmText(daily())).toBe('Every day')
    expect(rhythmText(daily({ target: 20, unit: 'pages' }))).toBe('20 pages every day')
    expect(rhythmText(weekly({ target: 1 }))).toBe('1 day a week')
    expect(rhythmText(total({ target: 200000, unit: 'steps' }))).toMatch(/steps in total/)
  })
})

describe('the calendar page items', () => {
  it('turn challenge markers into lane items that open the challenge and tick when done', async () => {
    const { buildCalendarItems } = await import('../src/calendar')
    const c = daily({ title: 'Read', color: '#10B981', pauses: [{ from: '2026-11-04', to: '2026-11-04' }] })
    const items = buildCalendarItems({ challenges: [c], challengeCheckins: days(c, '01', '03') }, { from: '2026-11-01', to: '2026-11-06', tz: 'Asia/Kolkata', today: '2026-11-06', nowMs: Date.UTC(2026, 10, 6) })
    const mine = items.filter((i) => i.sourceType === 'challenge')
    expect(mine.map((i) => [i.date, i.done, i.overdue])).toEqual([
      ['2026-11-01', true, false],
      ['2026-11-02', false, true],
      ['2026-11-03', true, false],
      ['2026-11-05', false, true],
      ['2026-11-06', false, false],
    ])
    expect(mine[0]).toMatchObject({ kind: 'deadline', title: 'Challenge starts: Read', color: '#10B981', href: '/challenges?c=c1', allDay: true })
    expect(mine[1].title).toBe('Challenge: Read')
  })
  it('add nothing when there are no challenges', async () => {
    const { buildCalendarItems } = await import('../src/calendar')
    expect(buildCalendarItems({}, { from: '2026-11-01', to: '2026-11-30', tz: 'Asia/Kolkata', today: '2026-11-06' })).toEqual([])
  })
})
