import { addDays, addMonths, monthEnd, weekday, zonedToMs } from '@lifetrack/utils'

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
  { value: 'weekdays', label: 'Weekdays (Mon to Fri)' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]
export const KIND_LINK = {
  task: '/planner',
  study: '/learning',
  workout: '/fitness',
  habit: '/habits',
  bill: '/finance',
  custom: '/notifications',
  job: '/jobs',
  goal: '/goals',
  event: '/calendar',
  system: '/notifications',
}

/** Next date for a repeating reminder strictly after `date` (monthly and yearly clamp to the last day of shorter months, so 29 Feb becomes 28 Feb). */
export function nextRemindDate(date, repeat) {
  if (repeat === 'daily') return addDays(date, 1)
  if (repeat === 'weekdays') {
    let next = addDays(date, 1)
    while (weekday(next) === 0 || weekday(next) === 6) next = addDays(next, 1) // Saturday and Sunday are skipped
    return next
  }
  if (repeat === 'weekly') return addDays(date, 7)
  if (repeat === 'monthly' || repeat === 'yearly') {
    const first = addMonths(date.slice(0, 7) + '-01', repeat === 'yearly' ? 12 : 1)
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

/**
 * The notification a reminder turns into when it fires. With a timezone it also records when the reminder was meant to go off (`due_at`), so one that
 * fires late, because every device was off, can be shown as missed. The dedupe key is one per reminder per day: devices racing to fire it make one.
 */
export const reminderNotification = (r, today, tz) => ({
  kind: r.kind,
  title: r.title,
  body: r.body ?? '',
  priority: r.priority ?? 'normal',
  link: KIND_LINK[r.kind] ?? '',
  due_at: tz ? new Date(reminderDueMs(r, tz)).toISOString() : null,
  dedupe_key: `reminder:${r.id}:${today}`,
})

export const unreadCount = (notifications) => notifications.filter((n) => !n.read_at).length

/** The instant a reminder is meant to go off, in the user's timezone (a reminder is a wall-clock time, so it moves with the zone). */
export const reminderDueMs = (reminder, tz) => zonedToMs(reminder.remind_date, reminder.remind_time.slice(0, 5), tz)
/** An active reminder whose time has passed (whether or not a device has turned it into a notification yet). `nowTime` is 'HH:MM'. */
export const isReminderOverdue = (r, today, nowTime) => r.active && (r.remind_date < today || (r.remind_date === today && r.remind_time.slice(0, 5) <= nowTime))

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
export const kindLabel = (kind) => REMINDER_KINDS.find((k) => k.value === kind)?.label
export const repeatLabel = (repeat) => REPEATS.find((r) => r.value === repeat)?.label
/** A kind is enabled unless the user explicitly turned it off. */
export const prefEnabled = (prefs, kind) => prefs?.[kind] !== false
export const sortInbox = (notifications) => [...notifications].sort((a, b) => b.created_at.localeCompare(a.created_at))
/** Active reminders first, then by next date/time. */
export const sortReminders = (reminders) => [...reminders].sort((a, b) => Number(b.active) - Number(a.active) || (a.remind_date + a.remind_time).localeCompare(b.remind_date + b.remind_time))

/** A kind is on unless the user explicitly turned it off (alias kept for the web app). */
export const isKindEnabled = prefEnabled

/** The fields that change when a reminder is switched on or off. Turning one back on re-arms it for its next time. */
export const togglePatch = (reminder) => ({ active: !reminder.active, ...(!reminder.active ? { last_fired_on: null } : {}) })
