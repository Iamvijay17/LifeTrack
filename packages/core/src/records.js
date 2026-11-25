// Personal records and per-exercise progress. Computed from logged sets (nothing extra is stored), so editing a workout corrects them.

/** Sets of completed workouts, oldest first, each with its workout date. Sets with no reps never count. */
function countedSets(logs, workouts) {
  const dates = new Map(workouts.filter((w) => w.status === 'completed').map((w) => [w.id, w.workout_date]))
  return logs
    .filter((l) => dates.has(l.workout_id) && Number(l.reps) > 0)
    .map((l) => ({ name: l.exercise_name, reps: Number(l.reps), weight: Number(l.weight_kg) || 0, date: dates.get(l.workout_id) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** A heavier set beats a lighter one; at the same weight more reps win (so bodyweight exercises get a record too). */
const beats = (s, best) => s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)

/** Each exercise's best set and most recent training date; the most recently set records come first. */
export function personalRecords(logs, workouts) {
  const best = new Map()
  for (const s of countedSets(logs, workouts)) {
    const cur = best.get(s.name)
    if (!cur) best.set(s.name, { name: s.name, weight: s.weight, reps: s.reps, date: s.date, sessions: new Set([s.date]), last: s.date })
    else {
      cur.sessions.add(s.date)
      cur.last = s.date
      if (beats(s, cur)) Object.assign(cur, { weight: s.weight, reps: s.reps, date: s.date })
    }
  }
  return [...best.values()]
    .map(({ sessions, ...r }) => ({ ...r, sessions: sessions.size }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name))
}

/** One point per training day for an exercise: its heaviest set, its top reps and total volume. */
export function exerciseProgress(logs, workouts, name) {
  const byDay = new Map()
  for (const s of countedSets(logs, workouts)) {
    if (s.name !== name) continue
    const d = byDay.get(s.date) ?? { date: s.date, weight: 0, reps: 0, volume: 0 }
    d.weight = Math.max(d.weight, s.weight)
    d.reps = Math.max(d.reps, s.reps)
    d.volume += s.reps * s.weight
    byDay.set(s.date, d)
  }
  return [...byDay.values()]
}

export const recordText = (r) => (r.weight > 0 ? `${r.weight} kg × ${r.reps}` : `${r.reps} reps`)
