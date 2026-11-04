import '@testing-library/jest-dom/vitest'
import { pickOption } from './pickers'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  volume,
  groupSets,
  summarizeSets,
  setsByWorkout,
  planLabel,
  isTrainingDay,
  weekStats,
  weeklySeries,
  todayStatus,
  libraryGroups,
  routineToFormExercises,
  formExercisesToLogs,
  splitMeasurements,
  historyOf,
} from '@/domain/fitness'
import { weightSeries } from '@/domain/health'

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  removeMany: vi.fn(),
  upsert: vi.fn(),
  saveWorkout: vi.fn(),
  saveHealth: vi.fn(),
  confirm: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@/hooks/store', () => ({
  insert: mocks.insert,
  update: mocks.update,
  remove: mocks.remove,
  removeMany: mocks.removeMany,
  upsert: mocks.upsert,
}))
vi.mock('@/services/api', () => ({ saveWorkout: mocks.saveWorkout, saveHealth: mocks.saveHealth }))
vi.mock('@/components/shared/Confirm', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.toastError } }))

import { WorkoutDialog } from '@/features/fitness/WorkoutDialog'
import { RoutineDialog } from '@/features/fitness/RoutineDialog'
import { MeasurementDialog } from '@/features/fitness/MeasurementDialog'
import { ExerciseDialog } from '@/features/fitness/ExerciseDialog'
import { TodayCard } from '@/features/fitness/TodayCard'
import { HistoryTab } from '@/features/fitness/HistoryTab'
import { WeeklyPlan } from '@/features/fitness/WeeklyPlan'
import { RoutinesTab } from '@/features/fitness/RoutinesTab'

const TODAY = '2026-11-02' // Monday
beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.insert.mockResolvedValue({})
  mocks.update.mockResolvedValue({})
  mocks.remove.mockResolvedValue(undefined)
  mocks.removeMany.mockResolvedValue(undefined)
  mocks.upsert.mockResolvedValue({})
  mocks.saveWorkout.mockResolvedValue({})
  mocks.saveHealth.mockResolvedValue({})
})

const L = (o) => ({
  id: Math.random().toString(36).slice(2),
  workout_id: 'w1',
  exercise_name: 'Squat',
  order_index: 0,
  set_number: 1,
  reps: 5,
  weight_kg: '100',
  ...o,
})
const W = (o) => ({
  id: Math.random().toString(36).slice(2),
  workout_date: TODAY,
  status: 'completed',
  name: 'Push',
  created_at: '2026-11-02T00:00:00Z',
  duration_minutes: null,
  cardio_minutes: null,
  ...o,
})
const routine = {
  id: 'r1',
  name: 'Push day',
  exercises: [
    { name: 'Bench Press', sets: 3, reps: 8, weight_kg: 60 },
    { name: 'Dip', sets: 0, reps: '10', weight_kg: 0 },
  ],
}

