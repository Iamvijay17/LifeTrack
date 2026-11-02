import { describe, expect, it } from 'vitest'
import { blankHabit, blankTask, habitFormSchema, habitToForm, insertSchemas, taskFormSchema, taskFormToPayload, taskToForm, updateSchemas } from '../src'

describe('task form', () => {
  it('requires a title and a due date for repeating tasks', () => {
    expect(taskFormSchema.safeParse(blankTask()).success).toBe(false)
    const r = taskFormSchema.safeParse({ ...blankTask(), title: 'x', recurrence: 'daily' })
    expect(r.success).toBe(false)
    expect(!r.success && r.error.issues[0].message).toBe('Repeating tasks need a due date')
  })
  it('rejects an end date before the due date and invalid dates', () => {
    expect(taskFormSchema.safeParse({ ...blankTask('2026-11-05'), title: 'x', recurrence: 'daily', recurrence_until: '2026-11-01' }).success).toBe(false)
    expect(taskFormSchema.safeParse({ ...blankTask('2026-02-30'), title: 'x' }).success).toBe(false)
  })
  it('maps to a payload the database schema accepts', () => {
    const v = taskFormSchema.parse({ ...blankTask('2026-11-05'), title: ' Pay rent ', recurrence: 'monthly' })
    const p = taskFormToPayload(v)
    expect(p.title).toBe('Pay rent')
    expect(insertSchemas.tasks.safeParse(p).success).toBe(true)
    expect(taskFormToPayload(taskFormSchema.parse({ ...blankTask(), title: 'x' }))).toMatchObject({ due_date: null, recurrence_until: null })
  })
  it('round-trips an existing task through the form', () => {
    const f = taskToForm({ title: 'a', notes: null, category: 'Gym', priority: 'high', due_date: null, recurrence: 'none', recurrence_until: null })
    expect(f).toMatchObject({ notes: '', due_date: '' })
    expect(updateSchemas.tasks.safeParse(taskFormToPayload(f)).success).toBe(true)
  })
})

describe('habit form', () => {
  const base = blankHabit('2026-11-02', '#8B5CF6')
  it('validates name, custom days and weekly target', () => {
    expect(habitFormSchema.safeParse(base).success).toBe(false)
    expect(habitFormSchema.safeParse({ ...base, name: 'Read', frequency: 'custom' }).success).toBe(false)
    expect(habitFormSchema.safeParse({ ...base, name: 'Read', frequency: 'custom', days_of_week: [1] }).success).toBe(true)
    expect(habitFormSchema.safeParse({ ...base, name: 'Read', frequency: 'weekly', weekly_target: 9 }).success).toBe(false)
  })
  it('coerces a typed weekly target and produces a valid payload', () => {
    const v = habitFormSchema.parse({ ...base, name: 'Read', frequency: 'weekly', weekly_target: '4' })
    expect(v.weekly_target).toBe(4)
    expect(insertSchemas.habits.safeParse(v).success).toBe(true)
    expect(habitToForm({ name: 'a', description: null, color: '#fff000', frequency: 'daily', days_of_week: null, weekly_target: 3, start_date: '2026-11-01' }).days_of_week).toEqual([])
  })
})
