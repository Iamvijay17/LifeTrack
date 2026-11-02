// Configurable daily score (0–100). Pure functions: everything is derived from real records and configured targets.
//
// Method (shown to the user in the "How is this calculated?" panel):
//  1. Each category (learning, career, fitness, habits, health) turns the day's planned/recorded activities into a
//     0–1 fraction. A category with nothing planned AND nothing recorded is "not applicable" for that day.
//  2. The score is the weighted average of the APPLICABLE categories only — their weights are re-normalised, so a rest
//     day, a day with no job-search plan, or missing sleep data is never counted as a zero.
//  3. null (shown as "—") means nothing at all was applicable; a number is never invented.
import { weekday } from '@/lib/dates'
import { countedMinutes } from './learning'
import { habitDay } from './progress'

export const SCORE_CATEGORIES = [
  { key: 'learning', label: 'Learning', hint: 'Study time against your daily target, plus Learning tasks due today.' },
  { key: 'career', label: 'Career', hint: 'Job Search tasks due today, applications sent today and interviews completed today.' },
  { key: 'fitness', label: 'Fitness', hint: 'Planned workout and steps. Rest days and skipped workouts are not penalised.' },
  { key: 'habits', label: 'Habits', hint: 'Habits scheduled today. Skipped and rest-day habits are removed from the plan.' },
  { key: 'health', label: 'Sleep & Health', hint: 'Sleep (against 7½ h) and water (against your goal), once logged.' },
]
export const DEFAULT_WEIGHTS = { learning: 25, career: 25, fitness: 20, habits: 15, health: 15 }
export const SLEEP_TARGET_MINUTES = 450

/** Sanitise user weights: non-negative numbers; falls back to defaults when everything is zero/invalid. */
export function normalizeWeights(w) {
  const out = {}
  let sum = 0
  for (const c of SCORE_CATEGORIES) {
    const v = Number(w?.[c.key])
    out[c.key] = Number.isFinite(v) && v > 0 ? v : 0
    sum += out[c.key]
  }
  return sum > 0 ? out : { ...DEFAULT_WEIGHTS }
}

const mean = (items) => items.reduce((a, i) => a + i.fraction, 0) / items.length
const isTaskPlanned = (t, date) => t.due_date === date && t.status !== 'cancelled' && t.status !== 'skipped'
const frac = (done, target) => (target > 0 ? Math.max(0, Math.min(1, done / target)) : 0)

