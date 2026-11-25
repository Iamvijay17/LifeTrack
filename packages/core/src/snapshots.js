// Per-module summaries for the Life Command Center. Everything is derived from the user's own rows and goals: a figure that has no data behind
// it is `null` (the widget shows "not logged"), never a made-up zero that would read as a result.
import { addDays, eachDay, fmtDay, monthKey, monthStart, startOfWeek, weekday } from '@lifetrack/utils'
import { isStudyGoal, countedMinutes, goalProgress } from './learning'
import { isInactive, isOpen } from './tasks'
import { OPEN_STATUSES } from './jobs'
import { gymState } from './dashboard'
import { stepsForDay } from './fitness'
import { sleepConsistency, sleepGoalOf } from './sleep'
import { budgetForMonth, summarize } from './finance'
import { habitStats } from './habits'

const pct = (done, target) => (target > 0 ? Math.max(0, Math.min(100, Math.round((done / target) * 100))) : null)

/** Task counts for the day, and how many open tasks are past their due date (whatever day that was). */
export function taskSummary(tasks, today) {
  const day = tasks.filter((t) => t.due_date === today && !isInactive(t))
  const done = day.filter((t) => t.status === 'done').length
  return {
    total: day.length,
    done,
    pending: day.filter(isOpen).length,
    overdue: tasks.filter((t) => isOpen(t) && t.due_date && t.due_date < today).length,
  }
}

/** The next scheduled interviews and how many are still ahead. `nowMs` is injected so it can be tested. */
function scheduledInterviews(interviews, applications, nowMs) {
  const now = new Date(nowMs).toISOString()
  return interviews
    .filter((e) => e.status === 'scheduled' && e.scheduled_at >= now)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .map((e) => ({ ...e, app: applications.find((a) => a.id === e.application_id) }))
    .filter((e) => e.app)
}

/** How many scheduled interviews are still ahead (the dashboard header counts these as upcoming events). */
export const upcomingInterviewCount = (interviews, applications, nowMs = Date.now()) => scheduledInterviews(interviews, applications, nowMs).length

/**
 * Career & learning. There is no "course" record in LifeTrack: a course is a Learning goal that is still active, and a skill is a topic you
 * have actually studied in the last 30 days, so both come from what was recorded rather than a list you would have to keep in sync.
 */
