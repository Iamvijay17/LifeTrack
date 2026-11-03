import { describe, expect, it } from 'vitest'
import { groupTasksForDay } from '@lifetrack/core/tasks'
import { habitStats, habitSummary } from '@lifetrack/core/habits'
import { blankHabit, blankTask, habitFormSchema, taskFormSchema, taskFormToPayload } from '@lifetrack/schemas'
import { setup } from './helpers'

const TODAY = '2026-11-02'

describe('planner flows', () => {
  it('creates a task from the form payload and shows it on the right day', async () => {
    const { store, api } = setup()
    const v = taskFormSchema.parse({ ...blankTask(TODAY), title: 'Write report', priority: 'high' })
    await api.createTask(taskFormToPayload(v))
    await store.load('tasks')
    const g = groupTasksForDay(store.peek('tasks') as any, TODAY, TODAY)
    expect(g.priorities.map((t: any) => t.title)).toEqual(['Write report'])
  })
  it('completing a recurring task spawns exactly the next occurrence (and survives a duplicate from another device)', async () => {
    const { tables, api } = setup()
    const v = taskFormSchema.parse({ ...blankTask(TODAY), title: 'Standup', recurrence: 'daily' })
    const t = await api.createTask(taskFormToPayload(v)) as any
    await api.setTaskStatus(t, 'done', TODAY)
    expect(tables.tasks.map((x) => x.due_date).sort()).toEqual(['2026-11-02', '2026-11-03'])
    expect(tables.tasks.find((x) => x.due_date === '2026-11-03').status).toBe('pending')
    await expect(api.setTaskStatus({ ...t, status: 'pending' }, 'done', TODAY)).resolves.toBeDefined() // 23505 tolerated
    expect(tables.tasks).toHaveLength(2)
  })
  it('reopening, skipping and editing use valid patches', async () => {
    const { store, api } = setup()
    const t = await api.createTask(taskFormToPayload(taskFormSchema.parse({ ...blankTask(TODAY), title: 'x' }))) as any
    const done = await api.setTaskStatus(t, 'done', TODAY) as any
    expect(done.completed_at).toBeTruthy()
    const reopened = await api.setTaskStatus(done, 'pending', TODAY) as any
    expect(reopened.completed_at).toBeNull()
    await api.setTaskStatus(reopened, 'skipped', TODAY)
    await store.update('tasks', t.id, taskFormToPayload(taskFormSchema.parse({ ...blankTask(TODAY), title: 'renamed' })))
  })
  it('rejects a payload that would not match the database', async () => {
    const { store } = setup()
    await expect(store.insert('tasks', { title: '', due_date: TODAY })).rejects.toThrow(/Invalid insert payload for tasks/)
    await expect(store.insert('tasks', { title: 'x', nonsense: 1 })).rejects.toThrow(/nonsense|Unrecognized/)
  })
})

describe('habit flows', () => {
  it('create → check in → idempotent → clear', async () => {
    const { tables, store, api } = setup()
    const v = habitFormSchema.parse({ ...blankHabit('2026-10-30', '#8B5CF6'), name: 'Read' })
    const h = await store.insert('habits', v) as any
    await store.load('habit_logs')
    await api.setHabitStatus(h.id, TODAY, 'done')
    await api.setHabitStatus(h.id, TODAY, 'done')
    expect(tables.habit_logs).toHaveLength(1) // unique(habit, date) honoured via upsert
    await api.setHabitStatus(h.id, TODAY, 'skipped')
    expect(tables.habit_logs[0].status).toBe('skipped')
    await store.refetch('habit_logs')
    await api.setHabitStatus(h.id, TODAY, null)
    expect(tables.habit_logs).toHaveLength(0)
  })
  it('stats follow check-ins', async () => {
    const { store, api } = setup()
    const h = await store.insert('habits', habitFormSchema.parse({ ...blankHabit('2026-10-30', '#8B5CF6'), name: 'Read' })) as any
    await store.load('habit_logs')
    for (const d of ['2026-10-31', '2026-11-01', TODAY]) { await api.setHabitStatus(h.id, d, 'done'); await store.refetch('habit_logs') }
    const stats = habitStats(store.peek('habits') as any, store.peek('habit_logs') as any, TODAY, 1)
    expect(habitSummary(stats, TODAY)).toMatchObject({ doneToday: 1, total: 1, bestCurrent: 3 })
  })
  it('archive / restore / edit patches are valid; extra columns are not', async () => {
    const { store } = setup()
    const h = await store.insert('habits', habitFormSchema.parse({ ...blankHabit('2026-10-30', '#8B5CF6'), name: 'Read' })) as any
    await store.update('habits', h.id, { archived_at: new Date().toISOString() })
    await store.update('habits', h.id, { archived_at: null })
    await store.update('habits', h.id, habitFormSchema.parse({ ...blankHabit('2026-10-30', '#22C55E'), name: 'Read more', frequency: 'weekly', weekly_target: '4' }))
    await expect(store.update('habits', h.id, { colour: 'red' })).rejects.toThrow()
  })
})
