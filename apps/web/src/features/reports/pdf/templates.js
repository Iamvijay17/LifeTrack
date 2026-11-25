// Report templates: one function per module, each turning that module's real records for a period into PDF blocks (see
// services/pdf/engine.js). A template returns [] when the module has nothing in the period, so the report only ever contains sections
// that have data. Nothing here estimates or invents: every figure is a sum, count or average of stored records.
import { addDays, addMonths, dateStrInTz, diffDays, eachDay, endOfWeek, monthEnd, monthStart, startOfWeek } from '@lifetrack/utils'
import { completion, streaks } from '@lifetrack/core/streaks'
import { countedMinutes, topicTotals, sessionName } from '@lifetrack/core/learning'
import { goalPercent } from '@lifetrack/core/goals'
import { funnel } from '@lifetrack/core/jobs'
import { fmtDateTime, fmtDay, fmtDuration } from '@/lib/dates'
import { pctText } from '@/lib/format'

export const MODULES = [
  { id: 'summary', label: 'Overview & KPIs', hint: 'Headline numbers and daily score trend' },
  { id: 'learning', label: 'Career & Learning', hint: 'Study time, DSA, topics, goals' },
  { id: 'jobs', label: 'Job Switch', hint: 'Applications, statuses, interviews' },
  { id: 'fitness', label: 'Gym & Fitness', hint: 'Workouts, exercises, weight' },
  { id: 'health', label: 'Sleep & Health', hint: 'Sleep, water, steps, energy' },
  { id: 'finance', label: 'Finance & Expenses', hint: 'Income, spending, budgets, savings' },
  { id: 'habits', label: 'Routine & Habits', hint: 'Habit completion, streaks, tasks' },
  { id: 'calendar', label: 'Calendar & Timeline', hint: 'Scheduled tasks and interviews' },
  { id: 'daily', label: 'Day-by-day detail', hint: 'One row per day (wide table)' },
]
/** Which stored tables a module reads, so a locked module's data never reaches a PDF. */
export const MODULE_TABLES = {
  summary: ['tasks', 'habits', 'habit_logs', 'study_sessions', 'workouts', 'health_logs', 'transactions'],
  learning: ['study_sessions', 'focus_sessions', 'learning_topics', 'goals', 'milestones'],
  jobs: ['job_applications', 'application_history', 'interview_events'],
  fitness: ['workouts', 'exercise_logs', 'health_logs'],
  health: ['health_logs'],
  finance: ['transactions', 'budgets', 'savings_goals'],
  habits: ['habits', 'habit_logs', 'tasks'],
  calendar: ['tasks', 'interview_events', 'job_applications'],
  daily: ['tasks', 'habit_logs', 'study_sessions', 'focus_sessions', 'workouts', 'health_logs', 'transactions'],
}

const DASH = '—'
const num = (n, dp = 1) => (n == null ? DASH : Number(n).toLocaleString('en-IN', { maximumFractionDigits: dp }))
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const cap = (s) =>
  s
    ? String(s)
        .replace(/_/g, ' ')
        .replace(/^./, (c) => c.toUpperCase())
    : DASH
const D = (d) => (d ? fmtDay(d, 'd MMM yyyy') : DASH)
const hours = (min) => Math.round((min / 60) * 10) / 10

/** Time buckets for a trend chart: days up to a month, weeks up to ~6 months, months beyond. */
export function buckets(from, last, weekStartsOn = 1) {
  if (from > last) return []
  const n = diffDays(last, from) + 1
  const out = []
  if (n <= 31)
    return Object.assign(
      eachDay(from, last).map((d) => ({ from: d, to: d, label: fmtDay(d, n > 14 ? 'd' : 'EEE d') })),
      { unit: 'day' },
    )
  out.unit = n <= 190 ? 'week' : 'month'
  if (n <= 190) {
    for (let s = startOfWeek(from, weekStartsOn); s <= last; s = addDays(s, 7))
      out.push({
        from: s < from ? from : s,
        to: endOfWeek(s, weekStartsOn) > last ? last : endOfWeek(s, weekStartsOn),
        label: fmtDay(s, 'd MMM'),
      })
    return out
  }
  for (let s = monthStart(from); s <= last; s = addMonths(s, 1))
    out.push({ from: s < from ? from : s, to: monthEnd(s) > last ? last : monthEnd(s), label: fmtDay(s, 'MMM yy') })
  return out
}
const within = (d, b) => d != null && d >= b.from && d <= b.to
const unitWord = (bks) => bks.unit ?? 'day'

/** ctx: { data, from, to, last (to, capped at today), today, settings, money, report } */
const T = {}