describe('fitness domain', () => {
  it('volume is Σ reps × weight (weights arrive as strings from numeric columns)', () => {
    expect(volume([L({ reps: 5, weight_kg: '100' }), L({ reps: 8, weight_kg: '62.5' })])).toBe(1000)
    expect(volume([])).toBe(0)
  })
  it('groups sets per exercise in the order performed, whatever order they arrive in', () => {
    const logs = [
      L({ exercise_name: 'Row', order_index: 1, set_number: 1, reps: 10, weight_kg: '50' }),
      L({ order_index: 0, set_number: 2, reps: 5, weight_kg: '105' }),
      L({ order_index: 0, set_number: 1, reps: 5, weight_kg: '100' }),
    ]
    expect(groupSets(logs)).toEqual([
      {
        name: 'Squat',
        sets: [
          { reps: 5, weight: 100 },
          { reps: 5, weight: 105 },
        ],
      },
      { name: 'Row', sets: [{ reps: 10, weight: 50 }] },
    ])
    expect(summarizeSets(logs)).toEqual([
      { name: 'Squat', text: '5×100kg, 5×105kg' },
      { name: 'Row', text: '10×50kg' },
    ])
  })
  it('indexes logs by workout', () => {
    const m = setsByWorkout([L({ workout_id: 'a' }), L({ workout_id: 'b' }), L({ workout_id: 'a' })])
    expect(m.get('a')).toHaveLength(2)
    expect(m.get('b')).toHaveLength(1)
    expect(m.get('zzz')).toBeUndefined()
  })
  it('labels the plan: rest, routine name, removed routine, or flexible', () => {
    const routines = [{ id: 'r1', name: 'Push day' }]
    const plan = { 1: 'r1', 2: 'rest', 3: 'gone' } // Mon, Tue, Wed
    expect(planLabel(plan, routines, '2026-11-02')).toBe('Push day')
    expect(planLabel(plan, routines, '2026-11-03')).toBe('Rest')
    expect(planLabel(plan, routines, '2026-11-04')).toBe('Routine removed')
    expect(planLabel(plan, routines, '2026-11-05')).toBeNull()
    expect([isTrainingDay(plan, '2026-11-02'), isTrainingDay(plan, '2026-11-03'), isTrainingDay(plan, '2026-11-05')]).toEqual([
      true,
      false,
      false,
    ])
  })
  it('weekStats: counts this week only; planned vs hit days; sums minutes, cardio and volume', () => {
    const done = [
      W({ id: 'a', workout_date: '2026-11-02', duration_minutes: 60, cardio_minutes: 10 }),
      W({ id: 'b', workout_date: '2026-11-04', duration_minutes: 45 }),
      W({ id: 'old', workout_date: '2026-10-30', duration_minutes: 99 }),
    ]
    const logs = setsByWorkout([L({ workout_id: 'a', reps: 10, weight_kg: '50' }), L({ workout_id: 'old', reps: 1, weight_kg: '999' })])
    const s = weekStats({ completed: done, weekStart: '2026-11-02', plan: { 1: 'r1', 3: 'r1', 5: 'r1', 2: 'rest' }, logsByWorkout: logs })
    expect(s).toEqual({ count: 2, planned: 3, hit: 2, minutes: 105, cardio: 10, vol: 500 })
  })
  it('weekStats: nothing planned means planned=0 (not a fake 0%)', () => {
    expect(weekStats({ completed: [], weekStart: '2026-11-02', plan: {}, logsByWorkout: new Map() })).toMatchObject({
      count: 0,
      planned: 0,
      hit: 0,
    })
  })
  it('weeklySeries: N buckets, oldest first, the last one is the CURRENT week', () => {
    const done = [
      W({ id: 'a', workout_date: '2026-11-03' }),
      W({ id: 'b', workout_date: '2026-10-27' }),
      W({ id: 'c', workout_date: '2026-10-28' }),
    ]
    const s = weeklySeries(done, setsByWorkout([L({ workout_id: 'a', reps: 10, weight_kg: '10.4' })]), '2026-11-02', 3)
    expect(s.map((x) => x.workouts)).toEqual([0, 2, 1])
    expect(s[2]).toMatchObject({ label: '2 Nov', volume: 104 })
    expect(weeklySeries([], new Map(), '2026-11-02')).toHaveLength(8)
  })
  it('todayStatus covers every branch in priority order', () => {
    expect(todayStatus([W({ status: 'rest' }), W({ status: 'completed' })], null)).toBe('Workout done 💪')
    expect(todayStatus([W({ status: 'rest' })], 'Push day')).toBe('Rest day')
    expect(todayStatus([W({ status: 'skipped' })], null)).toBe('Skipped')
    expect(todayStatus([], 'Push day')).toBe('Push day')
    expect(todayStatus([], 'Rest')).toBe('Rest day planned')
    expect(todayStatus([], null)).toBe('Nothing planned')
  })
  it('weight series ignores days without weight, returns the latest and caps the chart', () => {
    const logs = [
      { log_date: '2026-11-01', weight_kg: '80.5' },
      { log_date: '2026-11-02', weight_kg: null },
      { log_date: '2026-10-30', weight_kg: '81' },
    ]
    const s = weightSeries(logs)
    expect(s.latest.log_date).toBe('2026-11-01')
    expect(s.data.map((d) => d.kg)).toEqual([81, 80.5])
    const many = Array.from({ length: 50 }, (_, i) => ({
      log_date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10),
      weight_kg: String(70 + i),
    }))
    expect(weightSeries(many, 40).data).toHaveLength(40)
    expect(weightSeries([]).latest).toBeNull()
  })
  it('library grouping: A–Z within group, blank group becomes Other', () => {
    const g = libraryGroups([
      { id: '1', name: 'Squat', muscle_group: 'Legs' },
      { id: '2', name: 'Bench', muscle_group: 'Chest' },
      { id: '3', name: 'Burpee', muscle_group: '' },
      { id: '4', name: 'Leg Press', muscle_group: 'Legs' },
    ])
    expect(g.map((x) => x.group)).toEqual(['Chest', 'Other', 'Legs'])
    expect(g.find((x) => x.group === 'Legs').items.map((e) => e.name)).toEqual(['Leg Press', 'Squat'])
  })
  it('a routine becomes form rows with at least one set and numeric values', () => {
    const rows = routineToFormExercises(routine)
    expect(rows[0]).toEqual({
      name: 'Bench Press',
      sets: [
        { reps: 8, weight: 60 },
        { reps: 8, weight: 60 },
        { reps: 8, weight: 60 },
      ],
    })
    expect(rows[1].sets).toEqual([{ reps: 10, weight: 0 }]) // "0 sets" still gets one set to fill in
  })
  it('form rows become log rows: numbering, order and case-insensitive library link', () => {
    const rows = formExercisesToLogs(
      [
        {
          name: 'bench press',
          sets: [
            { reps: 5, weight: 60 },
            { reps: 4, weight: 62.5 },
          ],
        },
        { name: 'Mystery', sets: [{ reps: 1, weight: 0 }] },
      ],
      [{ id: 'lib1', name: 'Bench Press' }],
    )
    expect(rows).toEqual([
      { exercise_name: 'bench press', exercise_id: 'lib1', order_index: 0, set_number: 1, reps: 5, weight_kg: 60 },
      { exercise_name: 'bench press', exercise_id: 'lib1', order_index: 0, set_number: 2, reps: 4, weight_kg: 62.5 },
      { exercise_name: 'Mystery', exercise_id: null, order_index: 1, set_number: 1, reps: 1, weight_kg: 0 },
    ])
  })
  const blankMetrics = {
    measured_on: TODAY,
    weight_kg: '',
    chest_cm: '',
    waist_cm: '',
    hips_cm: '',
    arm_cm: '',
    thigh_cm: '',
    body_fat_pct: '',
    notes: '',
  }
  it('splits body metrics: tape → measurements, weight → health log, nothing → empty (notes alone do not count)', () => {
    expect(splitMeasurements({ ...blankMetrics, waist_cm: '82.5', notes: 'AM' })).toEqual({
      tape: {
        measured_on: TODAY,
        chest_cm: null,
        waist_cm: 82.5,
        hips_cm: null,
        arm_cm: null,
        thigh_cm: null,
        body_fat_pct: null,
        notes: 'AM',
      },
      weight: null,
      empty: false,
    })
    expect(splitMeasurements({ ...blankMetrics, weight_kg: '80' })).toMatchObject({ tape: null, weight: 80, empty: false })
    expect(splitMeasurements({ ...blankMetrics, notes: 'just a note' })).toMatchObject({ tape: null, weight: null, empty: true })
    expect(splitMeasurements(blankMetrics).empty).toBe(true)
  })
  it('history is newest first', () => {
    expect(historyOf([W({ id: 'a', workout_date: '2026-11-01' }), W({ id: 'b', workout_date: '2026-11-03' })]).map((x) => x.id)).toEqual([
      'b',
      'a',
    ])
  })
})

