import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setUserId } from '@/services/session'
import * as store from '@/hooks/store'
import { addWater, saveWorkout, setTaskStatus, createTask, fireDueReminders, markAllRead } from '@/services/api'

beforeEach(() => {
  localStorage.clear()
  setUserId('user-a')
  store.resetStore()
})

describe('api: atomic operations', () => {
  it('addWater accumulates, never goes below zero, and updates the cache', async () => {
    await store.load('health_logs')
    await addWater('2026-03-01', 500)
    await addWater('2026-03-01', 750)
    expect(store.peek('health_logs').find((h) => h.log_date === '2026-03-01').water_ml).toBe(1250)
    await addWater('2026-03-01', -5000)
    expect(store.peek('health_logs').find((h) => h.log_date === '2026-03-01').water_ml).toBe(0)
  })

  it('editing a workout replaces its sets in one step', async () => {
    await store.load('workouts')
    await store.load('exercise_logs')
    const w = await saveWorkout(
      { workout_date: '2026-03-01', name: 'Push' },
      [
        { exercise_name: 'Bench', set_number: 1, reps: 8, weight_kg: 60 },
        { exercise_name: 'Bench', set_number: 2, reps: 8, weight_kg: 60 },
      ],
      null,
    )
    expect(store.peek('exercise_logs')).toHaveLength(2)
    await saveWorkout({ name: 'Push' }, [{ exercise_name: 'Squat', set_number: 1, reps: 5, weight_kg: 100 }], w)
    const sets = store.peek('exercise_logs').filter((l) => l.workout_id === w.id)
    expect(sets.map((s) => s.exercise_name)).toEqual(['Squat'])
  })

  it('a failed set replacement leaves the previous sets untouched', async () => {
    await store.load('workouts')
    await store.load('exercise_logs')
    const w = await saveWorkout(
      { workout_date: '2026-03-01', name: 'Pull' },
      [{ exercise_name: 'Row', set_number: 1, reps: 10, weight_kg: 40 }],
      null,
    )
    await expect(saveWorkout({ name: 'Pull' }, [{ exercise_name: 'X' }], { ...w, id: 'missing' })).rejects.toBeTruthy()
    expect(store.peek('exercise_logs').filter((l) => l.workout_id === w.id)).toHaveLength(1)
  })
})

describe('api: recurring tasks', () => {
  it('completing a recurring task creates exactly one next occurrence, even when another device already did', async () => {
    await store.load('tasks')
    const t = await createTask({ title: 'Water plants', due_date: '2099-01-01', recurrence: 'daily' })
    await setTaskStatus(t, 'done', '2099-01-01')
    await setTaskStatus({ ...t, status: 'pending' }, 'done', '2099-01-01') // second device races: unique (series, date) absorbs it
    const dates = store
      .peek('tasks')
      .map((x) => x.due_date)
      .sort()
    expect(dates).toEqual(['2099-01-01', '2099-01-02'])
  })
  it('recurring task without a due date is rejected', () => {
    expect(() => createTask({ title: 'x', recurrence: 'daily' })).toThrow(/due date/)
  })
})

describe('api: reminders', () => {
  it('fires a due reminder once per day even if two devices run it', async () => {
    await store.load('reminders')
    await store.load('notifications')
    await store.insert('reminders', { title: 'Pay rent', kind: 'bill', remind_date: '2026-01-01', remind_time: '09:00', repeat: 'daily' })
    const a = await fireDueReminders('2026-01-01', '10:00')
    const b = await fireDueReminders('2026-01-01', '10:05')
    expect(a + b).toBe(1)
    expect(store.peek('notifications')).toHaveLength(1)
  })
  it('markAllRead marks every unread notification', async () => {
    await store.load('notifications')
    await store.insert('notifications', [{ title: 'a' }, { title: 'b' }])
    expect(await markAllRead()).toBe(2)
    expect(store.peek('notifications').every((n) => n.read_at)).toBe(true)
  })
})

describe('supabase adapter', () => {
  it('subscribes per table: filtered inserts/updates, unfiltered deletes, and removes the channel on stop', async () => {
    const bindings = []
    const channel = {
      on: vi.fn((_t, cfg, cb) => {
        bindings.push({ cfg, cb })
        return channel
      }),
      subscribe: vi.fn((cb) => {
        cb('SUBSCRIBED')
        return channel
      }),
    }
    const removeChannel = vi.fn()
    const supabase = { channel: () => channel, removeChannel, rpc: vi.fn(async () => ({ data: { id: 1 }, error: null })) }
    const { createSupabaseAdapter, setUserId: setId } = await import('@lifetrack/data')
    const supabaseAdapter = createSupabaseAdapter(supabase)
    setId('u-1')
    const onChange = vi.fn()
    const onStatus = vi.fn()
    const stop = supabaseAdapter.subscribe(onChange, onStatus)
    const inserts = bindings.filter((b) => b.cfg.event === 'INSERT'),
      deletes = bindings.filter((b) => b.cfg.event === 'DELETE')
    expect(inserts.length).toBeGreaterThan(20)
    expect(inserts.every((b) => b.cfg.filter === 'user_id=eq.u-1')).toBe(true)
    expect(deletes.every((b) => b.cfg.filter === undefined)).toBe(true)
    inserts[0].cb({ eventType: 'INSERT', new: { id: 'x' } })
    expect(onChange).toHaveBeenCalledWith(inserts[0].cfg.table, { eventType: 'INSERT', new: { id: 'x' } })
    expect(onStatus).toHaveBeenCalledWith('SUBSCRIBED')
    stop()
    expect(removeChannel).toHaveBeenCalled()
    expect(await supabaseAdapter.rpc('add_water', { p_date: 'd', p_ml: 1 })).toEqual({ id: 1 })
  })
})