T.summary = ({ report: r, money }) => {
  const s = r.summary
  const items = [
    s.productivityScore != null && {
      label: 'Average daily score',
      value: `${s.productivityScore}/100`,
      sub: `${s.scoredDays} of ${s.days} days scored`,
    },
    s.studyHours > 0 && {
      label: 'Study time',
      value: `${num(s.studyHours)} h`,
      sub: s.focusHours ? `${num(s.focusHours)} h focus` : undefined,
    },
    s.workouts > 0 && {
      label: 'Workouts',
      value: String(s.workouts),
      sub: s.fitnessConsistency != null ? `${pctText(s.fitnessConsistency)} of plan` : undefined,
    },
    s.habitRate != null && { label: 'Habit completion', value: pctText(s.habitRate) },
    s.sleepAvgHours != null && { label: 'Average sleep', value: `${s.sleepAvgHours.toFixed(1)} h` },
    (s.expensePaise > 0 || s.incomePaise > 0) && { label: 'Expenses', value: money(s.expensePaise), sub: `Income ${money(s.incomePaise)}` },
    s.goalsActive > 0 && {
      label: 'Active goals',
      value: String(s.goalsActive),
      sub: s.goalAvgProgress != null ? `${s.goalAvgProgress}% average progress` : undefined,
    },
    s.applications > 0 && {
      label: 'Job applications',
      value: String(s.applications),
      sub: `${s.interviews} interviews · ${s.offers} offers`,
    },
  ].filter(Boolean)
  if (!items.length && !r.daily.some((d) => d.score != null)) return []
  const blocks = [
    { type: 'heading', text: 'Overview' },
    { type: 'kpis', items },
  ]
  const scored = r.daily.filter((d) => d.score != null)
  if (scored.length > 1) {
    const monthly = r.monthly.length > 1
    const trend =
      scored.length <= 31
        ? scored.map((d) => ({ label: fmtDay(d.date, 'd MMM'), v: d.score }))
        : (monthly ? r.monthly : r.weekly).map((x) => ({ label: fmtDay(x.key, monthly ? 'MMM yy' : 'd MMM'), v: x.score }))
    blocks.push({
      type: 'chart',
      kind: 'line',
      title: scored.length <= 31 ? 'Daily score' : monthly ? 'Monthly average score' : 'Weekly average score',
      unit: 'out of 100',
      labels: trend.map((t) => t.label),
      series: [{ name: 'Score', values: trend.map((t) => t.v) }],
    })
  }
  return blocks
}

T.learning = ({ data, from, last, settings }) => {
  const inR = (d) => d != null && d >= from && d <= last
  const sessions = data.study_sessions.filter((s) => inR(s.session_date))
  const done = sessions.filter((s) => s.status === 'completed')
  const focus = data.focus_sessions.filter((s) => inR(s.session_date) && s.kind !== 'short_break' && s.kind !== 'long_break')
  const goals = data.goals.filter((g) => g.status !== 'archived')
  if (!done.length && !focus.length) return []
  const minutes = countedMinutes(done)
  const problems = done.reduce((a, s) => a + (s.problems_solved ?? 0), 0)
  const blocks = [
    { type: 'heading', text: 'Career & Learning' },
    {
      type: 'kpis',
      items: [
        { label: 'Study time', value: fmtDuration(minutes), sub: `${done.length} session${done.length === 1 ? '' : 's'}` },
        {
          label: 'Average per active day',
          value: fmtDuration(minutes / new Set(done.map((s) => s.session_date)).size),
          sub: `${new Set(done.map((s) => s.session_date)).size} study days`,
        },
        problems > 0 && { label: 'DSA problems solved', value: String(problems) },
        {
          label: 'Goals completed',
          value: String(
            data.goals.filter((g) => g.status === 'completed' && g.completed_at && inR(dateStrInTz(g.completed_at, settings.timezone)))
              .length,
          ),
          sub: `${goals.filter((g) => g.status === 'active').length} still active`,
        },
      ].filter(Boolean),
    },
  ]
  const bks = buckets(from, last, settings.week_starts_on)
  blocks.push({
    type: 'chart',
    title: `Study time per ${unitWord(bks)}`,
    unit: 'hours',
    labels: bks.map((b) => b.label),
    series: [{ name: 'Study hours', values: bks.map((b) => hours(countedMinutes(done.filter((s) => within(s.session_date, b))))) }],
    format: (v) => `${num(v)}`,
  })
  // where the time went: by goal or topic
  const by = new Map()
  for (const s of done) {
    const k = sessionName(s, data.goals, data.learning_topics)
    const e = by.get(k) ?? { name: k, minutes: 0, sessions: 0, problems: 0 }
    e.minutes += (s.duration_seconds ?? 0) / 60
    e.sessions += 1
    e.problems += s.problems_solved ?? 0
    by.set(k, e)
  }
  const rows = [...by.values()].sort((a, b) => b.minutes - a.minutes)
  blocks.push({ type: 'heading', text: 'Time by goal or topic', level: 2 })
  blocks.push({
    type: 'table',
    columns: [
      { header: 'Goal / topic', width: 4 },
      { header: 'Sessions', width: 1.2, align: 'right' },
      { header: 'Time', width: 1.5, align: 'right' },
      { header: 'Share', width: 1.2, align: 'right' },
      { header: 'Problems', width: 1.2, align: 'right' },
    ],
    rows: rows.map((r) => [r.name, r.sessions, fmtDuration(r.minutes), pctText(minutes ? r.minutes / minutes : null), r.problems || DASH]),
  })
  const topics = topicTotals(
    data.learning_topics.filter((t) => !t.archived),
    done,
  ).filter((t) => t.minutes > 0)
  if (topics.length)
    blocks.push(
      { type: 'heading', text: 'Topic progress', level: 2 },
      {
        type: 'bars',
        items: topics
          .sort((a, b) => b.minutes - a.minutes)
          .map((t) => ({
            label: `${t.topic.group_name} › ${t.topic.name}`,
            value: minutes ? t.minutes / minutes : 0,
            text: `${fmtDuration(t.minutes)} · ${t.sessions} sessions`,
          })),
      },
    )
  const active = goals.filter(
    (g) => g.status === 'active' || (g.status === 'completed' && g.completed_at && inR(dateStrInTz(g.completed_at, settings.timezone))),
  )
  if (active.length)
    blocks.push(
      { type: 'heading', text: 'Goal progress', level: 2 },
      {
        type: 'table',
        columns: [
          { header: 'Goal', width: 4 },
          { header: 'Category', width: 1.6 },
          { header: 'Due', width: 1.6 },
          { header: 'Status', width: 1.2 },
          { header: 'Progress', width: 1.2, align: 'right' },
        ],
        rows: active.map((g) => [
          g.title,
          g.category || DASH,
          D(g.due_date),
          cap(g.status),
          `${goalPercent(g, data.milestones, data.study_sessions).percent}%`,
        ]),
      },
    )
  return blocks
}

