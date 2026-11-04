import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/misc'
import { useTables } from '@/hooks/store'
import * as store from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { useAction } from '@/hooks/useAction'
import { historyOf, libraryGroups, planLabel, setsByWorkout, weekStats, weeklySeries } from '@/domain/fitness'
import { weightSeries } from '@/domain/health'
import { addDays, eachDay, startOfWeek } from '@/lib/dates'
import { BodyTab } from './BodyTab'
import { ExerciseDialog } from './ExerciseDialog'
import { FitnessStats } from './FitnessStats'
import { HistoryTab } from './HistoryTab'
import { LibraryTab } from './LibraryTab'
import { MeasurementDialog } from './MeasurementDialog'
import { ProgressTab } from './ProgressTab'
import { RoutineDialog } from './RoutineDialog'
import { RoutinesTab } from './RoutinesTab'
import { WeekTab } from './WeekTab'
import { WorkoutDialog } from './WorkoutDialog'

const TABS = [
  { value: 'week', label: 'This week' },
  { value: 'progress', label: 'Progress' },
  { value: 'routines', label: 'Routines' },
  { value: 'history', label: 'History' },
  { value: 'library', label: 'Exercises' },
  { value: 'body', label: 'Body' },
]

export default function FitnessPage() {
  const today = useToday()
  const { settings, save: saveSettings } = useSettings()
  const weekStartsOn = settings.week_starts_on
  const { data, loading, error, refetch } = useTables(
    'workouts',
    'exercise_logs',
    'routines',
    'exercises',
    'body_measurements',
    'health_logs',
  )
  const [tab, setTab] = useState('week')
  const [workoutDlg, setWorkoutDlg] = useState({ open: false, workout: null, date: today, routineId: null })
  const [routineDlg, setRoutineDlg] = useState({ open: false, routine: null })
  const [exerciseDlg, setExerciseDlg] = useState(false)
  const [measurementDlg, setMeasurementDlg] = useState(false)

  const [markOff] = useAction(
    (status) => store.insert('workouts', { workout_date: today, status, name: status === 'rest' ? 'Rest day' : 'Skipped', kind: 'other' }),
    { success: 'Saved' },
  )
  const [undoOff] = useAction((records) =>
    store.removeMany(
      'workouts',
      records.map((x) => x.id),
    ),
  )
  const [setPlan, planning] = useAction(
    (dow, value) => saveSettings({ workout_plan: { ...settings.workout_plan, [dow]: value || null } }),
    { success: 'Plan updated' },
  )

  const routines = useMemo(() => data.routines.filter((r) => !r.archived_at), [data.routines])
  const plan = useMemo(() => settings.workout_plan ?? {}, [settings.workout_plan])
  const weekStart = startOfWeek(today, weekStartsOn)
  const weekDays = useMemo(() => eachDay(weekStart, addDays(weekStart, 6)), [weekStart])
  const logsByWorkout = useMemo(() => setsByWorkout(data.exercise_logs), [data.exercise_logs])
  const completed = useMemo(() => data.workouts.filter((x) => x.status === 'completed'), [data.workouts])
  const stats = useMemo(() => weekStats({ completed, weekStart, plan, logsByWorkout }), [completed, weekStart, plan, logsByWorkout])
  const weeks = useMemo(() => weeklySeries(completed, logsByWorkout, weekStart), [completed, logsByWorkout, weekStart])
  const weight = useMemo(() => weightSeries(data.health_logs), [data.health_logs])
  const history = useMemo(() => historyOf(data.workouts), [data.workouts])
  const library = useMemo(() => [...data.exercises].sort((a, b) => a.name.localeCompare(b.name)), [data.exercises])
  const groups = useMemo(() => libraryGroups(data.exercises), [data.exercises])
  const todays = data.workouts.filter((x) => x.workout_date === today)

  const logWorkout = (extra = {}) => setWorkoutDlg({ open: true, workout: null, date: today, routineId: null, ...extra })

  return (
    <>
      <PageHeader
        title="Gym & Fitness"
        description="Plan your week, log your sets and see your progress."
        actions={
          <Button onClick={() => logWorkout()}>
            <Plus className="h-4 w-4" />
            Log workout
          </Button>
        }
      />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-5">
          <FitnessStats stats={stats} latestWeight={weight.latest} />
          <Segmented value={tab} onChange={setTab} options={TABS} />

          {tab === 'week' && (
            <WeekTab
              weekDays={weekDays}
              today={today}
              plan={plan}
              routines={routines}
              workouts={data.workouts}
              completed={completed}
              todays={todays}
              planToday={planLabel(plan, routines, today)}
              weeks={weeks}
              planning={planning}
              onPlan={setPlan}
              onLog={() => logWorkout()}
              onMarkOff={markOff}
              onUndo={undoOff}
            />
          )}
          {tab === 'progress' && <ProgressTab logs={data.exercise_logs} workouts={data.workouts} onLog={() => logWorkout()} />}
          {tab === 'routines' && (
            <RoutinesTab
              routines={routines}
              onCreate={() => setRoutineDlg({ open: true, routine: null })}
              onEdit={(routine) => setRoutineDlg({ open: true, routine })}
              onStart={(routine) => logWorkout({ routineId: routine.id })}
            />
          )}
          {tab === 'history' && (
            <HistoryTab
              history={history}
              logsByWorkout={logsByWorkout}
              today={today}
              weekStartsOn={weekStartsOn}
              onEdit={(workout) => logWorkout({ workout, date: workout.workout_date })}
            />
          )}
          {tab === 'library' && <LibraryTab groups={groups} onCreate={() => setExerciseDlg(true)} />}
          {tab === 'body' && (
            <BodyTab weightData={weight.data} measurements={data.body_measurements} onLog={() => setMeasurementDlg(true)} />
          )}
        </div>
      </DataGate>

      <WorkoutDialog
        open={workoutDlg.open}
        workout={workoutDlg.workout}
        sets={workoutDlg.workout ? (logsByWorkout.get(workoutDlg.workout.id) ?? []) : []}
        routines={routines}
        library={library}
        today={today}
        date={workoutDlg.date}
        routineId={workoutDlg.routineId}
        onOpenChange={(o) => setWorkoutDlg((d) => ({ ...d, open: o }))}
      />
      <RoutineDialog
        open={routineDlg.open}
        routine={routineDlg.routine}
        library={library}
        onOpenChange={(o) => setRoutineDlg((d) => ({ ...d, open: o }))}
      />
      <ExerciseDialog open={exerciseDlg} onOpenChange={setExerciseDlg} />
      <MeasurementDialog open={measurementDlg} onOpenChange={setMeasurementDlg} today={today} />
    </>
  )
}
