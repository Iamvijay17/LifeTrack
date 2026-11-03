import { diffDays } from '@lifetrack/utils'
import { goalMinutes } from './learning'

export const PERIODS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]
export const GOAL_CATEGORIES = ['Learning', 'Career', 'Fitness', 'Health', 'Finance', 'Personal']

/**
 * Progress 0–100 for a goal, using the most concrete source available:
 *  1. milestones (done / total) when it has any,
 *  2. logged study time against a minutes target (Learning goals),
 *  3. the manually-set percentage.
 */
export function goalPercent(goal, milestones = [], sessions = []) {
  const ms = milestones.filter((m) => m.goal_id === goal.id)
  if (goal.status === 'completed') return { percent: 100, source: 'completed' }
  if (ms.length)
    return {
      percent: Math.round((ms.filter((m) => m.done).length / ms.length) * 100),
      source: 'milestones',
      done: ms.filter((m) => m.done).length,
      total: ms.length,
    }
  if ((goal.target_minutes ?? 0) > 0)
    return { percent: Math.min(100, Math.round((goalMinutes(goal, sessions) / goal.target_minutes) * 100)), source: 'study' }
  return { percent: goal.manual_progress ?? 0, source: 'manual' }
}

export const isOverdue = (goal, today) => goal.status === 'active' && !!goal.due_date && goal.due_date < today
/** Whole days from `today` to the target date (negative = overdue), or null when there is no target date. */
export const daysLeft = (goal, today) => (goal.due_date ? diffDays(goal.due_date, today) : null)

export const periodLabel = (value) => PERIODS.find((p) => p.value === value)?.label

// ---------------------------------------------------------------- milestones
export const sortMilestones = (ms) => [...ms].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))

/** Position for a new milestone: after the highest existing one (so deletions never cause duplicate positions). */
export const nextMilestonePosition = (ms) => ms.reduce((max, m) => Math.max(max, m.position ?? 0), -1) + 1

// --------------------------------------------------------------- goal list
/** Every goal with its progress and its own milestones (in order). */
export const goalRows = (goals, milestones, sessions) =>
  goals.map((goal) => ({
    goal,
    progress: goalPercent(goal, milestones, sessions),
    milestones: sortMilestones(milestones.filter((m) => m.goal_id === goal.id)),
  }))

/** Active goals or history (completed + archived), optionally one period, soonest target date first (no date last). */
export function visibleGoals(rows, { tab = 'active', period = '' } = {}) {
  return rows
    .filter(({ goal }) => (tab === 'active' ? goal.status === 'active' : goal.status !== 'active') && (!period || goal.period === period))
    .sort((a, b) => (a.goal.due_date ?? '9999').localeCompare(b.goal.due_date ?? '9999'))
}

/** Headline numbers. `avg` is the average progress of active goals (null when there are none). */
export function goalSummary(rows, milestones, today) {
  const active = rows.filter((r) => r.goal.status === 'active')
  const completed = rows.filter((r) => r.goal.status === 'completed').length
  const closed = completed + rows.filter((r) => r.goal.status === 'archived').length
  return {
    active: active.length,
    overdue: active.filter((r) => isOverdue(r.goal, today)).length,
    completed,
    completedShare: closed ? Math.round((completed / closed) * 100) : null,
    avg: active.length ? Math.round(active.reduce((a, r) => a + r.progress.percent, 0) / active.length) : null,
    milestonesDone: milestones.filter((m) => m.done).length,
    milestonesTotal: milestones.length,
  }
}

/** What the progress bar is measuring, in words. */
export const progressSourceLabel = (p) =>
  p.source === 'milestones'
    ? `${p.done}/${p.total} milestones`
    : p.source === 'study'
      ? 'Study time'
      : p.source === 'completed'
        ? 'Completed'
        : 'Manual progress'

/** "5d left" / "Due today" / "3d overdue", or null when there is no target date. */
export function remainingText(goal, today) {
  const left = daysLeft(goal, today)
  return left == null ? null : left < 0 ? `${-left}d overdue` : left === 0 ? 'Due today' : `${left}d left`
}
