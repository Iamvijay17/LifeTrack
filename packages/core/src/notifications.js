// The notification centre's rules: priorities, categories, settings, quiet hours, snooze / dismiss, filtering and search, and the plan for which
// new notifications should interrupt the person. Pure: the web app and the send-reminders Edge Function (see scripts/sync-function-core.mjs, which
// copies this file next to it) run the same code, so import only from @lifetrack/utils.
//
// Vocabulary
//   inbox      a notification that is neither dismissed nor snoozed into the future. This is what the bell and the Inbox tab show.
//   snoozed    hidden until `snoozed_until`, then it is in the inbox again (as unread).
//   dismissed  out of the inbox; it stays in the History until it is deleted.
//   unread     in the inbox and `read_at` is empty. A hidden notification never counts toward the badge.
import { addDays, localDayMinutes, minutesToTime, timeToMinutes, weekday, zonedToMs } from '@lifetrack/utils'

// ---------------------------------------------------------------- priorities
export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]
const RANK = { low: 0, normal: 1, high: 2, urgent: 3 }
export const normalizePriority = (p) => (typeof p === 'string' && Object.hasOwn(RANK, p) ? p : 'normal')
export const priorityRank = (p) => RANK[normalizePriority(p)]
export const priorityLabel = (p) => PRIORITIES.find((x) => x.value === normalizePriority(p)).label
/** Tasks and calendar events say `medium` where notifications say `normal`. */
export const fromItemPriority = (p) => (p === 'medium' ? 'normal' : normalizePriority(p))
/** The most important of several priorities. */
export const topPriority = (list) => list.map(normalizePriority).reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'low')

// ---------------------------------------------------------------- categories
/** A notification's `kind` is its category. The order here is the order of the filter chips. */
export const CATEGORIES = [
  { value: 'custom', label: 'Reminders' },
  { value: 'task', label: 'Tasks' },
  { value: 'event', label: 'Calendar' },
  { value: 'habit', label: 'Habits' },
  { value: 'workout', label: 'Fitness' },
  { value: 'bill', label: 'Finance' },
  { value: 'study', label: 'Learning' },
  { value: 'job', label: 'Jobs' },
  { value: 'goal', label: 'Goals' },
  { value: 'system', label: 'System' },
]
export const categoryLabel = (kind) => CATEGORIES.find((c) => c.value === kind)?.label ?? 'Other'
/** A category is on unless the person switched it off (the same rule as the per-kind switches that already existed). */
export const categoryEnabled = (prefs, kind) => prefs?.[kind] !== false

// ------------------------------------------------------------------ settings
export const DEFAULT_SETTINGS = Object.freeze({
  quiet: Object.freeze({ enabled: false, from: '22:00', to: '07:00', allow_urgent: true }),
  desktop: false, // show browser notifications (the browser's own permission is still needed)
  smart: true, // create notifications from tasks, habits, fitness, finance, jobs, learning and goals
  morning: '08:00', // when the "today" nudges (tasks, workout, bills, follow-ups, revision, goals) arrive
  evening: '20:00', // when the "still to do" nudges (habits left, bills due tomorrow) arrive
  lead_minutes: 60, // how long before an interview to tell you
})
export const LEAD_CHOICES = [15, 30, 60, 120, 1440]
const isTime = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)

/** `user_settings.notification_settings` with every missing or malformed field replaced by its default. */
export function notificationSettings(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const q = r.quiet && typeof r.quiet === 'object' ? r.quiet : {}
  const D = DEFAULT_SETTINGS
  return {
    quiet: { enabled: q.enabled === true, from: isTime(q.from) ? q.from : D.quiet.from, to: isTime(q.to) ? q.to : D.quiet.to, allow_urgent: q.allow_urgent !== false },
    desktop: r.desktop === true,
    smart: r.smart !== false,
    morning: isTime(r.morning) ? r.morning : D.morning,
    evening: isTime(r.evening) ? r.evening : D.evening,
    lead_minutes: Number.isInteger(r.lead_minutes) && r.lead_minutes >= 5 && r.lead_minutes <= 2880 ? r.lead_minutes : D.lead_minutes,
  }
}

