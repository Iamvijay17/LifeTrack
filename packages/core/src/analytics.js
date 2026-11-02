import { addDays, diffDays, eachDay, fmtDay, inRange, monthKey, monthStart, startOfWeek, weekday } from '@lifetrack/utils'
import { counted, countedMinutes, goalProgress, problemsSolved } from './learning'
import { funnel } from './jobs'
import { completion, streaks } from './streaks'
import { categoryBreakdown } from './finance'

/** Group dated values into day / week / month buckets depending on the range length. */
export function bucketize(items, getDate, getValue, from, to, weekStartsOn = 1) {
  const span = diffDays(to, from) + 1
  const unit = span <= 31 ? 'day' : span <= 120 ? 'week' : 'month'
  const keyOf = (d) => (unit === 'day' ? d : unit === 'week' ? startOfWeek(d, weekStartsOn) : monthStart(d))
  const map = new Map()
  const keys = []
  for (const d of eachDay(from, to)) { const k = keyOf(d); if (!map.has(k)) { map.set(k, 0); keys.push(k) } }
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
  if (preset === 'week') { const s = startOfWeek(today, weekStartsOn); return { from: s, to: addDays(s, 6) } }
  if (preset === 'month') { const s = monthStart(today); const [y, m] = s.split('-').map(Number); return { from: s, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) } }
  if (preset === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` }
  return null
}

export const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
export { monthKey }

export const ANALYTICS_PRESETS = [{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }, { value: 'custom', label: 'Custom' }]
export const pctText = (r) => (r == null ? '—' : `${Math.round(r * 100)}%`)

/** Resolve a preset/custom range; a reversed custom range is swapped, and `upto` never counts the future. */
export function resolveRange(preset, custom, today, weekStartsOn = 1) {
  const range = preset === 'custom' ? custom : rangeFor(preset, today, weekStartsOn)
  const valid = range.from <= range.to
  const { from, to } = valid ? range : { from: range.to, to: range.from }
  return { from, to, upto: to > today ? today : to }
}

/**
 * Every number on the Analytics screen for [from, to]. `d` = { studySessions, goals, applications, history, interviews, workouts,
 * healthLogs, transactions, habits, habitLogs }. Empty ranges stay empty (nulls / zeros), nothing is invented.
 */
export function analyticsRange(d, { from, to, upto, today, weekStartsOn = 1, workoutPlan = {} }) {
  const w = weekStartsOn
  const sessions = d.studySessions.filter((s) => inRange(s.session_date, from, to))
  const study = bucketize(counted(sessions), (s) => s.session_date, (s) => (s.duration_seconds ?? 0) / 3600, from, to, w)
  const apps = d.applications.filter((x) => inRange(x.applied_date, from, to))
  const jobs = funnel(d.applications, d.history, d.interviews, from, to)
  const jobBuckets = bucketize(apps, (x) => x.applied_date, () => 1, from, to, w)
  const done = d.workouts.filter((x) => x.status === 'completed' && inRange(x.workout_date, from, to))
  const days = eachDay(from, upto > from ? upto : from).filter((day) => day <= today)
  const plannedDays = days.filter((day) => { const p = workoutPlan[String(weekday(day))]; return p && p !== 'rest' })
  const hit = plannedDays.filter((day) => done.some((x) => x.workout_date === day))
  const wBuckets = bucketize(done, (x) => x.workout_date, () => 1, from, to, w)
  const weights = d.healthLogs.filter((h) => h.weight_kg != null && inRange(h.log_date, from, to)).sort((x, y) => x.log_date.localeCompare(y.log_date)).map((h) => ({ label: fmtDay(h.log_date, 'd MMM'), kg: Number(h.weight_kg) }))
  const hl = d.healthLogs.filter((h) => inRange(h.log_date, from, to))
  const withSleep = hl.filter((h) => h.sleep_minutes != null)
  const sleepB = bucketize(withSleep, (h) => h.log_date, (h) => h.sleep_minutes / 60, from, to, w)
  const sleepCount = bucketize(withSleep, (h) => h.log_date, () => 1, from, to, w)
  const sleepSeries = sleepB.data.map((x, i) => ({ label: x.label, hours: sleepCount.data[i].value ? Math.round((x.value / sleepCount.data[i].value) * 10) / 10 : undefined }))
  const tx = d.transactions.filter((t) => inRange(t.txn_date, from, to))
  const sum = { income: 0, expense: 0, savings: 0 }
  for (const t of tx) sum[t.type] += t.amount_paise
  const spend = bucketize(tx.filter((t) => t.type === 'expense'), (t) => t.txn_date, (t) => t.amount_paise / 100, from, to, w)
  const habits = d.habits.map((h) => { const logs = d.habitLogs.filter((l) => l.habit_id === h.id); return { h, ...completion(h, logs, from, to, today, w), ...streaks(h, logs, today, w) } })
  const ranked = habits.filter((x) => x.expected > 0).sort((x, y) => y.rate - x.rate || y.done - x.done)
  const totalDone = habits.reduce((s, x) => s + x.done, 0), totalExp = habits.reduce((s, x) => s + x.expected, 0)
  const goals = d.goals.filter((g) => g.status !== 'archived')
  return {
    sessions, study, apps, jobs, jobBuckets, done, plannedDays, hit, wBuckets, weights, hl, sleepSeries, tx, sum, spend, habits, ranked,
    habitRate: totalExp ? totalDone / totalExp : null,
    studyMinutes: countedMinutes(sessions),
    studySessionCount: counted(sessions).length,
    problems: problemsSolved(sessions),
    sleepAvg: avg(withSleep.map((h) => h.sleep_minutes)),
    waterAvg: avg(hl.filter((h) => h.water_ml > 0).map((h) => h.water_ml)),
    stepsAvg: avg(hl.filter((h) => h.steps > 0).map((h) => h.steps)),
    categories: categoryBreakdown(tx),
    goalRows: goals.map((g) => ({ g, p: goalProgress(g, d.studySessions) })),
    longestStreak: habits.reduce((m, x) => Math.max(m, x.longest), 0),
    activeHabits: d.habits.filter((h) => !h.archived_at).length,
    planConsistency: plannedDays.length ? hit.length / plannedDays.length : null,
    salaryApps: d.applications.filter((x) => inRange(x.applied_date ?? x.created_at.slice(0, 10), from, to)),
  }
}
