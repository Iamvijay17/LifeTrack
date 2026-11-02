// Report builder: pure functions over already-loaded records. No AI, no estimation — only sums, counts and averages.
import { addDays, eachDay, monthStart, weekday } from '@/lib/dates'
import { countedMinutes } from './learning'
import { dailyScore, averageScore } from './score'
import { completion } from './streaks'
import { funnel } from './jobs'
import { goalPercent } from './goals'
import { focusMinutes } from './focus'

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** The first date on which the user recorded anything — days before it are not scored (no history ≠ a bad day). */
export function firstActivityDate(d) {
  const dates = [
    ...d.tasks.map((t) => t.due_date), ...d.study_sessions.map((s) => s.session_date), ...d.workouts.map((w) => w.workout_date),
    ...d.health_logs.map((h) => h.log_date), ...d.habit_logs.map((l) => l.log_date), ...d.job_applications.map((a) => a.applied_date),
    ...d.transactions.map((t) => t.txn_date),
  ].filter(Boolean)
  return dates.length ? dates.sort()[0] : null
}

export function buildReport(d, from, to, { today, settings, weekStartsOn = 1 }) {
  const tz = settings.timezone
  const last = to > today ? today : to
  const first = firstActivityDate(d)
  const days = from <= last ? eachDay(from, last) : []
  const scoreDays = first ? days.filter((x) => x >= first) : []

  const daily = days.map((date) => {
    const sc = scoreDays.includes(date) ? dailyScore({ date, tasks: d.tasks, habits: d.habits, habitLogs: d.habit_logs, sessions: d.study_sessions, workouts: d.workouts, health: d.health_logs.find((h) => h.log_date === date) ?? null, applications: d.job_applications, interviews: d.interview_events, settings, tz }) : null
    const h = d.health_logs.find((x) => x.log_date === date)
    return {
      date, score: sc?.score ?? null,
      tasksDone: d.tasks.filter((t) => t.due_date === date && t.status === 'done').length,
      tasksPlanned: d.tasks.filter((t) => t.due_date === date && t.status !== 'cancelled' && t.status !== 'skipped').length,
      studyMinutes: Math.round(countedMinutes(d.study_sessions.filter((s) => s.session_date === date))),
      focusMinutes: Math.round(focusMinutes(d.focus_sessions.filter((s) => s.session_date === date))),
      workout: d.workouts.some((w) => w.workout_date === date && w.status === 'completed'),
      habitsDone: d.habit_logs.filter((l) => l.log_date === date && l.status === 'done').length,
      sleepHours: h?.sleep_minutes != null ? Math.round((h.sleep_minutes / 60) * 10) / 10 : null,
      spentPaise: d.transactions.filter((t) => t.type === 'expense' && t.txn_date === date).reduce((a, t) => a + t.amount_paise, 0),
    }
  })

  // weekly + monthly productivity trends (average of scored days)
  const group = (keyOf) => { const m = new Map(); for (const x of daily) if (x.score != null) { const k = keyOf(x.date); m.set(k, [...(m.get(k) ?? []), x.score]) } return [...m].map(([key, v]) => ({ key, score: Math.round(avg(v)), days: v.length })) }
  const weekKey = (dt) => addDays(dt, -((weekday(dt) - weekStartsOn + 7) % 7))
  const weekly = group(weekKey), monthly = group(monthStart)

  const inR = (x) => x != null && x >= from && x <= to
  const workoutsDone = d.workouts.filter((w) => w.status === 'completed' && inR(w.workout_date))
  const plannedDays = days.filter((x) => { const p = settings.workout_plan?.[String(weekday(x))]; return p && p !== 'rest' })
  const planHit = plannedDays.filter((x) => workoutsDone.some((w) => w.workout_date === x)).length
  const habitStats = d.habits.map((h) => completion(h, d.habit_logs.filter((l) => l.habit_id === h.id), from, to, today, weekStartsOn)).filter((x) => x.expected > 0)
  const hExp = habitStats.reduce((a, x) => a + x.expected, 0), hDone = habitStats.reduce((a, x) => a + x.done, 0)
  const health = d.health_logs.filter((h) => inR(h.log_date))
  const tx = d.transactions.filter((t) => inR(t.txn_date))
  const sum = (type) => tx.filter((t) => t.type === type).reduce((a, t) => a + t.amount_paise, 0)
  const goals = d.goals.filter((g) => g.status !== 'archived')
  const jobs = funnel(d.job_applications, d.application_history, d.interview_events, from, to)

  const score = averageScore(daily)
  return {
    from, to, daily, weekly, monthly,
    summary: {
      productivityScore: score.avg, scoredDays: score.scored, days: days.length,
      studyHours: Math.round((countedMinutes(d.study_sessions.filter((s) => inR(s.session_date))) / 60) * 10) / 10,
      focusHours: Math.round((focusMinutes(d.focus_sessions.filter((s) => inR(s.session_date))) / 60) * 10) / 10,
      workouts: workoutsDone.length, fitnessConsistency: plannedDays.length ? planHit / plannedDays.length : null,
      habitRate: hExp ? hDone / hExp : null,
      sleepAvgHours: avg(health.filter((h) => h.sleep_minutes != null).map((h) => h.sleep_minutes / 60)),
      waterAvgMl: avg(health.filter((h) => h.water_ml > 0).map((h) => h.water_ml)),
      stepsAvg: avg(health.filter((h) => h.steps > 0).map((h) => h.steps)),
      incomePaise: sum('income'), expensePaise: sum('expense'), savingsPaise: sum('savings'),
      goalsActive: goals.filter((g) => g.status === 'active').length,
      goalCompletion: goals.length ? d.goals.filter((g) => g.status === 'completed').length / goals.length : null,
      goalAvgProgress: goals.filter((g) => g.status === 'active').length ? Math.round(avg(goals.filter((g) => g.status === 'active').map((g) => goalPercent(g, d.milestones, d.study_sessions).percent))) : null,
      applications: jobs.applied, interviews: jobs.interviews, offers: jobs.offers, rejections: jobs.rejections, interviewRate: jobs.conversion,
    },
  }
}

const pct = (v) => (v == null ? '' : `${Math.round(v * 100)}%`)
const num = (v, dp = 1) => (v == null ? '' : Number(v.toFixed(dp)))

/** Flat rows for CSV export: a summary section and the day-by-day table. */
export function reportToRows(r, money) {
  const s = r.summary
  const summary = [
    ['Average daily score', s.productivityScore ?? ''], ['Days scored', `${s.scoredDays} of ${s.days}`], ['Study hours', s.studyHours], ['Focus hours', s.focusHours],
    ['Workouts completed', s.workouts], ['Fitness consistency', pct(s.fitnessConsistency)], ['Habit completion', pct(s.habitRate)],
    ['Average sleep (h)', num(s.sleepAvgHours)], ['Average water (ml)', num(s.waterAvgMl, 0)], ['Average steps', num(s.stepsAvg, 0)],
    ['Income', money(s.incomePaise)], ['Expenses', money(s.expensePaise)], ['Savings', money(s.savingsPaise)],
    ['Active goals', s.goalsActive], ['Goal completion', pct(s.goalCompletion)],
    ['Job applications', s.applications], ['Interviews', s.interviews], ['Offers', s.offers], ['Rejections', s.rejections], ['Interview rate', pct(s.interviewRate)],
  ].map(([metric, value]) => ({ metric, value }))
  return { summary, daily: r.daily }
}
