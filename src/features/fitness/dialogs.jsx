import { useEffect } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { FormDialog } from '@/components/shared/FormDialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { MUSCLE_GROUPS } from '@/domain/defaults'
import { isValidDay } from '@/lib/dates'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'
import { saveWorkout, saveHealth } from '@/services/api'

const nonNeg = (max, label) => z.coerce.number({ invalid_type_error: `${label}: enter a number` }).min(0, `${label} can’t be negative`).max(max, `${label} is too large`)
const optNum = (max, label) => z.union([z.literal(''), nonNeg(max, label)])

// ----------------------------------------------------------------- exercise
export function ExerciseDialog({ open, onOpenChange }) {
  const schema = z.object({ name: z.string().trim().min(1, 'Name the exercise').max(80), muscle_group: z.string(), equipment: z.string().max(60) })
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: { name: '', muscle_group: 'Chest', equipment: '' } })
  useEffect(() => { if (open) reset({ name: '', muscle_group: 'Chest', equipment: '' }) }, [open, reset])
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
  const schema = z.object({
    name: z.string().trim().min(1, 'Name the routine').max(80), notes: z.string().max(1000),
    exercises: z.array(z.object({ name: z.string().trim().min(1, 'Exercise name'), sets: nonNeg(20, 'Sets'), reps: nonNeg(1000, 'Reps'), weight_kg: nonNeg(1000, 'Weight') })).min(1, 'Add at least one exercise'),
  })
  const blank = { name: '', notes: '', exercises: [{ name: '', sets: 3, reps: 10, weight_kg: 0 }] }
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
  const schema = z.object({
    workout_date: z.string().refine(isValidDay, 'Pick a date'), routine_id: z.string(), name: z.string().trim().min(1, 'Name the workout').max(80),
    kind: z.enum(['strength', 'cardio', 'mixed', 'other']), duration_minutes: optNum(1440, 'Duration'), cardio_minutes: optNum(1440, 'Cardio minutes'), cardio_distance_km: optNum(1000, 'Distance'), notes: z.string().max(2000),
    exercises: z.array(z.object({ name: z.string().trim().min(1, 'Exercise name'), sets: z.array(z.object({ reps: nonNeg(1000, 'Reps'), weight: nonNeg(1000, 'Weight') })) })),
  })
  const blank = { workout_date: date ?? today, routine_id: '', name: 'Workout', kind: 'strength', duration_minutes: '', cardio_minutes: '', cardio_distance_km: '', notes: '', exercises: [] }
  const { register, control, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  const { fields, append, remove } = useFieldArray({ control, name: 'exercises' })
  const fromSets = () => {
    const by = new Map()
    for (const s of [...sets].sort((a, b) => a.order_index - b.order_index || a.set_number - b.set_number)) by.set(s.exercise_name, [...(by.get(s.exercise_name) ?? []), { reps: s.reps, weight: Number(s.weight_kg) }])
    return [...by.entries()].map(([name, ss]) => ({ name, sets: ss }))
  }
  useEffect(() => {
    if (!open) return
    reset(workout ? { workout_date: workout.workout_date, routine_id: workout.routine_id ?? '', name: workout.name, kind: workout.kind, duration_minutes: workout.duration_minutes ?? '', cardio_minutes: workout.cardio_minutes ?? '', cardio_distance_km: workout.cardio_distance_km ?? '', notes: workout.notes ?? '', exercises: fromSets() } : { ...blank, workout_date: date ?? today })
    if (!workout && routineId) pickRoutine(routineId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workout?.id, date, routineId])
  const pickRoutine = (id) => {
    setValue('routine_id', id)
    const r = routines.find((x) => x.id === id)
    if (!r) return
    setValue('name', r.name)
    setValue('exercises', r.exercises.map((e) => ({ name: e.name, sets: Array.from({ length: Math.max(1, Number(e.sets) || 1) }, () => ({ reps: Number(e.reps) || 0, weight: Number(e.weight_kg) || 0 })) })))
  }
  const [save, pending] = useAction(async (v) => {
    const n = (x) => (x === '' ? null : Number(x))
    const row = { workout_date: v.workout_date, routine_id: v.routine_id || null, name: v.name, kind: v.kind, status: 'completed', duration_minutes: n(v.duration_minutes), cardio_minutes: n(v.cardio_minutes), cardio_distance_km: n(v.cardio_distance_km), notes: v.notes }
    const rows = v.exercises.flatMap((e, oi) => e.sets.map((s, si) => ({ exercise_name: e.name, exercise_id: library.find((l) => l.name.toLowerCase() === e.name.toLowerCase())?.id ?? null, order_index: oi, set_number: si + 1, reps: s.reps, weight_kg: s.weight })))
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
  const o = (max, l) => optNum(max, l)
  const schema = z.object({ measured_on: z.string().refine(isValidDay, 'Pick a date'), weight_kg: z.union([z.literal(''), z.coerce.number().min(20).max(500)]), chest_cm: o(300, 'Chest'), waist_cm: o(300, 'Waist'), hips_cm: o(300, 'Hips'), arm_cm: o(150, 'Arm'), thigh_cm: o(200, 'Thigh'), body_fat_pct: o(80, 'Body fat'), notes: z.string().max(500) })
  const blank = { measured_on: today, weight_kg: '', chest_cm: '', waist_cm: '', hips_cm: '', arm_cm: '', thigh_cm: '', body_fat_pct: '', notes: '' }
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(() => { if (open) reset({ ...blank, measured_on: today }) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async (v) => {
    const n = (x) => (x === '' ? null : Number(x))
    const { weight_kg, ...rest } = v
    const body = Object.fromEntries(Object.entries(rest).map(([k, x]) => [k, k === 'measured_on' || k === 'notes' ? x : n(x)]))
    if (Object.entries(body).every(([k, x]) => k === 'measured_on' || k === 'notes' || x == null) && weight_kg === '') throw new Error('Enter at least one measurement.')
    if (Object.entries(body).some(([k, x]) => k.endsWith('_cm') || k === 'body_fat_pct' ? x != null : false)) await store.upsert('body_measurements', body, { onConflict: 'user_id,measured_on' })
    if (weight_kg !== '') await saveHealth(v.measured_on, { weight_kg: Number(weight_kg) })
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