T.jobs = ({ data, from, to, last, settings }) => {
  const apps = data.job_applications
  const names = new Map(apps.map((a) => [a.id, a]))
  const inApplied = apps.filter((a) => a.applied_date && a.applied_date >= from && a.applied_date <= last)
  const interviews = data.interview_events.filter((e) => {
    const d = e.scheduled_at ? dateStrInTz(e.scheduled_at, settings.timezone) : null
    return d && d >= from && d <= to
  })
  if (!inApplied.length && !interviews.length) return []
  const f = funnel(apps, data.application_history, data.interview_events, from, last)
  const blocks = [
    { type: 'heading', text: 'Job Switch' },
    {
      type: 'kpis',
      items: [
        { label: 'Applications', value: String(f.applied) },
        {
          label: 'Interviews',
          value: String(f.interviews),
          sub: f.conversion != null ? `${pctText(f.conversion)} of applications` : undefined,
        },
        { label: 'Offers', value: String(f.offers) },
        { label: 'Rejections', value: String(f.rejections) },
      ],
    },
  ]
  if (inApplied.length) {
    const counts = new Map()
    for (const a of inApplied) counts.set(a.status, (counts.get(a.status) ?? 0) + 1)
    blocks.push(
      { type: 'heading', text: 'Application status', level: 2 },
      {
        type: 'bars',
        items: [...counts]
          .sort((a, b) => b[1] - a[1])
          .map(([s, n]) => ({ label: cap(s), value: n / inApplied.length, text: `${n} (${Math.round((n / inApplied.length) * 100)}%)` })),
      },
    )
    const bks = buckets(from, last, settings.week_starts_on)
    if (bks.length > 1)
      blocks.push({
        type: 'chart',
        title: `Applications per ${unitWord(bks)}`,
        unit: 'count',
        labels: bks.map((b) => b.label),
        series: [{ name: 'Applications', values: bks.map((b) => inApplied.filter((a) => within(a.applied_date, b)).length) }],
      })
    const withPay = inApplied.some((a) => a.salary_paise)
    blocks.push(
      { type: 'heading', text: 'Applications', level: 2 },
      {
        type: 'table',
        columns: [
          { header: 'Company', width: 2.4 },
          { header: 'Role', width: 2.8 },
          { header: 'Applied', width: 1.7 },
          { header: 'Status', width: 1.5 },
          { header: 'Location', width: 1.8 },
          ...(withPay ? [{ header: 'Package', width: 1.3, align: 'right' }] : []),
          { header: 'Follow-up', width: 1.7 },
        ],
        rows: [...inApplied]
          .sort((a, b) => b.applied_date.localeCompare(a.applied_date))
          .map((a) => [
            a.company,
            a.job_title,
            D(a.applied_date),
            cap(a.status),
            a.location || DASH,
            ...(withPay ? [a.salary_paise ? `${num(a.salary_paise / 100 / 100000, 2)} LPA` : DASH] : []),
            D(a.followup_date),
          ]),
      },
    )
  }
  if (interviews.length)
    blocks.push(
      { type: 'heading', text: 'Interview tracking', level: 2 },
      {
        type: 'table',
        columns: [
          { header: 'When', width: 2.2 },
          { header: 'Company', width: 2.4 },
          { header: 'Round', width: 2 },
          { header: 'Mode', width: 1.2 },
          { header: 'Status', width: 1.4 },
        ],
        rows: [...interviews]
          .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
          .map((e) => [
            fmtDateTime(e.scheduled_at, settings.timezone),
            names.get(e.application_id)?.company ?? DASH,
            e.round_name || DASH,
            cap(e.mode),
            cap(e.status),
          ]),
      },
    )
  return blocks
}

