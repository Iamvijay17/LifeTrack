// Pomodoro timer state machine shared by web and mobile. Pure functions over a plain state object, driven by an
// absolute end timestamp so it stays correct in the background and after a reload / app restart.
// state: { mode, plannedMinutes, endsAt|null, pausedLeft|null, taskId, topicId, label, startedAt }
import { remainingSeconds } from './focus'

export const FOCUS_MODE_LABEL = { focus: 'Focus', short_break: 'Short break', long_break: 'Long break' }
export const MIN_FOCUS_MINUTES = 1
export const MAX_FOCUS_MINUTES = 240

export const isValidFocusMinutes = (m) => Number.isInteger(m) && m >= MIN_FOCUS_MINUTES && m <= MAX_FOCUS_MINUTES

/** Minutes for the selected mode. `preset` is '25' | '50' | 'custom'; `custom` is the typed string. */
export function focusMinutesFor(mode, preset, custom, prefs) {
  if (mode === 'focus') return preset === 'custom' ? Number(custom) : Number(preset)
  return mode === 'short_break' ? prefs.short_break : prefs.long_break
}

/** 'task:<id>' | 'topic:<id>' | '' → ids for the saved session. */
export function parseFocusTarget(value) {
  const [kind, id] = String(value ?? '').split(':')
  return { taskId: kind === 'task' && id ? id : null, topicId: kind === 'topic' && id ? id : null }
}

export const startFocus = (cfg, nowMs) => ({ ...cfg, endsAt: nowMs + cfg.plannedMinutes * 60_000, pausedLeft: null, startedAt: nowMs })
export const isRunning = (t) => !!t && t.endsAt != null
export const isPaused = (t) => !!t && t.endsAt == null
export const focusLeft = (t, nowMs) => (!t ? 0 : t.endsAt != null ? remainingSeconds(t.endsAt, nowMs) : t.pausedLeft ?? t.plannedMinutes * 60)
export const pauseFocus = (t, nowMs) => (t && t.endsAt != null ? { ...t, endsAt: null, pausedLeft: remainingSeconds(t.endsAt, nowMs) } : t)
export const resumeFocus = (t, nowMs) => (t && t.endsAt == null ? { ...t, endsAt: nowMs + (t.pausedLeft ?? 0) * 1000, pausedLeft: null } : t)
export const isFinished = (t, nowMs) => isRunning(t) && focusLeft(t, nowMs) === 0
/** Seconds actually spent when stopping early. */
export const spentSeconds = (t, nowMs) => (t ? t.plannedMinutes * 60 - focusLeft(t, nowMs) : 0)

/** Display name for a recorded focus session. */
export const focusSessionName = (s, tasks, topics) =>
  tasks.find((t) => t.id === s.task_id)?.title ?? topics.find((t) => t.id === s.topic_id)?.name ?? s.label ?? 'Focus'
