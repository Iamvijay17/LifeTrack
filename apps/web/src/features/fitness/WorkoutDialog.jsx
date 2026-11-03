import { useFieldArray } from 'react-hook-form'
import { z } from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { FormDialog } from '@/components/shared/FormDialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { formExercisesToLogs, groupSets, routineToFormExercises } from '@/domain/fitness'
import { nonNegativeNumber, optionalNumber, requiredDay } from '@/lib/validation'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import { saveWorkout } from '@/services/api'
import { WorkoutSets } from './WorkoutSets'

const schema = z.object({
  workout_date: requiredDay(),
  routine_id: z.string(),
  name: z.string().trim().min(1, 'Name the workout').max(80),
  kind: z.enum(['strength', 'cardio', 'mixed', 'other']),
  duration_minutes: optionalNumber(1440, 'Duration'),
  cardio_minutes: optionalNumber(1440, 'Cardio minutes'),
  cardio_distance_km: optionalNumber(1000, 'Distance'),
  notes: z.string().max(2000),
  exercises: z.array(
    z.object({
      name: z.string().trim().min(1, 'Exercise name'),
      sets: z.array(z.object({ reps: nonNegativeNumber(1000, 'Reps'), weight: nonNegativeNumber(1000, 'Weight') })),
    }),
  ),
})

const toNumberOrNull = (x) => (x === '' ? null : Number(x))

/**
 * Log or edit a workout. Opened from a routine (`routineId`) it starts with that routine's exercises and sets filled in;
 * the same workout can be edited later from its saved sets.
 */
export function WorkoutDialog({ open, onOpenChange, workout, sets = [], routines, library, today, date, routineId }) {
  const day = date ?? today
  const blank = {
    workout_date: day,
    routine_id: '',
    name: 'Workout',
    kind: 'strength',
    duration_minutes: '',
    cardio_minutes: '',
    cardio_distance_km: '',
    notes: '',
    exercises: [],
  }
  const fromWorkout = (w) => ({
    workout_date: w.workout_date,
    routine_id: w.routine_id ?? '',
    name: w.name,
    kind: w.kind,
    duration_minutes: w.duration_minutes ?? '',
    cardio_minutes: w.cardio_minutes ?? '',
    cardio_distance_km: w.cardio_distance_km ?? '',
    notes: w.notes ?? '',
    exercises: groupSets(sets),
  })
  const fromRoutine = (r) => ({ ...blank, routine_id: r.id, name: r.name, exercises: routineToFormExercises(r) })
  const startingRoutine = !workout && routineId ? routines.find((r) => r.id === routineId) : null

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useDialogForm({
    open,
    schema,
    recordKey: `${workout?.id ?? 'new'}|${day}|${routineId ?? ''}`,
    valuesFor: () => (workout ? fromWorkout(workout) : startingRoutine ? fromRoutine(startingRoutine) : blank),
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'exercises' })

  // Choosing a routine in the form replaces the exercises with that routine's template.
  const pickRoutine = (id) => {
    setValue('routine_id', id)
    const r = routines.find((x) => x.id === id)
    if (!r) return
    setValue('name', r.name)
    setValue('exercises', routineToFormExercises(r))
  }

  const [save, pending] = useAction(
    async (v) => {
      const row = {
        workout_date: v.workout_date,
        routine_id: v.routine_id || null,
        name: v.name,
        kind: v.kind,
        status: 'completed',
        duration_minutes: toNumberOrNull(v.duration_minutes),
        cardio_minutes: toNumberOrNull(v.cardio_minutes),
        cardio_distance_km: toNumberOrNull(v.cardio_distance_km),
        notes: v.notes,
      }
      await saveWorkout(row, formExercisesToLogs(v.exercises, library), workout)
      onOpenChange(false)
    },
    { success: workout ? 'Workout updated' : 'Workout logged' },
  )
  const kind = watch('kind')

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={workout ? 'Edit workout' : 'Log workout'}
      pending={pending}
      onSubmit={handleSubmit(save)}
      submitLabel={workout ? 'Save changes' : 'Log workout'}
      className="md:max-w-xl"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" error={errors.workout_date?.message}>
          <Input type="date" {...register('workout_date')} />
        </Field>
        <Field label="Routine (optional)">
          <Select value={watch('routine_id')} onChange={(e) => pickRoutine(e.target.value)}>
            <option value="">Freestyle</option>
            {routines
              .filter((r) => !r.archived_at)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Name" error={errors.name?.message}>
          <Input {...register('name')} />
        </Field>
        <Field label="Type">
          <Select {...register('kind')}>
            <option value="strength">Strength</option>
            <option value="cardio">Cardio</option>
            <option value="mixed">Mixed</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Duration (min)" error={errors.duration_minutes?.message}>
          <Input type="number" inputMode="numeric" {...register('duration_minutes')} />
        </Field>
      </div>
      {(kind === 'cardio' || kind === 'mixed') && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cardio minutes" error={errors.cardio_minutes?.message}>
            <Input type="number" inputMode="numeric" {...register('cardio_minutes')} />
          </Field>
          <Field label="Distance (km)" error={errors.cardio_distance_km?.message}>
            <Input type="number" inputMode="decimal" step="0.1" {...register('cardio_distance_km')} />
          </Field>
        </div>
      )}
      {kind !== 'cardio' && (
        <div className="space-y-3">
          <datalist id="lib-ex2">
            {library.map((e) => (
              <option key={e.id} value={e.name} />
            ))}
          </datalist>
          {fields.map((f, i) => (
            <div key={f.id} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                <Input list="lib-ex2" aria-label={`Exercise ${i + 1}`} placeholder="Exercise" {...register(`exercises.${i}.name`)} />
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove exercise" onClick={() => remove(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {errors.exercises?.[i]?.name && <p className="text-xs text-danger">{errors.exercises[i].name.message}</p>}
              <WorkoutSets control={control} register={register} index={i} errors={errors} />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => append({ name: '', sets: [{ reps: 10, weight: 0 }] })}>
            <Plus className="h-3.5 w-3.5" />
            Add exercise
          </Button>
        </div>
      )}
      <Field label="Notes">
        <Textarea rows={2} {...register('notes')} />
      </Field>
    </FormDialog>
  )
}
