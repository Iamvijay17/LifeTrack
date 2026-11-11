// Notifications that come from the other modules, worked out from the same rows the screens use. Nothing here stores anything: a source says "this is
// worth a notification, at this time, under this key", and the key is what keeps it from being raised twice (it becomes the notification's
// unique `dedupe_key`). Reminders and calendar alerts have their own paths and are not repeated here.
//
// Each source is one notification per day (a digest) or per event, never one per row, so a long task list is a single "5 tasks due today".
import { addDays, dateStrInTz, fmtClock, formatMoney, localDayMinutes, monthEnd, monthKey, zonedToMs } from '@lifetrack/utils'
import { todayAgenda } from './agenda'
import { budgetAlert, budgetForMonth, summarize } from './finance'
import { categoryEnabled, fromItemPriority, topPriority } from './notifications'
import { ruleStatus, ruleTitle } from './recurring'
import { isOpen } from './tasks'

/** The tables each category needs, so the app only loads what the person has not switched off. */
export const SOURCE_TABLES = {
  task: ['tasks'],
  habit: ['habits', 'habit_logs'],
  workout: ['workouts', 'routines'],
  job: ['interview_events', 'job_applications'],
  bill: ['recurring_rules', 'transactions', 'budgets'],
  study: ['learning_topics'],
  goal: ['goals', 'milestones'],
}
/** Categories that smart notifications can come from, in the order the preferences list them. */
export const SOURCE_KINDS = Object.keys(SOURCE_TABLES)
export const sourceTables = (prefs, settings) => (settings.smart ? [...new Set(SOURCE_KINDS.filter((k) => categoryEnabled(prefs, k)).flatMap((k) => SOURCE_TABLES[k]))] : [])

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
/** "A, B, C +2 more" */
const names = (list, max = 3) => list.slice(0, max).join(' · ') + (list.length > max ? ` · +${list.length - max} more` : '')

/**
 * @param d    raw rows, named as todayAgenda names them: { tasks, habits, habitLogs, workouts, routines, interviews, applications, topics,
 *             recurringRules, goals, milestones, transactions, budgets }. Anything missing counts as empty.
 * @param ctx  { nowMs, tz, settings: notificationSettings(), prefs: notification_prefs, user: { week_starts_on, workout_plan, monthly_budget_paise, currency } }
 * @returns candidates: { key, kind, priority, title, body, link, dueMs, expiresMs }. One is due when dueMs <= now < expiresMs (see dueCandidates).
 */
