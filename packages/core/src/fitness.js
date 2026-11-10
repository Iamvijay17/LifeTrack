// Fitness logic shared by web and mobile.
import { addDays, eachDay, fmtDay, startOfWeek, weekday } from '@lifetrack/utils'

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const STEPS_PER_KM = 1300
export const STEPS_PER_MINUTE = 100
/**
 * Steps estimated from completed cardio on `date` (treadmill, run, walk). Distance wins when logged
 * (~1,300 steps/km); otherwise minutes (~100 steps/min). Gym-only sessions add nothing.
 */
export function cardioSteps(workouts, date) {
  let n = 0
  for (const w of workouts ?? []) {
    if (w.workout_date !== date || w.status !== 'completed') continue
    const km = Number(w.cardio_distance_km) || 0, min = Number(w.cardio_minutes) || 0
    n += km > 0 ? km * STEPS_PER_KM : min * STEPS_PER_MINUTE
  }
  return Math.round(n)
}
/** Steps for a day: what was logged in Health plus the estimate from cardio workouts. */
export const stepsForDay = (health, workouts, date) => (health?.steps ?? 0) + cardioSteps(workouts, date)

/** Total volume = Σ reps × weight. */
export const volume = (sets) => sets.reduce((a, s) => a + s.reps * Number(s.weight_kg), 0)

export function setsByWorkout(logs) {
  const m = new Map()
  for (const s of logs) m.set(s.workout_id, [...(m.get(s.workout_id) ?? []), s])
  return m
}
const orderedSets = (sets) => [...sets].sort((a, b) => a.order_index - b.order_index || a.set_number - b.set_number)

/** [{ name, text: '10×60kg, 8×62.5kg' }] in workout order. */
export function summarizeSets(sets) {
  const by = new Map()
  for (const s of orderedSets(sets)) by.set(s.exercise_name, [...(by.get(s.exercise_name) ?? []), s])
  return [...by.entries()].map(([name, ss]) => ({ name, text: ss.map((s) => `${s.reps}×${Number(s.weight_kg)}kg`).join(', ') }))
}
/** Stored set rows → editable form shape [{ name, sets: [{ reps, weight }] }]. */
export function exercisesFromSets(sets) {
  const by = new Map()
  for (const s of orderedSets(sets)) by.set(s.exercise_name, [...(by.get(s.exercise_name) ?? []), { reps: s.reps, weight: Number(s.weight_kg) }])
  return [...by.entries()].map(([name, ss]) => ({ name, sets: ss }))
}
/** A routine template → editable form exercises (one set row per planned set). */
export const routineToExercises = (routine) =>
  routine.exercises.map((e) => ({ name: e.name, sets: Array.from({ length: Math.max(1, Number(e.sets) || 1) }, () => ({ reps: Number(e.reps) || 0, weight: Number(e.weight_kg) || 0 })) }))
/** Form exercises → exercise_logs rows (without workout_id). Matches library exercises by name, case-insensitively. */
export const workoutRows = (exercises, library) =>
  exercises.flatMap((e, oi) => e.sets.map((s, si) => ({ exercise_name: e.name, exercise_id: library.find((l) => l.name.toLowerCase() === e.name.toLowerCase())?.id ?? null, order_index: oi, set_number: si + 1, reps: s.reps, weight_kg: s.weight })))

/** What the plan says about a date: null (flexible), 'Rest', a routine name, or 'Routine removed'. */
export function planFor(date, plan, routines) {
  const p = (plan ?? {})[String(weekday(date))]
  return p === 'rest' ? 'Rest' : p ? routines.find((r) => r.id === p)?.name ?? 'Routine removed' : null
}
export const dayStatus = (date, workouts) => {
  if (workouts.some((x) => x.workout_date === date && x.status === 'completed')) return 'done'
  const off = workouts.find((x) => x.workout_date === date && x.status !== 'completed')
  return off ? off.status : null
}

