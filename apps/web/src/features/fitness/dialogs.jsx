import { useEffect } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { blankExercise, blankMeasurement, blankRoutine, blankWorkout, exerciseFormSchema, measurementFormSchema, measurementFormToPayloads, routineFormSchema, workoutFormSchema, workoutFormToPayload, workoutToForm } from '@lifetrack/schemas'
import { exercisesFromSets, routineToExercises, workoutRows } from '@lifetrack/core/fitness'
import { Plus, Trash2 } from 'lucide-react'
import { FormDialog } from '@/components/shared/FormDialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { MUSCLE_GROUPS } from '@lifetrack/constants/defaults'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'
import { saveWorkout, saveHealth } from '@/services/api'

// ----------------------------------------------------------------- exercise
export function ExerciseDialog({ open, onOpenChange }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(exerciseFormSchema), defaultValues: blankExercise() })
  useEffect(() => { if (open) reset(blankExercise()) }, [open, reset])
  const [save, pending] = useAction(async (v) => { await store.insert('exercises', v); onOpenChange(false) }, { success: 'Exercise added' })
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="New exercise" pending={pending} onSubmit={handleSubmit(save)}>
      <Field label="Name" error={errors.name?.message}><Input autoFocus {...register('name')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Muscle group"><Select {...register('muscle_group')}>{MUSCLE_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select></Field>
        <Field label="Equipment"><Input placeholder="Barbell, cable…" {...register('equipment')} /></Field>
      </div>
    </FormDialog>
  )
}