/** Problems with settings a person is about to save, as { field: message }. An empty object means they can be saved. */
export function validateSettings(s) {
  const errors = {}
  if (!isTime(s.quiet?.from)) errors.quiet_from = 'Pick a start time'
  if (!isTime(s.quiet?.to)) errors.quiet_to = 'Pick an end time'
  if (s.quiet?.enabled && isTime(s.quiet.from) && s.quiet.from === s.quiet.to) errors.quiet_to = 'Quiet hours can’t start and end at the same time'
  if (!isTime(s.morning)) errors.morning = 'Pick a time'
  if (!isTime(s.evening)) errors.evening = 'Pick a time'
  if (isTime(s.morning) && isTime(s.evening) && timeToMinutes(s.morning) >= timeToMinutes(s.evening)) errors.evening = 'The evening nudge has to be later than the morning one'
  if (!Number.isInteger(s.lead_minutes) || s.lead_minutes < 5 || s.lead_minutes > 2880) errors.lead_minutes = 'Choose how long before'
  return errors
}

// --------------------------------------------------------------- quiet hours
/** Whether `nowMs` falls inside the quiet window in the person's timezone. A window such as 22:00 to 07:00 runs overnight. */
export function inQuietHours(settings, nowMs, tz) {
  const q = settings?.quiet
  if (!q?.enabled) return false
  const from = timeToMinutes(q.from)
  const to = timeToMinutes(q.to)
  if (from == null || to == null || from === to) return false
  const m = localDayMinutes(nowMs, tz).minutes
  return from < to ? m >= from && m < to : m >= from || m < to
}
/** Whether a notification is allowed to interrupt right now (a sound, a toast, a push). Urgent ones may, when the person allows it. */
export const mayInterrupt = (n, settings, nowMs, tz) => !inQuietHours(settings, nowMs, tz) || (settings.quiet.allow_urgent && normalizePriority(n.priority) === 'urgent')
/** When the current quiet window ends (ms), or null when it is not quiet. */
export function quietEndsAtMs(settings, nowMs, tz) {
  if (!inQuietHours(settings, nowMs, tz)) return null
  const { date, minutes } = localDayMinutes(nowMs, tz)
  const from = timeToMinutes(settings.quiet.from)
  const to = timeToMinutes(settings.quiet.to)
  return zonedToMs(from < to || minutes < to ? date : addDays(date, 1), minutesToTime(to), tz)
}

// -------------------------------------------------------------------- snooze
export const MIN_SNOOZE_MS = 60_000
export const MAX_SNOOZE_MS = 366 * 86_400_000
/**
 * The quick snooze choices, each with the instant it lands on. Choices that make no sense right now are left out: "This morning" once the morning
 * is past, "This evening" within half an hour of it. "Next week" is the coming Monday.
 */
export function snoozeOptions(nowMs, tz, settings = notificationSettings()) {
  const { date } = localDayMinutes(nowMs, tz)
  const at = (day, time) => zonedToMs(day, time, tz)
  const out = [
    { id: '10m', label: '10 minutes', at: nowMs + 10 * 60_000 },
    { id: '1h', label: '1 hour', at: nowMs + 60 * 60_000 },
    { id: '3h', label: '3 hours', at: nowMs + 3 * 60 * 60_000 },
  ]
  const morning = at(date, settings.morning)
  const evening = at(date, settings.evening)
  if (morning - nowMs >= 30 * 60_000) out.push({ id: 'morning', label: 'This morning', at: morning })
  if (evening - nowMs >= 30 * 60_000) out.push({ id: 'evening', label: 'This evening', at: evening })
  out.push({ id: 'tomorrow', label: 'Tomorrow morning', at: at(addDays(date, 1), settings.morning) })
  out.push({ id: 'nextweek', label: 'Next week', at: at(addDays(date, (8 - weekday(date)) % 7 || 7), settings.morning) })
  return out
}
/** Why a snooze time can't be used, or null when it can. */
export function validateSnooze(untilMs, nowMs) {
  if (!Number.isFinite(untilMs)) return 'Pick a date and time'
  if (untilMs < nowMs + MIN_SNOOZE_MS) return 'Pick a time in the future'
  if (untilMs > nowMs + MAX_SNOOZE_MS) return 'Pick a time within the next year'
  return null
}
const iso = (ms) => new Date(ms).toISOString()
/** The columns to write for each action. Snoozing makes the notification unread again so it is noticed when it comes back. */
export const snoozePatch = (untilMs) => ({ snoozed_until: iso(untilMs), dismissed_at: null, read_at: null })
export const dismissPatch = (n, nowMs) => ({ dismissed_at: iso(nowMs), snoozed_until: null, read_at: n.read_at ?? iso(nowMs) })
export const restorePatch = () => ({ dismissed_at: null, snoozed_until: null })
export const readPatch = (nowMs) => ({ read_at: iso(nowMs) })
export const unreadPatch = () => ({ read_at: null })

