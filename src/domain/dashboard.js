// Pure dashboard logic (no React, no Supabase): the greeting, today's headline numbers, the week's score series and the activity feed.
import { addDays, eachDay, fmtDay, fmtDuration } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { countedMinutes } from './learning'
import { groupTasksForDay } from './tasks'
import { appliedInWeek } from './jobs'
import { gymStatus, planFor } from './fitness'
import { goalRows, visibleGoals } from './goals'

/** "Good morning" etc. from the hour (0–23) in the user's timezone. */
export const greetingFor = (hour) =>
  hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 22 ? 'Good evening' : 'Good night'

/**
 * Today's headline numbers. `habitStats` is buildHabitStats(); `plan` the weekly workout plan.
 * Habits count when they are due today (or already have a log today) and are not archived.
 */
export function todayHeadlines({ tasks, sessions, healthLogs, transactions, applications, workouts, habitStats, plan, today, weekStart }) {
  const day = groupTasksForDay(tasks, today, today)
  const habitsDue = habitStats.filter((s) => !s.habit.archived_at && (s.due || s.today))
  const todayWorkouts = workouts.filter((x) => x.workout_date === today)
  return {
    priorities: day.priorities,
    hasTasksToday: day.count > 0,
    openTasks: day.priorities.length + day.pending.length,
    doneTasks: day.done.length,
    health: healthLogs.find((h) => h.log_date === today),
    studyMinutes: countedMinutes(sessions.filter((s) => s.session_date === today)),
    studyRunning: sessions.some((s) => s.status === 'running'),
    spentToday: transactions.filter((t) => t.type === 'expense' && t.txn_date === today).reduce((a, t) => a + t.amount_paise, 0),
    appliedThisWeek: appliedInWeek(applications, weekStart),
    habitsDue: habitsDue.length,
    habitsDone: habitsDue.filter((s) => s.today?.status === 'done').length,
    gym: gymStatus(todayWorkouts, planFor(plan, today)),
    workoutName: todayWorkouts[0]?.name,
  }
}

/** Daily score for each day of the week starting at `weekStart`; days after today are null. `scoreFor(date)` returns { score }. */
export function weekScoreSeries(scoreFor, weekStart, today) {
  return eachDay(weekStart, addDays(weekStart, 6)).map((d) => ({ d, label: fmtDay(d, 'EEE'), score: d > today ? null : scoreFor(d).score }))
}

/** The nearest-deadline active goals with their real progress (milestones / study / manual), at most `limit`. */
export function dashboardGoals(goals, milestones, sessions, limit = 4) {
  return visibleGoals(goalRows(goals, milestones, sessions), { tab: 'active' }).slice(0, limit)
}

/**
 * The latest things you did, newest first. `kind` tells the UI which icon to use:
 * task | study | workout | money | job | habit.
 */
export function recentActivity({ tasks, sessions, workouts, transactions, history, applications, habitLogs, habits, currency }, limit = 8) {
  const items = []
  for (const t of tasks)
    if (t.status === 'done' && t.completed_at) items.push({ at: t.completed_at, kind: 'task', text: `Completed “${t.title}”` })
  for (const s of sessions)
    if (s.status === 'completed' && s.ended_at)
      items.push({
        at: s.ended_at,
        kind: 'study',
        text: `Studied ${fmtDuration(s.duration_seconds / 60)}${s.problems_solved ? ` · ${s.problems_solved} problems` : ''}`,
      })
  for (const x of workouts) if (x.status === 'completed') items.push({ at: x.created_at, kind: 'workout', text: `Workout: ${x.name}` })
  for (const t of transactions)
    items.push({
      at: t.created_at,
      kind: 'money',
      text: `${t.type === 'income' ? 'Income' : t.type === 'savings' ? 'Saved' : 'Spent'} ${formatMoney(t.amount_paise, currency)} · ${t.category}`,
    })
  for (const h of history) {
    const app = applications.find((x) => x.id === h.application_id)
    if (app)
      items.push({
        at: h.changed_at,
        kind: 'job',
        text: `${app.company}: ${h.from_status ? `${h.from_status} → ` : 'added as '}${h.to_status}`,
      })
  }
  for (const l of habitLogs)
    if (l.status === 'done') {
      const habit = habits.find((x) => x.id === l.habit_id)
      if (habit) items.push({ at: l.updated_at ?? l.created_at, kind: 'habit', text: `Checked in: ${habit.name}` })
    }
  return items.sort((x, y) => y.at.localeCompare(x.at)).slice(0, limit)
}
