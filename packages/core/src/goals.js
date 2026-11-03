import { goalMinutes } from './learning'

export const GOAL_CATEGORIES = ['Learning', 'Career', 'Fitness', 'Health', 'Finance', 'Personal']
export const PERIODS = [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]


/**
 * Progress 0–100 for a goal, using the most concrete source available:
 *  1. milestones (done / total) when it has any,
 *  2. logged study time against a minutes target (Learning goals),
 *  3. the manually-set percentage.
 */
export function goalPercent(goal, milestones = [], sessions = []) {
  const ms = milestones.filter((m) => m.goal_id === goal.id)
  if (goal.status === 'completed') return { percent: 100, source: 'completed' }
  if (ms.length) return { percent: Math.round((ms.filter((m) => m.done).length / ms.length) * 100), source: 'milestones', done: ms.filter((m) => m.done).length, total: ms.length }
  if ((goal.target_minutes ?? 0) > 0) return { percent: Math.min(100, Math.round((goalMinutes(goal, sessions) / goal.target_minutes) * 100)), source: 'study' }
  return { percent: goal.manual_progress ?? 0, source: 'manual' }
}

export const isOverdue = (goal, today) => goal.status === 'active' && !!goal.due_date && goal.due_date < today
export const daysLeft = (goal, today) => (goal.due_date ? Math.round((new Date(goal.due_date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 864e5) : null)

// ---- presentation helpers shared by the Goals screens
export const periodLabel = (p) => PERIODS.find((x) => x.value === p)?.label ?? p
export const goalSourceLabel = (p) =>
  p.source === 'milestones' ? `${p.done}/${p.total} milestones` : p.source === 'study' ? 'Study time' : p.source === 'completed' ? 'Completed' : 'Manual progress'
export const orderedMilestones = (goalId, milestones) =>
  milestones.filter((m) => m.goal_id === goalId).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
export const daysLeftLabel = (left) => (left < 0 ? `${-left}d overdue` : left === 0 ? 'Due today' : `${left}d left`)

/** Rows (goal + computed progress) for the active/history list, filtered by tab and period and sorted by due date. */
export function goalList(goals, milestones, sessions, { tab = 'active', period = '' } = {}) {
  const rows = goals.map((g) => ({ g, p: goalPercent(g, milestones, sessions) }))
  return rows
    .filter(({ g }) => (tab === 'active' ? g.status === 'active' : g.status !== 'active') && (!period || g.period === period))
    .sort((a, b) => (a.g.due_date ?? '9999').localeCompare(b.g.due_date ?? '9999'))
}

export function goalsSummary(goals, milestones, sessions, today) {
  const rows = goals.map((g) => ({ g, p: goalPercent(g, milestones, sessions) }))
  const active = rows.filter((r) => r.g.status === 'active')
  const completed = rows.filter((r) => r.g.status === 'completed')
  const closed = completed.length + rows.filter((r) => r.g.status === 'archived').length
  return {
    active: active.length,
    overdue: active.filter((r) => isOverdue(r.g, today)).length,
    completed: completed.length,
    completedShare: closed ? Math.round((completed.length / closed) * 100) : null,
    avgProgress: active.length ? Math.round(active.reduce((a, r) => a + r.p.percent, 0) / active.length) : null,
    milestonesDone: milestones.filter((m) => m.done).length,
    milestonesTotal: milestones.length,
  }
}