T.fitness = ({ data, from, last, settings, report }) => {
  const inR = (d) => d != null && d >= from && d <= last
  const done = data.workouts.filter((w) => w.status === 'completed' && inR(w.workout_date))
  const weights = data.health_logs
    .filter((h) => inR(h.log_date) && h.weight_kg != null)
    .sort((a, b) => a.log_date.localeCompare(b.log_date))
  if (!done.length && !weights.length) return []
  const ids = new Set(done.map((w) => w.id))
  const minutes = sum(done.map((w) => (w.duration_minutes ?? 0) + (w.cardio_minutes ?? 0)))
  const km = sum(done.map((w) => w.cardio_distance_km ?? 0))
  const blocks = [{ type: 'heading', text: 'Gym & Fitness' }]
  const kp = [
    done.length > 0 && {
      label: 'Workouts completed',
      value: String(done.length),
      sub: `${new Set(done.map((w) => w.workout_date)).size} training days`,
    },
    minutes > 0 && { label: 'Training time', value: fmtDuration(minutes) },
    report.summary.fitnessConsistency != null && {
      label: 'Plan consistency',
      value: pctText(report.summary.fitnessConsistency),
      sub: 'planned days trained',
    },
    km > 0 && { label: 'Cardio distance', value: `${num(km)} km` },
    weights.length > 0 && {
      label: 'Latest weight',
      value: `${num(weights.at(-1).weight_kg)} kg`,
      sub:
        weights.length > 1
          ? `${weights.at(-1).weight_kg - weights[0].weight_kg >= 0 ? '+' : '−'}${num(Math.abs(weights.at(-1).weight_kg - weights[0].weight_kg))} kg since ${D(weights[0].log_date)}`
          : undefined,
    },
  ].filter(Boolean)
  blocks.push({ type: 'kpis', items: kp })
  const bks = buckets(from, last, settings.week_starts_on)
  if (done.length && bks.length > 1)
    blocks.push({
      type: 'chart',
      title: `Workouts per ${unitWord(bks)}`,
      unit: 'count',
      labels: bks.map((b) => b.label),
      series: [{ name: 'Workouts', values: bks.map((b) => done.filter((w) => within(w.workout_date, b)).length) }],
    })
  if (weights.length > 1)
    blocks.push({
      type: 'chart',
      kind: 'line',
      title: 'Weight trend',
      unit: 'kg',
      labels: weights.map((w) => fmtDay(w.log_date, 'd MMM')),
      series: [{ name: 'Weight', values: weights.map((w) => w.weight_kg) }],
      format: (v) => num(v),
    })
  // exercise summary
  const logs = data.exercise_logs.filter((l) => ids.has(l.workout_id))
  const ex = new Map()
  for (const l of logs) {
    const e = ex.get(l.exercise_name) ?? { name: l.exercise_name, sets: 0, reps: 0, max: 0, volume: 0, days: new Set() }
    e.sets += 1
    e.reps += l.reps ?? 0
    e.max = Math.max(e.max, l.weight_kg ?? 0)
    e.volume += (l.reps ?? 0) * (l.weight_kg ?? 0)
    ex.set(l.exercise_name, e)
  }
  if (ex.size)
    blocks.push(
      { type: 'heading', text: 'Exercise summary', level: 2 },
      {
        type: 'table',
        columns: [
          { header: 'Exercise', width: 3.5 },
          { header: 'Sets', width: 1, align: 'right' },
          { header: 'Reps', width: 1, align: 'right' },
          { header: 'Top weight', width: 1.5, align: 'right' },
          { header: 'Volume', width: 1.6, align: 'right' },
        ],
        rows: [...ex.values()]
          .sort((a, b) => b.volume - a.volume || b.sets - a.sets)
          .map((e) => [e.name, e.sets, e.reps, e.max ? `${num(e.max)} kg` : DASH, e.volume ? `${num(e.volume, 0)} kg` : DASH]),
      },
    )
  if (done.length)
    blocks.push(
      { type: 'heading', text: 'Workout history', level: 2 },
      {
        type: 'table',
        columns: [
          { header: 'Date', width: 1.7 },
          { header: 'Workout', width: 3 },
          { header: 'Type', width: 1.2 },
          { header: 'Duration', width: 1.2, align: 'right' },
          { header: 'Cardio', width: 1.4, align: 'right' },
          { header: 'Notes', width: 3 },
        ],
        rows: [...done]
          .sort((a, b) => b.workout_date.localeCompare(a.workout_date))
          .map((w) => [
            D(w.workout_date),
            w.name || DASH,
            cap(w.kind),
            w.duration_minutes ? fmtDuration(w.duration_minutes) : DASH,
            w.cardio_minutes || w.cardio_distance_km
              ? [w.cardio_minutes ? fmtDuration(w.cardio_minutes) : null, w.cardio_distance_km ? `${num(w.cardio_distance_km)} km` : null]
                  .filter(Boolean)
                  .join(' · ')
              : DASH,
            w.notes || '',
          ]),
      },
    )
  return blocks
}

