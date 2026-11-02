import { describe, expect, it } from 'vitest'
import { FOCUS_MODE_LABEL, focusLeft, focusMinutesFor, focusSessionName, isFinished, isValidFocusMinutes, pauseFocus, parseFocusTarget, resumeFocus, spentSeconds, startFocus } from '../src/focusTimer'
import { fmtHms, parseRevisionDates, parseStudyTarget, sessionName, studyOverview, topicRevision, isGoalOverdue } from '../src/learning'
import { daysLeftLabel, goalList, goalsSummary, goalSourceLabel, orderedMilestones, periodLabel } from '../src/goals'

const T0 = 1_700_000_000_000
describe('focus timer state machine', () => {
  const cfg = { mode: 'focus', plannedMinutes: 25, taskId: null, topicId: null, label: '' }
  it('counts down from an absolute end time and finishes at zero', () => {
    const t = startFocus(cfg, T0)
    expect(focusLeft(t, T0)).toBe(1500)
    expect(focusLeft(t, T0 + 60_000)).toBe(1440)
    expect(isFinished(t, T0 + 1499_000)).toBe(false)
    expect(isFinished(t, T0 + 1500_000)).toBe(true)
    expect(focusLeft(t, T0 + 99_999_999)).toBe(0) // app was closed for hours → still finished, never negative
  })
  it('pauses and resumes without losing or gaining time', () => {
    const t = startFocus(cfg, T0)
    const p = pauseFocus(t, T0 + 600_000)
    expect(p.endsAt).toBeNull()
    expect(focusLeft(p, T0 + 9_000_000)).toBe(900) // clock keeps moving, paused value does not
    const r = resumeFocus(p, T0 + 9_000_000)
    expect(focusLeft(r, T0 + 9_000_000)).toBe(900)
    expect(focusLeft(r, T0 + 9_060_000)).toBe(840)
    expect(pauseFocus(p, T0)).toBe(p) // idempotent
    expect(resumeFocus(r, T0)).toBe(r)
  })
  it('reports seconds spent when stopped early', () => {
    const t = startFocus(cfg, T0)
    expect(spentSeconds(t, T0 + 300_000)).toBe(300)
    expect(spentSeconds(null, T0)).toBe(0)
  })
  it('resolves minutes, targets, validity and names', () => {
    const prefs = { short_break: 5, long_break: 15 }
    expect(focusMinutesFor('focus', '50', '', prefs)).toBe(50)
    expect(focusMinutesFor('focus', 'custom', '30', prefs)).toBe(30)
    expect(focusMinutesFor('long_break', '25', '', prefs)).toBe(15)
    expect([0, 1, 240, 241, 2.5, NaN].map(isValidFocusMinutes)).toEqual([false, true, true, false, false, false])
    expect(parseFocusTarget('task:abc')).toEqual({ taskId: 'abc', topicId: null })
    expect(parseFocusTarget('topic:xyz')).toEqual({ taskId: null, topicId: 'xyz' })
    expect(parseFocusTarget('')).toEqual({ taskId: null, topicId: null })
    expect(focusSessionName({ task_id: 't1' }, [{ id: 't1', title: 'Write' }], [])).toBe('Write')
    expect(focusSessionName({ label: 'x' }, [], [])).toBe('x')
    expect(FOCUS_MODE_LABEL.short_break).toBe('Short break')
  })
})

