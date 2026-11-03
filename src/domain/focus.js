import { addDays, eachDay } from '@/lib/dates'

export const PRESETS = [
  { minutes: 25, label: '25 min' },
  { minutes: 50, label: '50 min' },
]
export const MIN_RECORD_SECONDS = 60 // shorter attempts are not worth recording

/** Focus minutes actually spent (completed or stopped early) — breaks never count. */
export const focusSeconds = (s) => (s.kind === 'focus' ? (s.actual_seconds ?? 0) : 0)
export const focusMinutes = (sessions) => sessions.reduce((a, s) => a + focusSeconds(s) / 60, 0)

export function dailyFocus(sessions, from, to) {
  const m = new Map()
  for (const s of sessions) if (s.kind === 'focus') m.set(s.session_date, (m.get(s.session_date) ?? 0) + focusSeconds(s) / 60)
  return eachDay(from, to).map((date) => ({ date, minutes: Math.round(m.get(date) ?? 0) }))
}

export const completedCount = (sessions) => sessions.filter((s) => s.kind === 'focus' && s.completed).length

/** Which break follows the nth completed focus session of the day. */
export const nextBreak = (completedToday, longEvery = 4) =>
  completedToday > 0 && completedToday % longEvery === 0 ? 'long_break' : 'short_break'

export const remainingSeconds = (endsAt, nowMs) => Math.max(0, Math.ceil((endsAt - nowMs) / 1000))
export const fmtClock = (secs) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
export const weekRange = (today, weekStartsOn) => {
  const diff = (new Date(today + 'T00:00:00Z').getUTCDay() - weekStartsOn + 7) % 7
  const from = addDays(today, -diff)
  return { from, to: addDays(from, 6) }
}

// --------------------------------------------------------------- setup form
export const MODE_LABEL = { focus: 'Focus', short_break: 'Short break', long_break: 'Long break' }
export const MIN_MINUTES = 1
export const MAX_MINUTES = 240
export const isValidMinutes = (n) => Number.isInteger(n) && n >= MIN_MINUTES && n <= MAX_MINUTES

/** Length of the next block in minutes: the chosen preset/custom length for focus, the configured break otherwise. */
export function plannedMinutes({ mode, preset, custom, prefs }) {
  if (mode === 'focus') return preset === 'custom' ? Number(custom) : Number(preset)
  return mode === 'short_break' ? prefs.short_break : prefs.long_break
}

/** 'task:<id>' | 'topic:<id>' | '' (the "Working on" select) -> the columns stored on a focus session. */
export function parseFocusTarget(value) {
  const [kind, id] = value.split(':')
  return { taskId: kind === 'task' && id ? id : null, topicId: kind === 'topic' && id ? id : null }
}

/** Open tasks (pending or in progress) that can be focused on. */
export const focusableTasks = (tasks) => tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress')

/** What a session was spent on, and its optional extra note (shown after a dash when it adds information). */
export function sessionTitle(s, tasks, topics) {
  const what = tasks.find((t) => t.id === s.task_id)?.title ?? topics.find((t) => t.id === s.topic_id)?.name ?? s.label ?? 'Focus'
  return { what: what || 'Focus', note: s.label && s.label !== what ? s.label : null }
}

export const newestFirst = (sessions) => [...sessions].sort((a, b) => b.started_at.localeCompare(a.started_at))