export function dailyScore({
  date,
  tasks = [],
  habits = [],
  habitLogs = [],
  sessions = [],
  workouts = [],
  health = null,
  applications = [],
  interviews = [],
  settings = {},
  tz,
} = {}) {
  const cats = Object.fromEntries(SCORE_CATEGORIES.map((c) => [c.key, []]))
  const tasksOf = (category) => tasks.filter((t) => isTaskPlanned(t, date) && t.category === category)

  // learning
  const target = settings.daily_study_target_minutes ?? 0
  const minutes = countedMinutes(sessions.filter((s) => s.session_date === date))
  if (target > 0)
    cats.learning.push({ label: 'Study time', fraction: frac(minutes, target), detail: `${Math.round(minutes)} / ${target} min` })
  else if (minutes > 0) cats.learning.push({ label: 'Study time', fraction: 1, detail: `${Math.round(minutes)} min (no target set)` })
  const learnTasks = tasksOf('Learning')
  if (learnTasks.length)
    cats.learning.push({
      label: 'Learning tasks',
      fraction: learnTasks.filter((t) => t.status === 'done').length / learnTasks.length,
      detail: `${learnTasks.filter((t) => t.status === 'done').length} / ${learnTasks.length}`,
    })

  // career
  const jobTasks = tasksOf('Job Search')
  if (jobTasks.length)
    cats.career.push({
      label: 'Job Search tasks',
      fraction: jobTasks.filter((t) => t.status === 'done').length / jobTasks.length,
      detail: `${jobTasks.filter((t) => t.status === 'done').length} / ${jobTasks.length}`,
    })
  const sent = applications.filter((a) => a.applied_date === date).length
  if (sent) cats.career.push({ label: 'Applications sent', fraction: 1, detail: `${sent} today` })
  const dayInterviews = interviews.filter((e) => e.status !== 'cancelled' && e.scheduled_at && dateOf(e.scheduled_at, tz) === date)
  if (dayInterviews.length)
    cats.career.push({
      label: 'Interviews',
      fraction: dayInterviews.filter((e) => e.status === 'completed').length / dayInterviews.length,
      detail: `${dayInterviews.filter((e) => e.status === 'completed').length} / ${dayInterviews.length}`,
    })

  // fitness
  const dayWorkouts = workouts.filter((w) => w.workout_date === date)
  const plan = settings.workout_plan?.[String(weekday(date))]
  const didWorkout = dayWorkouts.some((w) => w.status === 'completed')
  const off = dayWorkouts.some((w) => w.status === 'rest' || w.status === 'skipped') && !didWorkout
  const workoutPlanned = !off && (didWorkout || (plan && plan !== 'rest'))
  if (workoutPlanned) cats.fitness.push({ label: 'Workout', fraction: didWorkout ? 1 : 0, detail: didWorkout ? 'done' : 'planned' })
  const steps = health?.steps ?? 0
  if ((settings.steps_goal ?? 0) > 0 && (steps > 0 || workoutPlanned))
    cats.fitness.push({ label: 'Steps', fraction: frac(steps, settings.steps_goal), detail: `${steps} / ${settings.steps_goal}` })

  // habits
  const h = habitDay(habits, habitLogs, date)
  if (h.total) cats.habits.push({ label: 'Habits', fraction: h.done / h.total, detail: `${h.done} / ${h.total}` })

  // sleep & health: only once something was logged — an unlogged day is "unknown", not "bad"
  if (health?.sleep_minutes != null)
    cats.health.push({
      label: 'Sleep',
      fraction: frac(health.sleep_minutes, SLEEP_TARGET_MINUTES),
      detail: `${(health.sleep_minutes / 60).toFixed(1)} h`,
    })
  if (health && (settings.water_goal_ml ?? 0) > 0 && (health.water_ml > 0 || health.sleep_minutes != null))
    cats.health.push({
      label: 'Water',
      fraction: frac(health.water_ml ?? 0, settings.water_goal_ml),
      detail: `${health.water_ml ?? 0} / ${settings.water_goal_ml} ml`,
    })

  const weights = normalizeWeights(settings.score_weights)
  const categories = SCORE_CATEGORIES.map((c) => {
    const items = cats[c.key]
    const applicable = items.length > 0
    return { ...c, weight: weights[c.key], items, applicable, fraction: applicable ? mean(items) : null }
  })
  const active = categories.filter((c) => c.applicable && c.weight > 0)
  const totalWeight = active.reduce((a, c) => a + c.weight, 0)
  for (const c of categories) c.effectiveWeight = c.applicable && c.weight > 0 && totalWeight ? (c.weight / totalWeight) * 100 : 0
  const score = totalWeight ? Math.round((active.reduce((a, c) => a + c.fraction * c.weight, 0) / totalWeight) * 100) : null
  return { date, score, categories }
}

function dateOf(iso, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  )
}

/** Average score over days that had a score. Returns { avg, days, scored }. */
export function averageScore(daily) {
  const scored = daily.filter((d) => d.score != null)
  return {
    avg: scored.length ? Math.round(scored.reduce((a, d) => a + d.score, 0) / scored.length) : null,
    days: daily.length,
    scored: scored.length,
  }
}

/** Plain-language explanation of how a score was reached. */
export function explainScore(result) {
  if (result.score == null)
    return 'Nothing was planned or recorded for this day, so there is no score yet. Add a task, habit or study session to start.'
  const parts = result.categories
    .filter((c) => c.effectiveWeight > 0)
    .map((c) => `${c.label} ${Math.round(c.fraction * 100)}% × ${Math.round(c.effectiveWeight)}%`)
  const skipped = result.categories.filter((c) => !c.applicable).map((c) => c.label)
  return `${parts.join(' + ')} = ${result.score}.${skipped.length ? ` ${skipped.join(', ')} had nothing planned or logged, so ${skipped.length > 1 ? 'their' : 'its'} weight was shared among the rest instead of counting as zero.` : ''}`
}