// ------------------------------------------------------------------ routine
export function RoutineDialog({ open, onOpenChange, routine, library }) {
  const schema = routineFormSchema
  const blank = blankRoutine()
  const { register, control, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  const { fields, append, remove } = useFieldArray({ control, name: 'exercises' })
  useEffect(() => { if (open) reset(routine ? { name: routine.name, notes: routine.notes ?? '', exercises: routine.exercises } : blank) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [open, routine?.id])
  const [save, pending] = useAction(async (v) => {
    if (routine) await store.update('routines', routine.id, v); else await store.insert('routines', v)
    onOpenChange(false)
  }, { success: routine ? 'Routine updated' : 'Routine created' })
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={routine ? 'Edit routine' : 'New routine'} pending={pending} onSubmit={handleSubmit(save)} className="md:max-w-xl">
      <Field label="Name" error={errors.name?.message}><Input autoFocus placeholder="e.g. Push day, Full body A" {...register('name')} /></Field>
      <div className="space-y-2">
        <p className="text-[13px] font-medium">Exercises</p>
        <datalist id="lib-ex">{library.map((e) => <option key={e.id} value={e.name} />)}</datalist>
        {fields.map((f, i) => (
          <div key={f.id} className="grid grid-cols-[1fr_3.5rem_3.5rem_4.5rem_2rem] items-start gap-1.5">
            <div><Input list="lib-ex" aria-label={`Exercise ${i + 1} name`} placeholder="Exercise" {...register(`exercises.${i}.name`)} />{errors.exercises?.[i]?.name && <p className="mt-1 text-xs text-danger">{errors.exercises[i].name.message}</p>}</div>
            <Input type="number" inputMode="numeric" aria-label="Sets" placeholder="Sets" {...register(`exercises.${i}.sets`)} />
            <Input type="number" inputMode="numeric" aria-label="Reps" placeholder="Reps" {...register(`exercises.${i}.reps`)} />
            <Input type="number" inputMode="decimal" step="0.5" aria-label="Weight kg" placeholder="kg" {...register(`exercises.${i}.weight_kg`)} />
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove exercise" onClick={() => remove(i)} disabled={fields.length === 1}><Trash2 className="h-4 w-4" /></Button>
          </div>))}
        {errors.exercises?.message && <p className="text-xs text-danger">{errors.exercises.message}</p>}
        <Button type="button" variant="outline" size="sm" onClick={() => append({ name: '', sets: 3, reps: 10, weight_kg: 0 })}><Plus className="h-3.5 w-3.5" />Add exercise</Button>
      </div>
      <Field label="Notes"><Textarea rows={2} {...register('notes')} /></Field>
    </FormDialog>
  )
}

// ------------------------------------------------------------------ workout
function Sets({ control, register, index, errors }) {
  const { fields, append, remove } = useFieldArray({ control, name: `exercises.${index}.sets` })
  return (
    <div className="space-y-1.5">
      {fields.map((f, s) => (
        <div key={f.id} className="grid grid-cols-[1.5rem_1fr_1fr_2rem] items-center gap-1.5">
          <span className="text-center text-xs text-muted-foreground">{s + 1}</span>
          <Input type="number" inputMode="numeric" aria-label={`Set ${s + 1} reps`} placeholder="reps" {...register(`exercises.${index}.sets.${s}.reps`)} />
          <Input type="number" inputMode="decimal" step="0.5" aria-label={`Set ${s + 1} weight`} placeholder="kg" {...register(`exercises.${index}.sets.${s}.weight`)} />
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove set" onClick={() => remove(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>))}
      {errors?.exercises?.[index]?.sets && <p className="text-xs text-danger">Check reps and weight (numbers, 0 or more)</p>}
      <Button type="button" variant="ghost" size="sm" onClick={() => { const last = fields.at(-1); append({ reps: last?.reps ?? 10, weight: last?.weight ?? 0 }) }}><Plus className="h-3.5 w-3.5" />Set</Button>
    </div>
  )
}

export function WorkoutDialog({ open, onOpenChange, workout, sets = [], routines, library, today, date, routineId }) {
  const schema = workoutFormSchema
  const blank = blankWorkout(date ?? today)
  const { register, control, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  const { fields, append, remove } = useFieldArray({ control, name: 'exercises' })
  const fromSets = () => exercisesFromSets(sets)
  useEffect(() => {
    if (!open) return
    reset(workout ? workoutToForm(workout, fromSets()) : { ...blank, workout_date: date ?? today })
    if (!workout && routineId) pickRoutine(routineId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workout?.id, date, routineId])
  const pickRoutine = (id) => {
    setValue('routine_id', id)
    const r = routines.find((x) => x.id === id)
    if (!r) return
    setValue('name', r.name)
    setValue('exercises', routineToExercises(r))
  }
  const [save, pending] = useAction(async (v) => {
    const row = workoutFormToPayload(v)
    const rows = workoutRows(v.exercises, library)
    await saveWorkout(row, rows, workout)
    onOpenChange(false)
  }, { success: workout ? 'Workout updated' : 'Workout logged' })
  const kind = watch('kind')
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={workout ? 'Edit workout' : 'Log workout'} pending={pending} onSubmit={handleSubmit(save)} submitLabel={workout ? 'Save changes' : 'Log workout'} className="md:max-w-xl">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" error={errors.workout_date?.message}><Input type="date" {...register('workout_date')} /></Field>
        <Field label="Routine (optional)"><Select value={watch('routine_id')} onChange={(e) => pickRoutine(e.target.value)}><option value="">Freestyle</option>{routines.filter((r) => !r.archived_at).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <Field label="Name" error={errors.name?.message}><Input {...register('name')} /></Field>
        <Field label="Type"><Select {...register('kind')}><option value="strength">Strength</option><option value="cardio">Cardio</option><option value="mixed">Mixed</option><option value="other">Other</option></Select></Field>
        <Field label="Duration (min)" error={errors.duration_minutes?.message}><Input type="number" inputMode="numeric" {...register('duration_minutes')} /></Field>
      </div>
      {(kind === 'cardio' || kind === 'mixed') && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cardio minutes" error={errors.cardio_minutes?.message}><Input type="number" inputMode="numeric" {...register('cardio_minutes')} /></Field>
          <Field label="Distance (km)" error={errors.cardio_distance_km?.message}><Input type="number" inputMode="decimal" step="0.1" {...register('cardio_distance_km')} /></Field>
        </div>)}
      {kind !== 'cardio' && (
        <div className="space-y-3">
          <datalist id="lib-ex2">{library.map((e) => <option key={e.id} value={e.name} />)}</datalist>
          {fields.map((f, i) => (
            <div key={f.id} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center gap-2"><Input list="lib-ex2" aria-label={`Exercise ${i + 1}`} placeholder="Exercise" {...register(`exercises.${i}.name`)} /><Button type="button" variant="ghost" size="icon-sm" aria-label="Remove exercise" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button></div>
              {errors.exercises?.[i]?.name && <p className="text-xs text-danger">{errors.exercises[i].name.message}</p>}
              <Sets control={control} register={register} index={i} errors={errors} />
            </div>))}
          <Button type="button" variant="outline" size="sm" onClick={() => append({ name: '', sets: [{ reps: 10, weight: 0 }] })}><Plus className="h-3.5 w-3.5" />Add exercise</Button>
        </div>)}
      <Field label="Notes"><Textarea rows={2} {...register('notes')} /></Field>
    </FormDialog>
  )
}

// -------------------------------------------------------------- measurements
export function MeasurementDialog({ open, onOpenChange, today }) {
  const schema = measurementFormSchema
  const blank = blankMeasurement(today)
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(() => { if (open) reset({ ...blank, measured_on: today }) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async (v) => {
    const { body, weight, date: d } = measurementFormToPayloads(v)
    if (body) await store.upsert('body_measurements', body, { onConflict: 'user_id,measured_on' })
    if (weight != null) await saveHealth(d, { weight_kg: weight })
    onOpenChange(false)
  }, { success: 'Measurements saved' })
  const f = (name, label) => <Field label={label} error={errors[name]?.message}><Input type="number" inputMode="decimal" step="0.1" {...register(name)} /></Field>
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Log body metrics" pending={pending} onSubmit={handleSubmit(save)}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" error={errors.measured_on?.message}><Input type="date" {...register('measured_on')} /></Field>{f('weight_kg', 'Weight (kg)')}
        {f('chest_cm', 'Chest (cm)')}{f('waist_cm', 'Waist (cm)')}{f('hips_cm', 'Hips (cm)')}{f('arm_cm', 'Arm (cm)')}{f('thigh_cm', 'Thigh (cm)')}{f('body_fat_pct', 'Body fat (%)')}
      </div>
    </FormDialog>
  )
}
