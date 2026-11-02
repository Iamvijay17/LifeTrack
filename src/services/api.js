// Domain operations that span more than one row. UI components call these (never the adapters directly).
import * as store from '@/hooks/store'
import { nextOccurrence, nextDueDate } from '@/domain/recurrence'
import { dueReminders, afterFire, KIND_LINK } from '@/domain/reminders'
import { MIN_RECORD_SECONDS } from '@/domain/focus'
import { DEFAULT_TOPICS, DEFAULT_EXERCISES } from '@/domain/defaults'
import { CONFLICT_KEYS } from './schema'
import { uid } from '@/lib/utils'
import { AppError } from './errors'

const nowIso = () => new Date().toISOString()

// ------------------------------------------------------------------- tasks
export function createTask(input) {
  const row = { ...input }
  if (row.recurrence && row.recurrence !== 'none') {
    if (!row.due_date) throw new AppError('Recurring tasks need a due date.')
    row.series_id = row.series_id ?? uid()
  }
  return store.insert('tasks', row)
}

export async function setTaskStatus(task, status, today) {
  const patch = { status }
  if (status === 'in_progress') patch.started_at = task.started_at ?? nowIso()
  if (status === 'done') { patch.completed_at = nowIso(); patch.started_at = task.started_at ?? patch.completed_at }
  if (status === 'pending') patch.completed_at = null
  const updated = await store.update('tasks', task.id, patch)
  if (status === 'done' && task.status !== 'done') {
    let next = nextOccurrence(task)
    // Skip occurrences already in the past so a late completion doesn't spawn a pile of overdue copies.
    while (next && today && next < today) next = nextDueDate(next, task.recurrence)
    if (next && (!task.recurrence_until || next <= task.recurrence_until)) {
      const { id, created_at, updated_at, ...rest } = task
      try {
        await store.insert('tasks', { ...rest, due_date: next, status: 'pending', started_at: null, completed_at: null })
      } catch (e) {
        if (e.code !== '23505') throw e // 23505: another device already created this occurrence
      }
    }
  }
  return updated
}

// ------------------------------------------------------------------ habits
/** status: 'done' | 'skipped' | 'rest' | null (null clears the log). Unique(habit,date) guarantees one record per day. */
export async function setHabitStatus(habitId, date, status) {
  if (status == null) {
    const existing = store.peek('habit_logs').find((l) => l.habit_id === habitId && l.log_date === date)
    if (existing) await store.remove('habit_logs', existing.id)
    return null
  }
  return store.upsert('habit_logs', { habit_id: habitId, log_date: date, status }, { onConflict: CONFLICT_KEYS.habit_logs })
}

// ------------------------------------------------------------ study sessions
export async function startStudy({ goal_id = null, topic_id = null }, today) {
  if (store.peek('study_sessions').some((s) => s.status === 'running')) throw new AppError('A study timer is already running.')
  return store.insert('study_sessions', { status: 'running', source: 'timer', session_date: today, started_at: nowIso(), goal_id, topic_id })
}
/** `minutes` lets you correct a forgotten timer downwards; it can never exceed the real elapsed time. */
export function stopStudy(session, { problems_solved = 0, notes = '', minutes } = {}) {
  const ended = new Date()
  const elapsed = Math.max(0, Math.round((ended.getTime() - new Date(session.started_at).getTime()) / 1000))
  const secs = minutes == null ? elapsed : Math.min(elapsed, Math.round(minutes * 60))
  return store.update('study_sessions', session.id, { status: 'completed', ended_at: ended.toISOString(), duration_seconds: secs, problems_solved, notes })
}
export const discardStudy = (session) => store.update('study_sessions', session.id, { status: 'discarded', ended_at: nowIso() })

// ----------------------------------------------------------------- workouts
export async function saveWorkout(workout, sets, existing) {
  if (!existing) {
    const w = await store.insert('workouts', workout)
    if (sets.length) {
      try { await store.insert('exercise_logs', sets.map((s) => ({ ...s, workout_id: w.id }))) }
      catch (e) { await store.remove('workouts', w.id).catch(() => {}); throw e } // no half-saved workouts
    }
    return w
  }
  const w = await store.update('workouts', existing.id, workout)
  // One database transaction swaps every set, so a failure or retry can never leave duplicate or missing sets.
  const fresh = await store.rpc('replace_exercise_logs', { p_workout: existing.id, p_sets: sets })
  store.patchGroup('exercise_logs', (l) => l.workout_id === existing.id, fresh ?? [])
  return w
}

