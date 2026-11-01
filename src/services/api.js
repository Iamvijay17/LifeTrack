// Domain operations that span more than one row. UI components call these (never the adapters directly).
import * as store from '@/hooks/store'
import { nextOccurrence, nextDueDate } from '@/domain/recurrence'
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
export function stopStudy(session, { problems_solved = 0, notes = '' } = {}) {
  const ended = new Date()
  const secs = Math.max(0, Math.round((ended.getTime() - new Date(session.started_at).getTime()) / 1000))
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
  const old = store.peek('exercise_logs').filter((l) => l.workout_id === existing.id).map((l) => l.id)
  if (sets.length) await store.insert('exercise_logs', sets.map((s) => ({ ...s, workout_id: existing.id })))
  if (old.length) await store.removeMany('exercise_logs', old) // remove old sets only after the new ones are safely stored
  return w
}

// ------------------------------------------------------------------- health
export const saveHealth = (date, patch) => store.upsert('health_logs', { log_date: date, ...patch }, { onConflict: CONFLICT_KEYS.health_logs })
export function addWater(date, ml) {
  const cur = store.peek('health_logs').find((h) => h.log_date === date)?.water_ml ?? 0
  return saveHealth(date, { water_ml: Math.max(0, cur + ml) })
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
