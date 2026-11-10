// All "daily record" dates are plain 'yyyy-MM-dd' strings computed in the user's timezone
// (default Asia/Kolkata). Arithmetic is done in UTC so it never depends on the device timezone.
import { format } from 'date-fns'

export const DEFAULT_TZ = 'Asia/Kolkata'
const DAY = 86400000

const utc = (s: string): number => {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

// Building an Intl.DateTimeFormat is slow (~10x a format call); streak/score code calls this once per record, so reuse one per timezone.
const dayFormatters = new Map<string, Intl.DateTimeFormat>()
const dayFormatter = (tz: string): Intl.DateTimeFormat => {
  let f = dayFormatters.get(tz)
  if (!f) dayFormatters.set(tz, (f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })))
  return f
}

export function dateStrInTz(input: Date | string | number = new Date(), tz: string = DEFAULT_TZ): string {
  const d = input instanceof Date ? input : new Date(input)
  const parts = dayFormatter(tz).formatToParts(d)
  const get = (t: string): string => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export const todayStr = (tz: string = DEFAULT_TZ, now: Date = new Date()): string => dateStrInTz(now, tz)

export function timeStrInTz(input: Date | string | number = new Date(), tz: string = DEFAULT_TZ): string {
  const d = input instanceof Date ? input : new Date(input)
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

export const addDays = (s: string, n: number): string => fromUtc(utc(s) + n * DAY)
export const diffDays = (a: string, b: string): number => Math.round((utc(a) - utc(b)) / DAY) // a - b
export const weekday = (s: string): number => new Date(utc(s)).getUTCDay() // 0=Sun
export const isValidDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUtc(utc(s)) === s

export function startOfWeek(s: string, weekStartsOn = 1): string {
  const diff = (weekday(s) - weekStartsOn + 7) % 7
  return addDays(s, -diff)
}
export const endOfWeek = (s: string, w = 1): string => addDays(startOfWeek(s, w), 6)
export const monthStart = (s: string): string => s.slice(0, 7) + '-01'
export function monthEnd(s: string): string {
  const [y, m] = s.split('-').map(Number)
  return fromUtc(Date.UTC(y, m, 0))
}
export const addMonths = (s: string, n: number): string => {
  const [y, m] = s.split('-').map(Number)
  return fromUtc(Date.UTC(y, m - 1 + n, 1))
}
export const monthKey = (s: string): string => s.slice(0, 7)

export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}
export const inRange = (d: string | null | undefined, from: string, to: string): boolean => d != null && d >= from && d <= to

// ---- display (device-local Date built from the Y-M-D parts, so no timezone shifting)
export const parseDay = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const fmtDay = (s: string | null | undefined, pattern = 'EEE, d MMM'): string => (s ? format(parseDay(s), pattern) : '')
export const fmtDateTime = (iso: string, tz: string = DEFAULT_TZ): string =>
  new Intl.DateTimeFormat('en-IN', { timeZone: tz, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

// ---- time-of-day helpers
export const timeToMinutes = (t: string | null | undefined): number | null => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
export function fmtDuration(mins: number | null | undefined): string {
  if (mins == null || Number.isNaN(mins)) return '—'
  const m = Math.round(mins)
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r}m`
  return r === 0 ? `${h}h` : `${h}h ${r}m`
}
/** Minutes slept between bedtime and wake time, correctly handling overnight sleep (23:30 -> 06:30 = 7h). */
export function sleepMinutes(bedtime: string | null | undefined, wake: string | null | undefined): number | null {
  const b = timeToMinutes(bedtime)
  const w = timeToMinutes(wake)
  if (b == null || w == null || Number.isNaN(b) || Number.isNaN(w)) return null
  if (b === w) return null // ambiguous: 0 or 24h — ask the user to fix it
  return (w - b + 1440) % 1440
}
export const minutesToHours = (mins: number): number => Math.round((mins / 60) * 10) / 10

/** Combine a yyyy-MM-dd and HH:mm in `tz` into a UTC ISO string (IST has no DST; works for any fixed/DST zone via iteration). */
export function zonedToIso(day: string, time: string, tz: string = DEFAULT_TZ): string {
  const guess = new Date(`${day}T${time}:00Z`)
  const asLocal = new Date(guess.toLocaleString('en-US', { timeZone: tz }))
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(guess.getTime() + (asUtc.getTime() - asLocal.getTime())).toISOString()
}

export const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
]

// ---- exact wall-clock <-> instant conversion (calendar scheduling)
// Calendar items are stored as UTC instants plus the IANA zone they were planned in. Placing an item on a local date and time, and reading a
// local date and time back, must stay correct across daylight-saving changes, which the helpers above only approximate.

const partFormatters = new Map<string, Intl.DateTimeFormat>()
const partFormatter = (tz: string): Intl.DateTimeFormat => {
  let f = partFormatters.get(tz)
  if (!f)
    partFormatters.set(
      tz,
      (f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      })),
    )
  return f
}

/** Local wall-clock parts of an instant in `tz`. */
export function wallParts(ms: number, tz: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const p = partFormatter(tz).formatToParts(new Date(ms))
  const n = (t: string): number => Number(p.find((x) => x.type === t)!.value)
  return { y: n('year'), mo: n('month'), d: n('day'), h: n('hour') % 24, mi: n('minute'), s: n('second') }
}

/** Offset of `tz` from UTC at an instant, in ms (positive east of Greenwich). */
export function tzOffsetMs(ms: number, tz: string): number {
  const w = wallParts(ms, tz)
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000
}

/**
 * The instant (ms since epoch) at which the wall clock of `tz` reads `day` + `time` ('HH:mm').
 * A time that never happens (clocks jump forward) moves forward by the gap, so 02:30 becomes 03:30.
 * A time that happens twice (clocks fall back) resolves to the first occurrence.
 */
export function zonedToMs(day: string, time: string, tz: string = DEFAULT_TZ): number {
  const wall = utc(day) + (timeToMinutes(time) ?? 0) * 60000
  const before = tzOffsetMs(wall - DAY, tz)
  const after = tzOffsetMs(wall + DAY, tz)
  const valid = [...new Set([before, after])].map((o) => wall - o).filter((t) => tzOffsetMs(t, tz) === wall - t)
  if (valid.length) return Math.min(...valid)
  return wall - Math.min(before, after) // gap: use the offset in force before the clocks moved
}

/** Local calendar date and minutes since local midnight of an instant in `tz`. */
export function localDayMinutes(input: Date | string | number, tz: string = DEFAULT_TZ): { date: string; minutes: number } {
  const w = wallParts(new Date(input).getTime(), tz)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return { date: `${w.y}-${pad(w.mo)}-${pad(w.d)}`, minutes: w.h * 60 + w.mi }
}

/** 'HH:mm' from minutes since midnight (1440 reads as 24:00). */
export const minutesToTime = (mins: number): string => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

/** A clock time for display: "9:30 AM" (12-hour) or "09:30" (24-hour). `mins` is minutes since midnight. */
export function fmtClock(mins: number, hour12 = false): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  if (!hour12) return `${String(h).padStart(2, '0')}:${mm}`
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`
}
