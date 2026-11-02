import { goalMinutes } from './learning'

export const PERIODS = [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]
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
  if (ms.length) return { percent: Math.round((ms.filter((m) => m.done).length / ms.length) * 100), source: 'milestones', done: ms.filter((m) => m.done).length, total: ms.length }
  if ((goal.target_minutes ?? 0) > 0) return { percent: Math.min(100, Math.round((goalMinutes(goal, sessions) / goal.target_minutes) * 100)), source: 'study' }
  return { percent: goal.manual_progress ?? 0, source: 'manual' }
}

export const isOverdue = (goal, today) => goal.status === 'active' && !!goal.due_date && goal.due_date < today
export const daysLeft = (goal, today) => (goal.due_date ? Math.round((new Date(goal.due_date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 864e5) : null)