/** Weekly stats + the last 8 weeks of workout counts/volume. */
export function fitnessWeek({ workouts, logs, plan = {}, today, weekStartsOn = 1 }) {
  const byWorkout = setsByWorkout(logs)
  const completed = workouts.filter((x) => x.status === 'completed')
  const weekStart = startOfWeek(today, weekStartsOn)
  const weekEnd = addDays(weekStart, 6)
  const weekDays = eachDay(weekStart, weekEnd)
  const inWeek = completed.filter((x) => x.workout_date >= weekStart && x.workout_date <= weekEnd)
  const plannedDays = weekDays.filter((d) => { const p = plan[String(weekday(d))]; return p && p !== 'rest' })
  const hit = plannedDays.filter((d) => completed.some((x) => x.workout_date === d)).length
  const vol = (list) => list.reduce((a, x) => a + volume(byWorkout.get(x.id) ?? []), 0)
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const ws = addDays(weekStart, -(7 - i) * 7), we = addDays(ws, 6)
    const ins = completed.filter((x) => x.workout_date >= ws && x.workout_date <= we)
    return { label: fmtDay(ws, 'd MMM'), workouts: ins.length, volume: Math.round(vol(ins)) }
  })
  return {
    weekStart, weekDays, byWorkout, completed, weeks,
    stats: { count: inWeek.length, planned: plannedDays.length, hit, minutes: inWeek.reduce((a, x) => a + (x.duration_minutes ?? 0), 0), cardio: inWeek.reduce((a, x) => a + (x.cardio_minutes ?? 0), 0), vol: vol(inWeek) },
  }
}

/** Headline for "Today": done / rest / skipped / planned / nothing. */
export function todayHeadline(todayWorkouts, planToday) {
  if (todayWorkouts.some((x) => x.status === 'completed')) return 'Workout done 💪'
  if (todayWorkouts[0]?.status === 'rest') return 'Rest day'
  if (todayWorkouts[0]?.status === 'skipped') return 'Skipped'
  return planToday ? (planToday === 'Rest' ? 'Rest day planned' : planToday) : 'Nothing planned'
}
export const offDayWorkout = (status, date) => ({ workout_date: date, status, name: status === 'rest' ? 'Rest day' : 'Skipped', kind: 'other' })

export function weightHistory(healthLogs, last = 40) {
  const weights = healthLogs.filter((h) => h.weight_kg != null).sort((a, b) => a.log_date.localeCompare(b.log_date))
  return { weights, latest: weights.at(-1) ?? null, series: weights.slice(-last).map((h) => ({ label: fmtDay(h.log_date, 'd MMM'), kg: Number(h.weight_kg) })) }
}
export function workoutMeta(x, sets) {
  return `${fmtDay(x.workout_date)}${x.duration_minutes ? ` · ${x.duration_minutes} min` : ''}${sets.length ? ` · ${sets.length} sets · ${Math.round(volume(sets)).toLocaleString('en-IN')} kg` : ''}${x.cardio_minutes ? ` · cardio ${x.cardio_minutes} min${x.cardio_distance_km ? ` / ${x.cardio_distance_km} km` : ''}` : ''}`
}
export const measurementLine = (m) => [['Chest', m.chest_cm], ['Waist', m.waist_cm], ['Hips', m.hips_cm], ['Arm', m.arm_cm], ['Thigh', m.thigh_cm], ['BF%', m.body_fat_pct]].filter(([, v]) => v != null).map(([k, v]) => `${k} ${v}`).join(' · ')
export const sortedHistory = (workouts) => [...workouts].sort((a, b) => (b.workout_date + b.created_at).localeCompare(a.workout_date + a.created_at))
export function exerciseGroups(exercises) {
  const lib = [...exercises].sort((a, b) => a.name.localeCompare(b.name))
  return { lib, groups: [...new Set(lib.map((e) => e.muscle_group || 'Other'))].map((g) => ({ group: g, items: lib.filter((e) => (e.muscle_group || 'Other') === g) })) }
}
