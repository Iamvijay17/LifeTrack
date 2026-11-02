import { addDays, addMonths, monthEnd } from '@/lib/dates'

export const REMINDER_KINDS = [
  { value: 'task', label: 'Task' },
  { value: 'study', label: 'Study' },
  { value: 'workout', label: 'Workout' },
  { value: 'habit', label: 'Habit' },
  { value: 'bill', label: 'Bill' },
  { value: 'custom', label: 'Custom' },
]
export const REPEATS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]
export const KIND_LINK = {
  task: '/planner',
  study: '/learning',
  workout: '/fitness',
  habit: '/habits',
  bill: '/finance',
  custom: '/notifications',
}

/** Next date for a repeating reminder strictly after `date` (monthly clamps to the last day of shorter months). */
export function nextRemindDate(date, repeat) {
  if (repeat === 'daily') return addDays(date, 1)
  if (repeat === 'weekly') return addDays(date, 7)
  if (repeat === 'monthly') {
    const first = addMonths(date.slice(0, 7) + '-01', 1)
    const day = Math.min(Number(date.slice(8)), Number(monthEnd(first).slice(8)))
    return first.slice(0, 8) + String(day).padStart(2, '0')
  }
  return null
}

/** Reminders that should fire now: active, due on/before today (and past their time today), not already fired today. */
export function dueReminders(reminders, today, nowTime) {
  return reminders.filter(
    (r) =>
      r.active && r.last_fired_on !== today && (r.remind_date < today || (r.remind_date === today && r.remind_time.slice(0, 5) <= nowTime)),
  )
}

/** What to store on the reminder after it fires. One-off reminders deactivate; repeating ones jump past today. */
export function afterFire(r, today) {
  if (r.repeat === 'none') return { last_fired_on: today, active: false }
  let next = r.remind_date
  do {
    next = nextRemindDate(next, r.repeat)
  } while (next <= today)
  return { last_fired_on: today, remind_date: next }
}

export const unreadCount = (notifications) => notifications.filter((n) => !n.read_at).length

// ------------------------------------------------------------- list helpers
export const kindLabel = (kind) => REMINDER_KINDS.find((k) => k.value === kind)?.label
export const repeatLabel = (repeat) => REPEATS.find((r) => r.value === repeat)?.label

/** A kind is on unless the user explicitly turned it off (so a new kind is on by default). */
export const isKindEnabled = (prefs, kind) => prefs?.[kind] !== false

/** Newest first. */
export const sortInbox = (notifications) => [...notifications].sort((a, b) => b.created_at.localeCompare(a.created_at))

/** Active reminders first, then by date and time. */
export const sortReminders = (reminders) =>
  [...reminders].sort(
    (a, b) => Number(b.active) - Number(a.active) || (a.remind_date + a.remind_time).localeCompare(b.remind_date + b.remind_time),
  )

/** The fields that change when a reminder is switched on or off. Turning one back on re-arms it for its next time. */
export const togglePatch = (reminder) => ({ active: !reminder.active, ...(!reminder.active ? { last_fired_on: null } : {}) })
