import { z } from 'zod'
import { addDays, diffDays, localDayMinutes, minutesToTime, timeToMinutes, zonedToMs } from '@/lib/dates'
import { DEFAULT_DURATION, categoryMeta, ruleFromPreset, presetOf, taskCategoryOf, categoryOfTask, normalizeRule } from '@/domain/calendar'
import { isValidDay } from '@/lib/dates'

// The create/edit form for events and tasks. Kept apart from the dialog so the conversions can be tested: the dialog edits a flat object of
// strings and numbers, and these functions turn it into what the database stores (instants, a recurrence rule, alert offsets) and back.

const day = z.string().refine((v) => v === '' || isValidDay(v), 'Enter a valid date')
const hhmm = z.string().regex(/^(\d{2}:\d{2})?$/, 'Pick a time')
const LINKS = { goal: 'goal_id', topic: 'topic_id', application: 'application_id', routine: 'routine_id' }
export const LINK_TYPES = [
  { value: '', label: 'Nothing' },
  { value: 'goal', label: 'A goal' },
  { value: 'topic', label: 'A learning topic' },
  { value: 'application', label: 'A job application' },
  { value: 'routine', label: 'A workout routine' },
]

export const schema = z
  .object({
    kind: z.enum(['event', 'task']),
    title: z.string().trim().min(1, 'Give it a title').max(200, 'Keep it under 200 characters'),
    all_day: z.boolean(),
    timed: z.boolean(), // tasks only: has a time of day
    start_date: day,
    start_time: hhmm,
    end_date: day,
    end_time: hhmm,
    category: z.enum(['learning', 'jobs', 'fitness', 'health', 'finance', 'routine', 'personal', 'custom']),
    category_label: z.string().trim().max(40, 'Keep it under 40 characters'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    color: z.string().regex(/^(#[0-9A-Fa-f]{6})?$/),
    location: z.string().trim().max(200, 'Keep it under 200 characters'),
    description: z.string().max(4000, 'Keep it under 4000 characters'),
    repeat: z.enum(['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly', 'custom']),
    r_freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    r_interval: z.coerce.number({ error: 'Enter a number' }).int('Whole numbers only').min(1, 'At least 1').max(99, 'At most 99'),
    r_weekdays: z.array(z.number().int().min(0).max(6)),
    r_monthly: z.enum(['date', 'weekday']),
    ends: z.enum(['never', 'on', 'after']),
    ends_on: day,
    ends_after: z.coerce.number({ error: 'Enter a number' }).int('Whole numbers only').min(1, 'At least 1').max(999, 'At most 999'),
    alerts: z.array(z.number().int().min(0).max(40320)).max(5, 'At most 5 alerts'),
    link_type: z.enum(['', 'goal', 'topic', 'application', 'routine']),
    link_id: z.string(),
  })
  .superRefine((v, ctx) => {
    const bad = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message })
    const needsDate = v.kind === 'event' || v.timed || v.repeat !== 'none'
    if (needsDate && !v.start_date)
      bad('start_date', v.repeat !== 'none' && v.kind === 'task' ? 'Repeating tasks need a date' : 'Pick a date')
    const timedItem = v.kind === 'event' ? !v.all_day : v.timed
    if (timedItem) {
      if (!v.start_time) bad('start_time', 'Pick a start time')
      if (!v.end_time) bad('end_time', 'Pick an end time')
    }
    if (v.kind === 'event') {
      if (!v.end_date) bad('end_date', 'Pick an end date')
      else if (v.start_date && v.end_date < v.start_date) bad('end_date', 'It cannot end before it starts')
      else if (!v.all_day && v.start_date && v.start_time && v.end_time && v.end_date === v.start_date && v.end_time <= v.start_time)
        bad('end_time', 'End time must be after the start')
    } else if (v.timed && v.start_time && v.end_time && v.end_time <= v.start_time) bad('end_time', 'End time must be after the start')
    if (v.repeat === 'custom' && v.r_freq === 'weekly' && v.r_weekdays.length === 0) bad('r_weekdays', 'Choose at least one day')
    if (v.repeat !== 'none' && v.ends === 'on') {
      if (!v.ends_on) bad('ends_on', 'Pick an end date')
      else if (v.start_date && v.ends_on < v.start_date) bad('ends_on', 'Must be on or after the start date')
    }
    if (v.link_type && !v.link_id) bad('link_id', 'Choose which one')
  })

const RULE_BLANK = { r_freq: 'weekly', r_interval: 1, r_weekdays: [], r_monthly: 'date', ends: 'never', ends_on: '', ends_after: 10 }

/** Defaults for a brand new item. `at` carries what was clicked or dragged out: { date, startMin, endMin, allDay }. */
export function blankValues({ kind = 'event', at = {}, prefs, today }) {
  const date = at.date ?? today
  const dur = prefs.default_duration ?? DEFAULT_DURATION
  const hasTime = at.startMin != null
  const startMin = hasTime ? at.startMin : null
  const endMin = hasTime ? (at.endMin ?? Math.min(1439, at.startMin + dur)) : null
  // All-day only when asked for (the + on a month cell). Everything else starts a timed event, at the next hour if no time was clicked.
  const allDay = kind === 'event' && !hasTime && at.allDay === true
  return {
    kind,
    title: at.title ?? '',
    all_day: allDay,
    timed: kind === 'task' && hasTime,
    start_date: at.noDate ? '' : date,
    start_time: hasTime ? minutesToTime(startMin) : kind === 'event' && !allDay ? nextHour(prefs) : '09:00',
    end_date: date,
    end_time: hasTime
      ? minutesToTime(endMin >= 1440 ? 1439 : endMin)
      : kind === 'event' && !allDay
        ? minutesToTime(Math.min(1439, timeToMinutes(nextHour(prefs)) + dur))
        : '10:00',
    category: at.category ?? 'personal',
    category_label: '',
    priority: 'medium',
    color: '',
    location: '',
    description: '',
    repeat: 'none',
    ...RULE_BLANK,
    alerts: prefs.default_alert != null ? [prefs.default_alert] : [],
    link_type: '',
    link_id: '',
  }
}
function nextHour(prefs) {
  const m = localDayMinutes(Date.now(), prefs.timezone).minutes
  return minutesToTime(Math.min(22 * 60, (Math.floor(m / 60) + 1) * 60))
}

function ruleFields(rule, start, until) {
  if (!rule) return { repeat: 'none', ...RULE_BLANK }
  const r = normalizeRule(rule, start)
  const preset = presetOf(rule, start)
  return {
    repeat: preset,
    r_freq: r.freq,
    r_interval: r.interval,
    r_weekdays: r.freq === 'weekly' ? r.byWeekday : [],
    r_monthly: r.monthlyBy ?? 'date',
    ends: r.until ? 'on' : r.count ? 'after' : 'never',
    ends_on: r.until ?? until ?? '',
    ends_after: r.count ?? 10,
  }
}

/** The form for an item already on the calendar. For an occurrence of a repeating event the dates are that occurrence's, the rule is the series'. */
export function valuesFromItem(item) {
  const row = item.row
  if (item.kind === 'task') {
    const timed = !!row.start_time
    return {
      ...blankValuesShell(),
      kind: 'task',
      title: row.title,
      timed,
      start_date: row.due_date ?? '',
      start_time: timed ? row.start_time.slice(0, 5) : '09:00',
      end_date: row.due_date ?? '',
      end_time: timed ? row.end_time.slice(0, 5) : '10:00',
      category: categoryOfTask(row),
      priority: row.priority,
      color: row.color ?? '',
      location: row.location ?? '',
      description: row.notes ?? '',
      alerts: [...(row.alert_minutes ?? [])],
      ...(row.recurrence !== 'none'
        ? { repeat: row.recurrence, ends: row.recurrence_until ? 'on' : 'never', ends_on: row.recurrence_until ?? '' }
        : {}),
    }
  }
  const link = Object.entries(LINKS).find(([, col]) => row[col])
  return {
    ...blankValuesShell(),
    kind: 'event',
    title: item.title,
    all_day: item.allDay,
    start_date: item.date,
    start_time: item.allDay ? '09:00' : minutesToTime(item.startMin),
    end_date: item.endDate,
    end_time: item.allDay ? '10:00' : minutesToTime(item.endMin >= 1440 ? 1439 : item.endMin),
    category: item.category,
    category_label: row.category_label ?? '',
    priority: item.priority ?? 'medium',
    color: item.occurrence?.color ?? row.color ?? '',
    location: item.location,
    description: item.description,
    alerts: [...(item.alertMinutes ?? [])],
    link_type: link?.[0] ?? '',
    link_id: link ? row[link[1]] : '',
    ...ruleFields(row.rrule, localDayMinutes(row.starts_at, row.timezone).date),
  }
}
const blankValuesShell = () => ({
  kind: 'event',
  title: '',
  all_day: false,
  timed: false,
  start_date: '',
  start_time: '09:00',
  end_date: '',
  end_time: '10:00',
  category: 'personal',
  category_label: '',
  priority: 'medium',
  color: '',
  location: '',
  description: '',
  repeat: 'none',
  ...RULE_BLANK,
  alerts: [],
  link_type: '',
  link_id: '',
})

/** The recurrence rule a form describes, or null. `start` is the first occurrence's date. */
export function ruleFromValues(v, start) {
  if (v.repeat === 'none') return null
  let rule
  if (v.repeat === 'custom') {
    rule = { freq: v.r_freq, interval: Number(v.r_interval) || 1 }
    if (v.r_freq === 'weekly') rule.byWeekday = [...v.r_weekdays].sort((a, b) => a - b)
    if (v.r_freq === 'monthly') rule.monthlyBy = v.r_monthly
  } else rule = ruleFromPreset(v.repeat, start)
  if (v.ends === 'on') rule.until = v.ends_on
  else if (v.ends === 'after') rule.count = Number(v.ends_after)
  return rule
}

const at = (date, time, tz) => zonedToMs(date, time, tz)

/**
 * What to save. Events become instants in the user's timezone (an all-day event runs from local midnight to local midnight after its last day);
 * tasks keep their date and optional time of day, and map the calendar category back to the task categories.
 */
export function toPayload(v, { tz }) {
  const links = Object.fromEntries(Object.values(LINKS).map((c) => [c, null]))
  if (v.kind === 'event') {
    const startMs = v.all_day ? at(v.start_date, '00:00', tz) : at(v.start_date, v.start_time, tz)
    const endMs = v.all_day ? at(addDays(v.end_date, 1), '00:00', tz) : at(v.end_date, v.end_time, tz)
    return {
      kind: 'event',
      values: {
        title: v.title.trim(),
        description: v.description.trim(),
        location: v.location.trim(),
        category: v.category,
        category_label: v.category === 'custom' ? v.category_label.trim() : '',
        priority: v.priority,
        color: v.color || null,
        all_day: v.all_day,
        starts_at: new Date(startMs).toISOString(),
        ends_at: new Date(endMs).toISOString(),
        timezone: tz,
        rrule: ruleFromValues(v, v.start_date),
        alert_minutes: [...v.alerts].sort((a, b) => a - b),
        ...links,
        ...(v.link_type ? { [LINKS[v.link_type]]: v.link_id } : {}),
      },
    }
  }
  const repeats = v.repeat !== 'none' && v.repeat !== 'custom'
  return {
    kind: 'task',
    values: {
      title: v.title.trim(),
      notes: v.description.trim(),
      category: taskCategoryOf(v.category),
      priority: v.priority,
      color: v.color || null,
      location: v.location.trim(),
      due_date: v.start_date || null,
      start_time: v.timed && v.start_date ? v.start_time : null,
      end_time: v.timed && v.start_date ? v.end_time : null,
      alert_minutes: [...v.alerts].sort((a, b) => a - b),
      recurrence: repeats ? v.repeat : 'none',
      recurrence_until: repeats && v.ends === 'on' ? v.ends_on : null,
    },
  }
}

export const categoryColor = (key) => categoryMeta(key).color
/** How many days after the start date an event ends (0 = same day). */
export const spanDays = (v) => (v.end_date && v.start_date ? diffDays(v.end_date, v.start_date) : 0)
