// Desktop Companion: the small window's data and layout rules, as pure functions. No React, no storage, nothing written.
import { groupTasksForDay } from './tasks'
import { upcomingItems } from './upcoming'

export const WIDGETS = ['add', 'progress', 'habits', 'timer', 'upcoming']
export const WIDGET_LABEL = {
  add: 'Quick add',
  progress: "Today's tasks",
  habits: "Today's habits",
  timer: 'Focus timer',
  upcoming: 'Upcoming reminders',
}
export const THEMES = ['app', 'dark', 'light'] // 'app' follows the theme set in Settings
export const DENSITIES = ['comfortable', 'compact']

export const DEFAULT_COMPANION = { order: [...WIDGETS], hidden: [], theme: 'app', density: 'comfortable', collapsed: false }

/** Accepts anything (stale, hand-edited) and returns a complete, valid layout. Unknown widgets are dropped; widgets added later keep a default place at the end. */
export function normalizeCompanionPrefs(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const seen = new Set()
  const order = (Array.isArray(r.order) ? r.order : []).filter((w) => WIDGETS.includes(w) && !seen.has(w) && seen.add(w))
  for (const w of WIDGETS) if (!seen.has(w)) order.push(w)
  const hidden = [...new Set((Array.isArray(r.hidden) ? r.hidden : []).filter((w) => WIDGETS.includes(w)))]
  return {
    order,
    hidden,
    theme: THEMES.includes(r.theme) ? r.theme : DEFAULT_COMPANION.theme,
    density: DENSITIES.includes(r.density) ? r.density : DEFAULT_COMPANION.density,
    collapsed: r.collapsed === true,
  }
}

/** The widgets to draw, in order, minus the hidden ones. */
export const visibleWidgets = (prefs) => prefs.order.filter((w) => !prefs.hidden.includes(w))

/** Move a widget one place up (-1) or down (+1) among ALL widgets (hidden ones keep their slot, so un-hiding returns it where it was). */
export function moveWidget(order, id, by) {
  const at = order.indexOf(id)
  const to = at + by
  if (at < 0 || to < 0 || to >= order.length) return order
  const next = [...order]
  next.splice(to, 0, next.splice(at, 1)[0])
  return next
}

export const toggleWidget = (prefs, id) => ({
  ...prefs,
  hidden: prefs.hidden.includes(id) ? prefs.hidden.filter((w) => w !== id) : [...prefs.hidden, id],
})

/**
 * What the small window shows for today.
 * tasks:  done/total of today's tasks (cancelled and skipped ones are not part of the plan) and the next few still open (overdue first).
 * habits: habits due today or already done today, paused and archived ones left out, with how many are done.
 * @param {{ tasks, habitStats, goals, milestones, reminders, interviews, applications, recurring }} src  habitStats = buildHabitStats rows
 */
export function companionSnapshot(src, { today, tz, nowMs, limit = 5 }) {
  const g = groupTasksForDay(src.tasks ?? [], today, today)
  const open = [...g.overdue, ...g.priorities, ...g.pending]
  const planned = open.length - g.overdue.length + g.done.length
  const habits = (src.habitStats ?? [])
    .filter(
      (s) =>
        !s.habit.archived_at && !(s.habit.pauses ?? []).some((p) => p.end_date == null || (today >= p.start_date && today <= p.end_date)),
    )
    .filter((s) => s.due || s.today?.status === 'done')
    .map((s) => ({
      id: s.habit.id,
      name: s.habit.name,
      color: s.habit.color,
      done: s.today?.status === 'done',
      streak: s.current,
      unit: s.unit,
    }))
  const habitsDone = habits.filter((h) => h.done).length
  const { items } = upcomingItems(
    {
      tasks: src.tasks ?? [],
      goals: src.goals ?? [],
      milestones: src.milestones ?? [],
      reminders: src.reminders ?? [],
      interviews: src.interviews ?? [],
      applications: src.applications ?? [],
      recurring: [],
    },
    { today, tz, nowMs, days: 7, limit: 50 },
  )
  // Reminders are the point of this list. Other deadlines only fill the space if there are no reminders.
  const reminders = items.filter((i) => i.kind === 'reminder')
  const upcoming = (reminders.length ? reminders : items).slice(0, limit)
  return {
    tasks: {
      total: planned,
      done: g.done.length,
      pct: planned ? g.done.length / planned : null,
      open: open.slice(0, limit),
      more: Math.max(0, open.length - limit),
      overdue: g.overdue.length,
    },
    habits: { list: habits, done: habitsDone, total: habits.length, pct: habits.length ? habitsDone / habits.length : null },
    upcoming: { items: upcoming, remindersOnly: reminders.length > 0 },
  }
}