describe('WorkoutDialog', () => {
  const base = { open: true, onOpenChange: () => {}, routines: [routine], library: [{ id: 'lib1', name: 'Bench Press' }], today: TODAY }
  it('starts from a routine: name and every set pre-filled, then saves the log rows', async () => {
    const user = userEvent.setup()
    render(<WorkoutDialog {...base} routineId="r1" />)
    expect(screen.getByLabelText('Name')).toHaveValue('Push day')
    expect(screen.getByLabelText('Exercise 1')).toHaveValue('Bench Press')
    expect(screen.getByLabelText('Set 3 reps')).toHaveValue(8)
    await user.click(document.querySelector('button[type=submit]'))
    await waitFor(() => expect(mocks.saveWorkout).toHaveBeenCalledTimes(1))
    const [row, logs, existing] = mocks.saveWorkout.mock.calls[0]
    expect(row).toMatchObject({ workout_date: TODAY, routine_id: 'r1', name: 'Push day', status: 'completed', duration_minutes: null })
    expect(logs).toHaveLength(4)
    expect(logs[0]).toMatchObject({
      exercise_name: 'Bench Press',
      exercise_id: 'lib1',
      order_index: 0,
      set_number: 1,
      reps: 8,
      weight_kg: 60,
    })
    expect(existing).toBeUndefined()
  })
  it('validates: a name is required and negative reps are rejected inline', async () => {
    const user = userEvent.setup()
    render(<WorkoutDialog {...base} routineId="r1" />)
    await user.clear(screen.getByLabelText('Name'))
    fireEvent.change(screen.getAllByLabelText('Set 1 reps')[0], { target: { value: '-3' } })
    await user.click(document.querySelector('button[type=submit]'))
    expect(await screen.findByText('Name the workout')).toBeInTheDocument()
    expect(screen.getByText(/Check reps and weight/)).toBeInTheDocument()
    expect(mocks.saveWorkout).not.toHaveBeenCalled()
  })
  it('picking a routine inside the form replaces the exercises with its template', async () => {
    const user = userEvent.setup()
    render(<WorkoutDialog {...base} />)
    expect(screen.queryByLabelText('Exercise 1')).toBeNull()
    await pickOption(user, screen.getByLabelText('Routine (optional)'), 'r1')
    expect(screen.getByLabelText('Exercise 1')).toHaveValue('Bench Press')
    expect(screen.getByLabelText('Name')).toHaveValue('Push day')
  })
  it('editing pre-fills from the saved sets and passes the existing workout to saveWorkout', async () => {
    const user = userEvent.setup()
    const workout = W({ id: 'w1', name: 'Legs', kind: 'strength', routine_id: null, duration_minutes: 55 })
    render(
      <WorkoutDialog
        {...base}
        workout={workout}
        sets={[
          L({ order_index: 0, set_number: 1, reps: 5, weight_kg: '100' }),
          L({ order_index: 0, set_number: 2, reps: 5, weight_kg: '105' }),
        ]}
      />,
    )
    expect(screen.getByLabelText('Duration (min)')).toHaveValue(55)
    expect(screen.getByLabelText('Set 2 weight')).toHaveValue(105)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mocks.saveWorkout).toHaveBeenCalled())
    expect(mocks.saveWorkout.mock.calls[0][2]).toMatchObject({ id: 'w1' })
    expect(mocks.saveWorkout.mock.calls[0][0]).toMatchObject({ duration_minutes: 55 })
  })
  it('cardio workouts hide the exercise list and show cardio fields', async () => {
    const user = userEvent.setup()
    render(<WorkoutDialog {...base} routineId="r1" />)
    await pickOption(user, screen.getByLabelText('Type'), 'cardio')
    expect(screen.queryByLabelText('Exercise 1')).toBeNull()
    expect(screen.getByLabelText('Distance (km)')).toBeInTheDocument()
  })
  it('a new set copies the previous one', async () => {
    const user = userEvent.setup()
    render(<WorkoutDialog {...base} routineId="r1" />)
    const sets = within(screen.getByLabelText('Exercise 1').closest('div.space-y-2')) // first exercise card
    await user.click(sets.getByRole('button', { name: 'Set' }))
    expect(screen.getByLabelText('Set 4 reps')).toHaveValue(8)
    expect(screen.getByLabelText('Set 4 weight')).toHaveValue(60)
  })
})