T.health = ({ data, from, last }) => {
  const logs = data.health_logs.filter((h) => h.log_date >= from && h.log_date <= last).sort((a, b) => a.log_date.localeCompare(b.log_date))
  const any = logs.filter((h) => h.sleep_minutes != null || h.water_ml > 0 || h.steps > 0 || h.energy_level != null)
  if (!any.length) return []
  const sleep = logs.filter((h) => h.sleep_minutes != null)
  const energy = logs.filter((h) => h.energy_level != null)
  const water = logs.filter((h) => h.water_ml > 0)
  const steps = logs.filter((h) => h.steps > 0)
  const blocks = [
    { type: 'heading', text: 'Sleep & Health' },
    {
      type: 'kpis',
      items: [
        sleep.length > 0 && {
          label: 'Average sleep',
          value: fmtDuration(avg(sleep.map((h) => h.sleep_minutes))),
          sub: `${sleep.length} night${sleep.length === 1 ? '' : 's'} logged`,
        },
        sleep.length > 0 && {
          label: 'Best / shortest night',
          value: `${fmtDuration(Math.max(...sleep.map((h) => h.sleep_minutes)))} / ${fmtDuration(Math.min(...sleep.map((h) => h.sleep_minutes)))}`,
        },
        water.length > 0 && { label: 'Average water', value: `${num(avg(water.map((h) => h.water_ml)), 0)} ml` },
        steps.length > 0 && { label: 'Average steps', value: num(avg(steps.map((h) => h.steps)), 0) },
        energy.length > 0 && { label: 'Average energy', value: `${num(avg(energy.map((h) => h.energy_level)))}/5` },
      ].filter(Boolean),
    },
  ]
  const label = (h) => fmtDay(h.log_date, 'd MMM')
  if (sleep.length > 1)
    blocks.push({
      type: 'chart',
      kind: 'line',
      title: 'Sleep trend',
      unit: 'hours',
      labels: sleep.map(label),
      series: [{ name: 'Sleep', values: sleep.map((h) => hours(h.sleep_minutes)) }],
      format: (v) => num(v),
    })
  if (steps.length > 1)
    blocks.push({
      type: 'chart',
      title: 'Daily steps',
      unit: 'steps',
      labels: steps.map(label),
      series: [{ name: 'Steps', values: steps.map((h) => h.steps) }],
      format: (v) => num(v, 0),
    })
  blocks.push(
    { type: 'heading', text: 'Daily health log', level: 2 },
    {
      type: 'table',
      columns: [
        { header: 'Date', width: 1.7 },
        { header: 'Bedtime', width: 1.1, align: 'right' },
        { header: 'Wake', width: 1.1, align: 'right' },
        { header: 'Sleep', width: 1.2, align: 'right' },
        { header: 'Water', width: 1.2, align: 'right' },
        { header: 'Steps', width: 1.2, align: 'right' },
        { header: 'Energy', width: 1, align: 'right' },
        { header: 'Weight', width: 1.2, align: 'right' },
      ],
      rows: any.map((h) => [
        D(h.log_date),
        h.bedtime?.slice(0, 5) ?? DASH,
        h.wake_time?.slice(0, 5) ?? DASH,
        h.sleep_minutes != null ? fmtDuration(h.sleep_minutes) : DASH,
        h.water_ml ? `${num(h.water_ml, 0)} ml` : DASH,
        h.steps ? num(h.steps, 0) : DASH,
        h.energy_level != null ? `${h.energy_level}/5` : DASH,
        h.weight_kg != null ? `${num(h.weight_kg)} kg` : DASH,
      ]),
    },
  )
  return blocks
}