describe('study overview', () => {
  const S = (o) => ({ id: o.id, status: 'completed', duration_seconds: 3600, problems_solved: 0, goal_id: null, topic_id: null, created_at: '2026-11-01T00:00:00Z', ...o })
  const sessions = [
    S({ id: 'a', session_date: '2026-11-02', problems_solved: 3 }), S({ id: 'b', session_date: '2026-11-01', duration_seconds: 1800 }),
    S({ id: 'c', session_date: '2026-10-20' }), S({ id: 'run', status: 'running', duration_seconds: null, session_date: '2026-11-02' }),
    S({ id: 'gone', status: 'discarded', session_date: '2026-11-02' }),
  ]
  const goals = [{ id: 'g1', status: 'active' }, { id: 'g2', status: 'completed' }]
  it('counts only completed sessions, within the user-week', () => {
    const o = studyOverview(sessions, goals, '2026-11-02', 1) // Monday
    expect(o.todayMin).toBe(60)
    expect(o.weekMin).toBe(60) // Mon 2 Nov only; Sunday 1 Nov belongs to the previous week
    expect(o.running.id).toBe('run')
    expect(o.problems).toBe(3)
    expect(o.activeGoals).toBe(1)
    expect(o.completedGoals).toBe(1)
    expect(o.history.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(studyOverview(sessions, goals, '2026-11-02', 0).weekMin).toBe(90) // Sunday-start week includes 1 Nov
    expect(o.week).toHaveLength(7)
  })
  it('parses targets, names and revision dates', () => {
    expect(parseStudyTarget('g:g1', [{ id: 'g1', topic_id: 't9' }])).toEqual({ goal_id: 'g1', topic_id: 't9' })
    expect(parseStudyTarget('t:t2', [])).toEqual({ goal_id: null, topic_id: 't2' })
    expect(parseStudyTarget('', [])).toEqual({ goal_id: null, topic_id: null })
    expect(sessionName({ goal_id: 'g1' }, [{ id: 'g1', title: 'React' }], [])).toBe('React')
    expect(sessionName({}, [], [])).toBe('General study')
    expect(parseRevisionDates('2026-11-09, 2026-11-02 2026-11-09')).toEqual(['2026-11-02', '2026-11-09'])
    expect(() => parseRevisionDates('2026-13-40')).toThrow(/isn't a valid date/)
    expect(fmtHms(3725)).toBe('01:02:05')
    expect(topicRevision({ revision_dates: ['2026-11-02', '2026-11-09'] }, '2026-11-02')).toEqual({ due: true, next: '2026-11-02' })
    expect(topicRevision({ revision_dates: [] }, '2026-11-02')).toEqual({ due: false, next: null })
    expect(isGoalOverdue({ due_date: '2026-11-01', status: 'active' }, '2026-11-02')).toBe(true)
  })
})

describe('goals lists and summary', () => {
  const G = (o) => ({ status: 'active', period: 'monthly', due_date: null, target_minutes: 0, manual_progress: 0, ...o })
  const goals = [G({ id: 'a', due_date: '2026-12-01' }), G({ id: 'b', due_date: '2026-11-01', manual_progress: 40 }), G({ id: 'c', status: 'completed' }), G({ id: 'd', status: 'archived' }), G({ id: 'e', period: 'weekly' })]
  const ms = [{ id: 'm1', goal_id: 'a', done: true, position: 1, created_at: 'b' }, { id: 'm2', goal_id: 'a', done: false, position: 0, created_at: 'a' }]
  it('sorts by due date (undated last) and filters by tab and period', () => {
    expect(goalList(goals, ms, [], { tab: 'active' }).map((r) => r.g.id)).toEqual(['b', 'a', 'e'])
    expect(goalList(goals, ms, [], { tab: 'active', period: 'weekly' }).map((r) => r.g.id)).toEqual(['e'])
    expect(goalList(goals, ms, [], { tab: 'history' }).map((r) => r.g.id)).toEqual(['c', 'd'])
  })
  it('summarises with milestone-driven progress', () => {
    const s = goalsSummary(goals, ms, [], '2026-11-02')
    expect(s).toMatchObject({ active: 3, overdue: 1, completed: 1, completedShare: 50, milestonesDone: 1, milestonesTotal: 2 })
    expect(s.avgProgress).toBe(30) // a:50 (1/2 milestones), b:40 manual, e:0 manual → round(90/3)
    expect(goalsSummary([], [], [], '2026-11-02').avgProgress).toBeNull()
  })
  it('labels and orders milestones', () => {
    expect(orderedMilestones('a', ms).map((m) => m.id)).toEqual(['m2', 'm1'])
    expect(goalSourceLabel({ source: 'milestones', done: 1, total: 2 })).toBe('1/2 milestones')
    expect(periodLabel('weekly')).toBe('Weekly')
    expect([-3, 0, 5].map(daysLeftLabel)).toEqual(['3d overdue', 'Due today', '5d left'])
  })
})
