import { addDays, addMonths, weekday, monthEnd } from '@lifetrack/utils'

export const RECURRENCES = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
]

export function nextDueDate(due, recurrence) {
  switch (recurrence) {
    case 'daily':
      return addDays(due, 1)
    case 'weekly':
      return addDays(due, 7)
    case 'weekdays': {
      let n = addDays(due, 1)
      while ([0, 6].includes(weekday(n))) n = addDays(n, 1)
      return n
    }
    case 'monthly': {
      const day = Number(due.slice(8))
      const first = addMonths(due, 1)
      const last = Number(monthEnd(first).slice(8))
      return first.slice(0, 8) + String(Math.min(day, last)).padStart(2, '0')
    }
    case 'yearly': {
      // 29 Feb falls on 28 Feb in years without one. Like monthly, each occurrence is derived from the previous one, so it stays on the 28th afterwards.
      const y = Number(due.slice(0, 4)) + 1
      const m = due.slice(5, 7)
      const last = Number(monthEnd(`${y}-${m}-01`).slice(8))
      return `${y}-${m}-${String(Math.min(Number(due.slice(8)), last)).padStart(2, '0')}`
    }
    default:
      return null
  }
}

/** The next occurrence of a recurring task, or null if it does not repeat / is past its end date. */
export function nextOccurrence(task) {
  if (!task.recurrence || task.recurrence === 'none' || !task.due_date) return null
  const next = nextDueDate(task.due_date, task.recurrence)
  if (!next) return null
  if (task.recurrence_until && next > task.recurrence_until) return null
  return next
}
