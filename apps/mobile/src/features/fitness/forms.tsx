import { useEffect } from 'react'
import { Text, View } from 'react-native'
import { MUSCLE_GROUPS } from '@lifetrack/constants/defaults'
import { exercisesFromSets, routineToExercises, workoutRows } from '@lifetrack/core/fitness'
import { blankExercise, blankMeasurement, blankRoutine, blankWorkout, exerciseFormSchema, measurementFormSchema, measurementFormToPayloads, routineFormSchema, workoutFormSchema, workoutFormToPayload, workoutToForm } from '@lifetrack/schemas'
import { api, store } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useZodForm } from '../../hooks/useZodForm'
import { useTheme } from '../../providers/ThemeProvider'
import { Sheet } from '../../ui/Sheet'
import { ChipGroup, DateField, SelectField } from '../../ui/controls'
import { Button, Field } from '../../ui'

const multiline = { multiline: true, numberOfLines: 2, style: { minHeight: 64, textAlignVertical: 'top' as const, paddingTop: 12 } }

export function ExerciseForm({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { values, errors, set, reset, validate } = useZodForm(exerciseFormSchema, blankExercise())
  useEffect(() => { if (visible) reset(blankExercise()) }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => { const v = validate(); if (!v) return; await store.insert('exercises', v); onClose() })
  return (
    <Sheet visible={visible} title="New exercise" onClose={onClose} footer={<Button title="Add exercise" onPress={save} loading={pending} />}>
      <Field label="Name" value={values.name} onChangeText={(t) => set('name', t)} error={errors.name} autoFocus maxLength={80} />
      <ChipGroup label="Muscle group" value={values.muscle_group} options={(MUSCLE_GROUPS as string[]).map((g) => ({ value: g, label: g }))} onChange={(v) => set('muscle_group', v)} />
      <Field label="Equipment" value={values.equipment} onChangeText={(t) => set('equipment', t)} placeholder="Barbell, cable…" maxLength={60} />
    </Sheet>
  )
}

export function RoutineForm({ visible, routine, library, onClose }: { visible: boolean; routine: any | null; library: any[]; onClose: () => void }) {
  const { colors } = useTheme()
  const { values, errors, set, reset, validate } = useZodForm(routineFormSchema, blankRoutine())
  useEffect(() => { if (visible) reset(routine ? { name: routine.name, notes: routine.notes ?? '', exercises: routine.exercises } : blankRoutine()) }, [visible, routine?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    if (routine) await store.update('routines', routine.id, v); else await store.insert('routines', v)
    onClose()
  })
  const rows = values.exercises as any[]
  const edit = (i: number, patch: object) => set('exercises', rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) as any)
  return (
    <Sheet visible={visible} title={routine ? 'Edit routine' : 'New routine'} onClose={onClose} footer={<Button title={routine ? 'Save changes' : 'Create routine'} onPress={save} loading={pending} />}>
      <Field label="Name" value={values.name} onChangeText={(t) => set('name', t)} error={errors.name} placeholder="e.g. Push day, Full body A" autoFocus={!routine} maxLength={80} />
      <Text style={{ color: colors.foreground, fontWeight: '500' }}>Exercises</Text>
      {rows.map((r, i) => (
        <View key={i} style={{ gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10 }}>
          <SelectField label={`Exercise ${i + 1} (from library)`} value="" placeholder="Pick from library…" options={library.map((e) => ({ value: e.name, label: e.name, group: e.muscle_group || 'Other' }))} onChange={(v) => edit(i, { name: v })} />
          <Field label="Name" value={r.name} onChangeText={(t) => edit(i, { name: t })} maxLength={80} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="Sets" value={String(r.sets ?? '')} onChangeText={(t) => edit(i, { sets: t })} keyboardType="number-pad" maxLength={2} /></View>
            <View style={{ flex: 1 }}><Field label="Reps" value={String(r.reps ?? '')} onChangeText={(t) => edit(i, { reps: t })} keyboardType="number-pad" maxLength={4} /></View>
            <View style={{ flex: 1 }}><Field label="kg" value={String(r.weight_kg ?? '')} onChangeText={(t) => edit(i, { weight_kg: t })} keyboardType="decimal-pad" maxLength={6} /></View>
          </View>
          <Button title="Remove exercise" variant="ghost" disabled={rows.length === 1} onPress={() => set('exercises', rows.filter((_, k) => k !== i) as any)} />
        </View>
      ))}
      {errors.exercises ? <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 13 }}>{errors.exercises}</Text> : null}
      <Button title="＋ Add exercise" variant="ghost" onPress={() => set('exercises', [...rows, { name: '', sets: 3, reps: 10, weight_kg: 0 }] as any)} />
      <Field label="Notes" value={values.notes} onChangeText={(t) => set('notes', t)} {...multiline} />
    </Sheet>
  )
}

