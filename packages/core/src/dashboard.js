// Everything the Dashboard shows, computed from raw table rows. Shared by web and mobile so both render identical numbers.
import { addDays, eachDay, fmtDay, fmtDuration, formatMoney, monthKey, startOfWeek, weekday } from '@lifetrack/utils'
import { habitStats } from './habits'
import { activeDates, dailyProgress } from './progress'
import { averageScore, dailyScore } from './score'
import { goalPercent } from './goals'
import { summarize } from './finance'
import { activeDayStreak } from './streaks'
import { countedMinutes } from './learning'
import { byPriority, isOpen } from './tasks'

export const WIDGETS = [
  { key: 'score', label: 'Daily score' },
  { key: 'progress', label: "Today's progress" },
  { key: 'priorities', label: 'Top priorities & tasks' },
  { key: 'stats', label: 'Today at a glance' },
  { key: 'goals', label: 'Goal progress' },
  { key: 'spending', label: 'Monthly spending' },
  { key: 'weekly', label: 'Weekly score chart' },
  { key: 'activity', label: 'Recent activity' },
  { key: 'quick', label: 'Quick actions' },
]
/** A widget is visible unless the user explicitly turned it off (so new widgets appear by default). */
export const isWidgetOn = (prefs, key) => prefs?.[key] !== false

export const QUICK_KINDS = [
  { kind: 'task', label: 'Add task' }, { kind: 'study', label: 'Start study' }, { kind: 'workout', label: 'Log workout' }, { kind: 'expense', label: 'Add expense' },
  { kind: 'water', label: 'Log water' }, { kind: 'habit', label: 'Complete habit' }, { kind: 'application', label: 'Job application' },
]

/** Colour tone for a 0–100 daily score (null = nothing planned yet). */
export const scoreTone = (s) => (s == null ? 'primary' : s >= 75 ? 'success' : s >= 40 ? 'primary' : 'warning')

