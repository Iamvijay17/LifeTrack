import { addDays, addMonths, monthEnd } from '@lifetrack/utils'

export const REMINDER_KINDS = [
  { value: 'task', label: 'Task' }, { value: 'study', label: 'Study' }, { value: 'workout', label: 'Workout' },
  { value: 'habit', label: 'Habit' }, { value: 'bill', label: 'Bill' }, { value: 'custom', label: 'Custom' },
]
export const REPEATS = [{ value: 'none', label: 'Does not repeat' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]
export const KIND_LINK = { task: '/planner', study: '/learning', workout: '/fitness', habit: '/habits', bill: '/finance', custom: '/notifications' }

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
  return reminders.filter((r) => r.active && r.last_fired_on !== today
    && (r.remind_date < today || (r.remind_date === today && r.remind_time.slice(0, 5) <= nowTime)))
}

/** What to store on the reminder after it fires. One-off reminders deactivate; repeating ones jump past today. */
export function afterFire(r, today) {
  if (r.repeat === 'none') return { last_fired_on: today, active: false }
  let next = r.remind_date
  do { next = nextRemindDate(next, r.repeat) } while (next <= today)
  return { last_fired_on: today, remind_date: next }
}

export const unreadCount = (notifications) => notifications.filter((n) => !n.read_at).length

// ---- presentation + runner helpers shared by web and mobile
/**
 * Background runners in the apps wait this long after a reminder's time before firing it themselves, so the server job
 * (which also sends the push) always gets the first chance. The apps only act as a fallback if the server is not running.
 */
export const CLIENT_GRACE_MINUTES = 2
/** 'HH:MM' shifted earlier by `minutes` (clamped at 00:00; reminders from earlier days are due regardless of time). */
export function clientNowTime(nowTime, minutes = CLIENT_GRACE_MINUTES) {
  const [h, m] = nowTime.split(':').map(Number)
  const t = Math.max(0, h * 60 + m - minutes)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
export const kindLabel = (kind) => REMINDER_KINDS.find((k) => k.value === kind)?.label ?? kind
export const repeatLabel = (repeat) => REPEATS.find((r) => r.value === repeat)?.label ?? repeat
/** A kind is enabled unless the user explicitly turned it off. */
export const prefEnabled = (prefs, kind) => prefs?.[kind] !== false
export const sortInbox = (notifications) => [...notifications].sort((a, b) => b.created_at.localeCompare(a.created_at))
/** Active reminders first, then by next date/time. */
export const sortReminders = (reminders) => [...reminders].sort((a, b) => Number(b.active) - Number(a.active) || (a.remind_date + a.remind_time).localeCompare(b.remind_date + b.remind_time))
