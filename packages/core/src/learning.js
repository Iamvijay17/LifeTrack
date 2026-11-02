import { addDays, eachDay, isValidDay, startOfWeek } from '@lifetrack/utils'
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

// ---- presentation helpers shared by the Learning screens
/** 'g:<goalId>' | 't:<topicId>' | '' → { goal_id, topic_id } (a goal also carries its topic). */
export function parseStudyTarget(v, goals) {
  if (v.startsWith('g:')) { const g = goals.find((x) => x.id === v.slice(2)); return { goal_id: g?.id ?? null, topic_id: g?.topic_id ?? null } }
  if (v.startsWith('t:')) return { goal_id: null, topic_id: v.slice(2) }
  return { goal_id: null, topic_id: null }
}
export const studyTargetValue = (s) => (s.goal_id ? `g:${s.goal_id}` : s.topic_id ? `t:${s.topic_id}` : '')
export const fmtHms = (secs) => [Math.floor(secs / 3600), Math.floor((secs % 3600) / 60), secs % 60].map((n) => String(n).padStart(2, '0')).join(':')
export const sessionName = (s, goals, topics) => goals.find((g) => g.id === s.goal_id)?.title ?? topics.find((t) => t.id === s.topic_id)?.name ?? 'General study'

/** Everything the Learning overview needs. Only completed sessions count. */
export function studyOverview(sessions, goals, today, weekStartsOn = 1) {
  const done = counted(sessions)
  const weekStart = startOfWeek(today, weekStartsOn)
  const weekEnd = addDays(weekStart, 6)
  const week = eachDay(weekStart, weekEnd).map((d) => ({ d, hours: Math.round((countedMinutes(done.filter((s) => s.session_date === d)) / 60) * 100) / 100 }))
  return {
    done,
    week,
    weekStart,
    running: sessions.find((s) => s.status === 'running') ?? null,
    todayMin: countedMinutes(done.filter((s) => s.session_date === today)),
    weekMin: countedMinutes(done.filter((s) => s.session_date >= weekStart && s.session_date <= weekEnd)),
    activeDays: week.filter((w) => w.hours > 0).length,
    problems: problemsSolved(sessions),
    activeGoals: goals.filter((g) => g.status === 'active').length,
    completedGoals: goals.filter((g) => g.status === 'completed').length,
    history: [...done].sort((a, b) => (b.session_date + b.created_at).localeCompare(a.session_date + a.created_at)),
  }
}

/** Revision state for a topic: due today, or the next upcoming date. */
export function topicRevision(topic, today) {
  const dates = topic.revision_dates ?? []
  const next = dates.filter((d) => d >= today).sort()[0] ?? null
  return { due: dates.includes(today), next }
}
export const isGoalOverdue = (g, today) => !!g.due_date && g.due_date < today && g.status === 'active'

/** Parse "2026-11-02, 2026-11-09" → sorted unique list; throws a friendly Error on an invalid date. */
export function parseRevisionDates(text) {
  const dates = String(text ?? '').split(/[\s,]+/).filter(Boolean)
  const bad = dates.find((d) => !isValidDay(d))
  if (bad) throw new Error(`"${bad}" isn't a valid date. Use YYYY-MM-DD, separated by commas.`)
  return [...new Set(dates)].sort()
}