// --------------------------------------------------------------------- state
const ms = (t) => (t ? Date.parse(t) : NaN)
export const isDismissed = (n) => !!n.dismissed_at
export const isSnoozed = (n, nowMs) => !n.dismissed_at && ms(n.snoozed_until) > nowMs
export const inInbox = (n, nowMs) => !n.dismissed_at && !(ms(n.snoozed_until) > nowMs)
export const isUnread = (n, nowMs) => !n.read_at && inInbox(n, nowMs)
export const countUnread = (list, nowMs) => list.reduce((c, n) => c + (isUnread(n, nowMs) ? 1 : 0), 0)
/** When a notification "arrived" for ordering and grouping: a snoozed one that has come back counts from the moment it did. */
export const arrivedMs = (n, nowMs) => (ms(n.snoozed_until) <= nowMs ? ms(n.snoozed_until) : ms(n.created_at))
/** A notification created long after it was due (the device was off or asleep) is shown as missed. */
export const MISSED_GRACE_MS = 15 * 60_000
export const missedByMs = (n) => (n.due_at ? Math.max(0, ms(n.created_at) - ms(n.due_at)) : 0)
export const isMissed = (n, graceMs = MISSED_GRACE_MS) => missedByMs(n) > graceMs

// ---------------------------------------------------- filtering and searching
export const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
  { value: 'snoozed', label: 'Snoozed' },
  { value: 'dismissed', label: 'Dismissed' },
]
function matchesStatus(n, status, nowMs) {
  switch (status) {
    case 'inbox': return inInbox(n, nowMs)
    case 'unread': return isUnread(n, nowMs)
    case 'read': return !!n.read_at && inInbox(n, nowMs)
    case 'snoozed': return isSnoozed(n, nowMs)
    case 'dismissed': return isDismissed(n)
    default: return true
  }
}
/** Every search word has to appear in the title, text, category or priority. */
export function matchesQuery(n, query) {
  const terms = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const hay = `${n.title} ${n.body ?? ''} ${categoryLabel(n.kind)} ${priorityLabel(n.priority)}`.toLowerCase()
  return terms.every((t) => hay.includes(t))
}
/** `f`: { status: 'inbox' | 'all' | 'unread' | 'read' | 'snoozed' | 'dismissed', kind: 'all' | <kind>, priority: 'all' | <priority>, query } */
export function filterNotifications(list, f = {}, nowMs = Date.now()) {
  const { status = 'inbox', kind = 'all', priority = 'all', query = '' } = f
  return list.filter(
    (n) => matchesStatus(n, status, nowMs) && (kind === 'all' || n.kind === kind) && (priority === 'all' || normalizePriority(n.priority) === priority) && matchesQuery(n, query),
  )
}
/** Newest first, or most important first (newest first among equals). Does not change the list it is given. */
export function sortNotifications(list, sort = 'newest', nowMs = Date.now()) {
  const newest = (a, b) => arrivedMs(b, nowMs) - arrivedMs(a, nowMs) || String(b.id).localeCompare(String(a.id))
  return [...list].sort(sort === 'priority' ? (a, b) => priorityRank(b.priority) - priorityRank(a.priority) || newest(a, b) : newest)
}
/** How many notifications of each category (and in total) match `f`, ignoring its own category choice, for the filter chips. */
export function categoryCounts(list, f = {}, nowMs = Date.now()) {
  const counts = { all: 0 }
  for (const n of filterNotifications(list, { ...f, kind: 'all' }, nowMs)) {
    counts.all++
    counts[n.kind] = (counts[n.kind] ?? 0) + 1
  }
  return counts
}
/** Today / Yesterday / Earlier this week / Older, newest first. Empty groups are left out. */
export function groupByDay(list, { tz, nowMs = Date.now() }) {
  const today = localDayMinutes(nowMs, tz).date
  const yesterday = addDays(today, -1)
  const weekAgo = addDays(today, -6)
  const groups = [
    { key: 'today', label: 'Today', items: [] },
    { key: 'yesterday', label: 'Yesterday', items: [] },
    { key: 'week', label: 'Earlier this week', items: [] },
    { key: 'older', label: 'Older', items: [] },
  ]
  for (const n of list) {
    const day = localDayMinutes(arrivedMs(n, nowMs), tz).date
    groups[day >= today ? 0 : day === yesterday ? 1 : day >= weekAgo ? 2 : 3].items.push(n)
  }
  return groups.filter((g) => g.items.length)
}

