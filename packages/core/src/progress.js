import { weekday, dateStrInTz } from '@lifetrack/utils'
import { isScheduled } from './streaks'
import { cardioSteps, stepsForDay } from './fitness'
import { countedMinutes, isStudying } from './learning'

const EXCLUDED_TASK = ['cancelled', 'skipped']

/** Habits planned for `date` (skipped / rest-day logs are removed from the plan) and how many are done. */
export function habitDay(habits, habitLogs, date) {
  const logFor = new Map(habitLogs.filter((l) => l.log_date === date).map((l) => [l.habit_id, l.status]))
  let done = 0,
    total = 0
  for (const h of habits) {
    if (h.archived_at) continue
    const st = logFor.get(h.id)
    if (st === 'skipped' || st === 'rest') continue
    const planned = h.frequency === 'weekly' ? st === 'done' : isScheduled(h, date)
    if (!planned && st !== 'done') continue
    total++
    if (st === 'done') done++
  }
  return { done, total }
}

/**
 * Daily progress is computed ONLY from real, planned activities for `date`:
 *  - each task due today (cancelled/skipped tasks are not planned)
 *  - each habit scheduled today (skipped / rest-day logs are removed from the plan)
 *  - study target, water goal, steps goal (fractional credit, capped at 100%) — only when a goal > 0 exists
 *  - workout only when the weekly plan has a workout today (rest days / skipped workouts are not planned)
 * Returns percent = null when nothing is planned, instead of inventing a number.
 */
export function dailyProgress({
  date,
  tasks = [],
  habits = [],
  habitLogs = [],
  sessions = [],
  workouts = [],
  health = null,
  settings = {},
}) {
  const items = []

  const dayTasks = tasks.filter((t) => t.due_date === date && !EXCLUDED_TASK.includes(t.status))
  if (dayTasks.length)
    items.push({ key: 'tasks', label: 'Tasks', done: dayTasks.filter((t) => t.status === 'done').length, total: dayTasks.length })

  const { done: hDone, total: hTotal } = habitDay(habits, habitLogs, date)
  if (hTotal) items.push({ key: 'habits', label: 'Habits', done: hDone, total: hTotal })

  const target = settings.daily_study_target_minutes ?? 0
  const mins = countedMinutes(sessions.filter((s) => s.session_date === date))
  if (target > 0 && isStudying(sessions, date, mins)) {
    items.push({ key: 'study', label: 'Study', done: Math.min(1, mins / target), total: 1, detail: `${Math.round(mins)}/${target} min` })
  }

  const dayWorkouts = workouts.filter((w) => w.workout_date === date)
  const plan = settings.workout_plan?.[String(weekday(date))]
  const didWorkout = dayWorkouts.some((w) => w.status === 'completed')
  const offToday = dayWorkouts.some((w) => w.status === 'rest' || w.status === 'skipped')
  if (!offToday && (didWorkout || (plan && plan !== 'rest'))) {
    items.push({ key: 'workout', label: 'Workout', done: didWorkout ? 1 : 0, total: 1 })
  }

  if ((settings.water_goal_ml ?? 0) > 0) {
    const ml = health?.water_ml ?? 0
    items.push({
      key: 'water',
      label: 'Water',
      done: Math.min(1, ml / settings.water_goal_ml),
      total: 1,
      detail: `${ml}/${settings.water_goal_ml} ml`,
    })
  }
  if ((settings.steps_goal ?? 0) > 0) {
    const steps = stepsForDay(health, workouts, date)
    const fromCardio = cardioSteps(workouts, date)
    items.push({
      key: 'steps',
      label: 'Steps',
      done: Math.min(1, steps / settings.steps_goal),
      total: 1,
      detail: `${steps}/${settings.steps_goal}`,
      ...(fromCardio > 0 && { note: `Includes ~${fromCardio.toLocaleString('en-IN')} steps estimated from cardio` }),
    })
  }

  const total = items.reduce((a, i) => a + i.total, 0)
  const done = items.reduce((a, i) => a + i.done, 0)
  return { items, done, total, percent: total ? Math.round((done / total) * 100) : null }
}

/** Set of dates on which something productive was actually completed. */
export function activeDates({ habitLogs = [], tasks = [], sessions = [], workouts = [] }, tz) {
  const s = new Set()
  for (const l of habitLogs) if (l.status === 'done') s.add(l.log_date)
  for (const t of tasks) if (t.status === 'done' && t.completed_at) s.add(dateStrInTz(t.completed_at, tz))
  for (const x of sessions) if (x.status === 'completed' && x.duration_seconds > 0) s.add(x.session_date)
  for (const w of workouts) if (w.status === 'completed') s.add(w.workout_date)
  return s
}
