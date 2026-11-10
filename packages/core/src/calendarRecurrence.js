// Recurrence for calendar events. Pure: no React, no Supabase. Dates are 'yyyy-MM-dd' strings in the event's own timezone.
//
// A rule is a small JSON object (see rruleSchema in @lifetrack/schemas):
//   { freq: 'daily'|'weekly'|'monthly'|'yearly', interval?: 1, byWeekday?: [0..6], monthlyBy?: 'date'|'weekday', until?: 'yyyy-MM-dd'|null, count?: n|null }
// Rules of thumb that keep behaviour predictable:
//   * The event's own start date is ALWAYS the first occurrence, even if it does not match `byWeekday`.
//   * `until` is inclusive. `count` includes the first occurrence. If both are present, whichever ends the series first wins.
//   * Month-end clamps instead of skipping: "monthly on the 31st" falls on the 30th (or 28th/29th) in shorter months and returns to the 31st,
//     and 29 Feb repeats on 28 Feb in other years. This matches how recurring bills already behave in LifeTrack.
//   * Weeks are counted Monday to Sunday when `interval` > 1 ("every 2 weeks").
//   * The wall-clock time of day is kept, so a 09:00 event stays at 09:00 across daylight-saving changes (see expandEvent).
import { addDays, diffDays, localDayMinutes, monthEnd, startOfWeek, weekday, zonedToMs } from '@lifetrack/utils'

/** Hard stop for any expansion, so a corrupt rule can never freeze the page. */
export const MAX_OCCURRENCES = 5000

export const REPEAT_PRESETS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
  { value: 'custom', label: 'Custom…' },
]
export const WEEKDAYS_MON_FRI = [1, 2, 3, 4, 5]
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ORDINALS = ['first', 'second', 'third', 'fourth', 'last']

const pad = (n) => String(n).padStart(2, '0')
const daysInMonth = (y, m) => Number(monthEnd(`${y}-${pad(m)}-01`).slice(8))
const sortedUnique = (list) => [...new Set(list)].sort((a, b) => a - b)

/** The rule with every default filled in, so the generator and the UI never have to guess. `start` is the first occurrence's date. */
export function normalizeRule(rule, start) {
  if (!rule) return null
  const freq = rule.freq
  const out = {
    freq,
    interval: Math.max(1, Math.min(99, Number(rule.interval) || 1)),
    until: rule.until || null,
    count: rule.count ? Math.max(1, Number(rule.count)) : null,
  }
  if (freq === 'weekly') {
    const days = sortedUnique((rule.byWeekday ?? []).map(Number).filter((d) => d >= 0 && d <= 6))
    out.byWeekday = days.length ? days : [weekday(start)]
  }
  if (freq === 'monthly') out.monthlyBy = rule.monthlyBy === 'weekday' ? 'weekday' : 'date'
  return out
}

export function ruleFromPreset(preset, start) {
  switch (preset) {
    case 'daily':
      return { freq: 'daily' }
    case 'weekdays':
      return { freq: 'weekly', byWeekday: WEEKDAYS_MON_FRI }
    case 'weekly':
      return { freq: 'weekly', byWeekday: [weekday(start)] }
    case 'monthly':
      return { freq: 'monthly' }
    case 'yearly':
      return { freq: 'yearly' }
    default:
      return null
  }
}

/** Which preset a rule is (ignoring how it ends), or 'custom' when none fits. */
export function presetOf(rule, start) {
  if (!rule) return 'none'
  const r = normalizeRule(rule, start)
  if (r.interval !== 1) return 'custom'
  if (r.freq === 'daily') return 'daily'
  if (r.freq === 'weekly') {
    if (r.byWeekday.join() === WEEKDAYS_MON_FRI.join()) return 'weekdays'
    if (r.byWeekday.length === 1 && r.byWeekday[0] === weekday(start)) return 'weekly'
    return 'custom'
  }
  if (r.freq === 'monthly') return r.monthlyBy === 'date' ? 'monthly' : 'custom'
  if (r.freq === 'yearly') return 'yearly'
  return 'custom'
}

/** 1-4, or 5 meaning "last", for the weekday-of-month a date falls on (the 2nd Tuesday, the last Friday). */
export const weekdayOrdinal = (date) => {
  const n = Math.ceil(Number(date.slice(8)) / 7)
  return n >= 5 ? 5 : n
}

