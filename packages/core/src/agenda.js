// The Today agenda: everything that belongs to one day, across modules, in the order a person would do it.
// Pure: takes raw table rows. Shared by web and mobile so both show the same list.
import { dateStrInTz, timeStrInTz, weekday } from '@lifetrack/utils'
import { habitStats } from './habits'
import { byPriority, isOpen } from './tasks'
import { ruleTitle } from './recurring'

const CLOSED_APPLICATION = ['selected', 'offer', 'rejected', 'withdrawn']
/** Anytime items are listed in this order; tasks come first because they are the user's own commitments. */
const KIND_ORDER = ['task', 'habit', 'workout', 'reminder', 'revision', 'followup', 'bill']

/**
 * @param d { tasks, habits, habitLogs, workouts, routines, interviews, applications, reminders, topics, recurringRules }
 * @returns { timed, anytime, done, total, doneCount } where each item is
 *   { id, kind, title, time?, done, refId, source? } and `source` is the row to hand back to an action (tasks and habits can be completed from the list).
 * Timed items (interviews, reminders) form a rail ordered by time. Everything else sits under "anytime". Finished items sink into `done`.
 */
export function todayAgenda(d, { today, tz, weekStartsOn = 1, workoutPlan = {} }) {
  const timed = []
  const anytime = []
  const done = []
  const put = (item) => (item.done ? done : item.time ? timed : anytime).push(item)

  for (const t of (d.tasks ?? []).filter((t) => t.due_date === today && (isOpen(t) || t.status === 'done')).sort(byPriority))
    put({ id: t.id, kind: 'task', title: t.title, done: t.status === 'done', refId: t.id, priority: t.priority, source: t })

  for (const s of habitStats(d.habits ?? [], d.habitLogs ?? [], today, weekStartsOn)) {
    if (s.habit.archived_at) continue
    const isDone = s.today?.status === 'done'
    if (s.today && !isDone) continue // skipped or rest day: off the plan
    if (isDone || s.due) put({ id: s.habit.id, kind: 'habit', title: s.habit.name, done: isDone, refId: s.habit.id, source: s.habit })
  }

  const plan = workoutPlan[String(weekday(today))]
  const todays = (d.workouts ?? []).filter((w) => w.workout_date === today)
  const did = todays.find((w) => w.status === 'completed')
  const off = todays.some((w) => w.status === 'rest' || w.status === 'skipped')
  if (did) put({ id: did.id, kind: 'workout', title: did.name, done: true, refId: did.id })
  else if (!off && plan && plan !== 'rest')
    put({ id: `workout-${today}`, kind: 'workout', title: (d.routines ?? []).find((r) => r.id === plan)?.name ?? 'Workout', done: false, refId: plan })

  for (const e of d.interviews ?? []) {
    if (e.status === 'cancelled' || !e.scheduled_at || dateStrInTz(e.scheduled_at, tz) !== today) continue
    const app = (d.applications ?? []).find((a) => a.id === e.application_id)
    put({
      id: e.id,
      kind: 'interview',
      title: [app?.company, e.round_name].filter(Boolean).join(' · ') || 'Interview',
      time: timeStrInTz(new Date(e.scheduled_at), tz).slice(0, 5),
      done: e.status === 'completed',
      refId: e.application_id,
    })
  }

  for (const r of d.reminders ?? [])
    if (r.active && r.remind_date === today) put({ id: r.id, kind: 'reminder', title: r.title, time: r.remind_time?.slice(0, 5), done: false, refId: r.id })

  for (const t of d.topics ?? [])
    if (!t.archived && (t.revision_dates ?? []).includes(today)) put({ id: `revision-${t.id}`, kind: 'revision', title: `Revise ${t.name}`, done: false, refId: t.id })

  for (const a of d.applications ?? [])
    if (a.followup_date === today && !CLOSED_APPLICATION.includes(a.status))
      put({ id: `followup-${a.id}`, kind: 'followup', title: `Follow up with ${a.company}`, done: false, refId: a.id })

  for (const r of d.recurringRules ?? [])
    if (r.active && r.next_date === today)
      put({ id: `bill-${r.id}`, kind: 'bill', title: ruleTitle(r), done: false, refId: r.id, amount_paise: r.amount_paise, txnType: r.type })

  const rank = (i) => KIND_ORDER.indexOf(i.kind)
  // Reminders carry a time but not always; one without a time is an anytime item like the rest.
  const withTime = timed.filter((i) => i.time).sort((a, b) => a.time.localeCompare(b.time))
  anytime.sort((a, b) => rank(a) - rank(b)) // stable: tasks keep their priority order
  return { timed: withTime, anytime, done, total: withTime.length + anytime.length + done.length, doneCount: done.length }
}

/** The first timed item that has not started yet (`nowTime` is 'HH:MM'), or null: where the "now" marker sits on the rail. */
export const nextTimed = (agenda, nowTime) => agenda.timed.find((i) => i.time >= nowTime) ?? null
