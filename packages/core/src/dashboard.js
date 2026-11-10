// Everything the Dashboard shows, computed from raw table rows. Shared by web and mobile so both render identical numbers.
import { addDays, eachDay, fmtDay, fmtDuration, formatMoney, monthKey, monthStart, startOfWeek, weekday } from '@lifetrack/utils'
import { habitStats } from './habits'
import { activeDates, dailyProgress } from './progress'
import { cardioSteps, stepsForDay } from './fitness'
import { averageScore, dailyScore } from './score'
import { goalPercent } from './goals'
import { budgetForMonth, summarize } from './finance'
import { upcomingItems } from './upcoming'
import { todayAgenda } from './agenda'
import { activeDayStreak } from './streaks'
import { countedMinutes } from './learning'
import { byPriority, isOpen } from './tasks'
import { dayStatus } from './nutrition'

export const WIDGETS = [
  { key: 'today', label: 'Today agenda' },
  { key: 'score', label: 'Daily score' },
  { key: 'progress', label: "Today's progress" },
  { key: 'priorities', label: 'Top priorities & tasks' },
  { key: 'upcoming', label: 'Upcoming deadlines' },
  { key: 'stats', label: 'Today at a glance' },
  { key: 'goals', label: 'Goal progress' },
  { key: 'spending', label: 'Monthly spending' },
  { key: 'nutrition', label: 'Food & nutrition' },
  { key: 'weekly', label: 'Weekly score chart' },
  { key: 'activity', label: 'Recent activity' },
  { key: 'quick', label: 'Quick actions' },
  { key: 'getting_started', label: 'Getting started guide' },
]
/** First steps for a new account. Each is ticked off by real data, so the guide disappears by itself once everything has been tried. */
export function gettingStartedSteps({ tasks = [], habits = [], goals = [], transactions = [], healthLogs = [] }) {
  const steps = [
    { key: 'task', label: 'Plan a task', done: tasks.length > 0 },
    { key: 'habit', label: 'Create a habit', done: habits.length > 0 },
    { key: 'goal', label: 'Set a goal', done: goals.length > 0 },
    { key: 'money', label: 'Log an expense', done: transactions.length > 0 },
    { key: 'health', label: "Log today's sleep or water", done: healthLogs.length > 0 },
  ]
  return { steps, done: steps.filter((x) => x.done).length, total: steps.length, complete: steps.every((x) => x.done) }
}

/** Widgets that are only rows of zeros until something has been logged. A new account sees the guide instead of them. */
export const WIDGETS_NEEDING_DATA = ['today', 'score', 'progress', 'stats', 'weekly', 'activity']
/** True until anything at all has been entered, in any module. Takes the table rows to check. */
export const isBrandNew = (...tables) => tables.every((rows) => !rows?.length)

/** A widget is visible unless the user explicitly turned it off (so new widgets appear by default). */
export const isWidgetOn = (prefs, key) => prefs?.[key] !== false

/** The order widgets appear in until the user arranges them, and how wide each wants to be on a 12-column grid. */
const DEFAULT_ORDER = ['getting_started', 'today', 'score', 'progress', 'priorities', 'stats', 'weekly', 'upcoming', 'goals', 'spending', 'nutrition', 'activity', 'quick']
const WIDGET_SPAN = { getting_started: 12, today: 7, score: 5, progress: 7, priorities: 5, stats: 12, weekly: 7, upcoming: 5, goals: 4, spending: 4, nutrition: 4, activity: 4, quick: 12 }

/** Every widget key in the user's order. Saved keys come first; widgets added to the app later join in their default place. */
export function widgetOrder(prefs) {
  const saved = Array.isArray(prefs?.order) ? prefs.order.filter((k) => DEFAULT_ORDER.includes(k)) : []
  const missing = DEFAULT_ORDER.filter((k) => !saved.includes(k))
  return [...saved, ...missing]
}

/**
 * Lays visible widgets out in rows of 12 columns: each widget keeps its preferred width while it fits, and a row that ends short is stretched
 * to fill, so hiding or moving a widget never leaves a hole. Returns [{ key, span }] in display order.
 */
export function arrangeWidgets(keys) {
  const out = []
  let row = []
  let used = 0
  const flush = () => {
    if (!row.length) return
    const extra = 12 - used
    const each = Math.floor(extra / row.length)
    row.forEach((key, i) => out.push({ key, span: WIDGET_SPAN[key] + each + (i < extra - each * row.length ? 1 : 0) }))
    row = []
    used = 0
  }
  for (const key of keys) {
    if (used + WIDGET_SPAN[key] > 12) flush()
    row.push(key)
    used += WIDGET_SPAN[key]
  }
  flush()
  return out
}

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
 * @param d { tasks, studySessions, workouts, healthLogs, transactions, applications, history, interviews, goals, milestones, habits, habitLogs, foodLogs?, nutritionSettings? }
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
    nutrition: dayStatus(d.foodLogs ?? [], d.nutritionSettings ?? null, today),
    month: summarize(d.transactions, monthKey(today), budgetForMonth(d.budgets, monthStart(today), settings.monthly_budget_paise)),
    agenda: todayAgenda({ tasks: d.tasks, habits: d.habits, habitLogs: d.habitLogs, workouts: d.workouts, routines: d.routines, interviews: d.interviews, applications: d.applications, reminders: d.reminders, topics: d.topics, recurringRules: d.recurringRules }, { today, tz, weekStartsOn: w, workoutPlan: settings.workout_plan }),
    upcoming: upcomingItems({ tasks: d.tasks, interviews: d.interviews, applications: d.applications, goals: d.goals, milestones: d.milestones, reminders: d.reminders, recurring: d.recurringRules }, { today, tz, nowMs }),
    gettingStarted: gettingStartedSteps({ tasks: d.tasks, habits: d.habits, goals: d.goals, transactions: d.transactions, healthLogs: d.healthLogs }),
    openToday: todayTasks.filter(isOpen).length,
    doneTodayTasks: todayTasks.filter((t) => t.status === 'done').length,
    hasTasksToday: todayTasks.length > 0,
    topTasks: todayTasks.filter(isOpen).sort(byPriority).slice(0, 3),
    health,
    stepsToday: stepsForDay(health, d.workouts, today),
    cardioStepsToday: cardioSteps(d.workouts, today),
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