/** The date of the nth (1-4) or last (5) `wd` in a month. */
function nthWeekdayOfMonth(y, m, wd, nth) {
  const first = `${y}-${pad(m)}-01`
  const firstHit = addDays(first, (wd - weekday(first) + 7) % 7)
  if (nth < 5) return addDays(firstHit, (nth - 1) * 7)
  let d = firstHit
  while (addDays(d, 7).slice(0, 7) === first.slice(0, 7)) d = addDays(d, 7)
  return d
}

/** Plain-language summary: "Every 2 weeks on Mon, Wed until 12 Dec 2026". */
export function describeRule(rule, start, fmt = (d) => d) {
  if (!rule) return 'Does not repeat'
  const r = normalizeRule(rule, start)
  const every = (unit, plural) => (r.interval === 1 ? `Every ${unit}` : `Every ${r.interval} ${plural}`)
  let text
  if (r.freq === 'daily') text = every('day', 'days')
  else if (r.freq === 'weekly') {
    const key = r.byWeekday.join()
    if (r.interval === 1 && key === WEEKDAYS_MON_FRI.join()) text = 'Every weekday'
    else text = `${every('week', 'weeks')} on ${r.byWeekday.map((d) => WEEKDAY_NAMES[d]).join(', ')}`
  } else if (r.freq === 'monthly') {
    const nth = weekdayOrdinal(start)
    text =
      r.monthlyBy === 'weekday'
        ? `${every('month', 'months')} on the ${ORDINALS[nth - 1]} ${WEEKDAY_LONG[weekday(start)]}`
        : `${every('month', 'months')} on day ${Number(start.slice(8))}`
  } else text = every('year', 'years')
  if (r.until) text += ` until ${fmt(r.until)}`
  else if (r.count) text += `, ${r.count} time${r.count === 1 ? '' : 's'}`
  return text
}

/**
 * Every occurrence date of a rule from `start`, oldest first, lazily. Stops at `until`, `count` or MAX_OCCURRENCES.
 * @param {number} [skipBefore] where the caller starts looking; lets rules without a `count` jump ahead instead of walking from the start.
 */
function* generate(rule, start, skipBefore = start) {
  const r = normalizeRule(rule, start)
  const limit = r.count ? Math.min(r.count, MAX_OCCURRENCES) : MAX_OCCURRENCES
  const jump = !r.count // with a count every occurrence from the start must be counted
  let produced = 0
  const emit = (d) => {
    if (r.until && d > r.until) return false
    produced++
    return true
  }
  const from = skipBefore > start ? skipBefore : start

  if (r.freq === 'daily') {
    let k = jump ? Math.max(0, Math.floor(diffDays(from, start) / r.interval) - 1) : 0
    while (produced < limit) {
      const d = addDays(start, k * r.interval)
      if (!emit(d)) return
      yield d
      k++
    }
  } else if (r.freq === 'weekly') {
    const base = startOfWeek(start, 1)
    if (!emit(start)) return
    yield start // the start is always the first occurrence, whether or not its weekday is ticked
    let w = jump ? Math.max(0, Math.floor(diffDays(startOfWeek(from, 1), base) / (7 * r.interval)) - 1) : 0
    for (; ; w++) {
      const monday = addDays(base, w * r.interval * 7)
      if (r.until && monday > r.until) return
      for (let i = 0; i < 7; i++) {
        const d = addDays(monday, i)
        if (d <= start || !r.byWeekday.includes(weekday(d))) continue
        if (produced >= limit || !emit(d)) return
        yield d
      }
    }
  } else if (r.freq === 'monthly') {
    const [sy, sm] = start.split('-').map(Number)
    const sd = Number(start.slice(8))
    const wd = weekday(start)
    const nth = weekdayOrdinal(start)
    let k = jump ? Math.max(0, Math.floor(((Number(from.slice(0, 4)) - sy) * 12 + Number(from.slice(5, 7)) - sm) / r.interval) - 1) : 0
    while (produced < limit) {
      const idx = sm - 1 + k * r.interval
      const y = sy + Math.floor(idx / 12)
      const m = (((idx % 12) + 12) % 12) + 1
      const d = k === 0 ? start : r.monthlyBy === 'weekday' ? nthWeekdayOfMonth(y, m, wd, nth) : `${y}-${pad(m)}-${pad(Math.min(sd, daysInMonth(y, m)))}`
      if (r.until && d > r.until) return
      if (!emit(d)) return
      yield d
      k++
    }
  } else {
    const [sy, sm] = start.split('-').map(Number)
    const sd = Number(start.slice(8))
    let k = jump ? Math.max(0, Math.floor((Number(from.slice(0, 4)) - sy) / r.interval) - 1) : 0
    while (produced < limit) {
      const y = sy + k * r.interval
      const d = k === 0 ? start : `${y}-${pad(sm)}-${pad(Math.min(sd, daysInMonth(y, sm)))}`
      if (r.until && d > r.until) return
      if (!emit(d)) return
      yield d
      k++
    }
  }
}