describe('RoutineDialog', () => {
  it('needs a name, keeps at least one exercise row, and caps sets', async () => {
    const user = userEvent.setup()
    render(<RoutineDialog open onOpenChange={() => {}} library={[]} />)
    expect(screen.getByRole('button', { name: 'Remove exercise' })).toBeDisabled()
    await user.click(document.querySelector('button[type=submit]'))
    expect(await screen.findByText('Name the routine')).toBeInTheDocument()
    expect(screen.getByText('Exercise name')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Name'), 'Pull')
    await user.type(screen.getByLabelText('Exercise 1 name'), 'Row')
    fireEvent.change(screen.getByLabelText('Sets'), { target: { value: '99' } })
    await user.click(document.querySelector('button[type=submit]'))
    expect(await screen.findByText('Sets is too large')).toBeInTheDocument()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('saves a routine and edits an existing one in place', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<RoutineDialog open onOpenChange={() => {}} library={[]} />)
    await user.type(screen.getByLabelText('Name'), 'Pull')
    await user.type(screen.getByLabelText('Exercise 1 name'), 'Row')
    await user.click(document.querySelector('button[type=submit]'))
    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith(
        'routines',
        expect.objectContaining({ name: 'Pull', exercises: [{ name: 'Row', sets: 3, reps: 10, weight_kg: 0 }] }),
      ),
    )
    unmount()
    render(<RoutineDialog open onOpenChange={() => {}} library={[]} routine={{ ...routine, notes: '' }} />)
    expect(screen.getByLabelText('Exercise 2 name')).toHaveValue('Dip')
    await user.click(document.querySelector('button[type=submit]'))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('routines', 'r1', expect.objectContaining({ name: 'Push day' })))
  })
})

