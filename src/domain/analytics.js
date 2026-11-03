import { addDays, diffDays, eachDay, fmtDay, inRange, monthKey, startOfWeek, monthStart, weekday } from '@/lib/dates'
import { counted, countedMinutes, problemsSolved } from './learning'
import { funnel, salaryProgression } from './jobs'
import { completion, streaks } from './streaks'
import { categoryBreakdown } from './finance'
import { goalPercent } from './goals'

/** Group dated values into day / week / month buckets depending on the range length. */
export function bucketize(items, getDate, getValue, from, to, weekStartsOn = 1) {
  const span = diffDays(to, from) + 1
  const unit = span <= 31 ? 'day' : span <= 120 ? 'week' : 'month'
  const keyOf = (d) => (unit === 'day' ? d : unit === 'week' ? startOfWeek(d, weekStartsOn) : monthStart(d))
  const map = new Map()
  const keys = []
  for (const d of eachDay(from, to)) {
    const k = keyOf(d)
    if (!map.has(k)) {
      map.set(k, 0)
      keys.push(k)
    }
  }
  for (const it of items) {
    const d = getDate(it)
    if (!d || d < from || d > to) continue
    const k = keyOf(d)
    map.set(k, (map.get(k) ?? 0) + getValue(it))
  }
  const fmt = unit === 'month' ? 'MMM yy' : 'd MMM'
  return { unit, data: keys.map((k) => ({ key: k, label: fmtDay(k, fmt), value: map.get(k) })) }
}

export const rangeFor = (preset, today, weekStartsOn = 1) => {
  if (preset === 'week') {
    const s = startOfWeek(today, weekStartsOn)
    return { from: s, to: addDays(s, 6) }
  }
  if (preset === 'month') {
    const s = monthStart(today)
    const [y, m] = s.split('-').map(Number)
    return { from: s, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
  }
  if (preset === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` }
  return null
}

export const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
export { monthKey }

// ------------------------------------------------------------ whole page
const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp

/**
 * Everything the Analytics page shows for [from, to], grouped by module. Future days are never counted, and
 * empty ranges stay empty (nulls / zero-length lists, never invented numbers).
 */
export function buildAnalytics(data, { from, to, today, weekStartsOn, plan = {}, tz }) {
  const w = weekStartsOn
  const bucket = (items, getDate, getValue) => bucketize(items, getDate, getValue, from, to, w)

  // learning
  const sessions = data.study_sessions.filter((s) => inRange(s.session_date, from, to))
  const study = bucket(
    counted(sessions),
    (s) => s.session_date,
    (s) => (s.duration_seconds ?? 0) / 3600,
  )
  const learning = {
    minutes: countedMinutes(sessions),
    sessionCount: counted(sessions).length,
    problems: problemsSolved(sessions),
    unit: study.unit,
    chart: study.data.map((d) => ({ ...d, value: round(d.value, 2) })),
    goals: data.goals
      .filter((g) => g.status !== 'archived')
      .map((goal) => ({ goal, progress: goalPercent(goal, data.milestones ?? [], data.study_sessions) })),
  }

  // jobs
  const apps = data.job_applications.filter((x) => inRange(x.applied_date, from, to))
  const jobBuckets = bucket(
    apps,
    (x) => x.applied_date,
    () => 1,
  )
  const salary = salaryProgression(
    data.job_applications.filter((x) => inRange(x.applied_date ?? x.created_at.slice(0, 10), from, to)),
    tz,
  ).map((d) => ({
    ...d,
    label: fmtDay(d.date, 'd MMM'),
  }))
  const jobs = {
    funnel: funnel(data.job_applications, data.application_history, data.interview_events, from, to),
    applied: apps.length,
    unit: jobBuckets.unit,
    chart: jobBuckets.data,
    salary,
  }

  // fitness
  const done = data.workouts.filter((x) => x.status === 'completed' && inRange(x.workout_date, from, to))
  const days = eachDay(from, to).filter((d) => d <= today) // never count the future
  const plannedDays = days.filter((d) => {
    const p = plan[String(weekday(d))]
    return p && p !== 'rest'
  })
  const hit = plannedDays.filter((d) => done.some((x) => x.workout_date === d)).length
  const wBuckets = bucket(
    done,
    (x) => x.workout_date,
    () => 1,
  )
  const weights = data.health_logs
    .filter((h) => h.weight_kg != null && inRange(h.log_date, from, to))
    .sort((x, y) => x.log_date.localeCompare(y.log_date))
    .map((h) => ({ label: fmtDay(h.log_date, 'd MMM'), kg: Number(h.weight_kg) }))
  const fitness = {
    workouts: done.length,
    plannedDays: plannedDays.length,
    hitDays: hit,
    consistency: plannedDays.length ? hit / plannedDays.length : null,
    minutes: done.reduce((s, x) => s + (x.duration_minutes ?? 0), 0),
    weights,
    weightChange: weights.length > 1 ? weights.at(-1).kg - weights[0].kg : null,
    unit: wBuckets.unit,
    chart: wBuckets.data,
  }

  // sleep & health
  const hl = data.health_logs.filter((h) => inRange(h.log_date, from, to))
  const slept = hl.filter((h) => h.sleep_minutes != null)
  const sleepSum = bucket(
    slept,
    (h) => h.log_date,
    (h) => h.sleep_minutes / 60,
  )
  const sleepCount = bucket(
    slept,
    (h) => h.log_date,
    () => 1,
  )
  const health = {
    sleepAvg: avg(slept.map((h) => h.sleep_minutes)),
    waterAvg: avg(hl.filter((h) => h.water_ml > 0).map((h) => h.water_ml)),
    stepsAvg: avg(hl.filter((h) => h.steps > 0).map((h) => h.steps)),
    sleepSeries: sleepSum.data.map((d, i) => ({
      label: d.label,
      hours: sleepCount.data[i].value ? round(d.value / sleepCount.data[i].value, 1) : undefined,
    })),
  }

  // finance
  const tx = data.transactions.filter((t) => inRange(t.txn_date, from, to))
  const sum = { income: 0, expense: 0, savings: 0 }
  for (const t of tx) sum[t.type] += t.amount_paise
  const spend = bucket(
    tx.filter((t) => t.type === 'expense'),
    (t) => t.txn_date,
    (t) => t.amount_paise / 100,
  )
  const finance = {
    ...sum,
    savingsRate: sum.income ? Math.round((sum.savings / sum.income) * 100) : null,
    unit: spend.unit,
    chart: spend.data,
    categories: categoryBreakdown(tx),
  }

  // habits
  const perHabit = data.habits.map((h) => {
    const logs = data.habit_logs.filter((l) => l.habit_id === h.id)
    return { habit: h, ...completion(h, logs, from, to, today, w), ...streaks(h, logs, today, w) }
  })
  const totalDone = perHabit.reduce((s, x) => s + x.done, 0)
  const totalExpected = perHabit.reduce((s, x) => s + x.expected, 0)
  const habits = {
    rate: totalExpected ? totalDone / totalExpected : null,
    longestStreak: perHabit.reduce((m, x) => Math.max(m, x.longest), 0),
    active: data.habits.filter((h) => !h.archived_at).length,
    ranked: perHabit.filter((x) => x.expected > 0).sort((x, y) => y.rate - x.rate || y.done - x.done),
  }

  return { learning, jobs, fitness, health, finance, habits }
}
