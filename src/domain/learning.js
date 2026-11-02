/** Only COMPLETED sessions count. Running timers and discarded sessions never contribute study time. */
export const counted = (sessions) => sessions.filter((s) => s.status === 'completed')
export const sessionMinutes = (s) => (s.status === 'completed' ? (s.duration_seconds ?? 0) / 60 : 0)
export const countedMinutes = (sessions) => sessions.reduce((a, s) => a + sessionMinutes(s), 0)
export const problemsSolved = (sessions) => counted(sessions).reduce((a, s) => a + (s.problems_solved ?? 0), 0)

export function goalMinutes(goal, sessions) {
  return countedMinutes(sessions.filter((s) => s.goal_id === goal.id || (!s.goal_id && goal.topic_id && s.topic_id === goal.topic_id)))
}
export function goalProgress(goal, sessions) {
  const done = goalMinutes(goal, sessions)
  const target = goal.target_minutes ?? 0
  return { done, target, percent: target > 0 ? Math.min(100, Math.round((done / target) * 100)) : null }
}

export function topicTotals(topics, sessions) {
  return topics.map((t) => {
    const mine = sessions.filter((s) => s.topic_id === t.id)
    return { topic: t, minutes: countedMinutes(mine), problems: problemsSolved(mine), sessions: counted(mine).length }
  })
}

/** Elapsed seconds of a running session, using a supplied "now" (ms). */
export const elapsedSeconds = (session, nowMs) => Math.max(0, Math.floor((nowMs - new Date(session.started_at).getTime()) / 1000))
export const MAX_REASONABLE_TIMER_SECONDS = 12 * 3600

// ------------------------------------------------------------------- targets
/** Study-target <select> values: 'g:<goalId>' | 't:<topicId>' | '' — parsed into the columns stored on a session. */
export const parseTarget = (v, goals) => {
  if (v.startsWith('g:')) {
    const g = goals.find((x) => x.id === v.slice(2))
    return { goal_id: g?.id ?? null, topic_id: g?.topic_id ?? null }
  }
  if (v.startsWith('t:')) return { goal_id: null, topic_id: v.slice(2) }
  return { goal_id: null, topic_id: null }
}
/** Inverse of parseTarget, for pre-filling the form when editing a session. */
export const targetValue = (s) => (s.goal_id ? `g:${s.goal_id}` : s.topic_id ? `t:${s.topic_id}` : '')

/** Display name of what a session was spent on. */
export const sessionName = (s, goals, topics) =>
  goals.find((g) => g.id === s.goal_id)?.title ?? topics.find((t) => t.id === s.topic_id)?.name ?? 'General study'

// ------------------------------------------------------------------ summaries
/** Hours studied per day for the 7 days starting at `weekStart` (for the weekly chart). */
export function weekSeries(completed, weekStart, days, label) {
  return days.map((d) => ({
    d,
    label: label(d),
    hours: Math.round((countedMinutes(completed.filter((s) => s.session_date === d)) / 60) * 100) / 100,
  }))
}

/** Completed sessions, newest first. */
export const historyOf = (completed) =>
  [...completed].sort((a, b) => (b.session_date + b.created_at).localeCompare(a.session_date + a.created_at))

/** Distinct topic group names, in first-seen order. */
export const topicGroups = (topics) => [...new Set(topics.map((t) => t.group_name))]

/** When a topic should next be revised: whether it is due today and the next upcoming revision date. */
export function revisionStatus(topic, today) {
  const dates = topic.revision_dates ?? []
  return { due: dates.includes(today), next: dates.filter((d) => d >= today).sort()[0] ?? null }
}