export function learningSnapshot({ sessions = [], goals = [], topics = [], today, weekStartsOn = 1, targetMinutes = 0 }) {
  const todayMinutes = countedMinutes(sessions.filter((s) => s.session_date === today))
  const weekStart = startOfWeek(today, weekStartsOn)
  const weekMinutes = countedMinutes(sessions.filter((s) => s.session_date >= weekStart && s.session_date <= addDays(weekStart, 6)))
  const since = addDays(today, -29)
  const recent = sessions.filter((s) => s.session_date >= since && s.session_date <= today)
  const skills = topics
    .filter((t) => !t.archived)
    .map((t) => ({ id: t.id, name: t.name, group: t.group_name, minutes: Math.round(countedMinutes(recent.filter((s) => s.topic_id === t.id))) }))
    .filter((t) => t.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
  const courses = goals
    .filter((g) => g.status === 'active' && isStudyGoal(g))
    .map((g) => ({ id: g.id, title: g.title, percent: goalProgress(g, sessions).percent, due: g.due_date ?? null }))
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  return {
    totalMinutes: Math.round(countedMinutes(sessions)),
    todayMinutes: Math.round(todayMinutes),
    targetMinutes,
    todayPercent: pct(todayMinutes, targetMinutes),
    weekMinutes: Math.round(weekMinutes),
    running: sessions.some((s) => s.status === 'running'),
    courses,
    skills,
    hasData: sessions.some((s) => s.status === 'completed') || courses.length > 0,
  }
}

/** Job switch: totals, what is in progress, interviews still ahead and the latest status changes. */
export function jobsSnapshot({ applications = [], interviews = [], history = [], today, weekStartsOn = 1, nowMs = Date.now(), limit = 4 }) {
  const weekStart = startOfWeek(today, weekStartsOn)
  const ahead = scheduledInterviews(interviews, applications, nowMs)
  const recent = history
    .map((h) => ({ h, app: applications.find((a) => a.id === h.application_id) }))
    .filter((x) => x.app)
    .sort((a, b) => b.h.changed_at.localeCompare(a.h.changed_at))
    .slice(0, limit)
    .map(({ h, app }) => ({ id: h.id, at: h.changed_at, company: app.company, role: app.job_title, from: h.from_status, to: h.to_status, appId: app.id }))
  return {
    total: applications.length,
    inProgress: applications.filter((a) => OPEN_STATUSES.includes(a.status)).length,
    appliedThisWeek: applications.filter((a) => a.applied_date && a.applied_date >= weekStart && a.applied_date <= addDays(weekStart, 6)).length,
    offers: applications.filter((a) => a.status === 'offer' || a.status === 'selected').length,
    interviewsScheduled: ahead.length,
    nextInterview: ahead[0] ?? null,
    recent,
  }
}

/**
 * Gym & fitness. `plan` is the weekly workout plan (weekday -> routine id | 'rest'). The goal is "do the workouts you planned this week",
 * so with no plan there is no goal progress to show rather than a target we invented. Calories are what was eaten (Nutrition), since workouts
 * do not record burn; they appear only once food has been logged today.
 */
export function fitnessSnapshot({ workouts = [], health = null, settings = {}, today, weekStartsOn = 1, caloriesEaten = null }) {
  const plan = settings.workout_plan ?? {}
  const weekStart = startOfWeek(today, weekStartsOn)
  const week = eachDay(weekStart, addDays(weekStart, 6))
  const completed = workouts.filter((w) => w.status === 'completed')
  const inWeek = completed.filter((w) => w.workout_date >= weekStart && w.workout_date <= addDays(weekStart, 6))
  const plannedDays = week.filter((d) => plan[String(weekday(d))] && plan[String(weekday(d))] !== 'rest')
  const hit = plannedDays.filter((d) => completed.some((w) => w.workout_date === d)).length
  const todays = workouts.filter((w) => w.workout_date === today)
  const steps = stepsForDay(health, workouts, today)
  const stepsGoal = settings.steps_goal ?? 0
  return {
    today: gymState(todays, plan[String(weekday(today))]),
    todayName: todays.find((w) => w.status === 'completed')?.name ?? null,
    weekCount: inWeek.length,
    weekMinutes: inWeek.reduce((a, w) => a + (w.duration_minutes ?? 0), 0),
    planned: plannedDays.length,
    plannedDone: hit,
    goalPercent: plannedDays.length ? pct(hit, plannedDays.length) : null,
    week: week.map((d) => ({ d, label: fmtDay(d, 'EEE'), done: completed.some((w) => w.workout_date === d), planned: plannedDays.includes(d) })),
    steps: steps > 0 ? steps : null,
    stepsGoal,
    stepsPercent: steps > 0 ? pct(steps, stepsGoal) : null,
    calories: caloriesEaten != null && caloriesEaten > 0 ? Math.round(caloriesEaten) : null,
  }
}

/**
 * Sleep: the most recent night recorded (not necessarily last night), against the goal, and how steady the last seven days were.
 * A night that was not logged is missing, not a short night, so it never enters an average.
 */
export function sleepSnapshot({ healthLogs = [], settings = {}, today }) {
  const goal = sleepGoalOf(settings)
  const slept = healthLogs.filter((l) => l.sleep_minutes != null && l.log_date <= today).sort((a, b) => b.log_date.localeCompare(a.log_date))
  const last = slept[0] ?? null
  const days = eachDay(addDays(today, -6), today)
  const week = days.map((d) => {
    const log = healthLogs.find((l) => l.log_date === d)
    return { d, label: fmtDay(d, 'EEE'), minutes: log?.sleep_minutes ?? null }
  })
  const logged = week.filter((w) => w.minutes != null)
  const consistency = sleepConsistency(
    healthLogs.filter((l) => l.log_date >= days[0] && l.log_date <= today),
    { goalMinutes: goal },
  )
  return {
    goal,
    lastMinutes: last?.sleep_minutes ?? null,
    lastDate: last?.log_date ?? null,
    daysAgo: last ? Math.round((new Date(today + 'T00:00:00Z') - new Date(last.log_date + 'T00:00:00Z')) / 864e5) : null,
    goalPercent: last ? pct(last.sleep_minutes, goal) : null,
    week,
    nightsLogged: logged.length,
    avgMinutes: logged.length ? Math.round(logged.reduce((a, w) => a + w.minutes, 0) / logged.length) : null,
    nightsMetGoal: logged.filter((w) => w.minutes >= goal).length,
    consistency,
  }
}

/** Finance for the month of `today`: money in, money out, what is left of the budget and the latest transactions. */
export function financeSnapshot({ transactions = [], budgets = [], settings = {}, today, limit = 5 }) {
  const month = monthKey(today)
  const budget = budgetForMonth(budgets, monthStart(today), settings.monthly_budget_paise ?? 0)
  const sum = summarize(transactions, month, budget)
  const recent = [...transactions].sort((a, b) => (b.txn_date + (b.created_at ?? '')).localeCompare(a.txn_date + (a.created_at ?? ''))).slice(0, limit)
  return { month, sum, hasBudget: budget > 0, recent, hasData: transactions.length > 0 }
}

/**
 * Habits and the day's routine. `agenda` is todayAgenda(): the routine is everything planned for today (tasks, habits, workout, reminders...),
 * so its progress is the same count the Today widget shows. Streaks are habits with a current streak, longest first.
 */
export function habitsSnapshot({ habits = [], habitLogs = [], today, weekStartsOn = 1, agenda = null }) {
  const stats = habitStats(habits, habitLogs, today, weekStartsOn).filter((s) => !s.habit.archived_at)
  const due = stats.filter((s) => s.due || s.today?.status === 'done')
  const done = due.filter((s) => s.today?.status === 'done')
  const pending = due.filter((s) => s.today?.status !== 'done')
  const streaks = stats
    .filter((s) => s.current > 0)
    .sort((a, b) => b.current - a.current)
    .map((s) => ({ id: s.habit.id, name: s.habit.name, current: s.current, unit: s.unit, color: s.habit.color }))
  return {
    total: stats.length,
    due: due.length,
    done: done.length,
    percent: due.length ? pct(done.length, due.length) : null,
    pending: pending.map((s) => ({ id: s.habit.id, name: s.habit.name, color: s.habit.color })),
    streaks,
    routine: agenda ? { done: agenda.doneCount, total: agenda.total, percent: pct(agenda.doneCount, agenda.total) } : null,
  }
}
