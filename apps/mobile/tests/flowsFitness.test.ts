import { describe, expect, it } from 'vitest'
import { exercisesFromSets, fitnessWeek, workoutRows } from '@lifetrack/core/fitness'
import { blankMeasurement, blankRoutine, blankWorkout, measurementFormSchema, measurementFormToPayloads, routineFormSchema, workoutFormSchema, workoutFormToPayload } from '@lifetrack/schemas'
import { setup } from './helpers'

const TODAY = '2026-11-02'
const workoutForm = (o: object = {}) => workoutFormSchema.parse({ ...blankWorkout(TODAY), name: 'Push', exercises: [{ name: 'Bench', sets: [{ reps: '10', weight: '60' }, { reps: '8', weight: '62.5' }] }, { name: 'Dip', sets: [{ reps: '12', weight: '0' }] }], ...o })

describe('fitness flows', () => {
  it('logs a workout with its sets; volume and week stats follow', async () => {
    const { store, api, tables } = setup()
    const v = workoutForm({ duration_minutes: '50' })
    const w = await api.saveWorkout(workoutFormToPayload(v), workoutRows(v.exercises, []), undefined) as any
    expect(tables.workouts).toHaveLength(1)
    expect(tables.exercise_logs.map((s) => [s.exercise_name, s.set_number, s.reps, Number(s.weight_kg)])).toEqual([['Bench', 1, 10, 60], ['Bench', 2, 8, 62.5], ['Dip', 1, 12, 0]])
    expect(tables.exercise_logs.every((s) => s.workout_id === w.id)).toBe(true)
    await store.load('workouts'); await store.load('exercise_logs')
    const wk = fitnessWeek({ workouts: store.peek('workouts') as any, logs: store.peek('exercise_logs') as any, plan: {}, today: TODAY, weekStartsOn: 1 })
    expect(wk.stats).toMatchObject({ count: 1, minutes: 50, vol: 1100 })
  })
  it('never leaves a half-saved workout: if the sets are rejected the workout is rolled back', async () => {
    const { api, tables } = setup()
    const v = workoutForm()
    const rows = (workoutRows(v.exercises, []) as any[]).map((r) => ({ ...r, reps: -1 })) // invalid set
    await expect(api.saveWorkout(workoutFormToPayload(v), rows, undefined)).rejects.toThrow(/Invalid insert payload for exercise_logs/)
    expect(tables.workouts ?? []).toHaveLength(0)
  })
  it('editing replaces the sets: new ones are stored first, old ones removed after', async () => {
    const { store, api, tables } = setup()
    const v = workoutForm()
    const w = await api.saveWorkout(workoutFormToPayload(v), workoutRows(v.exercises, []), undefined) as any
    await store.load('exercise_logs')
    const edited = workoutForm({ name: 'Push v2', exercises: [{ name: 'Bench', sets: [{ reps: '5', weight: '80' }] }] })
    await api.saveWorkout(workoutFormToPayload(edited), workoutRows(edited.exercises, []), w)
    expect(tables.workouts[0].name).toBe('Push v2')
    expect(tables.exercise_logs).toHaveLength(1)
    expect(tables.exercise_logs[0]).toMatchObject({ reps: 5 })
    expect(exercisesFromSets(tables.exercise_logs)).toEqual([{ name: 'Bench', sets: [{ reps: 5, weight: 80 }] }])
  })
  it('routines store their exercises as JSON and validate the shape', async () => {
    const { store, tables } = setup()
    const v = routineFormSchema.parse({ ...blankRoutine(), name: 'Push day', exercises: [{ name: 'Bench', sets: '3', reps: '10', weight_kg: '60' }] })
    await store.insert('routines', v)
    expect(tables.routines[0].exercises).toEqual([{ name: 'Bench', sets: 3, reps: 10, weight_kg: 60 }])
    await expect(store.insert('routines', { name: 'x', exercises: 'nope' })).rejects.toThrow(/Invalid insert payload/)
  })
  it('weekly plan is saved on user_settings (one row, upsert by user)', async () => {
    const { store, tables } = setup()
    await store.load('user_settings')
    await store.upsert('user_settings', { workout_plan: { 1: 'rest' } }, { onConflict: 'user_id' })
    await store.upsert('user_settings', { workout_plan: { 1: 'rest', 3: 'abc' } }, { onConflict: 'user_id' })
    expect(tables.user_settings).toHaveLength(1)
    expect(tables.user_settings[0].workout_plan).toEqual({ 1: 'rest', 3: 'abc' })
  })
  it('body metrics: tape measurements and weight go to their own tables; one row per day', async () => {
    const { store, api, tables } = setup()
    await store.load('health_logs'); await store.load('body_measurements')
    const p = measurementFormToPayloads(measurementFormSchema.parse({ ...blankMeasurement(TODAY), waist_cm: '82.5', weight_kg: '71.4' }))
    await store.upsert('body_measurements', p.body!, { onConflict: 'user_id,measured_on' })
    await api.saveHealth(p.date, { weight_kg: p.weight })
    const p2 = measurementFormToPayloads(measurementFormSchema.parse({ ...blankMeasurement(TODAY), waist_cm: '82' }))
    await store.upsert('body_measurements', p2.body!, { onConflict: 'user_id,measured_on' })
    expect(tables.body_measurements).toHaveLength(1)
    expect(tables.body_measurements[0].waist_cm).toBe(82)
    expect(tables.health_logs[0]).toMatchObject({ log_date: TODAY, weight_kg: 71.4 })
  })
})