describe('MeasurementDialog', () => {
  const open = () => render(<MeasurementDialog open onOpenChange={() => {}} today={TODAY} />)
  it('refuses an empty entry with a clear message and saves nothing', async () => {
    const user = userEvent.setup()
    open()
    await user.click(document.querySelector('button[type=submit]'))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Enter at least one measurement.'))
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.saveHealth).not.toHaveBeenCalled()
  })
  it('weight goes to the health log only; tape measurements go to body_measurements only', async () => {
    const user = userEvent.setup()
    const { unmount } = open()
    await user.type(screen.getByLabelText('Weight (kg)'), '80.4')
    await user.click(document.querySelector('button[type=submit]'))
    await waitFor(() => expect(mocks.saveHealth).toHaveBeenCalledWith(TODAY, { weight_kg: 80.4 }))
    expect(mocks.upsert).not.toHaveBeenCalled()
    unmount()
    mocks.saveHealth.mockClear()
    open()
    await user.type(screen.getByLabelText('Waist (cm)'), '82')
    await user.click(document.querySelector('button[type=submit]'))
    await waitFor(() =>
      expect(mocks.upsert).toHaveBeenCalledWith(
        'body_measurements',
        expect.objectContaining({ measured_on: TODAY, waist_cm: 82, chest_cm: null }),
        { onConflict: 'user_id,measured_on' },
      ),
    )
    expect(mocks.saveHealth).not.toHaveBeenCalled()
  })
  it('rejects an implausible weight', async () => {
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText('Weight (kg)'), '5')
    await user.click(document.querySelector('button[type=submit]'))
    await waitFor(() => expect(mocks.saveHealth).not.toHaveBeenCalled())
  })
})

describe('ExerciseDialog', () => {
  it('needs a name, then adds it to the library', async () => {
    const user = userEvent.setup()
    render(<ExerciseDialog open onOpenChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Name the exercise')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Name'), 'Face Pull')
    await pickOption(user, screen.getByLabelText('Muscle group'), 'Shoulders')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith('exercises', { name: 'Face Pull', muscle_group: 'Shoulders', equipment: '' }),
    )
  })
})

