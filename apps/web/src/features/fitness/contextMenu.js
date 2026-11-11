import { CheckCheck, Copy, CopyPlus, Dumbbell, ExternalLink, PersonStanding, Pencil, Plus, Trash2 } from 'lucide-react'
import { SEPARATOR } from '@/components/context-menu/items'
import { changeField, copyDetails, duplicateRow } from '@/components/context-menu/helpers'
import { fmtDay } from '@/lib/dates'
import { saveWorkout } from '@/services/api'
import * as store from '@/hooks/store'

const SERVER = ['id', 'created_at', 'updated_at', 'user_id']
const strip = (row, extra = []) => Object.fromEntries(Object.entries(row).filter(([k]) => ![...SERVER, ...extra].includes(k)))

/** A logged workout (or a rest / skipped day). `d`: { today, sets, onEdit } */
export function workoutItems(w, d) {
  const completed = w.status === 'completed'
  return [
    { label: 'Edit workout', icon: Pencil, hidden: !completed, onSelect: () => d.onEdit(w) },
    {
      label: 'Mark completed',
      icon: CheckCheck,
      hidden: completed,
      onSelect: () => changeField('workouts', w, { status: 'completed' }, 'Marked completed'),
    },
    {
      label: 'Duplicate to today',
      icon: CopyPlus,
      hidden: !completed,
      onSelect: async () => {
        // The same save the workout form makes: the workout and all its sets go in together, or not at all.
        const copy = await saveWorkout(
          { ...strip(w), workout_date: d.today },
          (d.sets ?? []).map((s) => strip(s, ['workout_id'])),
        )
        return { message: 'Workout duplicated to today', undo: () => store.remove('workouts', copy.id) }
      },
    },
    {
      label: 'Copy summary',
      icon: Copy,
      onSelect: () =>
        copyDetails(w.name, [
          ['Date', fmtDay(w.workout_date, 'EEE d MMM yyyy')],
          ['Duration', w.duration_minutes && `${w.duration_minutes} min`],
          ['Sets', d.sets?.length ? String(d.sets.length) : ''],
          ['Notes', w.notes],
        ]),
    },
    SEPARATOR,
    {
      label: 'Delete workout',
      icon: Trash2,
      danger: true,
      confirm: {
        title: 'Delete this workout?',
        description: `${w.name} · ${fmtDay(w.workout_date)}. Its sets are deleted too.`,
        confirmLabel: 'Delete',
      },
      onSelect: async () => {
        await store.remove('workouts', w.id)
        return { message: 'Workout deleted' }
      },
    },
  ]
}

/** A routine card. */
export function routineItems(r, { onStart, onEdit }) {
  return [
    { label: 'Start workout', icon: Dumbbell, onSelect: () => onStart(r) },
    { label: 'Edit routine', icon: Pencil, onSelect: () => onEdit(r) },
    {
      label: 'Duplicate',
      icon: CopyPlus,
      onSelect: () => duplicateRow('routines', r, { name: `${r.name} (copy)`, archived_at: null }, 'Routine duplicated'),
    },
    SEPARATOR,
    {
      label: 'Delete routine',
      icon: Trash2,
      danger: true,
      confirm: { title: `Delete ${r.name}?`, description: 'Logged workouts stay in your history.', confirmLabel: 'Delete' },
      onSelect: async () => {
        await store.remove('routines', r.id)
        return { message: 'Routine deleted' }
      },
    },
  ]
}

/** One of your exercises. `demo` is its entry in the exercise database, when there is one. */
export function exerciseItems(e, { demo, navigate }) {
  return [
    {
      label: 'View exercise details',
      icon: PersonStanding,
      hidden: !demo,
      onSelect: () => navigate(`/fitness/exercises/${encodeURIComponent(demo.id)}`),
    },
    {
      label: 'Copy name',
      icon: Copy,
      onSelect: () =>
        copyDetails(e.name, [
          ['Muscle group', e.muscle_group],
          ['Equipment', e.equipment],
        ]),
    },
    SEPARATOR,
    {
      label: 'Remove from library',
      icon: Trash2,
      danger: true,
      confirm: {
        title: `Remove ${e.name} from the library?`,
        description: 'Past workouts keep the exercise name.',
        confirmLabel: 'Remove',
      },
      onSelect: async () => {
        await store.remove('exercises', e.id)
        return { message: 'Exercise removed' }
      },
    },
  ]
}

/** Empty space on Gym & Fitness. */
export const fitnessPageItems = ({ tab, logWorkout, newRoutine, newExercise }) => [
  { label: 'Log workout', icon: Plus, onSelect: () => logWorkout() },
  { label: 'New routine', icon: Dumbbell, hidden: tab !== 'routines', onSelect: newRoutine },
  { label: 'New exercise', icon: ExternalLink, hidden: tab !== 'library', onSelect: newExercise },
]
