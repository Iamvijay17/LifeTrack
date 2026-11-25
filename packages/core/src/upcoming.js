// What is coming up across modules, for the dashboard: one list instead of checking each screen.
import { addDays, dateStrInTz, timeStrInTz } from '@lifetrack/utils'
import { ruleStatus, ruleTitle } from './recurring'

const isOpenTask = (t) => t.status === 'pending' || t.status === 'in_progress'
const CLOSED_APPLICATION = ['selected', 'offer', 'rejected', 'withdrawn']

/**
 * Deadlines in the next `days` days, soonest first. Today's tasks are left out (the priorities list shows them) and overdue tasks
 * collapse into one row, so a backlog can't push out the interview tomorrow. `kind`: overdue | task | interview | followup | goal | milestone | reminder | recurring.
 * A recurring rule shows only its next charge (with `amount_paise` and `txnType`), so a daily rule can't fill the list.
 */
export function upcomingItems({ tasks = [], interviews = [], applications = [], goals = [], milestones = [], reminders = [], recurring = [] }, { today, tz, nowMs = Date.now(), days = 7, limit = 8 }) {
  const until = addDays(today, days)
  const inWindow = (d) => d && d <= until
  const appOf = (id) => applications.find((a) => a.id === id)
  const items = []

  const overdue = tasks.filter((t) => isOpenTask(t) && t.due_date && t.due_date < today)
  if (overdue.length) items.push({ id: 'overdue', kind: 'overdue', title: `${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}`, date: overdue.map((t) => t.due_date).sort()[0], overdue: true })

  for (const t of tasks)
    if (isOpenTask(t) && t.due_date > today && inWindow(t.due_date)) items.push({ id: t.id, kind: 'task', refId: t.id, title: t.title, date: t.due_date })

  const now = new Date(nowMs).toISOString()
  for (const e of interviews) {
    if (e.status !== 'scheduled' || e.scheduled_at < now) continue
    const date = dateStrInTz(e.scheduled_at, tz)
    const app = appOf(e.application_id)
    if (inWindow(date)) items.push({ id: e.id, kind: 'interview', refId: e.application_id, title: [app?.company, e.round_name].filter(Boolean).join(' · ') || 'Interview', date, time: timeStrInTz(new Date(e.scheduled_at), tz).slice(0, 5) })
  }

  for (const a of applications)
    if (!CLOSED_APPLICATION.includes(a.status) && inWindow(a.followup_date)) items.push({ id: `followup-${a.id}`, kind: 'followup', refId: a.id, title: `Follow up with ${a.company}`, date: a.followup_date, overdue: a.followup_date < today })

  const active = new Set(goals.filter((g) => g.status === 'active').map((g) => g.id))
  for (const g of goals)
    if (g.status === 'active' && inWindow(g.due_date)) items.push({ id: g.id, kind: 'goal', refId: g.id, title: g.title, date: g.due_date, overdue: g.due_date < today })
  for (const m of milestones)
    if (!m.done && active.has(m.goal_id) && inWindow(m.due_date)) items.push({ id: m.id, kind: 'milestone', refId: m.goal_id, title: m.title, date: m.due_date, overdue: m.due_date < today })

  for (const r of reminders)
    if (r.active && r.remind_date >= today && inWindow(r.remind_date)) items.push({ id: r.id, kind: 'reminder', refId: r.id, title: r.title, date: r.remind_date, time: r.remind_time?.slice(0, 5) })

  for (const r of recurring)
    if (ruleStatus(r) === 'active' && r.next_date >= today && inWindow(r.next_date)) items.push({ id: r.id, kind: 'recurring', refId: r.id, title: ruleTitle(r), date: r.next_date, amount_paise: r.amount_paise, txnType: r.type })

  const rank = (x) => (x.overdue ? 0 : 1)
  const all = items.sort((a, b) => rank(a) - rank(b) || a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
  return { items: all.slice(0, limit), more: Math.max(0, all.length - limit) }
}

/** "Overdue", "Today", "Tomorrow" or a short date. `fmt(date)` is the caller's date formatter. */
export function dueLabel(item, today, fmt) {
  if (item.overdue) return item.kind === 'overdue' ? 'Overdue' : `Overdue · ${fmt(item.date)}`
  const day = item.date === today ? 'Today' : item.date === addDays(today, 1) ? 'Tomorrow' : fmt(item.date)
  return item.time ? `${day}, ${item.time}` : day
}