// ---------------------------------------------------------------- delivering
// "Delivering" is what interrupts the person: a toast, a browser notification. It is decided on each device from the rows it can see, so it also
// covers rows made by another device or by the server. A device announces a row once (`announced`), only while the row is fresh, and not during
// quiet hours; those wait in `held` and are summed up when the quiet window ends.
export const FRESH_MS = 3 * 60_000
/** Identifies one arrival: a snoozed notification that comes back is a new arrival, so it carries its wake time. */
export const deliveryStamp = (n) => `${n.id}@${n.snoozed_until ?? n.created_at}`

/** @returns { announce, hold, release, ignore }: rows to announce now, to hold until quiet hours end, to release now, and rows to mark as handled silently. */
export function planDelivery(rows, { announced, held, nowMs, tz, settings, prefs, freshMs = FRESH_MS }) {
  const plan = { announce: [], hold: [], release: [], ignore: [] }
  for (const n of rows) {
    if (n.read_at || !inInbox(n, nowMs)) continue
    const stamp = deliveryStamp(n)
    if (announced.has(stamp)) continue
    if (!categoryEnabled(prefs, n.kind)) {
      plan.ignore.push(n)
      continue
    }
    const may = mayInterrupt(n, settings, nowMs, tz)
    if (held.has(stamp)) {
      if (may) plan.release.push(n)
      continue
    }
    const age = nowMs - arrivedMs(n, nowMs)
    if (age < -60_000) continue // stamped in the future by a clock that is ahead: wait until it is real
    if (age > freshMs) plan.ignore.push(n) // opened the app long after it arrived: it is in the inbox, there is nothing to interrupt with
    else (may ? plan.announce : plan.hold).push(n)
  }
  return plan
}

/** A notification's link, if it points at a page inside the app; anything else (another site, a script) becomes the Notification Center. */
export const safeLink = (link) => (typeof link === 'string' && /^\/(?![/\\])/.test(link) ? link : '/notifications')

const MAX_SEPARATE = 3
/** What to show for a plan: one message per notification, or a single summary when there are many. */
export function deliveryMessages(plan) {
  const out = []
  const one = (n) => ({ title: n.title, body: n.body ?? '', link: safeLink(n.link), tag: deliveryStamp(n), priority: normalizePriority(n.priority), rows: [n] })
  const many = (rows, title) => ({
    title,
    body: rows.slice(0, 3).map((n) => n.title).join(' · ') + (rows.length > 3 ? ` · +${rows.length - 3} more` : ''),
    link: '/notifications',
    tag: `summary:${rows.map(deliveryStamp).sort()[0]}`,
    priority: topPriority(rows.map((n) => n.priority)),
    rows,
  })
  if (plan.announce.length > MAX_SEPARATE) out.push(many(plan.announce, `${plan.announce.length} new notifications`))
  else out.push(...plan.announce.map(one))
  if (plan.release.length === 1) out.push(one(plan.release[0]))
  else if (plan.release.length > 1) out.push(many(plan.release, `${plan.release.length} notifications while you were away`))
  return out
}
/** Every row a plan has dealt with, so the device does not announce them again. Held rows are not included: they are still waiting. */
export const handledStamps = (plan) => [...plan.announce, ...plan.release, ...plan.ignore].map(deliveryStamp)
