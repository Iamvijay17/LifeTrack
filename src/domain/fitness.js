// Pure fitness logic (no React, no Supabase): volume, weekly stats, plan labels, workout <-> form conversions.
import { addDays, eachDay, fmtDay, weekday } from '@/lib/dates'

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ------------------------------------------------------------------- sets
/** Total lifted: Σ reps × weight. */
export const volume = (sets) => sets.reduce((a, s) => a + s.reps * Number(s.weight_kg), 0)

const byOrder = (a, b) => a.order_index - b.order_index || a.set_number - b.set_number

/** exercise_logs rows -> [{ name, sets: [{ reps, weight }] }] in the order they were performed. */
export function groupSets(sets) {
  const by = new Map()
  for (const s of [...sets].sort(byOrder))
    by.set(s.exercise_name, [...(by.get(s.exercise_name) ?? []), { reps: s.reps, weight: Number(s.weight_kg) }])
  return [...by.entries()].map(([name, ss]) => ({ name, sets: ss }))
}

/** "8×60kg, 8×60kg" per exercise, for the history list. */
export const summarizeSets = (sets) =>
  groupSets(sets).map(({ name, sets: ss }) => ({ name, text: ss.map((s) => `${s.reps}×${s.weight}kg`).join(', ') }))

/** exercise_logs rows indexed by workout id. */
export function setsByWorkout(logs) {
  const m = new Map()
  for (const s of logs) m.set(s.workout_id, [...(m.get(s.workout_id) ?? []), s])
  return m
}

// ------------------------------------------------------------- weekly plan
/** The plan for a date's weekday: a routine id, 'rest', or undefined (flexible). */
export const planFor = (plan, date) => plan?.[String(weekday(date))]

/** 'Rest', a routine's name, 'Routine removed' (plan points at a deleted routine) or null (flexible). */
export function planLabel(plan, routines, date) {
  const p = planFor(plan, date)
  return p === 'rest' ? 'Rest' : p ? (routines.find((r) => r.id === p)?.name ?? 'Routine removed') : null
}

export const isTrainingDay = (plan, date) => {
  const p = planFor(plan, date)
  return !!p && p !== 'rest'
}

/** This week's headline numbers: workouts, planned-vs-hit days, minutes, cardio minutes and volume. */
export function weekStats({ completed, weekStart, plan, logsByWorkout }) {
  const weekEnd = addDays(weekStart, 6)
  const inWeek = completed.filter((x) => x.workout_date >= weekStart && x.workout_date <= weekEnd)
  const planned = eachDay(weekStart, weekEnd).filter((d) => isTrainingDay(plan, d))
  return {
    count: inWeek.length,
    planned: planned.length,
    hit: planned.filter((d) => completed.some((x) => x.workout_date === d)).length,
    minutes: inWeek.reduce((a, x) => a + (x.duration_minutes ?? 0), 0),
    cardio: inWeek.reduce((a, x) => a + (x.cardio_minutes ?? 0), 0),
    vol: inWeek.reduce((a, x) => a + volume(logsByWorkout.get(x.id) ?? []), 0),
  }
}

/** Workouts and volume per week for the last `weeks` weeks, the last bucket being the current week. */
export function weeklySeries(completed, logsByWorkout, weekStart, weeks = 8) {
  return Array.from({ length: weeks }, (_, i) => {
    const ws = addDays(weekStart, -(weeks - 1 - i) * 7)
    const we = addDays(ws, 6)
    const ins = completed.filter((x) => x.workout_date >= ws && x.workout_date <= we)
    return {
      label: fmtDay(ws, 'd MMM'),
      workouts: ins.length,
      volume: Math.round(ins.reduce((a, x) => a + volume(logsByWorkout.get(x.id) ?? []), 0)),
    }
  })
}

/** The headline for today's card, from today's workout records and the plan label. */
export function todayStatus(todays, planToday) {
  if (todays.some((x) => x.status === 'completed')) return 'Workout done 💪'
  if (todays[0]?.status === 'rest') return 'Rest day'
  if (todays[0]?.status === 'skipped') return 'Skipped'
  if (planToday) return planToday === 'Rest' ? 'Rest day planned' : planToday
  return 'Nothing planned'
}

export const historyOf = (workouts) =>
  [...workouts].sort((a, b) => (b.workout_date + b.created_at).localeCompare(a.workout_date + a.created_at))

// ------------------------------------------------------------ body & library
/** The exercise library as [{ group, items }], items A–Z, groups in first-seen order of the sorted list ('' -> 'Other'). */
export function libraryGroups(exercises) {
  const sorted = [...exercises].sort((a, b) => a.name.localeCompare(b.name))
  const groups = [...new Set(sorted.map((e) => e.muscle_group || 'Other'))]
  return groups.map((group) => ({ group, items: sorted.filter((e) => (e.muscle_group || 'Other') === group) }))
}

// ------------------------------------------------- workout form <-> database
/** A routine's template -> the exercise rows of the workout form (each set pre-filled with the planned reps/weight). */
export const routineToFormExercises = (routine) =>
  routine.exercises.map((e) => ({
    name: e.name,
    sets: Array.from({ length: Math.max(1, Number(e.sets) || 1) }, () => ({ reps: Number(e.reps) || 0, weight: Number(e.weight_kg) || 0 })),
  }))

/** Workout form exercise rows -> exercise_logs rows (linking to the library by case-insensitive name). */
export const formExercisesToLogs = (exercises, library) =>
  exercises.flatMap((e, oi) =>
    e.sets.map((s, si) => ({
      exercise_name: e.name,
      exercise_id: library.find((l) => l.name.toLowerCase() === e.name.toLowerCase())?.id ?? null,
      order_index: oi,
      set_number: si + 1,
      reps: s.reps,
      weight_kg: s.weight,
    })),
  )

const MEASURE_FIELDS = ['chest_cm', 'waist_cm', 'hips_cm', 'arm_cm', 'thigh_cm', 'body_fat_pct']

/**
 * Body-metrics form -> what to store. Tape measurements go to body_measurements (one row per day); body weight goes to the
 * daily health log. `empty` is true when nothing at all was entered.
 */
export function splitMeasurements(v) {
  const num = (x) => (x === '' ? null : Number(x))
  const measurements = Object.fromEntries(MEASURE_FIELDS.map((k) => [k, num(v[k])]))
  const hasTape = MEASURE_FIELDS.some((k) => measurements[k] != null)
  const weight = v.weight_kg === '' ? null : Number(v.weight_kg)
  return {
    tape: hasTape ? { measured_on: v.measured_on, ...measurements, notes: v.notes } : null,
    weight,
    empty: !hasTape && weight == null, // notes alone are not a measurement
  }
}