// ------------------------------------------------------------------- health
export const saveHealth = (date, patch) => store.upsert('health_logs', { log_date: date, ...patch }, { onConflict: CONFLICT_KEYS.health_logs })
/** Atomic on the server (`water_ml = water_ml + ml`), so two devices adding water at once never lose an increment. */
export async function addWater(date, ml) {
  const row = await store.rpc('add_water', { p_date: date, p_ml: ml })
  store.patch('health_logs', [row])
  return row
}

// ---------------------------------------------------------------- job board
export function setApplicationStatus(app, status, today) {
  const patch = { status }
  if (status === 'applied' && !app.applied_date) patch.applied_date = today
  return store.update('job_applications', app.id, patch) // the history row is written by the database trigger
}

// ------------------------------------------------------------------ seeding
export async function seedDefaults() {
  const topics = Object.entries(DEFAULT_TOPICS).flatMap(([group_name, names]) => names.map((name) => ({ group_name, name })))
  await store.upsert('learning_topics', topics, { onConflict: CONFLICT_KEYS.learning_topics, ignoreDuplicates: true })
  await store.upsert('exercises', DEFAULT_EXERCISES.map(([name, muscle_group, equipment]) => ({ name, muscle_group, equipment })), { onConflict: CONFLICT_KEYS.exercises, ignoreDuplicates: true })
  await store.upsert('user_settings', { defaults_seeded: true }, { onConflict: 'user_id' })
  await Promise.all([store.refetch('learning_topics'), store.refetch('exercises')])
}

// -------------------------------------------------------------------- goals
export async function setGoalStatus(goal, status) {
  return store.update('goals', goal.id, { status, completed_at: status === 'completed' ? nowIso() : null })
}
export async function toggleMilestone(m) {
  return store.update('milestones', m.id, { done: !m.done, completed_at: m.done ? null : nowIso() })
}

// ------------------------------------------------------------ focus sessions
/** Records a finished (or stopped-early) focus block. Blocks shorter than a minute are discarded as accidental. */
export async function recordFocus({ plannedMinutes, actualSeconds, completed, taskId = null, topicId = null, label = '', date }) {
  if (actualSeconds < MIN_RECORD_SECONDS && !completed) return null
  return store.insert('focus_sessions', {
    session_date: date, kind: 'focus', planned_minutes: plannedMinutes, actual_seconds: Math.min(actualSeconds, plannedMinutes * 60 + 5),
    completed, task_id: taskId, topic_id: topicId, label: label.slice(0, 120),
  })
}

// ------------------------------------------------------------- reminders
/**
 * Turns due reminders into notifications. Safe to run from several devices at once: the notification's dedupe_key is
 * unique per user, so only the first insert wins (the loser gets 23505 and is ignored).
 * Reminders fire while LifeTrack is open on any device — there is no background server push in this build.
 */
export async function fireDueReminders(today, nowTime, prefs = {}) {
  await store.load('reminders')
  let fired = 0
  for (const r of dueReminders(store.peek('reminders'), today, nowTime)) {
    if (prefs[r.kind] !== false) {
      try {
        await store.insert('notifications', { kind: r.kind, title: r.title, link: KIND_LINK[r.kind] ?? '', dedupe_key: `reminder:${r.id}:${today}` })
        fired++
      } catch (e) { if (e.code !== '23505') throw e }
    }
    await store.update('reminders', r.id, afterFire(r, today))
  }
  return fired
}
export const markNotificationRead = (n) => (n.read_at ? Promise.resolve(n) : store.update('notifications', n.id, { read_at: nowIso() }))
export async function markAllRead() {
  const unread = store.peek('notifications').filter((n) => !n.read_at)
  await Promise.all(unread.map((n) => store.update('notifications', n.id, { read_at: nowIso() })))
  return unread.length
}
