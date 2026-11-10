// Planner logic shared by web and mobile.
const RANK = { urgent: 0, high: 1, medium: 2, low: 3 }
export const byPriority = (a, b) => RANK[a.priority] - RANK[b.priority] || a.created_at.localeCompare(b.created_at)
export const isOpen = (t) => t.status === 'pending' || t.status === 'in_progress'
export const isInactive = (t) => t.status === 'cancelled' || t.status === 'skipped'

/** Display flags for one task relative to `today`. */
export function taskFlags(task, today) {
  const done = task.status === 'done'
  const inactive = isInactive(task)
  const overdue = !done && !inactive && !!task.due_date && task.due_date < today
  return { done, inactive, overdue }
}

/**
 * Buckets for the Daily Planner. Top priorities = the 3 most important open tasks of the day.
 * Overdue is only shown when looking at today; "someday" = open tasks with no due date.
 */
export function groupTasksForDay(tasks, day, today) {
  const forDay = tasks.filter((t) => t.due_date === day)
  const open = forDay.filter(isOpen).sort(byPriority)
  return {
    priorities: open.slice(0, 3),
    pending: open.slice(3),
    done: forDay.filter((t) => t.status === 'done'),
    off: forDay.filter(isInactive),
    overdue: day === today ? tasks.filter((t) => isOpen(t) && t.due_date && t.due_date < today).sort((a, b) => a.due_date.localeCompare(b.due_date)) : [],
    someday: tasks.filter((t) => isOpen(t) && !t.due_date).sort(byPriority),
    count: forDay.length,
  }
}