export function sourceCandidates(d, { nowMs, tz, settings, prefs = {}, user = {} }) {
  if (!settings.smart) return []
  const today = dateStrInTz(nowMs, tz)
  const tomorrow = addDays(today, 1)
  const at = (day, time) => zonedToMs(day, time, tz)
  const morning = at(today, settings.morning)
  const evening = at(today, settings.evening)
  const endOfDay = at(tomorrow, '00:00')
  const on = (kind) => categoryEnabled(prefs, kind)
  const money = (paise) => formatMoney(paise, user.currency)
  const out = []
  const push = (c) => out.push({ priority: 'normal', body: '', ...c })

  // The agenda already knows what is on for today (tasks, habits, the planned workout, revisions, follow-ups, bills); ask it rather than re-deciding.
  // A category that is switched off is passed in empty, so it can't leak into a digest.
  const agenda = todayAgenda(
    {
      tasks: on('task') ? d.tasks : [],
      habits: on('habit') ? d.habits : [],
      habitLogs: on('habit') ? d.habitLogs : [],
      workouts: on('workout') ? d.workouts : [],
      routines: on('workout') ? d.routines : [],
      applications: on('job') ? d.applications : [],
      topics: on('study') ? d.topics : [],
      recurringRules: on('bill') ? d.recurringRules : [],
    },
    { today, tz, weekStartsOn: user.week_starts_on ?? 1, workoutPlan: user.workout_plan ?? {} },
  )
  const open = [...agenda.timed, ...agenda.anytime]
  const ofKind = (kind) => open.filter((i) => i.kind === kind)

  // ---- tasks
  if (on('task')) {
    const due = ofKind('task')
    if (due.length)
      push({
        key: `src:tasks-today:${today}`,
        kind: 'task',
        priority: topPriority(due.map((i) => fromItemPriority(i.priority))),
        title: due.length === 1 ? `Due today: ${due[0].title}` : `${due.length} tasks due today`,
        body: due.length === 1 ? '' : names(due.map((i) => i.title)),
        link: '/planner',
        dueMs: morning,
        expiresMs: endOfDay,
      })
    const late = (d.tasks ?? []).filter((t) => isOpen(t) && t.due_date && t.due_date < today)
    if (late.length)
      push({
        key: `src:tasks-overdue:${today}`,
        kind: 'task',
        priority: 'high',
        title: plural(late.length, 'overdue task'),
        body: names(late.map((t) => t.title)),
        link: '/planner',
        dueMs: morning,
        expiresMs: endOfDay,
      })
  }

  // ---- habits: a check-in in the evening, only if some are still to do
  if (on('habit')) {
    const left = ofKind('habit')
    if (left.length)
      push({
        key: `src:habits:${today}`,
        kind: 'habit',
        title: plural(left.length, 'habit') + ' left today',
        body: names(left.map((i) => i.title)),
        link: '/habits',
        dueMs: evening,
        expiresMs: endOfDay,
      })
  }

  // ---- fitness: the planned workout, if it has not been done
  if (on('workout')) {
    const w = ofKind('workout')[0]
    if (w) push({ key: `src:workout:${today}`, kind: 'workout', title: `Today’s workout: ${w.title}`, body: 'Planned for today', link: '/fitness', dueMs: morning, expiresMs: endOfDay })
  }

  // ---- jobs: an interview heads-up, and the day's follow-ups
  if (on('job')) {
    const lead = settings.lead_minutes * 60_000
    const company = (id) => (d.applications ?? []).find((a) => a.id === id)?.company
    for (const e of d.interviews ?? []) {
      if (e.status !== 'scheduled' || !e.scheduled_at) continue
      const start = Date.parse(e.scheduled_at)
      if (start <= nowMs || start - lead > nowMs + 86_400_000) continue // already begun, or more than a day away
      const when = localDayMinutes(start, tz)
      const day = when.date === today ? 'today' : when.date === tomorrow ? 'tomorrow' : when.date
      push({
        key: `src:interview:${e.id}:${settings.lead_minutes}`,
        kind: 'job',
        priority: 'high',
        title: `Interview: ${[company(e.application_id), e.round_name].filter(Boolean).join(' · ') || 'scheduled'}`,
        body: `Starts ${day} at ${fmtClock(when.minutes, true)}`,
        link: '/jobs',
        dueMs: start - lead,
        expiresMs: start,
      })
    }
    const follow = ofKind('followup')
    if (follow.length)
      push({
        key: `src:followups:${today}`,
        kind: 'job',
        title: follow.length === 1 ? follow[0].title : `${follow.length} job follow-ups due today`,
        body: follow.length === 1 ? '' : names(follow.map((i) => i.title)),
        link: '/jobs',
        dueMs: morning,
        expiresMs: endOfDay,
      })
  }

  // ---- finance: bills due today and tomorrow, and the monthly budget
  if (on('bill')) {
    const bills = ofKind('bill').filter((i) => i.txnType === 'expense')
    if (bills.length)
      push({
        key: `src:bills-today:${today}`,
        kind: 'bill',
        priority: 'high',
        title: bills.length === 1 ? `${bills[0].title} is due today` : `${bills.length} bills due today`,
        body: bills.length === 1 ? money(bills[0].amount_paise) : names(bills.map((i) => `${i.title} ${money(i.amount_paise)}`)),
        link: '/finance',
        dueMs: morning,
        expiresMs: endOfDay,
      })
    const soon = (d.recurringRules ?? []).filter((r) => r.type === 'expense' && ruleStatus(r) === 'active' && r.next_date === tomorrow)
    if (soon.length)
      push({
        key: `src:bills-tomorrow:${tomorrow}`,
        kind: 'bill',
        title: soon.length === 1 ? `${ruleTitle(soon[0])} is due tomorrow` : `${soon.length} bills due tomorrow`,
        body: soon.length === 1 ? money(soon[0].amount_paise) : names(soon.map((r) => `${ruleTitle(r)} ${money(r.amount_paise)}`)),
        link: '/finance',
        dueMs: evening,
        expiresMs: endOfDay,
      })
    const month = monthKey(today)
    const alert = budgetAlert(summarize(d.transactions ?? [], month, budgetForMonth(d.budgets ?? [], month, user.monthly_budget_paise ?? 0)))
    if (alert)
      push({
        key: `src:budget:${month}:${alert.level}`,
        kind: 'bill',
        priority: alert.level === 'danger' ? 'high' : 'normal',
        title: alert.level === 'danger' ? `Over budget by ${money(alert.overBy)}` : `${alert.percent}% of this month’s budget used`,
        body: alert.level === 'danger' ? `You have spent ${alert.percent}% of this month’s budget` : `${money(alert.left)} left this month`,
        link: '/finance',
        dueMs: 0, // as soon as it is true
        expiresMs: at(addDays(monthEnd(today), 1), '00:00'),
      })
  }

  // ---- learning
  if (on('study')) {
    const revise = ofKind('revision')
    if (revise.length)
      push({
        key: `src:revision:${today}`,
        kind: 'study',
        title: revise.length === 1 ? revise[0].title : `${revise.length} topics to revise today`,
        body: revise.length === 1 ? '' : names(revise.map((i) => i.title.replace(/^Revise /, ''))),
        link: '/learning',
        dueMs: morning,
        expiresMs: endOfDay,
      })
  }

  // ---- goals and milestones due today or tomorrow
  if (on('goal')) {
    const live = (d.goals ?? []).filter((g) => g.status === 'active')
    const liveIds = new Set(live.map((g) => g.id))
    const items = [
      ...live.filter((g) => g.due_date === today || g.due_date === tomorrow).map((g) => ({ title: g.title, due: g.due_date })),
      ...(d.milestones ?? []).filter((m) => !m.done && liveIds.has(m.goal_id) && (m.due_date === today || m.due_date === tomorrow)).map((m) => ({ title: m.title, due: m.due_date })),
    ]
    if (items.length) {
      const now = items.filter((i) => i.due === today)
      push({
        key: `src:goals:${today}`,
        kind: 'goal',
        priority: now.length ? 'high' : 'normal',
        title: items.length === 1 ? `${items[0].title} is due ${items[0].due === today ? 'today' : 'tomorrow'}` : plural(items.length, 'goal deadline') + ' coming up',
        body: items.length === 1 ? '' : names(items.map((i) => `${i.title} (${i.due === today ? 'today' : 'tomorrow'})`)),
        link: '/goals',
        dueMs: morning,
        expiresMs: endOfDay,
      })
    }
  }
  return out
}

/** The candidates whose time has come and has not passed. A late app still gets today's digests; yesterday's are gone. */
export const dueCandidates = (candidates, nowMs) => candidates.filter((c) => c.dueMs <= nowMs && nowMs < c.expiresMs)