export const greetingFor = (hour) => (hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 22 ? 'Good evening' : 'Good night')
export function relTime(iso, nowMs = Date.now()) {
  const mins = Math.round((nowMs - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

/** Gym state for today: Done / Rest day / Skipped / Planned / Not planned. */
export function gymState(todayWorkouts, plannedValue) {
  if (todayWorkouts.some((x) => x.status === 'completed')) return 'Done'
  if (todayWorkouts.some((x) => x.status === 'rest') || plannedValue === 'rest') return 'Rest day'
  if (todayWorkouts.some((x) => x.status === 'skipped')) return 'Skipped'
  return plannedValue ? 'Planned' : 'Not planned'
}

/** Newest 8 events across modules: { at, kind, text }. */
export function recentActivity({ tasks, sessions, workouts, transactions, history, applications, habitLogs, habits, currency }, limit = 8) {
  const a = []
  for (const t of tasks) if (t.status === 'done' && t.completed_at) a.push({ at: t.completed_at, kind: 'task', text: `Completed “${t.title}”` })
  for (const s of sessions) if (s.status === 'completed' && s.ended_at) a.push({ at: s.ended_at, kind: 'study', text: `Studied ${fmtDuration(s.duration_seconds / 60)}${s.problems_solved ? ` · ${s.problems_solved} problems` : ''}` })
  for (const x of workouts) if (x.status === 'completed') a.push({ at: x.created_at, kind: 'workout', text: `Workout: ${x.name}` })
  for (const t of transactions) a.push({ at: t.created_at, kind: 'money', text: `${t.type === 'income' ? 'Income' : t.type === 'savings' ? 'Saved' : 'Spent'} ${formatMoney(t.amount_paise, currency)} · ${t.category}` })
  for (const h of history) { const app = applications.find((x) => x.id === h.application_id); if (app) a.push({ at: h.changed_at, kind: 'job', text: `${app.company}: ${h.from_status ? `${h.from_status} → ` : 'added as '}${h.to_status}` }) }
  for (const l of habitLogs) if (l.status === 'done') { const hb = habits.find((x) => x.id === l.habit_id); if (hb) a.push({ at: l.updated_at ?? l.created_at, kind: 'habit', text: `Checked in: ${hb.name}` }) }
  return a.sort((x, y) => y.at.localeCompare(x.at)).slice(0, limit)
}

/**
 * @param d { tasks, studySessions, workouts, healthLogs, transactions, applications, history, interviews, goals, milestones, habits, habitLogs }
 */
export function dashboardData(d, { settings, today, tz = settings.timezone, nowMs = Date.now() }) {
  const w = settings.week_starts_on
  const stats = habitStats(d.habits, d.habitLogs, today, w)
  const healthOn = (date) => d.healthLogs.find((h) => h.log_date === date) ?? null
  const progressFor = (date) => dailyProgress({ date, tasks: d.tasks, habits: d.habits, habitLogs: d.habitLogs, sessions: d.studySessions, workouts: d.workouts, health: healthOn(date) ?? undefined, settings })
  const scoreFor = (date) => dailyScore({ date, tasks: d.tasks, habits: d.habits, habitLogs: d.habitLogs, sessions: d.studySessions, workouts: d.workouts, health: healthOn(date), applications: d.applications, interviews: d.interviews, settings, tz })

  const weekStart = startOfWeek(today, w)
  const weekDays = eachDay(weekStart, addDays(weekStart, 6))
  const weekScores = weekDays.map((day) => ({ d: day, label: fmtDay(day, 'EEE'), score: day > today ? null : scoreFor(day).score }))
  const todayTasks = d.tasks.filter((t) => t.due_date === today)
  const todayWorkouts = d.workouts.filter((x) => x.workout_date === today)
  const habitsToday = stats.filter((s) => !s.habit.archived_at && (s.due || s.today))
  const health = healthOn(today)
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date(nowMs))) % 24

  return {
    habitStats: stats,
    progress: progressFor(today),
    score: scoreFor(today),
    weekScores,
    weekAvg: averageScore(weekScores.filter((x) => x.score != null).map((x) => ({ score: x.score }))).avg,
    activeGoals: d.goals.filter((g) => g.status === 'active').map((g) => ({ g, p: goalPercent(g, d.milestones, d.studySessions) }))
      .sort((a, b) => (a.g.due_date ?? '9999').localeCompare(b.g.due_date ?? '9999')).slice(0, 4),
    month: summarize(d.transactions, monthKey(today), settings.monthly_budget_paise),
    openToday: todayTasks.filter(isOpen).length,
    doneTodayTasks: todayTasks.filter((t) => t.status === 'done').length,
    hasTasksToday: todayTasks.length > 0,
    topTasks: todayTasks.filter(isOpen).sort(byPriority).slice(0, 3),
    health,
    studyMin: countedMinutes(d.studySessions.filter((s) => s.session_date === today)),
    timerRunning: d.studySessions.some((s) => s.status === 'running'),
    weekApps: d.applications.filter((a) => a.applied_date && a.applied_date >= weekStart && a.applied_date <= addDays(weekStart, 6)).length,
    spentToday: d.transactions.filter((t) => t.type === 'expense' && t.txn_date === today).reduce((a, t) => a + t.amount_paise, 0),
    habitsDue: habitsToday.length,
    habitsDone: habitsToday.filter((s) => s.today?.status === 'done').length,
    todayWorkouts,
    gym: gymState(todayWorkouts, settings.workout_plan?.[String(weekday(today))]),
    streak: activeDayStreak(activeDates({ habitLogs: d.habitLogs, tasks: d.tasks, sessions: d.studySessions, workouts: d.workouts }, tz), today),
    activity: recentActivity({ tasks: d.tasks, sessions: d.studySessions, workouts: d.workouts, transactions: d.transactions, history: d.history, applications: d.applications, habitLogs: d.habitLogs, habits: d.habits, currency: settings.currency }),
    greeting: greetingFor(hour),
  }
}