/** Occurrence dates inside [from, to] (inclusive), oldest first. A rule of null means a single occurrence on `start`. */
export function occurrenceDates(rule, start, from, to) {
  if (!rule) return start >= from && start <= to ? [start] : []
  const out = []
  for (const d of generate(rule, start, from)) {
    if (d > to) break
    if (d >= from) out.push(d)
  }
  return out
}

/** True if the series generates an occurrence on exactly this date (used to ignore overrides left behind by a rule change). */
export const isOccurrenceDate = (rule, start, date) => occurrenceDates(rule, start, date, date).length === 1

/** How many occurrences the series has strictly before `date`. */
export function countBefore(rule, start, date) {
  if (date <= start) return 0
  let n = 0
  for (const d of generate(rule, start)) {
    if (d >= date) break
    n++
  }
  return n
}

/** The last occurrence date of a series, or null if it never ends (or ends beyond MAX_OCCURRENCES). */
export function lastOccurrence(rule, start) {
  if (!rule) return start
  const r = normalizeRule(rule, start)
  if (!r.until && !r.count) return null
  let last = null
  for (const d of generate(rule, start)) last = d
  return last
}

/**
 * The rule for the part of a series that comes BEFORE `date` (used when a series is split: "this and following" is cut off there).
 * A series that used a `count` keeps exactly the occurrences before the cut.
 */
export function ruleBefore(rule, start, date) {
  const r = normalizeRule(rule, start)
  const out = { ...rule }
  const before = addDays(date, -1)
  if (r.count) {
    out.count = countBefore(rule, start, date)
    delete out.until
  } else out.until = r.until && r.until < before ? r.until : before
  return out
}

/** The rule for the part of a series from `date` onward, after the split. A `count` shrinks by the occurrences already used. */
export function ruleFrom(rule, start, date) {
  const r = normalizeRule(rule, start)
  const out = { ...rule }
  if (r.count) out.count = Math.max(1, r.count - countBefore(rule, start, date))
  return out
}

// --------------------------------------------------------------------------- events
const OVERRIDABLE = ['title', 'description', 'location', 'category', 'priority', 'color', 'all_day', 'alert_minutes']

/** Local date, minutes and the last covered local date of one event instance, in `tz`. */
function span(startsAt, endsAt, allDay, tz) {
  const s = localDayMinutes(startsAt, tz)
  const lastMs = Math.max(Date.parse(startsAt), Date.parse(endsAt) - 1)
  const e = localDayMinutes(lastMs, tz)
  const end = localDayMinutes(endsAt, tz)
  // An event that ends exactly at midnight ends at 24:00 of its last day, not 00:00 of the next one.
  return { date: s.date, startMin: s.minutes, endDate: e.date, endMin: allDay || end.date !== e.date ? 1440 : end.minutes, lastDate: e.date }
}

