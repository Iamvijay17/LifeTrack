import { describe, expect, it } from 'vitest'
import { blankExercise, blankMeasurement, blankRoutine, blankWorkout, exerciseFormSchema, insertSchemas, measurementFormSchema, measurementFormToPayloads, routineFormSchema, workoutFormSchema, workoutFormToPayload } from '../src'

describe('exercise + routine forms', () => {
  it('validates', () => {
    expect(exerciseFormSchema.safeParse(blankExercise()).success).toBe(false)
    expect(exerciseFormSchema.safeParse({ ...blankExercise(), name: 'Bench' }).success).toBe(true)
    expect(routineFormSchema.safeParse(blankRoutine()).success).toBe(false)
    expect(routineFormSchema.safeParse({ ...blankRoutine(), name: 'Push', exercises: [] }).success).toBe(false)
    const ok = routineFormSchema.parse({ ...blankRoutine(), name: 'Push', exercises: [{ name: 'Bench', sets: '3', reps: '10', weight_kg: '60' }] })
    expect(ok.exercises[0]).toEqual({ name: 'Bench', sets: 3, reps: 10, weight_kg: 60 })
    expect(insertSchemas.routines.safeParse({ name: ok.name, notes: ok.notes, exercises: ok.exercises }).success).toBe(true)
    expect(routineFormSchema.safeParse({ ...blankRoutine(), name: 'x', exercises: [{ name: 'a', sets: 21, reps: 1, weight_kg: 0 }] }).success).toBe(false)
  })
})
describe('workout form', () => {
  it('parses typed numbers, allows blanks, rejects negatives, maps to a DB-valid row', () => {
    const v = workoutFormSchema.parse({ ...blankWorkout('2026-11-02'), duration_minutes: '45', exercises: [{ name: 'Bench', sets: [{ reps: '10', weight: '60.5' }] }] })
    expect(v.exercises[0].sets[0]).toEqual({ reps: 10, weight: 60.5 })
    const row = workoutFormToPayload(v)
    expect(row).toMatchObject({ duration_minutes: 45, cardio_minutes: null, status: 'completed', routine_id: null })
    expect(insertSchemas.workouts.safeParse(row).success).toBe(true)
    expect(workoutFormSchema.safeParse({ ...blankWorkout('2026-11-02'), exercises: [{ name: 'x', sets: [{ reps: '-1', weight: '5' }] }] }).success).toBe(false)
    expect(workoutFormSchema.safeParse({ ...blankWorkout('2026-11-02'), duration_minutes: '2000' }).success).toBe(false)
    expect(workoutFormSchema.safeParse({ ...blankWorkout('2026-11-02'), exercises: [{ name: '', sets: [] }] }).success).toBe(false)
  })
})
describe('measurement form', () => {
  const base = blankMeasurement('2026-11-02')
  it('needs at least one value; splits tape measurements from weight', () => {
    expect(() => measurementFormToPayloads(measurementFormSchema.parse(base))).toThrow('Enter at least one measurement.')
    const w = measurementFormToPayloads(measurementFormSchema.parse({ ...base, weight_kg: '71.5' }))
    expect(w).toEqual({ body: null, weight: 71.5, date: '2026-11-02' })
    const t = measurementFormToPayloads(measurementFormSchema.parse({ ...base, waist_cm: '82.5', body_fat_pct: '15' }))
    expect(t.weight).toBeNull()
    expect(t.body).toMatchObject({ measured_on: '2026-11-02', waist_cm: 82.5, body_fat_pct: 15, chest_cm: null })
    expect(insertSchemas.body_measurements.safeParse(t.body).success).toBe(true)
    expect(measurementFormSchema.safeParse({ ...base, weight_kg: '10' }).success).toBe(false)
  })
})