T.finance = ({ data, from, last, settings, money }) => {
  const tx = data.transactions.filter((t) => t.txn_date >= from && t.txn_date <= last)
  if (!tx.length) return []
  const tot = (type) => sum(tx.filter((t) => t.type === type).map((t) => t.amount_paise))
  const income = tot('income')
  const expense = tot('expense')
  const savings = tot('savings')
  const blocks = [
    { type: 'heading', text: 'Finance & Expenses' },
    {
      type: 'kpis',
      items: [
        { label: 'Income', value: money(income) },
        { label: 'Expenses', value: money(expense) },
        { label: 'Savings', value: money(savings), sub: income > 0 ? `${Math.round((savings / income) * 100)}% of income` : undefined },
        { label: 'Income − expenses', value: `${income - expense < 0 ? '−' : ''}${money(Math.abs(income - expense))}` },
      ],
    },
  ]
  const bks = buckets(from, last, settings.week_starts_on)
  if (bks.length > 1)
    blocks.push({
      type: 'chart',
      title: `Income and expenses per ${unitWord(bks)}`,
      unit: settings.currency,
      labels: bks.map((b) => b.label),
      series: ['income', 'expense'].map((type) => ({
        name: type === 'income' ? 'Income' : 'Expenses',
        values: bks.map((b) => sum(tx.filter((t) => t.type === type && within(t.txn_date, b)).map((t) => t.amount_paise)) / 100),
      })),
      format: (v) => (Math.abs(v) >= 1000 ? `${num(v / 1000, 1)}k` : num(v, 0)),
    })
  const cats = new Map()
  for (const t of tx.filter((x) => x.type === 'expense'))
    cats.set(t.category || 'Uncategorised', (cats.get(t.category || 'Uncategorised') ?? 0) + t.amount_paise)
  if (cats.size)
    blocks.push(
      { type: 'heading', text: 'Expenses by category', level: 2 },
      {
        type: 'bars',
        items: [...cats]
          .sort((a, b) => b[1] - a[1])
          .map(([c, p]) => ({ label: c, value: expense ? p / expense : 0, text: `${money(p)} (${Math.round((p / expense) * 100)}%)` })),
      },
    )
  // budgets that apply to months in the period
  const months = [...new Set(eachDay(from, last).map((d) => d.slice(0, 7)))]
  const budgets = data.budgets.filter((b) => months.includes(b.month.slice(0, 7)))
  if (budgets.length) {
    const rows = budgets.map((b) => {
      const spent = sum(
        tx
          .filter(
            (t) => t.type === 'expense' && t.txn_date.slice(0, 7) === b.month.slice(0, 7) && (!b.category || t.category === b.category),
          )
          .map((t) => t.amount_paise),
      )
      const left = b.amount_paise - spent
      return [
        fmtDay(b.month, 'MMM yyyy'),
        b.category || 'Overall',
        money(b.amount_paise),
        money(spent),
        { text: `${left < 0 ? 'Over by ' : ''}${money(Math.abs(left))}`, color: left < 0 ? '#b91c1c' : '#047857' },
      ]
    })
    blocks.push(
      { type: 'heading', text: 'Budgets', level: 2 },
      {
        type: 'table',
        columns: [
          { header: 'Month', width: 1.6 },
          { header: 'Category', width: 2 },
          { header: 'Budget', width: 1.6, align: 'right' },
          { header: 'Spent', width: 1.6, align: 'right' },
          { header: 'Remaining', width: 1.8, align: 'right' },
        ],
        rows,
      },
    )
  }
  if (data.savings_goals.length)
    blocks.push(
      { type: 'heading', text: 'Savings goals', level: 2 },
      {
        type: 'table',
        columns: [
          { header: 'Goal', width: 3 },
          { header: 'Saved', width: 1.8, align: 'right' },
          { header: 'Target', width: 1.8, align: 'right' },
          { header: 'Progress', width: 1.2, align: 'right' },
          { header: 'Target date', width: 1.6 },
        ],
        rows: data.savings_goals.map((g) => [
          g.name,
          money(g.saved_paise ?? 0),
          money(g.target_paise),
          `${Math.min(100, Math.round(((g.saved_paise ?? 0) / g.target_paise) * 100))}%`,
          D(g.target_date),
        ]),
      },
    )
  const sign = { income: '+', expense: '−', savings: '' }
  blocks.push(
    { type: 'heading', text: 'Transactions', level: 2 },
    {
      type: 'table',
      columns: [
        { header: 'Date', width: 1.6 },
        { header: 'Type', width: 1.1 },
        { header: 'Category', width: 1.8 },
        { header: 'Note', width: 3 },
        { header: 'Method', width: 1.2 },
        { header: 'Amount', width: 1.7, align: 'right' },
      ],
      rows: [...tx]
        .sort((a, b) => b.txn_date.localeCompare(a.txn_date))
        .map((t) => [
          D(t.txn_date),
          cap(t.type),
          t.category || DASH,
          t.note || '',
          cap(t.payment_method),
          { text: `${sign[t.type]}${money(t.amount_paise)}`, color: t.type === 'income' ? '#047857' : undefined },
        ]),
      totals: ['', '', '', `${tx.length} transactions`, '', `Net ${income - expense < 0 ? '−' : ''}${money(Math.abs(income - expense))}`],
    },
  )
  return blocks
}

