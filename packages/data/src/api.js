// Domain operations that span more than one row. UI components call these (never the adapters directly).
import { nextOccurrence, nextDueDate } from '@lifetrack/core/recurrence'
import { dueReminders, afterFire, KIND_LINK } from '@lifetrack/core/reminders'
import { afterPost, dueOccurrences, dueRules, occurrenceRow, togglePatch as recurringTogglePatch } from '@lifetrack/core/recurring'
import { MIN_RECORD_SECONDS } from '@lifetrack/core/focus'
import { DEFAULT_TOPICS, DEFAULT_EXERCISES } from '@lifetrack/constants/defaults'
import { CONFLICT_KEYS } from '@lifetrack/constants/schema'
import { uid } from '@lifetrack/utils'
import { AppError } from './errors'

/**
 * Domain operations that span more than one row. `store` is the app's cache/mutation layer and must provide
 * insert, update, upsert, remove, removeMany, rpc, patch, patchGroup, peek, load and refetch (web: hooks/store.js; mobile: TanStack Query adapter).
 */
export function createApi(store) {

  const nowIso = () => new Date().toISOString()

  // ------------------------------------------------------------ generic rows
  /** Create (no `entity`) or update (with `entity`) a row. Forms call this instead of reaching into the store. */
  const saveRow = (table, entity, values) => (entity ? store.update(table, entity.id, values) : store.insert(table, values))
  const deleteRow = (table, id) => store.remove(table, id)

  // ------------------------------------------------------------------- tasks
  function createTask(input) {
    const row = { ...input }
    if (row.recurrence && row.recurrence !== 'none') {
      if (!row.due_date) throw new AppError('Recurring tasks need a due date.')
      row.series_id = row.series_id ?? uid()
    }
    return store.insert('tasks', row)
  }

  async function setTaskStatus(task, status, today) {
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
  async function setHabitStatus(habitId, date, status) {
    if (status == null) {
      const existing = store.peek('habit_logs').find((l) => l.habit_id === habitId && l.log_date === date)
      if (existing) await store.remove('habit_logs', existing.id)
      return null
    }
    return store.upsert('habit_logs', { habit_id: habitId, log_date: date, status }, { onConflict: CONFLICT_KEYS.habit_logs })
  }

  // ------------------------------------------------------------ study sessions
  async function startStudy({ goal_id = null, topic_id = null }, today) {
    if (store.peek('study_sessions').some((s) => s.status === 'running')) throw new AppError('A study timer is already running.')
    try { return await store.insert('study_sessions', { status: 'running', source: 'timer', session_date: today, started_at: nowIso(), goal_id, topic_id }) }
    catch (e) { // another device started one first: the database's one-running-timer index refuses the second
      if (e?.code === '23505') { await store.refetch('study_sessions').catch(() => {}); throw new AppError('A study timer is already running (it may have been started on another device).', { code: '23505' }) }
      throw e
    }
  }
  /**
   * `minutes` lets you correct a forgotten timer downwards; it can never exceed the real elapsed time.
   * @param {any} session the running study_sessions row
   * @param {{ problems_solved?: number, notes?: string, minutes?: number }} [opts]
   */
  function stopStudy(session, { problems_solved = 0, notes = '', minutes } = {}) {
    const ended = new Date()
    const elapsed = Math.max(0, Math.round((ended.getTime() - new Date(session.started_at).getTime()) / 1000))
    const secs = minutes == null ? elapsed : Math.min(elapsed, Math.round(minutes * 60))
    return store.update('study_sessions', session.id, { status: 'completed', ended_at: ended.toISOString(), duration_seconds: secs, problems_solved, notes })
  }
  const discardStudy = (session) => store.update('study_sessions', session.id, { status: 'discarded', ended_at: nowIso() })

  // ----------------------------------------------------------------- workouts
  async function saveWorkout(workout, sets, existing) {
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
  const saveHealth = (date, patch) => store.upsert('health_logs', { log_date: date, ...patch }, { onConflict: CONFLICT_KEYS.health_logs })
  /** Atomic on the server (`water_ml = water_ml + ml`), so two devices adding water at once never lose an increment. */
  async function addWater(date, ml) {
    const row = await store.rpc('add_water', { p_date: date, p_ml: ml })
    store.patch('health_logs', [row])
    return row
  }

  // ---------------------------------------------------------------- job board
  function setApplicationStatus(app, status, today) {
    const patch = { status }
    if (status === 'applied' && !app.applied_date) patch.applied_date = today
    return store.update('job_applications', app.id, patch) // the history row is written by the database trigger
  }

  // ------------------------------------------------------------------ finance
  /** Sets the overall budget (category '') for a month. `month` is 'yyyy-MM-01'; `paise` an integer >= 0. */
  function setMonthBudget(month, paise) {
    return store.upsert('budgets', { month, category: '', amount_paise: paise }, { onConflict: CONFLICT_KEYS.budgets })
  }
  /** Adds to a savings goal inside the database (add_savings), so additions from several devices never overwrite each other. */
  async function addSavingsFunds(goal, paise) {
    if (!Number.isInteger(paise) || paise <= 0) throw new AppError('Enter an amount greater than 0.')
    const row = await store.rpc('add_savings', { p_goal: goal.id, p_paise: paise }) // atomic on the server
    store.patch('savings_goals', [row])
    return row
  }

  // ------------------------------------------------------------------ seeding
  async function seedDefaults() {
    const topics = Object.entries(DEFAULT_TOPICS).flatMap(([group_name, names]) => names.map((name) => ({ group_name, name })))
    await store.upsert('learning_topics', topics, { onConflict: CONFLICT_KEYS.learning_topics, ignoreDuplicates: true })
    await store.upsert('exercises', DEFAULT_EXERCISES.map(([name, muscle_group, equipment]) => ({ name, muscle_group, equipment })), { onConflict: CONFLICT_KEYS.exercises, ignoreDuplicates: true })
    await store.upsert('user_settings', { defaults_seeded: true }, { onConflict: 'user_id' })
    await Promise.all([store.refetch('learning_topics'), store.refetch('exercises')])
  }

  // -------------------------------------------------------------------- goals
  async function setGoalStatus(goal, status) {
    return store.update('goals', goal.id, { status, completed_at: status === 'completed' ? nowIso() : null })
  }
  async function toggleMilestone(m) {
    return store.update('milestones', m.id, { done: !m.done, completed_at: m.done ? null : nowIso() })
  }

  // ------------------------------------------------------------ focus sessions
  /** Records a finished (or stopped-early) focus block. Blocks shorter than a minute are discarded as accidental.
   * @param {{ plannedMinutes: number, actualSeconds: number, completed: boolean, taskId?: string | null, topicId?: string | null, label?: string, date: string }} input
   */
  async function recordFocus({ plannedMinutes, actualSeconds, completed, taskId = null, topicId = null, label = '', date }) {
    if (actualSeconds < MIN_RECORD_SECONDS && !completed) return null
    return store.insert('focus_sessions', {
      session_date: date, kind: 'focus', planned_minutes: plannedMinutes, actual_seconds: Math.min(actualSeconds, plannedMinutes * 60 + 5),
      completed, task_id: taskId, topic_id: topicId, label: label.slice(0, 120),
    })
  }

  // ------------------------------------------------------------- recurring
  /**
   * Posts what recurring rules owe as transactions, each dated the day it fell due, so a device that was closed for a week catches up on the right days.
   * Safe to run from several devices at once: the occurrence's unique index lets only the first insert win (the loser gets 23505 and is ignored), and
   * next_date only moves after the inserts, so a run that dies half way simply repeats and skips what it already posted.
   * Runs while LifeTrack is open on any device: nothing is posted until one of them opens, which the back-dating makes invisible.
   */
  async function postDueRecurring(today) {
    await store.load('recurring_rules')
    if (!dueRules(store.peek('recurring_rules'), today).length) return 0
    // A device waking from sleep may hold an old next_date; re-read so it can't re-post an occurrence the user deleted meanwhile.
    await store.refetch('recurring_rules')
    let posted = 0
    for (const rule of dueRules(store.peek('recurring_rules'), today)) {
      const dates = dueOccurrences(rule, today)
      try {
        for (const date of dates) {
          try {
            await store.insert('transactions', occurrenceRow(rule, date))
            posted++
          } catch (e) { if (e.code !== '23505') throw e }
        }
        await store.update('recurring_rules', rule.id, afterPost(rule, dates.at(-1)))
      } catch (e) {
        if (e.code !== '23503') throw e // 23503: another device deleted this rule just now; nothing left to do for it
      }
    }
    return posted
  }
  const toggleRecurringRule = (rule, today) => store.update('recurring_rules', rule.id, recurringTogglePatch(rule, today))

  // ------------------------------------------------------------- reminders
  /**
   * Turns due reminders into notifications. Safe to run from several devices at once: the notification's dedupe_key is
   * unique per user, so only the first insert wins (the loser gets 23505 and is ignored).
   * Reminders fire while LifeTrack is open on any device — there is no background server push in this build.
   */
  async function fireDueReminders(today, nowTime, prefs = {}) {
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
  const markNotificationRead = (n) => (n.read_at ? Promise.resolve(n) : store.update('notifications', n.id, { read_at: nowIso() }))
  /** Pause/resume a reminder. Resuming also clears "already fired" so it can fire again. */
  const toggleReminder = (r) => store.update('reminders', r.id, { active: !r.active, ...(!r.active ? { last_fired_on: null } : {}) })
  /** Deletes read notifications (unread are kept). */
  async function clearReadNotifications() {
    const ids = store.peek('notifications').filter((n) => n.read_at).map((n) => n.id)
    if (ids.length) await store.removeMany('notifications', ids)
    return ids.length
  }
  async function markAllRead() {
    const unread = store.peek('notifications').filter((n) => !n.read_at)
    await Promise.all(unread.map((n) => store.update('notifications', n.id, { read_at: nowIso() })))
    return unread.length
  }

  return { saveRow, deleteRow, createTask, setTaskStatus, setHabitStatus, startStudy, stopStudy, discardStudy, saveWorkout, saveHealth, addWater, setApplicationStatus, setMonthBudget, addSavingsFunds, seedDefaults, setGoalStatus, toggleMilestone, recordFocus, postDueRecurring, toggleRecurringRule, fireDueReminders, toggleReminder, clearReadNotifications, markNotificationRead, markAllRead }
}
