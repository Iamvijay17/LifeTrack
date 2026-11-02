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

export function dateStrInTz(input: Date | string | number = new Date(), tz: string = DEFAULT_TZ): string {
  const d = input instanceof Date ? input : new Date(input)
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
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
export const minutesToHours = (mins: number): number => Math.round((mins / 60) * 10) / 10

/** Combine a yyyy-MM-dd and HH:mm in `tz` into a UTC ISO string (IST has no DST; works for any fixed/DST zone via iteration). */
export function zonedToIso(day: string, time: string, tz: string = DEFAULT_TZ): string {
  const guess = new Date(`${day}T${time}:00Z`)
  const asLocal = new Date(guess.toLocaleString('en-US', { timeZone: tz }))
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(guess.getTime() + (asUtc.getTime() - asLocal.getTime())).toISOString()
}

export const TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Europe/London', 'Europe/Berlin',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney', 'UTC',
]
