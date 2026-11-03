import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { studyOverview } from '@lifetrack/core/learning'
import { goalList, goalsSummary } from '@lifetrack/core/goals'
import { blankGoal, blankLearningGoal, blankSession, blankTopic, goalFormSchema, goalToPayload, learningGoalFormSchema, learningGoalToPayload, milestoneFormSchema, sessionFormSchema, sessionFormToPayload, topicFormSchema, topicToPayload } from '@lifetrack/schemas'
import { parseRevisionDates, parseStudyTarget } from '@lifetrack/core/learning'
import { setup } from './helpers'

const TODAY = '2026-11-02'
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-02T10:00:00Z')) })
afterEach(() => vi.useRealTimers())

describe('study timer + sessions', () => {
  it('only one running timer; only a saved (stopped) session counts; stop minutes are capped at elapsed', async () => {
    const { store, api, tables } = setup()
    await store.load('study_sessions')
    await api.startStudy({}, TODAY)
    await expect(api.startStudy({}, TODAY)).rejects.toThrow(/already running/i)
    expect(studyOverview(store.peek('study_sessions') as any, [], TODAY).todayMin).toBe(0) // running ≠ counted
    vi.setSystemTime(new Date('2026-11-02T10:30:00Z'))
    await api.stopStudy(tables.study_sessions[0], { minutes: 600, problems_solved: 2, notes: 'x' }) // asks for 10h, only 30 min elapsed
    expect(tables.study_sessions[0]).toMatchObject({ status: 'completed', duration_seconds: 1800, problems_solved: 2 })
    expect(studyOverview(store.peek('study_sessions') as any, [], TODAY).todayMin).toBe(30)
  })
  it('discarded timers never count', async () => {
    const { store, api, tables } = setup()
    await store.load('study_sessions')
    const s = await api.startStudy({}, TODAY) as any
    await api.discardStudy(s)
    expect(tables.study_sessions[0].status).toBe('discarded')
    expect(studyOverview(store.peek('study_sessions') as any, [], TODAY).todayMin).toBe(0)
  })
  it('manual log + edit use valid payloads and attach to a goal', async () => {
    const { store, tables } = setup()
    const g = await store.insert('goals', learningGoalToPayload(learningGoalFormSchema.parse({ ...blankLearningGoal(), title: 'React', target_hours: '2' }), [])) as any
    const v = sessionFormSchema(TODAY).parse({ ...blankSession(TODAY), target: `g:${g.id}`, minutes: '60', problems_solved: '1' })
    const created = await store.insert('study_sessions', sessionFormToPayload(v, parseStudyTarget(v.target, [g]), false)) as any
    expect(tables.study_sessions[0]).toMatchObject({ goal_id: g.id, duration_seconds: 3600, source: 'manual' })
    const edited = sessionFormSchema(TODAY).parse({ ...blankSession(TODAY), target: `g:${g.id}`, minutes: '90' })
    await store.update('study_sessions', created.id, sessionFormToPayload(edited, { goal_id: g.id, topic_id: null }, true))
    expect(tables.study_sessions[0].duration_seconds).toBe(5400)
  })
  it('topics: revision dates are parsed and saved', async () => {
    const { store, tables } = setup()
    const v = topicFormSchema.parse({ ...blankTopic('Frontend'), name: 'Hooks', revision_dates: '2026-11-09, 2026-11-05' })
    await store.insert('learning_topics', topicToPayload(v, parseRevisionDates(v.revision_dates)))
    expect(tables.learning_topics[0].revision_dates).toEqual(['2026-11-05', '2026-11-09'])
  })
})

describe('focus sessions', () => {
  const base = { plannedMinutes: 25, actualSeconds: 1500, completed: true, date: TODAY }
  it('records completed blocks, ignores sub-minute accidents, caps runaway seconds', async () => {
    const { api, tables } = setup()
    await api.recordFocus(base)
    expect(await api.recordFocus({ ...base, actualSeconds: 20, completed: false })).toBeNull()
    await api.recordFocus({ ...base, actualSeconds: 99999 })
    expect(tables.focus_sessions).toHaveLength(2)
    expect(tables.focus_sessions[1].actual_seconds).toBe(25 * 60 + 5)
  })
  it('stopped-early blocks keep their real time and are not "completed"', async () => {
    const { api, tables } = setup()
    await api.recordFocus({ ...base, actualSeconds: 600, completed: false, label: 'x'.repeat(300) })
    expect(tables.focus_sessions[0]).toMatchObject({ actual_seconds: 600, completed: false })
    expect(tables.focus_sessions[0].label).toHaveLength(120)
  })
})

describe('goals + milestones', () => {
  it('milestone progress drives the percentage; completing a goal stamps/clears completed_at', async () => {
    const { store, api, tables } = setup()
    const g = await store.insert('goals', goalToPayload(goalFormSchema.parse({ ...blankGoal(TODAY), title: 'Ship v1', due_date: '2026-12-01' }))) as any
    const m1 = await store.insert('milestones', { goal_id: g.id, ...milestoneFormSchema.parse({ title: 'Design', due_date: '' }), due_date: null, position: 0 }) as any
    await store.insert('milestones', { goal_id: g.id, title: 'Build', due_date: null, position: 1 })
    await api.toggleMilestone(m1)
    const rows = goalList(tables.goals, tables.milestones, [], { tab: 'active' }) as any[]
    expect(rows[0].p).toMatchObject({ percent: 50, source: 'milestones' })
    await api.toggleMilestone(tables.milestones[0])
    expect(tables.milestones[0]).toMatchObject({ done: false, completed_at: null })
    const done = await api.setGoalStatus(g, 'completed') as any
    expect(done.completed_at).toBeTruthy()
    expect(goalsSummary(tables.goals, tables.milestones, [], TODAY)).toMatchObject({ active: 0, completed: 1 })
    expect((await api.setGoalStatus(done, 'active') as any).completed_at).toBeNull()
  })
  it('invalid goal/milestone payloads are rejected before reaching the database', async () => {
    const { store } = setup()
    await expect(store.insert('milestones', { goal_id: 'not-a-uuid', title: 'x' })).rejects.toThrow(/Invalid insert payload/)
    await expect(store.insert('goals', { title: 'x', period: 'hourly' })).rejects.toThrow(/Invalid insert payload/)
  })
})
