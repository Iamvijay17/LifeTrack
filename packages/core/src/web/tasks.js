// Pure task logic (no React, no Supabase) — shared by the Planner and the dashboard.
const RANK = { high: 0, medium: 1, low: 2 }

export const byPriority = (a, b) => RANK[a.priority] - RANK[b.priority] || a.created_at.localeCompare(b.created_at)
export const isOpen = (t) => t.status === 'pending' || t.status === 'in_progress'

/**
 * Buckets for the planner screen.
 *  - priorities: the 3 most important open tasks due `day`; pending: the rest of the open ones
 *  - done / off (skipped or cancelled) for that day
 *  - overdue: open tasks due before today — only shown when looking at today
 *  - someday: open tasks with no due date
 */
export function groupTasksForDay(tasks, day, today) {
  const forDay = tasks.filter((t) => t.due_date === day)
  const open = forDay.filter(isOpen).sort(byPriority)
  return {
    priorities: open.slice(0, 3),
    pending: open.slice(3),
    done: forDay.filter((t) => t.status === 'done'),
    off: forDay.filter((t) => t.status === 'skipped' || t.status === 'cancelled'),
    overdue:
      day === today
        ? tasks.filter((t) => isOpen(t) && t.due_date && t.due_date < today).sort((a, b) => a.due_date.localeCompare(b.due_date))
        : [],
    someday: tasks.filter((t) => isOpen(t) && !t.due_date).sort(byPriority),
    count: forDay.length,
  }
}
