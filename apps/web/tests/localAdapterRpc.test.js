import { beforeEach, describe, expect, it } from 'vitest'
import { localAdapter } from '@/services/localAdapter'
import { setUserId } from '@/services/session'

beforeEach(() => {
  localStorage.clear()
  setUserId('11111111-1111-4111-8111-111111111111')
})

describe('local adapter: emulated database functions', () => {
  it('replace_exercise_logs swaps every set of a workout and refuses a workout that does not exist', async () => {
    await expect(localAdapter.rpc('replace_exercise_logs', { p_workout: 'missing', p_sets: [] })).rejects.toMatchObject({
      code: 'PGRST116',
    })
    const [w] = await localAdapter.insert('workouts', [{ workout_date: '2026-11-02', status: 'completed' }])
    await localAdapter.rpc('replace_exercise_logs', {
      p_workout: w.id,
      p_sets: [{ exercise_name: 'Bench', set_number: 1, reps: 5, weight_kg: 60 }],
    })
    const second = await localAdapter.rpc('replace_exercise_logs', {
      p_workout: w.id,
      p_sets: [{ exercise_name: 'Squat', set_number: 1, reps: 5, weight_kg: 80 }],
    })
    expect(second).toHaveLength(1)
    const logs = (await localAdapter.list('exercise_logs')).filter((l) => l.workout_id === w.id)
    expect(logs.map((l) => l.exercise_name)).toEqual(['Squat'])
  })
  it('add_savings validates the amount, needs an existing goal, and accumulates', async () => {
    const [g] = await localAdapter.insert('savings_goals', [{ name: 'Fund', target_paise: 100000 }])
    await expect(localAdapter.rpc('add_savings', { p_goal: g.id, p_paise: 0 })).rejects.toThrow('Enter an amount greater than 0.')
    await expect(localAdapter.rpc('add_savings', { p_goal: 'nope', p_paise: 100 })).rejects.toThrow('Savings goal not found.')
    await localAdapter.rpc('add_savings', { p_goal: g.id, p_paise: 2500 })
    expect((await localAdapter.rpc('add_savings', { p_goal: g.id, p_paise: 500 })).saved_paise).toBe(3000)
  })
  it('an unknown function is an error, not a silent no-op', async () => {
    await expect(localAdapter.rpc('drop_everything', {})).rejects.toThrow(/Unknown function/)
  })
})
