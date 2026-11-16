// Domain operations that span more than one row. UI components call these (never the adapters directly).
import { nextOccurrence, nextDueDate } from '@lifetrack/core/recurrence'
import { dueReminders, afterFire, reminderNotification } from '@lifetrack/core/reminders'
import { dismissPatch, isUnread, readPatch, restorePatch, snoozePatch, unreadPatch, validateSnooze } from '@lifetrack/core/notifications'
import { afterPost, dueOccurrences, dueRules, occurrenceRow, togglePatch as recurringTogglePatch } from '@lifetrack/core/recurring'
import { MIN_RECORD_SECONDS } from '@lifetrack/core/focus'
import { DEFAULT_TOPICS, DEFAULT_EXERCISES } from '@lifetrack/constants/defaults'
import { CONFLICT_KEYS } from '@lifetrack/constants/schema'
import { uid, localDayMinutes, isValidDay, zonedToMs } from '@lifetrack/utils'
import { exceptionOverrides, expandEvent, isOccurrenceDate, normalizeRule, ruleBefore, ruleFrom, shiftSeries } from '@lifetrack/core/calendarRecurrence'
import { checkPlacement, dismissKey, rescheduleKey, sameSlot } from '@lifetrack/core/recovery'
import { isOpen } from '@lifetrack/core/tasks'
import { checkLink, isNodeKey } from '@lifetrack/core/lifeMap'
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
  // ------------------------------------------------------ consistency protection
  /** Pause a habit from `today`: from then on its days are neutral. A second call while paused is a no-op. Existing check-ins are untouched. */
  async function pauseHabit(habitId, today, reason = '') {
    const open = store.peek('habit_pauses').find((p) => p.habit_id === habitId && p.end_date == null)
    if (open) return open
    return store.insert('habit_pauses', { habit_id: habitId, start_date: today, reason: String(reason).slice(0, 200) })
  }

  /** End the open pause so the habit is expected again from `today`. Pausing and resuming on the same day leaves no trace. */
  async function resumeHabit(habitId, today) {
    const open = store.peek('habit_pauses').find((p) => p.habit_id === habitId && p.end_date == null)
    if (!open) return null
    const end = addDays(today, -1)
    if (end < open.start_date) return store.remove('habit_pauses', open.id)
    return store.update('habit_pauses', open.id, { end_date: end })
  }

  /**
   * Make up a missed day: records a check-in for a PAST day, marked as recovered so it shows in the recovery history. It only ever adds a check-in
   * where there is none (an existing log, even a skipped one, is never overwritten), and only inside the recovery window.
   */
  async function recoverHabitDay(habitId, date, today, window = 7) {
    const habit = store.peek('habits').find((h) => h.id === habitId)
    if (!habit || habit.archived_at) throw new AppError('That habit is not active.')
    if (!isValidDay(date) || date >= today) throw new AppError('Only a past day can be made up.')
    if (diffDays(today, date) > window) throw new AppError(`Days older than ${window} days can no longer be recovered.`)
    if (date < habit.start_date) throw new AppError('That day is before the habit started.')
    if (store.peek('habit_logs').some((l) => l.habit_id === habitId && l.log_date === date)) throw new AppError('That day already has a check-in.')
    return store.upsert('habit_logs', { habit_id: habitId, log_date: date, status: 'done', recovered_at: nowIso() }, { onConflict: CONFLICT_KEYS.habit_logs })
  }

  // ------------------------------------------------------------------ life map
  /** Remember where a node was left. One saved place per node (the database enforces it), so dragging is an upsert. */
  async function saveMapPosition(nodeKey, x, y) {
    if (!isNodeKey(nodeKey) || !Number.isFinite(x) || !Number.isFinite(y)) throw new AppError('That position cannot be saved.')
    return store.upsert('life_map_positions', { node_key: nodeKey, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }, { onConflict: CONFLICT_KEYS.life_map_positions })
  }

  /** Save many positions at once (an auto-arrange). */
  async function saveMapPositions(entries) {
    const rows = entries.filter((e) => isNodeKey(e.key) && Number.isFinite(e.x) && Number.isFinite(e.y)).map((e) => ({ node_key: e.key, x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10 }))
    if (!rows.length) return []
    return store.upsert('life_map_positions', rows, { onConflict: CONFLICT_KEYS.life_map_positions })
  }

  /** Forget every saved position, so the next draw lays the map out afresh. Links and items are untouched. */
  async function resetMapLayout() {
    const ids = store.peek('life_map_positions').map((p) => p.id)
    if (ids.length) await store.removeMany('life_map_positions', ids)
    return ids.length
  }

  /**
   * Connect two nodes: `from` contributes to `to`. The map's own rules decide (no self-link, no repeat, no reverse duplicate, no loop); the
   * database enforces the first three again, so two devices cannot create a duplicate.
   */
  async function linkNodes(map, from, to, label = '') {
    const problem = checkLink(map, from, to)
    if (problem) throw new AppError(problem)
    return store.insert('life_map_links', { from_key: from, to_key: to, label: String(label).trim().slice(0, 60) })
  }

  /** Swap the direction of a drawn link. Done as delete + insert so the unique key never collides with itself. */
  async function reverseLink(linkId) {
    const l = store.peek('life_map_links').find((x) => x.id === linkId)
    if (!l) throw new AppError('That link no longer exists.')
    await store.remove('life_map_links', linkId)
    try {
      return await store.insert('life_map_links', { from_key: l.to_key, to_key: l.from_key, label: l.label })
    } catch (e) {
      await store.insert('life_map_links', { from_key: l.from_key, to_key: l.to_key, label: l.label }).catch(() => {}) // put it back
      throw e
    }
  }

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

  // ---------------------------------------------------------------- nutrition
  /**
   * Logs one drink of water. The database writes the entry AND raises the day's total in health_logs in one transaction, so the entry list
   * and Sleep & Health can never disagree and two devices adding at once never lose an increment.
   * @param {string} date
   * @param {number} ml
   * @param {string | null} [time] HH:mm, in the user's timezone
   */
  async function logWater(date, ml, time = null) {
    if (!Number.isInteger(ml) || ml < 1 || ml > 5000) throw new AppError('Enter an amount between 1 and 5000 ml.')
    const { entry, health } = await store.rpc('log_water', { p_date: date, p_ml: ml, p_time: time })
    store.patch('water_logs', [entry])
    store.patch('health_logs', [health]) // the function also raised the day's total there
    return entry
  }
  /** Removes one water entry and takes its amount off the day's total (same transaction). Use this, never a plain delete. */
  async function removeWaterLog(entry) {
    const health = await store.rpc('delete_water_log', { p_id: entry.id })
    store.patchGroup('water_logs', (w) => w.id === entry.id, [])
    if (health) store.patch('health_logs', [health])
    return health
  }
  /** Saves the user's targets; empty goals are stored as null ("not set"). `waterGoalMl` lives in user_settings, shared with Sleep & Health. */
  async function saveNutritionGoals(settings, waterGoalMl) {
    const row = await store.upsert('nutrition_settings', settings, { onConflict: CONFLICT_KEYS.nutrition_settings })
    if (waterGoalMl !== undefined) await store.upsert('user_settings', { water_goal_ml: waterGoalMl ?? 0 }, { onConflict: 'user_id' })
    return row
  }
  /** Replaces the favourite foods list (refs like "starter:idli" or "custom:<id>"). */
  const saveFavoriteFoods = (favorites) => store.upsert('nutrition_settings', { favorite_foods: favorites }, { onConflict: CONFLICT_KEYS.nutrition_settings })
  /**
   * Saves the user's own copy of a built-in starter food (edit it, or favourite-and-tweak). One copy per starter food: if it already exists
   * it is updated, so double clicks or two devices never create two.
   */
  async function saveFoodCopy(baseKey, values) {
    const existing = store.peek('foods').find((f) => f.base_key === baseKey)
    if (existing) return store.update('foods', existing.id, values)
    try { return await store.insert('foods', { ...values, base_key: baseKey }) }
    catch (e) {
      if (e?.code !== '23505') throw e // another device saved a copy first: update that one instead
      await store.refetch('foods')
      const theirs = store.peek('foods').find((f) => f.base_key === baseKey)
      if (!theirs) throw e
      return store.update('foods', theirs.id, values)
    }
  }
  /** Deleting a user's copy of a starter food brings the original back; deleting a custom food keeps the entries already logged with it. */
  const deleteFood = (food) => store.remove('foods', food.id)

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
   * Reminders fire from the send-reminders Edge Function when it is running, and otherwise from any open app. `opts.tz` lets the
   * notification record when the reminder was meant to go off (`due_at`), so one that fires late is shown as missed.
   */
  async function fireDueReminders(today, nowTime, prefs = {}, opts = {}) {
    await store.load('reminders')
    let fired = 0
    for (const r of dueReminders(store.peek('reminders'), today, nowTime)) {
      if (prefs[r.kind] !== false) {
        try {
          await store.insert('notifications', reminderNotification(r, today, opts.tz))
          fired++
        } catch (e) { if (e.code !== '23505') throw e }
      }
      await store.update('reminders', r.id, afterFire(r, today))
    }
    return fired
  }
  /** Pause/resume a reminder. Resuming also clears "already fired" so it can fire again. */
  const toggleReminder = (r) => store.update('reminders', r.id, { active: !r.active, ...(!r.active ? { last_fired_on: null } : {}) })
  /**
   * Moves a reminder to a new date and time and arms it again (the series carries on from there). `tz` is the person's timezone: a time that has
   * already passed there is refused, because the reminder would fire at once and look like a mistake.
   */
  async function rescheduleReminder(r, { date, time, tz, nowMs = Date.now() }) {
    if (!isValidDay(date)) throw new AppError('Pick a date.')
    if (!/^\d{2}:\d{2}$/.test(time ?? '')) throw new AppError('Pick a time.')
    const problem = validateSnooze(zonedToMs(date, time, tz), nowMs)
    if (problem) throw new AppError(problem)
    return store.update('reminders', r.id, { remind_date: date, remind_time: time, active: true, last_fired_on: null })
  }

  // ----------------------------------------------------------- notifications
  // A notification is read, snoozed (hidden until a time) or dismissed (out of the inbox, kept in the history). The columns each action writes are
  // in @lifetrack/core/notifications so the web app, the mobile app and the tests agree on them.
  const markNotificationRead = (n) => (n.read_at ? Promise.resolve(n) : store.update('notifications', n.id, readPatch(Date.now())))
  const markNotificationUnread = (n) => (n.read_at ? store.update('notifications', n.id, unreadPatch()) : Promise.resolve(n))
  /** Hides a notification until `untilMs`, then it is back in the inbox as unread. Use it for "snooze" and for "reschedule" alike. */
  async function snoozeNotification(n, untilMs, nowMs = Date.now()) {
    const problem = validateSnooze(untilMs, nowMs)
    if (problem) throw new AppError(problem)
    return store.update('notifications', n.id, snoozePatch(untilMs))
  }
  const dismissNotification = (n, nowMs = Date.now()) => store.update('notifications', n.id, dismissPatch(n, nowMs))
  const restoreNotification = (n) => store.update('notifications', n.id, restorePatch())
  /** Dismisses several at once; resolves to how many. */
  async function dismissNotifications(rows, nowMs = Date.now()) {
    await Promise.all(rows.map((n) => store.update('notifications', n.id, dismissPatch(n, nowMs))))
    return rows.length
  }
  /** Permanently deletes notifications (from the history). */
  async function deleteNotifications(ids) {
    if (ids.length) await store.removeMany('notifications', ids)
    return ids.length
  }
  /** Deletes read notifications (unread are kept). */
  async function clearReadNotifications() {
    const ids = store.peek('notifications').filter((n) => n.read_at).map((n) => n.id)
    if (ids.length) await store.removeMany('notifications', ids)
    return ids.length
  }
  /** Marks everything you can see in the inbox as read. A snoozed notification stays unread, so it is noticed when it comes back. */
  async function markAllRead(nowArg) {
    const nowMs = typeof nowArg === 'number' ? nowArg : Date.now() // (a click handler may hand over an event)
    const unread = store.peek('notifications').filter((n) => isUnread(n, nowMs))
    await Promise.all(unread.map((n) => store.update('notifications', n.id, readPatch(nowMs))))
    return unread.length
  }
  /**
   * Raises one notification under a key that names what it is about and when. The key is unique per user, so with the app open on several devices
   * (or tabs) only the first insert wins. Resolves to the notification, or null if another device already raised it.
   */
  async function raiseNotification({ key, kind, title, body = '', link = '', priority = 'normal', dueAt = null }) {
    try {
      return await store.insert('notifications', { kind, title: title.slice(0, 200), body, link, priority, due_at: dueAt, dedupe_key: key })
    } catch (e) {
      if (e?.code === '23505') return null
      throw e
    }
  }

  // ---------------------------------------------------------------- calendar
  // Events are `calendar_events` rows; tasks, interviews and reminders keep living in their own tables and are only rescheduled from the calendar.
  // Editing a repeating event comes in three scopes: 'this' (one occurrence: an override row in calendar_event_exceptions), 'following' (the series is cut
  // at that occurrence and a new one continues from it) and 'all'. Multi-row scopes undo what they did if a later step fails, like saveWorkout.
  const EVENT_FIELDS = ['title', 'description', 'location', 'category', 'category_label', 'priority', 'color', 'all_day', 'starts_at', 'ends_at', 'timezone', 'rrule', 'alert_minutes', 'goal_id', 'topic_id', 'application_id', 'routine_id']
  const pickEvent = (values) => Object.fromEntries(EVENT_FIELDS.filter((k) => k in values).map((k) => [k, values[k]]))
  const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  const seriesDate = (event) => localDayMinutes(event.starts_at, event.timezone || 'Asia/Kolkata').date
  const BLANK_OVERRIDES = { title: null, description: null, location: null, category: null, priority: null, color: null, all_day: null, starts_at: null, ends_at: null, alert_minutes: null }

  /** Another device may have changed (or deleted) the event since this screen read it; refuse to overwrite blindly. */
  function freshEvent(event) {
    const now = store.peek('calendar_events').find((e) => e.id === event.id)
    if (!now) throw new AppError('This event was deleted on another device.')
    if (event.updated_at && now.updated_at && now.updated_at !== event.updated_at)
      throw new AppError('This event was changed on another device. Review the latest version and try again.')
    return now
  }
  const exceptionsOf = (event) => store.peek('calendar_event_exceptions').filter((x) => x.event_id === event.id)

  /** Creates an event. Pass `id` (a fresh uuid made when the form opened) and a retry or a double submit can never create two. */
  async function createCalendarEvent(values) {
    const row = { id: uid(), ...pickEvent(values) }
    row.id = values.id ?? row.id
    try {
      return await store.insert('calendar_events', row)
    } catch (e) {
      if (e?.code !== '23505') throw e
      await store.refetch('calendar_events') // the first attempt went through
      const mine = store.peek('calendar_events').find((r) => r.id === row.id)
      if (mine) return mine
      throw e
    }
  }

  /**
   * Saves an edit to an event.
   * @param event the series row as the screen last saw it
   * @param values the edited fields of the OCCURRENCE being edited (starts_at/ends_at are that occurrence's times), plus the series `rrule`
   * @param opts.scope 'all' | 'this' | 'following' (ignored for events that do not repeat)
   * @param opts.occurrenceDate the local date the series generated for the edited occurrence
   */
  async function saveCalendarEvent(event, values, { scope = 'all', occurrenceDate = null } = {}) {
    await Promise.all([store.load('calendar_events'), store.load('calendar_event_exceptions')])
    event = freshEvent(event)
    const first = seriesDate(event)
    const repeats = !!event.rrule
    const date = occurrenceDate ?? first
    if (repeats && scope === 'following' && date <= first) scope = 'all' // from the very first occurrence on, that IS the whole series

    if (!repeats || scope === 'all') {
      let patch = pickEvent(values)
      if (repeats && occurrenceDate && values.starts_at && values.ends_at)
        patch = { ...patch, ...shiftSeries(event, date, Date.parse(values.starts_at), Date.parse(values.ends_at), values.all_day ?? event.all_day) }
      const next = { ...event, ...patch }
      const moved = repeats && (!sameJson(normalizeRule(event.rrule, first), normalizeRule(next.rrule, seriesDate(next))) || seriesDate(next) !== first)
      const row = await store.update('calendar_events', event.id, patch)
      if (moved) {
        // Overrides are keyed by the date the old rule produced; after the rule or start date changes they would attach to the wrong days.
        const stale = exceptionsOf(event).map((x) => x.id)
        if (stale.length) await store.removeMany('calendar_event_exceptions', stale)
      }
      return row
    }

    if (scope === 'this') {
      const [base] = expandEvent(event, [], date, date).filter((o) => o.occurrenceDate === date)
      if (!base) throw new AppError('That occurrence no longer exists.')
      // Fields the caller leaves out keep this occurrence's own values (never the series' first-occurrence times).
      const overrides = exceptionOverrides({ ...event, starts_at: base.startsAt, ends_at: base.endsAt }, { ...event, starts_at: base.startsAt, ends_at: base.endsAt, ...pickEvent(values) })
      const existing = exceptionsOf(event).find((x) => x.occurrence_date === date)
      if (Object.values(overrides).every((v) => v == null)) {
        if (existing) await store.remove('calendar_event_exceptions', existing.id) // edited back to the series' values: drop the override
        return event
      }
      await store.upsert('calendar_event_exceptions', { event_id: event.id, occurrence_date: date, status: 'modified', ...BLANK_OVERRIDES, ...overrides }, { onConflict: CONFLICT_KEYS.calendar_event_exceptions })
      return event
    }

    // 'following': cut the old series just before this occurrence and start a new one here
    const unchangedRule = sameJson(normalizeRule(event.rrule, first), normalizeRule(values.rrule, first))
    const tail = {
      ...pickEvent(event),
      ...pickEvent(values),
      id: uid(),
      timezone: event.timezone,
      rrule: values.rrule && unchangedRule ? ruleFrom(values.rrule, first, date) : values.rrule ?? null,
    }
    const created = await store.insert('calendar_events', tail)
    try {
      await store.update('calendar_events', event.id, { rrule: ruleBefore(event.rrule, first, date) })
    } catch (e) {
      await store.remove('calendar_events', created.id).catch(() => {}) // never leave two overlapping series behind
      throw e
    }
    const later = exceptionsOf(event).filter((x) => x.occurrence_date >= date)
    const superseded = later.filter((x) => x.occurrence_date === date).map((x) => x.id) // the new series replaces this occurrence's own override
    const carry = later.filter((x) => x.occurrence_date !== date)
    if (superseded.length) await store.removeMany('calendar_event_exceptions', superseded)
    for (const x of carry) await store.update('calendar_event_exceptions', x.id, { event_id: created.id })
    return created
  }

  /** Deletes an event, one occurrence of it, or it and everything after. Cancelling one occurrence keeps an override row so it stays gone. */
  async function deleteCalendarEvent(event, { scope = 'all', occurrenceDate = null } = {}) {
    await Promise.all([store.load('calendar_events'), store.load('calendar_event_exceptions')])
    event = store.peek('calendar_events').find((e) => e.id === event.id)
    if (!event) return null // already gone (another device)
    const first = seriesDate(event)
    const date = occurrenceDate ?? first
    if (!event.rrule || scope === 'all' || (scope === 'following' && date <= first)) return store.remove('calendar_events', event.id)
    if (scope === 'this') {
      if (!isOccurrenceDate(event.rrule, first, date)) return null
      return store.upsert('calendar_event_exceptions', { event_id: event.id, occurrence_date: date, status: 'cancelled', ...BLANK_OVERRIDES }, { onConflict: CONFLICT_KEYS.calendar_event_exceptions })
    }
    await store.update('calendar_events', event.id, { rrule: ruleBefore(event.rrule, first, date) })
    const gone = exceptionsOf(event).filter((x) => x.occurrence_date >= date).map((x) => x.id)
    if (gone.length) await store.removeMany('calendar_event_exceptions', gone)
    return null
  }

  /**
   * Applies a change planned by the calendar's drag-and-drop (planMove / planResize / planSchedule in @lifetrack/core/calendar).
   * Tasks, interviews and reminders are rescheduled in their own tables; events go through saveCalendarEvent with the chosen scope.
   */
  async function applyCalendarChange(change, { scope = 'all' } = {}) {
    if (change.table === 'calendar_events') return saveCalendarEvent(change.event, change.values, { scope, occurrenceDate: change.occurrenceDate })
    const current = store.peek(change.table).find((r) => r.id === change.id)
    if (!current) throw new AppError('That item no longer exists. It may have been deleted on another device.')
    return store.update(change.table, change.id, change.patch)
  }

  /**
   * Raises one calendar alert as a notification. The dedupe key names the occurrence and the offset, and is unique per user, so with the app open on
   * several devices (or tabs) only the first insert wins. Resolves to the notification, or null if another device already raised it.
   */
  const raiseCalendarAlert = ({ key, title, body = '', link = '', priority = 'normal', dueAt = null }) => raiseNotification({ key, kind: 'event', title, body, link, priority, dueAt })


  // ---------------------------------------------------------- smart recovery
  // Moving a slipped task is a change to the task itself (due_date / start_time / end_time, the columns the Planner and Calendar already use) plus one
  // row in task_reschedules, so the history and the duplicate guard live in the database. Order matters: the history row is written FIRST because its
  // unique `dedupe_key` is the lock (two devices accepting the same suggestion: the second insert fails before any task is touched); if the task update
  // then fails, the claim is deleted again, so a failed move leaves nothing behind.
  const RECOVERY_TABLES = ['tasks', 'task_reschedules', 'calendar_events', 'calendar_event_exceptions', 'interview_events']
  const hm = (t) => (t ? String(t).slice(0, 5) : null)
  const recoveryData = () => ({
    tasks: store.peek('tasks'),
    events: store.peek('calendar_events'),
    exceptions: store.peek('calendar_event_exceptions'),
    interviews: store.peek('interview_events'),
    habits: store.peek('habits'),
    habitLogs: store.peek('habit_logs'),
    reschedules: store.peek('task_reschedules'),
  })
  const SOURCE_OF = { recover: 'recovery', rebalance: 'rebalance', manual: 'manual' }
  const SKIP_TEXT = {
    missing: 'The task no longer exists.',
    changed: 'It was changed elsewhere since this suggestion was made.',
    duplicate: 'That move was already applied.',
    closed: 'It is already finished.',
  }

  /**
   * Accepts reschedule suggestions (or manual adjustments). Each change: { taskId, from: { date, start, end }, to: { date, start, end }, reason?, kind? }.
   * Every change is checked against fresh data right before it is saved: the task must still be exactly where the suggestion found it, the move must not
   * already have happened, and the new time must not overlap an event, an interview or another timed task (core checkPlacement).
   * Changes are independent: one that fails does not block the others. Resolves to { applied: [history rows], skipped: [{ taskId, code, message }], batchId }.
   * @param o { tz, prefs, today, nowMs, source: 'recovery' | 'rebalance' | 'manual' }
   */
  async function applyReschedules(changes, { tz, prefs = {}, today, nowMs = Date.now(), source = 'recovery' } = {}) {
    if (!changes?.length) return { applied: [], skipped: [], batchId: null }
    await Promise.all(RECOVERY_TABLES.map((t) => store.refetch(t)))
    const batchId = uid()
    const applied = []
    const skipped = []
    const skip = (c, code, message) => skipped.push({ taskId: c.taskId, code, message: message ?? SKIP_TEXT[code] ?? 'It could not be moved.' })
    for (const c of changes) {
      const task = store.peek('tasks').find((t) => t.id === c.taskId)
      if (!task) { skip(c, 'missing'); continue }
      if (!isOpen(task)) { skip(c, 'closed'); continue }
      if (!sameSlot(task, c.from)) { skip(c, 'changed'); continue }
      const key = rescheduleKey(c.taskId, c.from, c.to)
      if (store.peek('task_reschedules').some((r) => r.dedupe_key === key && !r.undone_at)) { skip(c, 'duplicate'); continue }
      const check = checkPlacement(recoveryData(), { today, tz, nowMs, prefs }, { taskId: c.taskId, ...c.to })
      if (!check.ok) { skip(c, check.errors[0].code, check.errors[0].message); continue }
      let claim
      try {
        claim = await store.insert('task_reschedules', {
          task_id: task.id, title: task.title.slice(0, 200), action: 'rescheduled', source: SOURCE_OF[c.kind] ?? source,
          from_date: c.from.date, from_start: c.from.start ?? null, from_end: c.from.end ?? null, to_date: c.to.date, to_start: c.to.start, to_end: c.to.end,
          reason: (c.reason ?? '').slice(0, 500), batch_id: batchId, dedupe_key: key,
        })
      } catch (e) {
        if (e?.code === '23505') { skip(c, 'duplicate'); continue }
        throw e
      }
      try {
        await store.update('tasks', task.id, { due_date: c.to.date, start_time: c.to.start, end_time: c.to.end })
        applied.push(claim)
      } catch (e) {
        await store.remove('task_reschedules', claim.id).catch(() => {})
        skip(c, 'failed', e?.code === '23505' ? 'A repeating task cannot have two occurrences on one day.' : e?.message ? 'The task could not be saved.' : undefined)
      }
    }
    return { applied, skipped, batchId }
  }

  /**
   * Puts tasks back where a reschedule found them. Only a move that is still in place is undone (if the task was edited or moved again since, it is left
   * alone and reported). Resolves to { undone: [history rows], skipped: [{ id, code, message }] }.
   */
  async function undoReschedules(ids) {
    await Promise.all([store.refetch('tasks'), store.refetch('task_reschedules')])
    const undone = []
    const skipped = []
    for (const id of ids) {
      const row = store.peek('task_reschedules').find((r) => r.id === id)
      const task = row && store.peek('tasks').find((t) => t.id === row.task_id)
      if (!row || row.action !== 'rescheduled' || row.undone_at) { skipped.push({ id, code: 'not_applicable', message: 'That move was already undone.' }); continue }
      if (!task) { skipped.push({ id, code: 'missing', message: 'The task no longer exists.' }); continue }
      if (task.due_date !== row.to_date || hm(task.start_time) !== hm(row.to_start) || hm(task.end_time) !== hm(row.to_end)) {
        skipped.push({ id, code: 'changed', message: 'The task was changed again since, so it was left as it is.' })
        continue
      }
      const stamp = nowIso()
      const marked = await store.update('task_reschedules', id, { undone_at: stamp }) // frees the dedupe key first
      try {
        await store.update('tasks', task.id, { due_date: row.from_date, start_time: hm(row.from_start), end_time: hm(row.from_end) })
        undone.push(marked)
      } catch (e) {
        await store.update('task_reschedules', id, { undone_at: null }).catch(() => {})
        skipped.push({ id, code: 'failed', message: e?.code === '23505' ? 'A repeating task already has an occurrence on that day.' : 'The task could not be restored.' })
      }
    }
    return { undone, skipped }
  }

  /** "Not now": hides suggestions for these tasks until `until` (a date). Asking twice for the same task and day changes nothing. Resolves to how many were recorded. */
  async function dismissRecovery(items, until) {
    let n = 0
    for (const it of items) {
      try {
        await store.insert('task_reschedules', {
          task_id: it.taskId, title: (it.title ?? '').slice(0, 200), action: 'dismissed', source: 'recovery',
          from_date: it.from.date, from_start: it.from.start ?? null, from_end: it.from.end ?? null, hide_until: until, dedupe_key: dismissKey(it.taskId, it.from, until),
        })
        n++
      } catch (e) {
        if (e?.code !== '23505') throw e
      }
    }
    return n
  }

  return { saveRow, deleteRow, createTask, setTaskStatus, setHabitStatus, pauseHabit, resumeHabit, recoverHabitDay, saveMapPosition, saveMapPositions, resetMapLayout, linkNodes, reverseLink, startStudy, stopStudy, discardStudy, saveWorkout, saveHealth, addWater, logWater, removeWaterLog, saveNutritionGoals, saveFavoriteFoods, saveFoodCopy, deleteFood, setApplicationStatus, setMonthBudget, addSavingsFunds, seedDefaults, setGoalStatus, toggleMilestone, recordFocus, postDueRecurring, toggleRecurringRule, fireDueReminders, toggleReminder, rescheduleReminder, clearReadNotifications, markNotificationRead, markNotificationUnread, markAllRead, snoozeNotification, dismissNotification, dismissNotifications, restoreNotification, deleteNotifications, raiseNotification, createCalendarEvent, saveCalendarEvent, deleteCalendarEvent, applyCalendarChange, raiseCalendarAlert, applyReschedules, undoReschedules, dismissRecovery }
}
