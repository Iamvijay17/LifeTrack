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
