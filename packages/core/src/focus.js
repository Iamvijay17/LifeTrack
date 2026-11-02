import { addDays, eachDay } from '@lifetrack/utils'

export const PRESETS = [{ minutes: 25, label: '25 min' }, { minutes: 50, label: '50 min' }]
export const MIN_RECORD_SECONDS = 60 // shorter attempts are not worth recording

/** Focus minutes actually spent (completed or stopped early) — breaks never count. */
export const focusSeconds = (s) => (s.kind === 'focus' ? s.actual_seconds ?? 0 : 0)
export const focusMinutes = (sessions) => sessions.reduce((a, s) => a + focusSeconds(s) / 60, 0)

export function dailyFocus(sessions, from, to) {
  const m = new Map()
  for (const s of sessions) if (s.kind === 'focus') m.set(s.session_date, (m.get(s.session_date) ?? 0) + focusSeconds(s) / 60)
  return eachDay(from, to).map((date) => ({ date, minutes: Math.round(m.get(date) ?? 0) }))
}

export const completedCount = (sessions) => sessions.filter((s) => s.kind === 'focus' && s.completed).length

/** Which break follows the nth completed focus session of the day. */
export const nextBreak = (completedToday, longEvery = 4) => (completedToday > 0 && completedToday % longEvery === 0 ? 'long_break' : 'short_break')

export const remainingSeconds = (endsAt, nowMs) => Math.max(0, Math.ceil((endsAt - nowMs) / 1000))
export const fmtClock = (secs) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
export const weekRange = (today, weekStartsOn) => { const diff = (new Date(today + 'T00:00:00Z').getUTCDay() - weekStartsOn + 7) % 7; const from = addDays(today, -diff); return { from, to: addDays(from, 6) } }