describe('TodayCard', () => {
  const props = { planToday: null, onLog: vi.fn(), onMarkOff: vi.fn(), onUndo: vi.fn() }
  it('offers log / rest / skip when nothing is recorded for today', async () => {
    const user = userEvent.setup()
    const onMarkOff = vi.fn()
    render(<TodayCard {...props} todays={[]} onMarkOff={onMarkOff} />)
    expect(screen.getByText('Nothing planned')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Rest day' }))
    expect(onMarkOff).toHaveBeenCalledWith('rest')
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(onMarkOff).toHaveBeenCalledWith('skipped')
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })
  it('after marking rest, shows the status and an Undo that receives the records to remove', async () => {
    const user = userEvent.setup()
    const onUndo = vi.fn()
    const rest = W({ id: 'r', status: 'rest' })
    render(<TodayCard {...props} todays={[rest]} onUndo={onUndo} />)
    expect(screen.getByText('Rest day')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log workout' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledWith([rest])
  })
  it('a completed workout cannot be "undone" from here', () => {
    render(<TodayCard {...props} todays={[W({ status: 'completed' })]} />)
    expect(screen.getByText('Workout done 💪')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })
})

describe('HistoryTab', () => {
  const workouts = [
    W({ id: 'a', name: 'Legs', duration_minutes: 50 }),
    W({ id: 'b', name: 'Rest day', status: 'rest', workout_date: '2026-11-01' }),
  ]
  const logs = setsByWorkout([
    L({ workout_id: 'a', reps: 5, weight_kg: '100' }),
    L({ workout_id: 'a', set_number: 2, reps: 5, weight_kg: '100' }),
  ])
  it('summarises a workout and expands to its sets', async () => {
    const user = userEvent.setup()
    render(<HistoryTab today={TODAY} weekStartsOn={1} history={workouts} logsByWorkout={logs} onEdit={() => {}} />)
    expect(screen.getByText(/50 min · 2 sets · 1,000 kg/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Legs/ }))
    expect(screen.getByText('5×100kg, 5×100kg')).toBeInTheDocument()
  })
  it('rest days cannot be edited, workouts can; delete confirms and names the workout', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    mocks.confirm.mockResolvedValue(true)
    render(<HistoryTab today={TODAY} weekStartsOn={1} history={workouts} logsByWorkout={logs} onEdit={onEdit} />)
    const items = screen.getAllByRole('button', { name: 'Workout actions' })
    await user.click(items[1])
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull()
    await user.keyboard('{Escape}')
    await user.click(items[0])
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
    await user.click(items[0])
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('workouts', 'a'))
    expect(mocks.confirm.mock.calls[0][0].description).toMatch(/Legs .*sets are deleted too/)
  })
  it('shows an empty state', () => {
    render(<HistoryTab today={TODAY} weekStartsOn={1} history={[]} logsByWorkout={new Map()} onEdit={() => {}} />)
    expect(screen.getByText('No workouts logged')).toBeInTheDocument()
  })
})

describe('WeeklyPlan and RoutinesTab', () => {
  it('changing a day reports the weekday number and the chosen value ("" = flexible)', async () => {
    const user = userEvent.setup()
    const onPlan = vi.fn()
    render(
      <WeeklyPlan
        weekDays={['2026-11-02', '2026-11-03']}
        today={TODAY}
        plan={{ 1: 'r1' }}
        routines={[{ id: 'r1', name: 'Push day' }]}
        workouts={[W({ workout_date: '2026-11-03', status: 'rest' })]}
        completed={[W({ workout_date: '2026-11-02' })]}
        planning={false}
        onPlan={onPlan}
      />,
    )
    expect(screen.getByLabelText('Plan for Monday')).toHavePickerValue('r1')
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('Rest')).toBeInTheDocument()
    expect(screen.getByText('TODAY')).toBeInTheDocument()
    await pickOption(user, screen.getByLabelText('Plan for Tuesday'), 'rest')
    expect(onPlan).toHaveBeenCalledWith('2', 'rest')
    await pickOption(user, screen.getByLabelText('Plan for Monday'), '')
    expect(onPlan).toHaveBeenCalledWith('1', '')
  })
  it('tells you to create a routine first when there are none', () => {
    render(
      <WeeklyPlan
        weekDays={['2026-11-02']}
        today={TODAY}
        plan={{}}
        routines={[]}
        workouts={[]}
        completed={[]}
        planning={false}
        onPlan={() => {}}
      />,
    )
    expect(screen.getByText(/Create a routine in the Routines tab/)).toBeInTheDocument()
  })
  it('RoutinesTab: start passes the routine, delete is confirmed', async () => {
    const user = userEvent.setup()
    const onStart = vi.fn()
    mocks.confirm.mockResolvedValue(true)
    render(<RoutinesTab routines={[routine]} onCreate={() => {}} onEdit={() => {}} onStart={onStart} />)
    expect(screen.getByText(/Bench Press/)).toBeInTheDocument()
    expect(screen.getByText(/3×8 @ 60kg/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Actions for Push day' }))
    await user.click(screen.getByRole('menuitem', { name: 'Start workout' }))
    expect(onStart).toHaveBeenCalledWith(routine)
    await user.click(screen.getByRole('button', { name: 'Actions for Push day' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('routines', 'r1'))
  })
})