T.habits = ({ data, from, last, today, settings }) => {
  const wk = settings.week_starts_on
  const stats = data.habits
    .filter((h) => !h.archived_at)
    .map((h) => {
      const logs = data.habit_logs.filter((l) => l.habit_id === h.id)
      const c = completion(h, logs, from, last, today, wk, settings.timezone)
      return { h, ...c, streak: streaks(h, logs, today, wk) }
    })
    .filter((x) => x.expected > 0)
  const tasks = data.tasks.filter((t) => t.due_date >= from && t.due_date <= last && t.status !== 'cancelled' && t.status !== 'skipped')
  if (!stats.length && !tasks.length) return []
  const exp = sum(stats.map((s) => s.expected))
  const dn = sum(stats.map((s) => s.done))
  const tDone = tasks.filter((t) => t.status === 'done').length
  const blocks = [
    { type: 'heading', text: 'Daily Routine & Habits' },
    {
      type: 'kpis',
      items: [
        stats.length > 0 && { label: 'Habit completion', value: pctText(exp ? dn / exp : null), sub: `${dn} of ${exp} check-ins` },
        stats.length > 0 && {
          label: 'Longest current streak',
          value: `${Math.max(...stats.map((s) => s.streak.current))} ${stats[0].streak.unit === 'w' ? 'wk' : 'd'}`,
        },
        tasks.length > 0 && { label: 'Tasks completed', value: `${tDone}/${tasks.length}`, sub: pctText(tDone / tasks.length) },
      ].filter(Boolean),
    },
  ]
  if (stats.length) {
    blocks.push(
      { type: 'heading', text: 'Habit completion', level: 2 },
      {
        type: 'bars',
        items: stats
          .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))
          .map((s) => ({ label: s.h.name, value: s.rate ?? 0, text: `${Math.round((s.rate ?? 0) * 100)}% (${s.done}/${s.expected})` })),
      },
    )
    blocks.push({
      type: 'table',
      columns: [
        { header: 'Habit', width: 3.4 },
        { header: 'Frequency', width: 1.4 },
        { header: 'Done', width: 1, align: 'right' },
        { header: 'Expected', width: 1.2, align: 'right' },
        { header: 'Current streak', width: 1.5, align: 'right' },
        { header: 'Longest streak', width: 1.5, align: 'right' },
      ],
      rows: stats.map((s) => [
        s.h.name,
        cap(s.h.frequency),
        s.done,
        s.expected,
        `${s.streak.current}${s.streak.unit === 'w' ? ' wk' : ' d'}`,
        `${s.streak.longest}${s.streak.unit === 'w' ? ' wk' : ' d'}`,
      ]),
    })
  }
  if (tasks.length) {
    const bks = buckets(from, last, wk)
    if (bks.length > 1)
      blocks.push({
        type: 'chart',
        title: `Task progress per ${unitWord(bks)}`,
        unit: 'tasks',
        labels: bks.map((b) => b.label),
        series: [
          { name: 'Planned', values: bks.map((b) => tasks.filter((t) => within(t.due_date, b)).length) },
          { name: 'Done', values: bks.map((b) => tasks.filter((t) => within(t.due_date, b) && t.status === 'done').length) },
        ],
      })
    const cats = new Map()
    for (const t of tasks) {
      const e = cats.get(t.category || 'other') ?? { total: 0, done: 0 }
      e.total += 1
      if (t.status === 'done') e.done += 1
      cats.set(t.category || 'other', e)
    }
    blocks.push(
      { type: 'heading', text: 'Task progress by category', level: 2 },
      {
        type: 'table',
        columns: [
          { header: 'Category', width: 3 },
          { header: 'Done', width: 1, align: 'right' },
          { header: 'Planned', width: 1, align: 'right' },
          { header: 'Completion', width: 1.4, align: 'right' },
        ],
        rows: [...cats].sort((a, b) => b[1].total - a[1].total).map(([c, e]) => [cap(c), e.done, e.total, pctText(e.done / e.total)]),
      },
    )
  }
  return blocks
}