/** One concrete occurrence: the series values with this date's override applied. */
function occurrence(event, exception, date, tz) {
  const patch = exception?.status === 'modified' ? exception : null
  const pick = (k) => (patch && patch[k] != null ? patch[k] : event[k])
  const allDay = patch?.all_day ?? event.all_day
  let startMs, endMs
  if (patch?.starts_at) {
    startMs = Date.parse(patch.starts_at)
    endMs = Date.parse(patch.ends_at)
  } else {
    const origStart = localDayMinutes(event.starts_at, tz)
    const origEnd = Date.parse(event.ends_at)
    if (allDay) {
      const endDay = localDayMinutes(origEnd, tz).date
      const days = Math.max(1, diffDays(endDay, origStart.date))
      startMs = zonedToMs(date, '00:00', tz)
      endMs = zonedToMs(addDays(date, days), '00:00', tz)
    } else {
      startMs = zonedToMs(date, `${pad(Math.floor(origStart.minutes / 60))}:${pad(origStart.minutes % 60)}`, tz)
      endMs = startMs + (origEnd - Date.parse(event.starts_at))
    }
  }
  const s = new Date(startMs).toISOString()
  const e = new Date(endMs).toISOString()
  const sp = span(s, e, allDay, tz)
  return {
    key: `${event.id}@${date}`,
    eventId: event.id,
    occurrenceDate: date,
    recurring: !!event.rrule,
    modified: !!patch,
    event,
    exception: exception ?? null,
    title: pick('title'),
    description: pick('description'),
    location: pick('location'),
    category: pick('category'),
    categoryLabel: event.category_label,
    priority: pick('priority'),
    color: pick('color'),
    allDay,
    alertMinutes: pick('alert_minutes') ?? [],
    startsAt: s,
    endsAt: e,
    startMs,
    endMs,
    date: sp.date,
    startMin: allDay ? 0 : sp.startMin,
    endDate: sp.lastDate,
    endMin: sp.endMin,
  }
}

/**
 * All occurrences of `event` that touch the local dates [from, to], with this series' exceptions applied.
 * Cancelled occurrences are left out; an occurrence moved by an exception is placed where it was moved to, even if it began outside the range.
 */
export function expandEvent(event, exceptions, from, to) {
  const tz = event.timezone || 'Asia/Kolkata'
  const first = span(event.starts_at, event.ends_at, event.all_day, tz)
  const start = first.date
  const spanDays = Math.max(0, diffDays(first.lastDate, first.date))
  const mine = new Map((exceptions ?? []).filter((x) => x.event_id === event.id).map((x) => [x.occurrence_date, x]))
  const out = []
  const touches = (o) => o.endDate >= from && o.date <= to
  const seen = new Set()

  const candidates = event.rrule ? occurrenceDates(event.rrule, start, addDays(from, -spanDays - 1), to) : [start]
  for (const date of candidates) {
    const x = mine.get(date)
    if (x?.status === 'cancelled') continue
    const o = occurrence(event, x, date, tz)
    seen.add(date)
    if (touches(o)) out.push(o)
  }
  // An occurrence moved into the range from a date outside it.
  for (const [date, x] of mine) {
    if (seen.has(date) || x.status !== 'modified' || !x.starts_at) continue
    if (event.rrule ? !isOccurrenceDate(event.rrule, start, date) : date !== start) continue
    const o = occurrence(event, x, date, tz)
    if (touches(o)) out.push(o)
  }
  return out
}

/**
 * Where a series' times go when ONE occurrence is edited and the change is applied to the whole series (scope "all events"):
 * the series keeps its own first date, shifted by however many days the occurrence moved, and takes the new time of day and length.
 */
export function shiftSeries(event, occurrenceDate, newStartMs, newEndMs, allDay) {
  const tz = event.timezone || 'Asia/Kolkata'
  const seriesStart = localDayMinutes(event.starts_at, tz).date
  const newStart = localDayMinutes(newStartMs, tz)
  const dayShift = diffDays(newStart.date, occurrenceDate)
  const date = addDays(seriesStart, dayShift)
  const hhmm = `${pad(Math.floor(newStart.minutes / 60))}:${pad(newStart.minutes % 60)}`
  const startMs = zonedToMs(date, allDay ? '00:00' : hhmm, tz)
  let endMs = startMs + (newEndMs - newStartMs)
  if (allDay) {
    const days = Math.max(1, diffDays(localDayMinutes(newEndMs - 1, tz).date, newStart.date) + 1)
    endMs = zonedToMs(addDays(date, days), '00:00', tz)
  }
  return { starts_at: new Date(startMs).toISOString(), ends_at: new Date(endMs).toISOString() }
}

/** Fields of an edited occurrence that differ from the series, as an exception row's override columns (unchanged fields stay null = inherit). */
export function exceptionOverrides(base, edited) {
  const out = {}
  for (const k of OVERRIDABLE) {
    const a = JSON.stringify(base[k] ?? null)
    const b = JSON.stringify(edited[k] ?? null)
    out[k] = a === b ? null : (edited[k] ?? null)
  }
  const moved = edited.starts_at !== base.starts_at || edited.ends_at !== base.ends_at
  out.starts_at = moved ? edited.starts_at : null
  out.ends_at = moved ? edited.ends_at : null
  return out
}