export function WorkoutForm({ visible, workout, sets, routines, library, today, date, routineId, onClose }: { visible: boolean; workout: any | null; sets: any[]; routines: any[]; library: any[]; today: string; date: string; routineId: string | null; onClose: () => void }) {
  const { colors } = useTheme()
  const { values, errors, set, reset, validate } = useZodForm(workoutFormSchema, blankWorkout(date))
  useEffect(() => {
    if (!visible) return
    if (workout) { reset(workoutToForm(workout, exercisesFromSets(sets))); return }
    const r = routineId ? routines.find((x) => x.id === routineId) : null
    reset(r ? { ...blankWorkout(date), routine_id: r.id, name: r.name, exercises: routineToExercises(r) } : blankWorkout(date))
  }, [visible, workout?.id, date, routineId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    await api.saveWorkout(workoutFormToPayload(v), workoutRows(v.exercises, library), workout)
    onClose()
  })
  const ex = values.exercises as any[]
  const editEx = (i: number, patch: object) => set('exercises', ex.map((e, k) => (k === i ? { ...e, ...patch } : e)) as any)
  const editSet = (i: number, s: number, patch: object) => editEx(i, { sets: ex[i].sets.map((x: any, k: number) => (k === s ? { ...x, ...patch } : x)) })
  const pick = (id: string) => {
    const r = routines.find((x) => x.id === id)
    set('routine_id', id)
    if (r) { set('name', r.name); set('exercises', routineToExercises(r) as any) }
  }
  const kind = values.kind
  return (
    <Sheet visible={visible} title={workout ? 'Edit workout' : 'Log workout'} onClose={onClose} footer={<Button title={workout ? 'Save changes' : 'Log workout'} onPress={save} loading={pending} />}>
      <DateField label="Date" value={values.workout_date} onChange={(v) => set('workout_date', v)} error={errors.workout_date} />
      <SelectField label="Routine (optional)" value={values.routine_id} onChange={pick} options={[{ value: '', label: 'Freestyle' }, ...routines.filter((r) => !r.archived_at).map((r) => ({ value: r.id, label: r.name }))]} />
      <Field label="Name" value={values.name} onChangeText={(t) => set('name', t)} error={errors.name} maxLength={80} />
      <ChipGroup label="Type" value={values.kind} options={[{ value: 'strength', label: 'Strength' }, { value: 'cardio', label: 'Cardio' }, { value: 'mixed', label: 'Mixed' }, { value: 'other', label: 'Other' }]} onChange={(v) => set('kind', v)} />
      <Field label="Duration (min)" value={String(values.duration_minutes ?? '')} onChangeText={(t) => set('duration_minutes', t as any)} error={errors.duration_minutes} keyboardType="number-pad" maxLength={4} />
      {kind === 'cardio' || kind === 'mixed' ? (<>
        <Field label="Cardio minutes" value={String(values.cardio_minutes ?? '')} onChangeText={(t) => set('cardio_minutes', t as any)} error={errors.cardio_minutes} keyboardType="number-pad" maxLength={4} />
        <Field label="Distance (km)" value={String(values.cardio_distance_km ?? '')} onChangeText={(t) => set('cardio_distance_km', t as any)} error={errors.cardio_distance_km} keyboardType="decimal-pad" maxLength={6} />
      </>) : null}
      {kind !== 'cardio' ? (<>
        {ex.map((e, i) => (
          <View key={i} style={{ gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10 }}>
            <SelectField label={`Exercise ${i + 1} (from library)`} value="" placeholder="Pick from library…" options={library.map((l) => ({ value: l.name, label: l.name, group: l.muscle_group || 'Other' }))} onChange={(v) => editEx(i, { name: v })} />
            <Field label="Name" value={e.name} onChangeText={(t) => editEx(i, { name: t })} maxLength={80} />
            {e.sets.map((s: any, k: number) => (
              <View key={k} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <Text style={{ color: colors.mutedForeground, width: 18, paddingBottom: 14 }}>{k + 1}</Text>
                <View style={{ flex: 1 }}><Field label="Reps" value={String(s.reps ?? '')} onChangeText={(t) => editSet(i, k, { reps: t })} keyboardType="number-pad" maxLength={4} /></View>
                <View style={{ flex: 1 }}><Field label="kg" value={String(s.weight ?? '')} onChangeText={(t) => editSet(i, k, { weight: t })} keyboardType="decimal-pad" maxLength={6} /></View>
                <Button title="✕" variant="ghost" onPress={() => editEx(i, { sets: e.sets.filter((_: any, q: number) => q !== k) })} />
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button title="＋ Set" variant="ghost" onPress={() => { const last = e.sets.at(-1); editEx(i, { sets: [...e.sets, { reps: last?.reps ?? 10, weight: last?.weight ?? 0 }] }) }} /></View>
              <View style={{ flex: 1 }}><Button title="Remove" variant="ghost" onPress={() => set('exercises', ex.filter((_, q) => q !== i) as any)} /></View>
            </View>
          </View>
        ))}
        {errors.exercises ? <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 13 }}>{errors.exercises}</Text> : null}
        <Button title="＋ Add exercise" variant="ghost" onPress={() => set('exercises', [...ex, { name: '', sets: [{ reps: 10, weight: 0 }] }] as any)} />
      </>) : null}
      <Field label="Notes" value={values.notes} onChangeText={(t) => set('notes', t)} {...multiline} />
    </Sheet>
  )
}

export function MeasurementForm({ visible, today, onClose }: { visible: boolean; today: string; onClose: () => void }) {
  const { values, errors, set, reset, validate } = useZodForm(measurementFormSchema, blankMeasurement(today))
  useEffect(() => { if (visible) reset(blankMeasurement(today)) }, [visible, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    const { body, weight, date } = measurementFormToPayloads(v)
    if (body) await store.upsert('body_measurements', body, { onConflict: 'user_id,measured_on' })
    if (weight != null) await api.saveHealth(date, { weight_kg: weight })
    onClose()
  })
  const num = (k: 'weight_kg' | 'chest_cm' | 'waist_cm' | 'hips_cm' | 'arm_cm' | 'thigh_cm' | 'body_fat_pct', label: string) =>
    <Field label={label} value={String(values[k] ?? '')} onChangeText={(t) => set(k, t as any)} error={errors[k]} keyboardType="decimal-pad" maxLength={6} />
  return (
    <Sheet visible={visible} title="Log body metrics" onClose={onClose} footer={<Button title="Save" onPress={save} loading={pending} />}>
      <DateField label="Date" value={values.measured_on} onChange={(v) => set('measured_on', v)} error={errors.measured_on} />
      {num('weight_kg', 'Weight (kg)')}{num('chest_cm', 'Chest (cm)')}{num('waist_cm', 'Waist (cm)')}{num('hips_cm', 'Hips (cm)')}{num('arm_cm', 'Arm (cm)')}{num('thigh_cm', 'Thigh (cm)')}{num('body_fat_pct', 'Body fat (%)')}
    </Sheet>
  )
}
