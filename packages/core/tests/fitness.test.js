import { describe, expect, it } from 'vitest'
import { dayStatus, exercisesFromSets, exerciseGroups, fitnessWeek, measurementLine, offDayWorkout, planFor, routineToExercises, setsByWorkout, summarizeSets, todayHeadline, volume, weightHistory, workoutMeta, workoutRows } from '../src/fitness'

const S = (workout_id, exercise_name, order_index, set_number, reps, weight_kg) => ({ workout_id, exercise_name, order_index, set_number, reps, weight_kg })
const logs = [S('w1', 'Bench', 0, 1, 10, '60.00'), S('w1', 'Bench', 0, 2, 8, '62.50'), S('w1', 'Row', 1, 1, 12, '40.00'), S('w2', 'Squat', 0, 1, 5, '100.00')]
describe('sets', () => {
  it('volume, grouping and ordering (numeric weights arrive as strings from Postgres)', () => {
    expect(volume(logs.slice(0, 2))).toBe(10 * 60 + 8 * 62.5)
    expect(setsByWorkout(logs).get('w1')).toHaveLength(3)
    expect(summarizeSets([...logs].reverse().filter((s) => s.workout_id === 'w1'))).toEqual([{ name: 'Bench', text: '10×60kg, 8×62.5kg' }, { name: 'Row', text: '12×40kg' }])
    expect(exercisesFromSets(logs.slice(0, 3))).toEqual([{ name: 'Bench', sets: [{ reps: 10, weight: 60 }, { reps: 8, weight: 62.5 }] }, { name: 'Row', sets: [{ reps: 12, weight: 40 }] }])
  })
  it('routine → form → rows round-trip, matching the library case-insensitively', () => {
    const ex = routineToExercises({ exercises: [{ name: 'bench press', sets: 2, reps: 10, weight_kg: 60 }, { name: 'Odd', sets: 0, reps: 'x', weight_kg: null }] })
    expect(ex[0].sets).toEqual([{ reps: 10, weight: 60 }, { reps: 10, weight: 60 }])
    expect(ex[1].sets).toEqual([{ reps: 0, weight: 0 }]) // always at least one set, never NaN
    const rows = workoutRows(ex, [{ id: 'lib1', name: 'Bench Press' }])
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ exercise_id: 'lib1', order_index: 0, set_number: 1 })
    expect(rows[1].set_number).toBe(2)
    expect(rows[2]).toMatchObject({ exercise_id: null, order_index: 1, exercise_name: 'Odd' })
  })
})
describe('week', () => {
  const W = (o) => ({ id: o.id, status: 'completed', duration_minutes: null, cardio_minutes: null, created_at: '2026-11-01T00:00:00Z', ...o })
  const workouts = [W({ id: 'w1', workout_date: '2026-11-02', duration_minutes: 60, cardio_minutes: 10 }), W({ id: 'w2', workout_date: '2026-10-28', duration_minutes: 45 }), W({ id: 'r', workout_date: '2026-11-03', status: 'rest' })]
  const plan = { 1: 'rt1', 2: 'rest', 3: 'rt1', 0: 'gone' }
  const wk = fitnessWeek({ workouts, logs, plan, today: '2026-11-04', weekStartsOn: 1 })
  it('counts only completed workouts in the user week, against planned training days', () => {
    expect(wk.weekStart).toBe('2026-11-02')
    expect(wk.stats).toMatchObject({ count: 1, planned: 3, hit: 1, minutes: 60, cardio: 10, vol: 1580 })
    expect(wk.weeks).toHaveLength(8)
    expect(wk.weeks.at(-1)).toMatchObject({ workouts: 1 })
    expect(wk.weeks.at(-2)).toMatchObject({ workouts: 1, volume: 500 })
  })
  it('plan labels and day status', () => {
    const routines = [{ id: 'rt1', name: 'Push' }]
    expect([planFor('2026-11-02', plan, routines), planFor('2026-11-03', plan, routines), planFor('2026-11-08', plan, routines), planFor('2026-11-06', plan, routines)]).toEqual(['Push', 'Rest', 'Routine removed', null])
    expect([dayStatus('2026-11-02', workouts), dayStatus('2026-11-03', workouts), dayStatus('2026-11-04', workouts)]).toEqual(['done', 'rest', null])
    expect(todayHeadline([], 'Push')).toBe('Push')
    expect(todayHeadline([], 'Rest')).toBe('Rest day planned')
    expect(todayHeadline([{ status: 'skipped' }], null)).toBe('Skipped')
    expect(todayHeadline([], null)).toBe('Nothing planned')
    expect(offDayWorkout('rest', '2026-11-02')).toEqual({ workout_date: '2026-11-02', status: 'rest', name: 'Rest day', kind: 'other' })
  })
})
describe('lists', () => {
  it('weight history, labels and library groups', () => {
    const wh = weightHistory([{ log_date: '2026-11-02', weight_kg: '71.0' }, { log_date: '2026-10-30', weight_kg: '72.0' }, { log_date: '2026-11-01', weight_kg: null }])
    expect(wh.latest.log_date).toBe('2026-11-02')
    expect(wh.series.map((p) => p.kg)).toEqual([72, 71])
    expect(measurementLine({ chest_cm: 100, waist_cm: null, body_fat_pct: 15.5 })).toBe('Chest 100 · BF% 15.5')
    expect(workoutMeta({ workout_date: '2026-11-02', duration_minutes: 60, cardio_minutes: 10, cardio_distance_km: 2 }, logs.slice(0, 2))).toContain('2 sets · 1,100 kg · cardio 10 min / 2 km')
    expect(exerciseGroups([{ name: 'B', muscle_group: '' }, { name: 'A', muscle_group: 'Chest' }]).groups.map((g) => g.group)).toEqual(['Chest', 'Other'])
  })
})
