// Insights engine: pure functions over already-loaded records. Only sums, counts and ratios of what was recorded —
// no estimates, no AI. Two rules run through everything:
//   * `null` means "not available" (nothing was ever recorded for that module by then, or the denominator is zero);
//     `0` means "recorded, and the real answer is zero". They are never mixed up.
//   * The future is never counted, and a half-finished period is compared with the same number of days of the
//     previous one, so a month in progress is not "down" against a finished month.
import { addDays, addMonths, dateStrInTz, diffDays, eachDay, fmtDay, monthEnd, monthStart, startOfWeek, weekday } from '@lifetrack/utils'
import { goalPercent } from './goals'
import { funnel } from './jobs'
import { categoryBreakdown } from './finance'
import { completion, streaks, withPauses } from './streaks'

export const PERIOD_KINDS = ['week', 'month', 'quarter', 'year', 'custom']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const round = (n, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp
const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const avg = (xs) => (xs.length ? sum(xs) / xs.length : null)
const ratio = (a, b) => (b > 0 ? a / b : null)
const minDate = (xs) => xs.reduce((m, x) => (x && (m == null || x < m) ? x : m), null)

// ------------------------------------------------------------------ periods
/** The calendar period of `kind` that contains `anchor`. */
export function periodFor(kind, anchor, weekStartsOn = 1) {
  if (kind === 'week') {
    const from = startOfWeek(anchor, weekStartsOn)
    return { from, to: addDays(from, 6) }
  }
  if (kind === 'month') return { from: monthStart(anchor), to: monthEnd(anchor) }
  if (kind === 'quarter') {
    const [y, m] = anchor.split('-').map(Number)
    const from = `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}-01`
    return { from, to: monthEnd(addMonths(from, 2)) }
  }
  if (kind === 'year') return { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` }
  throw new Error(`periodFor: unknown kind "${kind}"`)
}

/** Move an anchor date by `n` periods (negative = earlier). */
export function shiftAnchor(kind, anchor, n) {
  if (kind === 'week') return addDays(anchor, 7 * n)
  if (kind === 'month') return addMonths(anchor, n)
  if (kind === 'quarter') return addMonths(anchor, 3 * n)
  if (kind === 'year') return addMonths(anchor, 12 * n)
  return anchor
}

/** Order a custom range and never let it be empty. */
export const normalizeRange = (r) => (r.from <= r.to ? { from: r.from, to: r.to } : { from: r.to, to: r.from })

/**
 * The range actually counted and the one it is compared with.
 * `to` is cut at today; the previous period is cut to the same number of days, so both sides cover equally many days.
 */
export function comparisonRanges(range, kind, today) {
  const { from, to } = normalizeRange(range)
  const upto = to > today ? today : to
  const days = upto < from ? 0 : diffDays(upto, from) + 1
  const length = diffDays(to, from) + 1
  // Calendar months/quarters/years differ in length, so they are shifted by calendar; weeks and custom ranges by their own length.
  const prev =
    kind === 'month' || kind === 'quarter' || kind === 'year'
      ? periodFor(kind, shiftAnchor(kind, from, -1))
      : { from: addDays(from, -length), to: addDays(from, -1) }
  const prevDays = Math.min(days, diffDays(prev.to, prev.from) + 1)
  const prevUpto = prevDays === 0 ? addDays(prev.from, -1) : addDays(prev.from, prevDays - 1)
  return {
    current: { from, to, upto, days },
    previous: { from: prev.from, to: prev.to, upto: prevUpto, days: prevDays },
    partial: upto < to,
    future: days === 0,
  }
}

// ------------------------------------------------------------ data hygiene
const newer = (a, b) => ((a.updated_at ?? a.created_at ?? '') >= (b.updated_at ?? b.created_at ?? '') ? a : b)
function uniqueBy(rows, keyOf, stats) {
  const m = new Map()
  for (const r of rows ?? []) {
    const k = keyOf(r)
    if (k == null) {
      m.set(Symbol('keyless'), r)
      continue
    }
    if (m.has(k)) stats.duplicates++
    m.set(k, m.has(k) ? newer(m.get(k), r) : r)
  }
  return [...m.values()]
}

/**
 * Make the loaded tables safe to count: duplicates (same id, or the same habit/day, or two health logs for a day) collapse
 * to the newest row, rows pointing at a deleted parent are ignored, and records dated after today are ignored.
 * Returns the cleaned tables plus a tally of what was set aside, so the page can say so.
 */
export function cleanInsightsData(raw, today) {
  const stats = { duplicates: 0, orphans: 0, future: 0, unfinished: 0 }
  const rows = (t) => raw?.[t] ?? []
  const byId = (t) => uniqueBy(rows(t), (r) => r.id ?? null, stats)
  const notFuture = (list, dateOf) =>
    list.filter((r) => {
      const d = dateOf(r)
      if (d && d > today) {
        stats.future++
        return false
      }
      return true
    })

  const habits = byId('habits')
  const habitIds = new Set(habits.map((h) => h.id))
  const workouts = notFuture(byId('workouts'), (w) => w.workout_date)
  const workoutIds = new Set(workouts.map((w) => w.id))
  const habitLogsAll = uniqueBy(
    byId('habit_logs').filter((l) => {
      if (habitIds.has(l.habit_id)) return true
      stats.orphans++
      return false
    }),
    (l) => `${l.habit_id}|${l.log_date}`,
    stats,
  )

  const study = notFuture(byId('study_sessions'), (s) => s.session_date)
  const completed = study.filter((s) => s.status === 'completed' && s.duration_seconds != null && s.duration_seconds >= 0)
  stats.unfinished += study.length - completed.length

  return {
    data: {
      habits,
      habit_logs: notFuture(habitLogsAll, (l) => l.log_date),
      habit_pauses: rows('habit_pauses'),
      study_sessions: completed,
      focus_sessions: notFuture(byId('focus_sessions'), (s) => s.session_date).filter(
        (s) => s.kind === 'focus' && (s.actual_seconds ?? 0) > 0,
      ),
      learning_topics: byId('learning_topics'),
      goals: byId('goals'),
      milestones: byId('milestones'),
      job_applications: byId('job_applications'),
      application_history: rows('application_history'),
      interview_events: byId('interview_events'),
      workouts,
      exercise_logs: byId('exercise_logs').filter((e) => {
        if (workoutIds.has(e.workout_id)) return true
        stats.orphans++
        return false
      }),
      health_logs: notFuture(
        uniqueBy(rows('health_logs'), (h) => h.log_date, stats),
        (h) => h.log_date,
      ),
      transactions: notFuture(byId('transactions'), (t) => t.txn_date),
      tasks: byId('tasks'),
    },
    notes: stats,
  }
}

/** The first date each module has any record on, or null when the module was never used. */
export function firstDates(d, tz) {
  const created = (r) => (r.created_at ? dateStrInTz(r.created_at, tz) : null)
  return {
    focus: minDate(d.focus_sessions.map((s) => s.session_date)),
    learning: minDate([...d.study_sessions.map((s) => s.session_date), ...d.focus_sessions.map((s) => s.session_date)]),
    career: minDate(d.job_applications.map((a) => a.applied_date ?? created(a))),
    fitness: minDate(d.workouts.map((w) => w.workout_date)),
    health: minDate(d.health_logs.map((h) => h.log_date)),
    finance: minDate(d.transactions.map((t) => t.txn_date)),
    habits: minDate([...d.habits.map((h) => h.start_date), ...d.habit_logs.map((l) => l.log_date)]),
    tasks: minDate(d.tasks.map((t) => t.due_date)),
  }
}

// ----------------------------------------------------------------- metrics
const seconds = (s) => s.duration_seconds ?? 0
const workoutMinutes = (w) => w.duration_minutes ?? w.cardio_minutes ?? 0
const bucketUnit = (days) => (days <= 31 ? 'day' : days <= 120 ? 'week' : 'month')

function groupBy(rows, keyOf) {
  const m = new Map()
  for (const r of rows) {
    const k = keyOf(r)
    if (k == null) continue
    const list = m.get(k)
    if (list) list.push(r)
    else m.set(k, [r])
  }
  return m
}

/**
 * Every metric for one range, from cleaned data. The range is cut at today. A module whose first record is after the
 * (cut) range ends has `available: false` and all its metrics are null: that period predates the data.
 */
export function periodMetrics(d, range, ctx, { series = true } = {}) {
  const { today, weekStartsOn = 1, plan = {}, tz } = ctx
  const from = range.from
  const to = range.to > today ? today : range.to
  const days = to < from ? [] : eachDay(from, to)
  const n = days.length
  const first = ctx.first ?? firstDates(d, tz)
  const ok = (m) => first[m] != null && first[m] <= to && n > 0
  const inR = (x) => x != null && x >= from && x <= to
  const avail = {
    learning: ok('learning'),
    career: ok('career'),
    fitness: ok('fitness'),
    health: ok('health'),
    finance: ok('finance'),
    habits: ok('habits'),
    tasks: ok('tasks'),
  }

  // ---- per-day indexes, built once
  const study = d.study_sessions.filter((s) => inR(s.session_date))
  const focus = d.focus_sessions.filter((s) => inR(s.session_date))
  const doneWorkouts = d.workouts.filter((w) => w.status === 'completed' && inR(w.workout_date))
  const skippedWorkouts = d.workouts.filter((w) => w.status === 'skipped' && inR(w.workout_date)).length
  const tx = d.transactions.filter((t) => inR(t.txn_date))
  const health = d.health_logs.filter((h) => inR(h.log_date))
  const studyByDay = groupBy(study, (s) => s.session_date)
  const focusByDay = groupBy(focus, (s) => s.session_date)
  const workoutsByDay = groupBy(doneWorkouts, (w) => w.workout_date)
  const txByDay = groupBy(tx, (t) => t.txn_date)
  const healthByDay = new Map(health.map((h) => [h.log_date, h]))
  const habitLogsByDay = groupBy(
    d.habit_logs.filter((l) => l.status === 'done' && inR(l.log_date)),
    (l) => l.log_date,
  )
  const tasksDue = d.tasks.filter((t) => inR(t.due_date) && t.status !== 'cancelled' && t.status !== 'skipped')
  // A task due today that is still open has not been missed yet (same rule as habits), so it is not counted against you.
  const tasksCounted = tasksDue.filter((t) => t.status === 'done' || t.due_date < today)
  const tasksByDay = groupBy(tasksCounted, (t) => t.due_date)

  const dayRow = (date) => {
    const s = studyByDay.get(date) ?? []
    const f = focusByDay.get(date) ?? []
    const w = workoutsByDay.get(date) ?? []
    const t = txByDay.get(date) ?? []
    const tk = tasksByDay.get(date) ?? []
    const h = healthByDay.get(date)
    return {
      date,
      studyMin: round(sum(s.map(seconds)) / 60, 1),
      focusMin: round(sum(f.map((x) => x.actual_seconds)) / 60, 1),
      workouts: w.length,
      workoutMin: sum(w.map(workoutMinutes)),
      habitsDone: (habitLogsByDay.get(date) ?? []).length,
      tasksDone: tk.filter((x) => x.status === 'done').length,
      tasksPlanned: tk.length,
      income: sum(t.filter((x) => x.type === 'income').map((x) => x.amount_paise)),
      expense: sum(t.filter((x) => x.type === 'expense').map((x) => x.amount_paise)),
      savings: sum(t.filter((x) => x.type === 'savings').map((x) => x.amount_paise)),
      sleepMin: h?.sleep_minutes ?? null,
    }
  }
  const daily = days.map(dayRow)

  // ---- career & learning
  const studyMin = sum(daily.map((x) => x.studyMin))
  const focusMin = sum(daily.map((x) => x.focusMin))
  const focusUsed = first.focus != null && first.focus <= to // never used the focus timer: its time is unavailable, not 0
  const learnDays = daily.filter((x) => x.studyMin > 0 || x.focusMin > 0).length
  const topicName = new Map(d.learning_topics.map((t) => [t.id, t.name]))
  const byTopic = new Map()
  for (const s of study) {
    const k = s.topic_id ?? (s.goal_id ? `goal:${s.goal_id}` : null)
    const label =
      k == null ? 'General study' : (topicName.get(s.topic_id) ?? d.goals.find((g) => g.id === s.goal_id)?.title ?? 'General study')
    byTopic.set(label, (byTopic.get(label) ?? 0) + seconds(s) / 60)
  }
  const job = funnel(d.job_applications, d.application_history, d.interview_events, from, to)
  const activeGoals = d.goals.filter((g) => g.status === 'active')
  const learning = avail.learning
    ? {
        studyMinutes: round(studyMin, 1),
        sessions: study.length,
        avgSessionMinutes: study.length ? round(studyMin / study.length, 1) : null,
        problems: sum(study.map((s) => s.problems_solved ?? 0)),
        focusMinutes: focusUsed ? round(focusMin, 1) : null,
        focusSessions: focusUsed ? focus.length : null,
        focusCompletion: focusUsed ? ratio(focus.filter((s) => s.completed).length, focus.length) : null,
        activeDays: learnDays,
        consistency: ratio(learnDays, n),
        topics: [...byTopic].map(([label, minutes]) => ({ label, minutes: round(minutes, 1) })).sort((a, b) => b.minutes - a.minutes),
      }
    : null
  const career =
    avail.career || avail.learning
      ? {
          available: avail.career,
          applications: avail.career ? job.applied : null,
          interviews: avail.career ? job.interviews : null,
          offers: avail.career ? job.offers : null,
          rejections: avail.career ? job.rejections : null,
          interviewRate: avail.career ? job.conversion : null,
          goalsActive: activeGoals.length,
          goalsCompleted: d.goals.filter((g) => g.status === 'completed').length,
          goalAvgProgress: activeGoals.length
            ? Math.round(avg(activeGoals.map((g) => goalPercent(g, d.milestones, d.study_sessions).percent)))
            : null,
          goals: activeGoals.map((g) => ({
            id: g.id,
            title: g.title,
            percent: goalPercent(g, d.milestones, d.study_sessions).percent,
            due: g.due_date ?? null,
          })),
        }
      : null

  // ---- fitness
  const plannedDays = days.filter((x) => {
    const p = plan[String(weekday(x))]
    return p && p !== 'rest'
  })
  const workoutDates = new Set(doneWorkouts.map((w) => w.workout_date))
  const hit = plannedDays.filter((x) => workoutDates.has(x)).length
  const doneIds = new Set(doneWorkouts.map((w) => w.id))
  const sets = d.exercise_logs.filter((e) => doneIds.has(e.workout_id))
  const volumeByName = new Map()
  for (const e of sets)
    volumeByName.set(e.exercise_name, (volumeByName.get(e.exercise_name) ?? 0) + (e.reps ?? 0) * Number(e.weight_kg ?? 0))
  const weights = health
    .filter((h) => h.weight_kg != null)
    .sort((a, b) => a.log_date.localeCompare(b.log_date))
    .map((h) => ({ date: h.log_date, kg: Number(h.weight_kg) }))
  const kinds = new Map()
  for (const w of doneWorkouts) kinds.set(w.kind ?? 'other', (kinds.get(w.kind ?? 'other') ?? 0) + 1)
  const weeks = n / 7
  const fitness = avail.fitness
    ? {
        workouts: doneWorkouts.length,
        activeDays: workoutDates.size,
        minutes: sum(doneWorkouts.map(workoutMinutes)),
        perWeek: weeks >= 1 ? round(doneWorkouts.length / weeks, 1) : null,
        skipped: skippedWorkouts,
        plannedDays: plannedDays.length,
        hitDays: hit,
        consistency: ratio(hit, plannedDays.length), // null when no weekly plan is set: "no plan" is not 0%
        sets: sets.length,
        volumeKg: round(sum([...volumeByName.values()]), 0),
        cardioKm: round(sum(doneWorkouts.map((w) => Number(w.cardio_distance_km ?? 0))), 1),
        kinds: [...kinds].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
        topExercises: [...volumeByName]
          .map(([name, volume]) => ({ name, volume: round(volume, 0) }))
          .filter((x) => x.volume > 0)
          .sort((a, b) => b.volume - a.volume)
          .slice(0, 5),
        weights,
        weightChangeKg: weights.length > 1 ? round(weights.at(-1).kg - weights[0].kg, 1) : null,
      }
    : null

  // ---- sleep & health (shown with fitness)
  const sleepVals = health.filter((h) => h.sleep_minutes != null).map((h) => h.sleep_minutes)
  const healthM = avail.health
    ? {
        nightsLogged: sleepVals.length,
        sleepAvgMinutes: avg(sleepVals) == null ? null : round(avg(sleepVals), 0),
        stepsAvg:
          avg(health.filter((h) => h.steps > 0).map((h) => h.steps)) == null
            ? null
            : round(avg(health.filter((h) => h.steps > 0).map((h) => h.steps)), 0),
        waterAvgMl:
          avg(health.filter((h) => h.water_ml > 0).map((h) => h.water_ml)) == null
            ? null
            : round(avg(health.filter((h) => h.water_ml > 0).map((h) => h.water_ml)), 0),
      }
    : null

  // ---- finance
  const income = sum(daily.map((x) => x.income))
  const expense = sum(daily.map((x) => x.expense))
  const savings = sum(daily.map((x) => x.savings))
  const expenses = tx.filter((t) => t.type === 'expense')
  const biggest = expenses.reduce((m, t) => (m == null || t.amount_paise > m.amount_paise ? t : m), null)
  const finance = avail.finance
    ? {
        income,
        expense,
        savings,
        net: income - expense,
        savingsRate: ratio(savings, income),
        avgDailySpend: n ? Math.round(expense / n) : null,
        noSpendDays: daily.filter((x) => x.expense === 0).length,
        transactions: tx.length,
        categories: categoryBreakdown(tx),
        biggest: biggest
          ? { paise: biggest.amount_paise, category: biggest.category, date: biggest.txn_date, note: biggest.note ?? '' }
          : null,
      }
    : null

  // ---- habits & routine
  const pausedHabits = withPauses(d.habits, d.habit_pauses)
  const logsByHabit = groupBy(d.habit_logs, (l) => l.habit_id)
  const perHabit = pausedHabits.map((h) => {
    const logs = logsByHabit.get(h.id) ?? []
    return { habit: h, ...completion(h, logs, from, to, today, weekStartsOn, tz), longest: streaks(h, logs, today, weekStartsOn).longest }
  })
  const hDone = sum(perHabit.map((x) => x.done))
  const hExpected = sum(perHabit.map((x) => x.expected))
  const weekdayDone = Array.from({ length: 7 }, () => 0)
  for (const [date, logs] of habitLogsByDay) weekdayDone[weekday(date)] += logs.length
  const weekdayDays = Array.from({ length: 7 }, () => 0)
  for (const x of days) weekdayDays[weekday(x)]++
  const taskDone = tasksCounted.filter((t) => t.status === 'done')
  const onTime = taskDone.filter((t) => t.completed_at && dateStrInTz(t.completed_at, tz) <= t.due_date)
  const habits = avail.habits
    ? {
        done: hDone,
        expected: hExpected,
        rate: ratio(hDone, hExpected),
        active: d.habits.filter((h) => !h.archived_at).length,
        longestStreak: perHabit.reduce((m, x) => Math.max(m, x.longest), 0),
        perHabit: perHabit
          .filter((x) => x.expected > 0)
          .map((x) => ({
            id: x.habit.id,
            name: x.habit.name,
            color: x.habit.color,
            done: x.done,
            expected: x.expected,
            rate: x.rate,
            longest: x.longest,
          }))
          .sort((a, b) => b.rate - a.rate || b.done - a.done),
        byWeekday: WEEKDAYS.map((label, i) => ({
          weekday: i,
          label,
          done: weekdayDone[i],
          days: weekdayDays[i],
          perDay: ratio(weekdayDone[i], weekdayDays[i]) == null ? null : round(weekdayDone[i] / weekdayDays[i], 2),
        })),
      }
    : null
  const tasks = avail.tasks
    ? {
        planned: tasksCounted.length,
        done: taskDone.length,
        rate: ratio(taskDone.length, tasksCounted.length),
        onTimeRate: ratio(onTime.length, taskDone.length),
        open: tasksCounted.length - taskDone.length,
      }
    : null

  // ---- time distribution (minutes actually recorded)
  const workoutMin = sum(daily.map((x) => x.workoutMin))
  const timeAvail = avail.learning || avail.fitness
  const parts = [
    { key: 'study', label: 'Study', minutes: round(studyMin, 0) },
    { key: 'focus', label: 'Focus', minutes: round(focusMin, 0) },
    { key: 'workout', label: 'Workouts', minutes: workoutMin },
  ]
  const totalTime = sum(parts.map((p) => p.minutes))
  const byDow = Array.from({ length: 7 }, (_, i) => ({
    weekday: i,
    label: WEEKDAYS[i],
    study: 0,
    focus: 0,
    workout: 0,
    days: weekdayDays[i],
  }))
  for (const x of daily) {
    const r = byDow[weekday(x.date)]
    r.study += x.studyMin
    r.focus += x.focusMin
    r.workout += x.workoutMin
  }
  const time = timeAvail
    ? {
        totalMinutes: totalTime,
        parts: parts.map((p) => ({ ...p, share: ratio(p.minutes, totalTime) })),
        byWeekday: byDow.map((r) => {
          const total = r.study + r.focus + r.workout
          return {
            ...r,
            study: round(r.study, 0),
            focus: round(r.focus, 0),
            workout: round(r.workout, 0),
            total: round(total, 0),
            avg: r.days ? round(total / r.days, 0) : null,
          }
        }),
        sleepAvgMinutes: healthM?.sleepAvgMinutes ?? null,
      }
    : null

  const m = {
    range: { from, to },
    days: n,
    available: avail,
    learning,
    career,
    fitness,
    health: healthM,
    finance,
    habits,
    tasks,
    time,
    daily,
  }
  if (series) m.series = buildSeries(d, m, { from, to, today, weekStartsOn, tz, first, logsByHabit, pausedHabits, tasksCounted, avail })
  return m
}

/** Day / week / month buckets for trend charts. Buckets before a module's first record are null (a gap), not zero. */
function buildSeries(d, m, c) {
  const { from, to, weekStartsOn, avail } = c
  const unit = bucketUnit(m.days)
  const keyOf = (date) => (unit === 'day' ? date : unit === 'week' ? startOfWeek(date, weekStartsOn) : monthStart(date))
  const buckets = new Map()
  for (const row of m.daily) {
    const k = keyOf(row.date)
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k).push(row)
  }
  const fmt = unit === 'month' ? 'MMM yy' : 'd MMM'
  const taskByDue = groupBy(c.tasksCounted, (t) => keyOf(t.due_date))
  const rows = [...buckets].map(([key, list]) => {
    const bFrom = list[0].date < from ? from : list[0].date
    const bTo = list.at(-1).date > to ? to : list.at(-1).date
    const gap = (mod) => c.first[mod] == null || c.first[mod] > bTo
    let habitRate = null
    if (!gap('habits') && avail.habits) {
      const stats = c.pausedHabits.map((h) => completion(h, c.logsByHabit.get(h.id) ?? [], bFrom, bTo, c.today, weekStartsOn, c.tz))
      // On a single day a weekly habit has no schedule of its own, so day buckets use scheduled (daily/custom) habits only.
      const use = unit === 'day' ? stats.filter((_, i) => c.pausedHabits[i].frequency !== 'weekly') : stats
      habitRate = ratio(sum(use.map((x) => x.done)), sum(use.map((x) => x.expected)))
    }
    const t = taskByDue.get(key) ?? []
    return {
      key,
      label: fmtDay(key, fmt),
      from: bFrom,
      to: bTo,
      studyHours: gap('learning') ? null : round(sum(list.map((x) => x.studyMin)) / 60, 2),
      focusHours: gap('learning') ? null : round(sum(list.map((x) => x.focusMin)) / 60, 2),
      workouts: gap('fitness') ? null : sum(list.map((x) => x.workouts)),
      workoutMinutes: gap('fitness') ? null : sum(list.map((x) => x.workoutMin)),
      expense: gap('finance') ? null : sum(list.map((x) => x.expense)),
      income: gap('finance') ? null : sum(list.map((x) => x.income)),
      habitRate: habitRate == null ? null : round(habitRate * 100, 0),
      taskRate: gap('tasks')
        ? null
        : ratio(t.filter((x) => x.status === 'done').length, t.length) == null
          ? null
          : round((t.filter((x) => x.status === 'done').length / t.length) * 100, 0),
      sleepHours: (() => {
        const v = list.filter((x) => x.sleepMin != null).map((x) => x.sleepMin)
        return v.length ? round(avg(v) / 60, 1) : null
      })(),
    }
  })
  return { unit, rows }
}

// -------------------------------------------------------------- comparisons
/**
 * The headline metrics: how to read them out of periodMetrics, how to format them (`kind`) and whether more is better.
 * `good: 'up' | 'down' | null` (null = neither direction is good or bad, e.g. spending).
 */
export const INSIGHT_METRICS = [
  {
    key: 'studyMinutes',
    group: 'Career & Learning',
    label: 'Study time',
    kind: 'minutes',
    good: 'up',
    get: (m) => m.learning?.studyMinutes,
  },
  {
    key: 'learnConsistency',
    group: 'Career & Learning',
    label: 'Study consistency',
    kind: 'rate',
    good: 'up',
    get: (m) => m.learning?.consistency,
  },
  { key: 'problems', group: 'Career & Learning', label: 'Problems solved', kind: 'count', good: 'up', get: (m) => m.learning?.problems },
  {
    key: 'focusMinutes',
    group: 'Career & Learning',
    label: 'Focus time',
    kind: 'minutes',
    good: 'up',
    get: (m) => m.learning?.focusMinutes,
  },
  {
    key: 'applications',
    group: 'Career & Learning',
    label: 'Applications sent',
    kind: 'count',
    good: 'up',
    get: (m) => m.career?.applications,
  },
  { key: 'interviews', group: 'Career & Learning', label: 'Interviews', kind: 'count', good: 'up', get: (m) => m.career?.interviews },
  { key: 'workouts', group: 'Fitness', label: 'Workouts', kind: 'count', good: 'up', get: (m) => m.fitness?.workouts },
  { key: 'workoutMinutes', group: 'Fitness', label: 'Workout time', kind: 'minutes', good: 'up', get: (m) => m.fitness?.minutes },
  { key: 'fitConsistency', group: 'Fitness', label: 'Plan consistency', kind: 'rate', good: 'up', get: (m) => m.fitness?.consistency },
  { key: 'volumeKg', group: 'Fitness', label: 'Training volume', kind: 'kg', good: 'up', get: (m) => m.fitness?.volumeKg },
  { key: 'sleep', group: 'Fitness', label: 'Average sleep', kind: 'minutes', good: 'up', get: (m) => m.health?.sleepAvgMinutes },
  { key: 'income', group: 'Finance', label: 'Income', kind: 'money', good: 'up', get: (m) => m.finance?.income },
  { key: 'expense', group: 'Finance', label: 'Expenses', kind: 'money', good: 'down', get: (m) => m.finance?.expense },
  { key: 'savings', group: 'Finance', label: 'Saved', kind: 'money', good: 'up', get: (m) => m.finance?.savings },
  { key: 'savingsRate', group: 'Finance', label: 'Savings rate', kind: 'rate', good: 'up', get: (m) => m.finance?.savingsRate },
  { key: 'habitRate', group: 'Habits & Routine', label: 'Habit completion', kind: 'rate', good: 'up', get: (m) => m.habits?.rate },
  { key: 'habitsDone', group: 'Habits & Routine', label: 'Habits done', kind: 'count', good: 'up', get: (m) => m.habits?.done },
  { key: 'taskRate', group: 'Habits & Routine', label: 'Task completion', kind: 'rate', good: 'up', get: (m) => m.tasks?.rate },
]

const SAME = 0.005 // changes under half a percent of the earlier value read as "no change"

/** One metric across two periods. A null on either side means "can't compare", never "changed from/to zero". */
export function compareValue(cur, prev, good = 'up', kind = 'count') {
  if (cur == null || prev == null) return { cur: cur ?? null, prev: prev ?? null, diff: null, pct: null, verdict: 'unavailable' }
  const diff = cur - prev
  const pct = kind === 'rate' ? null : prev === 0 ? null : diff / Math.abs(prev)
  const flat = kind === 'rate' ? Math.abs(diff) < 0.005 : prev === 0 ? diff === 0 : Math.abs(diff) / Math.abs(prev) < SAME
  const verdict = flat ? 'same' : good == null ? 'changed' : diff > 0 === (good === 'up') ? 'better' : 'worse'
  return { cur, prev, diff, pct, verdict }
}

export function compareMetrics(cur, prev) {
  return INSIGHT_METRICS.map((def) => ({ ...def, ...compareValue(def.get(cur) ?? null, def.get(prev) ?? null, def.good, def.kind) }))
}

/** The last `count` calendar months ending with the month of `endDate`, each with its headline metrics. */
export function monthlyHistory(d, endDate, count, ctx) {
  const out = []
  for (let i = count - 1; i >= 0; i--) {
    const ms = addMonths(monthStart(endDate), -i)
    const r = { from: ms, to: monthEnd(ms) }
    const m = periodMetrics(d, r, ctx, { series: false })
    out.push({
      month: ms.slice(0, 7),
      label: fmtDay(ms, 'MMM yy'),
      partial: r.to > ctx.today,
      future: m.days === 0,
      values: Object.fromEntries(INSIGHT_METRICS.map((x) => [x.key, x.get(m) ?? null])),
    })
  }
  return out
}

/**
 * The whole report for the page and the exports.
 * `raw` is the loaded tables; `opts`: { kind, range, today, weekStartsOn, plan, tz, historyMonths }.
 */
export function buildInsightsReport(raw, opts) {
  const { kind, range, today, weekStartsOn = 1, plan = {}, tz, historyMonths = 6 } = opts
  const { data, notes } = cleanInsightsData(raw, today)
  const first = firstDates(data, tz)
  const ctx = { today, weekStartsOn, plan, tz, first }
  const cmp = comparisonRanges(range, kind, today)
  const current = periodMetrics(data, { from: cmp.current.from, to: cmp.current.to }, ctx)
  const previous = periodMetrics(data, { from: cmp.previous.from, to: cmp.previous.upto }, ctx, { series: false })
  const hasAny = Object.values(first).some((x) => x != null)
  return {
    kind,
    ranges: cmp,
    first,
    hasAnyData: hasAny,
    notes,
    current,
    previous,
    comparison: compareMetrics(current, previous),
    history: monthlyHistory(data, cmp.current.to < today ? cmp.current.to : today, historyMonths, ctx),
  }
}