T.calendar = ({ data, from, to, settings }) => {
  const tasks = data.tasks.filter((t) => t.due_date >= from && t.due_date <= to && t.status !== 'cancelled')
  const names = new Map(data.job_applications.map((a) => [a.id, a.company]))
  const dayOf = (e) => dateStrInTz(e.scheduled_at, settings.timezone)
  const ivs = data.interview_events.filter((e) => e.scheduled_at && dayOf(e) >= from && dayOf(e) <= to && e.status !== 'cancelled')
  if (!tasks.length && !ivs.length) return []
  const items = [
    ...tasks.map((t) => ({
      date: t.due_date,
      time: t.start_time?.slice(0, 5) ?? '',
      end: t.end_time?.slice(0, 5),
      title: t.title,
      kind: cap(t.category) || 'Task',
      where: t.location || '',
      status: cap(t.status),
    })),
    ...ivs.map((e) => {
      const local = fmtDateTime(e.scheduled_at, settings.timezone)
      return {
        date: dayOf(e),
        time: '',
        stamp: local,
        title: `Interview: ${names.get(e.application_id) ?? DASH}${e.round_name ? ` (${e.round_name})` : ''}`,
        kind: 'Interview',
        where: cap(e.mode),
        status: cap(e.status),
      }
    }),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  const blocks = [
    { type: 'heading', text: 'Calendar & Timeline' },
    {
      type: 'kpis',
      items: [
        { label: 'Scheduled items', value: String(items.length) },
        { label: 'Completed', value: String(items.filter((i) => i.status === 'Done' || i.status === 'Completed').length) },
        {
          label: 'Busiest day',
          value: D(mode(items.map((i) => i.date))),
          sub: `${Math.max(...[...countBy(items.map((i) => i.date)).values()])} items`,
        },
      ],
    },
  ]
  const weeks = new Map()
  for (const i of items) {
    const w = startOfWeek(i.date, settings.week_starts_on)
    const e = weeks.get(w) ?? { total: 0, done: 0 }
    e.total += 1
    if (i.status === 'Done' || i.status === 'Completed') e.done += 1
    weeks.set(w, e)
  }
  if (weeks.size > 1)
    blocks.push(
      { type: 'heading', text: 'Weekly overview', level: 2 },
      {
        type: 'table',
        columns: [
          { header: 'Week of', width: 2 },
          { header: 'Items', width: 1, align: 'right' },
          { header: 'Completed', width: 1.2, align: 'right' },
        ],
        rows: [...weeks].sort().map(([w, e]) => [D(w), e.total, e.done]),
      },
    )
  blocks.push(
    { type: 'heading', text: 'Schedule', level: 2 },
    {
      type: 'table',
      columns: [
        { header: 'Date', width: 1.9 },
        { header: 'Time', width: 1.5 },
        { header: 'Item', width: 4 },
        { header: 'Type', width: 1.3 },
        { header: 'Where', width: 1.6 },
        { header: 'Status', width: 1.3 },
      ],
      rows: items.map((i) => [
        fmtDay(i.date, 'EEE, d MMM yyyy'),
        i.stamp ?? (i.time ? `${i.time}${i.end ? `–${i.end}` : ''}` : 'All day'),
        i.title,
        i.kind,
        i.where || DASH,
        i.status,
      ]),
    },
  )
  return blocks
}
T.daily = ({ report: r, money }) => {
  const active = (d) =>
    d.score != null ||
    d.tasksPlanned ||
    d.studyMinutes ||
    d.focusMinutes ||
    d.workout ||
    d.habitsDone ||
    d.sleepHours != null ||
    d.spentPaise
  if (!r.daily.some(active)) return []
  return [
    { type: 'heading', text: 'Day-by-day detail' },
    {
      type: 'table',
      caption: 'A dash means nothing was recorded for that day.',
      columns: [
        { header: 'Date', width: 1.7 },
        { header: 'Score', width: 0.8, align: 'right' },
        { header: 'Tasks', width: 0.9, align: 'right' },
        { header: 'Study', width: 1, align: 'right' },
        { header: 'Focus', width: 1, align: 'right' },
        { header: 'Workout', width: 0.9, align: 'center' },
        { header: 'Habits', width: 0.8, align: 'right' },
        { header: 'Sleep', width: 0.9, align: 'right' },
        { header: 'Spent', width: 1.5, align: 'right' },
      ],
      rows: r.daily.map((d) => [
        fmtDay(d.date, 'EEE, d MMM yyyy'),
        d.score ?? DASH,
        d.tasksPlanned ? `${d.tasksDone}/${d.tasksPlanned}` : DASH,
        d.studyMinutes ? fmtDuration(d.studyMinutes) : DASH,
        d.focusMinutes ? fmtDuration(d.focusMinutes) : DASH,
        d.workout ? 'Yes' : DASH,
        d.habitsDone || DASH,
        d.sleepHours != null ? `${d.sleepHours} h` : DASH,
        d.spentPaise ? money(d.spentPaise) : DASH,
      ]),
    },
  ]
}
const countBy = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())
const mode = (xs) => [...countBy(xs)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]

/** Blocks for the chosen modules, skipping any with nothing to show. Returns { blocks, included, skipped }. */
export function buildModuleBlocks(ctx, ids) {
  const blocks = []
  const included = []
  const skipped = []
  for (const m of MODULES.filter((x) => ids.includes(x.id))) {
    const b = T[m.id](ctx)
    if (b.length) {
      blocks.push(...b)
      included.push(m.label)
    } else skipped.push(m.label)
  }
  return { blocks, included, skipped }
}
