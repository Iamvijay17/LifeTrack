// Challenge operations: everything that changes more than one row, or that must refuse something the database would also refuse (with words a
// person can read). The rules themselves live in @lifetrack/core/challenges; the database enforces the same ones (migration 0023).
import {
  challengeFromTemplate,
  challengeProblems,
  challengeProgress,
  checkinProblem,
  cleanEvidence,
  durationDays,
  effectiveCheckins,
  isClosed,
  normalizeMilestones,
  openPause,
  settlement,
  withPause,
  withResume,
} from '@lifetrack/core/challenges'
import { addDays } from '@lifetrack/utils'
import { AppError } from './errors'

const WRITABLE = ['title', 'description', 'kind', 'target', 'unit', 'start_date', 'end_date', 'category', 'color', 'habit_id', 'template_key', 'milestones', 'notes']
const first = (problems) => Object.values(problems)[0]

export function createChallengeApi(store) {
  const nowIso = () => new Date().toISOString()
  const rows = (t) => store.peek(t)
  const find = (id) => {
    const c = rows('challenges').find((x) => x.id === id)
    if (!c) throw new AppError('That challenge could not be found.')
    return c
  }
  const loadAll = () => Promise.all([store.load('challenges'), store.load('challenge_checkins'), store.load('habit_logs')])

  function clean(input) {
    const row = Object.fromEntries(WRITABLE.filter((k) => k in input).map((k) => [k, input[k]]))
    if ('title' in row) row.title = String(row.title ?? '').trim()
    if ('unit' in row) row.unit = String(row.unit ?? '').trim()
    if ('description' in row) row.description = String(row.description ?? '').trim()
    if ('notes' in row) row.notes = String(row.notes ?? '').trim()
    if ('milestones' in row) row.milestones = normalizeMilestones(row.milestones)
    if ('habit_id' in row && !row.habit_id) row.habit_id = null
    return row
  }
  function checkHabit(habitId) {
    if (!habitId) return
    const h = rows('habits').find((x) => x.id === habitId)
    if (!h || h.archived_at) throw new AppError('That habit is not available to link.')
  }

  // ---------------------------------------------------------------- the challenge itself
  async function createChallenge(input) {
    const row = clean(input)
    const problem = first(challengeProblems(row))
    if (problem) throw new AppError(problem)
    checkHabit(row.habit_id)
    return store.insert('challenges', row)
  }

  async function updateChallenge(id, patch) {
    await loadAll()
    const c = find(id)
    if (isClosed(c)) throw new AppError('A finished challenge can no longer be edited.')
    const next = { ...c, ...clean(patch) }
    const problem = first(challengeProblems(next))
    if (problem) throw new AppError(problem)
    const own = rows('challenge_checkins').filter((k) => k.challenge_id === id)
    if (next.kind !== c.kind && own.length) throw new AppError('The kind of a challenge cannot change once it has check-ins.')
    const stray = own.filter((k) => k.checkin_date < next.start_date || k.checkin_date > next.end_date).length
    if (stray) throw new AppError(`${stray} check-in${stray === 1 ? '' : 's'} would fall outside the new dates. Remove ${stray === 1 ? 'it' : 'them'} first.`)
    if (patch.habit_id !== undefined && patch.habit_id !== c.habit_id) checkHabit(next.habit_id)
    return store.update('challenges', id, clean(patch))
  }

  const deleteChallenge = (id) => store.remove('challenges', id)

  // ---------------------------------------------------------------- pause, resume, cancel, complete
  async function pauseChallenge(id, today) {
    const c = find(id)
    if (c.status === 'paused') return c
    if (c.status !== 'active') throw new AppError('Only a running challenge can be paused.')
    return store.update('challenges', id, { status: 'paused', pauses: withPause(c, today) })
  }

  async function resumeChallenge(id, today) {
    const c = find(id)
    if (c.status === 'active') return c
    if (c.status !== 'paused') throw new AppError('Only a paused challenge can be resumed.')
    if (!openPause(c) && c.pauses.length === 0) return store.update('challenges', id, { status: 'active' })
    return store.update('challenges', id, { status: 'active', pauses: withResume(c, today) })
  }

  async function cancelChallenge(id) {
    const c = find(id)
    if (c.status === 'cancelled') return c
    if (c.status === 'completed') throw new AppError('A completed challenge cannot be cancelled.')
    return store.update('challenges', id, { status: 'cancelled', cancelled_at: nowIso() })
  }

  /** Finish early: records what was achieved so far. */
  async function completeChallenge(id, today) {
    await loadAll()
    const c = find(id)
    if (c.status !== 'active' && c.status !== 'paused') throw new AppError('Only a running challenge can be completed.')
    const p = challengeProgress(c, rows('challenge_checkins'), rows('habit_logs'), today)
    return store.update('challenges', id, { status: 'completed', completed_at: nowIso(), final_pct: p.pct })
  }

  // `byTargetOnly`: a check-in may finish a total challenge by reaching its target, but never closes one because time ran out (that is settleChallenges'
  // job), so several missed days can still be filled in one after another.
  async function settleOne(c, today, { byTargetOnly = false } = {}) {
    const s = settlement(c, rows('challenge_checkins'), rows('habit_logs'), today)
    if (!s || (byTargetOnly && c.kind !== 'total')) return null
    if (byTargetOnly && s.final_pct !== 100) return null
    return store.update('challenges', c.id, { ...s, completed_at: nowIso() })
  }

  /** Closes every challenge that has finished (target reached, or the end date has passed). Safe to run any time, on any device, any number of times. */
  async function settleChallenges(today) {
    await loadAll()
    const done = []
    for (const c of rows('challenges')) {
      if (c.status !== 'active' && c.status !== 'paused') continue
      const closed = await settleOne(c, today)
      if (closed) done.push(closed)
    }
    return done
  }

  // ---------------------------------------------------------------- check-ins
  /**
   * Record one day. A day can have only ONE check-in: a second attempt is refused here (with a clear message) and by the database's unique
   * constraint (so two devices cannot both succeed). Resolves { checkin, completed } where `completed` is the challenge if this check-in finished it.
   */
  async function checkInChallenge(id, { date, amount = 1, note = '', evidence = [], today }) {
    await loadAll()
    const c = find(id)
    const map = effectiveCheckins(c, rows('challenge_checkins'), rows('habit_logs'))
    const problem = checkinProblem(c, date, today, map, amount)
    if (problem) throw new AppError(problem)
    const ev = cleanEvidence(evidence)
    if (ev.error) throw new AppError(ev.error)
    if (String(note).length > 500) throw new AppError('Keep the note under 500 characters.')
    let checkin
    try {
      checkin = await store.insert('challenge_checkins', { challenge_id: id, checkin_date: date, amount, note: String(note).trim(), evidence: ev.list })
    } catch (e) {
      if (e?.code === '23505') throw new AppError('You already checked in for that day.', { code: '23505' })
      throw e
    }
    const completed = await settleOne(c, today, { byTargetOnly: true })
    return { checkin, completed }
  }

  async function updateCheckin(checkinId, patch, today) {
    await loadAll()
    const k = rows('challenge_checkins').find((x) => x.id === checkinId)
    if (!k) throw new AppError('That check-in could not be found.')
    const c = find(k.challenge_id)
    if (isClosed(c)) throw new AppError('A finished challenge can no longer be changed.')
    const out = {}
    if (patch.amount !== undefined) {
      if (!Number.isInteger(patch.amount) || patch.amount < 1) throw new AppError('Enter a whole amount of at least 1.')
      if (patch.amount > 10000000) throw new AppError('That amount is too large.')
      out.amount = patch.amount
    }
    if (patch.note !== undefined) {
      if (String(patch.note).length > 500) throw new AppError('Keep the note under 500 characters.')
      out.note = String(patch.note).trim()
    }
    if (patch.evidence !== undefined) {
      const ev = cleanEvidence(patch.evidence)
      if (ev.error) throw new AppError(ev.error)
      out.evidence = ev.list
    }
    const row = await store.update('challenge_checkins', checkinId, out)
    const completed = today ? await settleOne(c, today, { byTargetOnly: true }) : null
    return { checkin: row, completed }
  }

  /** Adds to a day's amount (a second run, another few pages) without creating a second check-in. */
  async function addToCheckin(checkinId, extra, today) {
    const k = rows('challenge_checkins').find((x) => x.id === checkinId)
    if (!k) throw new AppError('That check-in could not be found.')
    if (!Number.isInteger(extra) || extra < 1) throw new AppError('Enter a whole amount of at least 1.')
    return updateCheckin(checkinId, { amount: k.amount + extra }, today)
  }

  async function removeCheckin(checkinId) {
    await loadAll()
    const k = rows('challenge_checkins').find((x) => x.id === checkinId)
    if (!k) return null
    const c = find(k.challenge_id)
    if (isClosed(c)) throw new AppError('A finished challenge can no longer be changed.')
    return store.remove('challenge_checkins', checkinId)
  }

  // ---------------------------------------------------------------- templates
  /** Save (or, with `entity`, update) a reusable template. Checked with the same rules as a challenge of that length. */
  async function saveChallengeTemplate(values, entity) {
    const days = values.duration_days ?? 30
    const probe = { title: values.name, kind: values.kind ?? 'daily', target: values.target ?? 1, unit: values.unit ?? '', start_date: '2026-01-01', end_date: addDays('2026-01-01', Math.max(0, days - 1)), color: values.color ?? '#8B5CF6' }
    if (!Number.isInteger(days) || days < 1) throw new AppError('A template must last at least one day.')
    const problem = first(challengeProblems(probe))
    if (problem) throw new AppError(problem.replace('challenge', 'template'))
    const row = { ...values, name: String(values.name).trim(), milestones: normalizeMilestones(values.milestones) }
    return entity ? store.update('challenge_templates', entity.id, row) : store.insert('challenge_templates', row)
  }

  /** A new challenge from a template (built-in or saved), starting on `start`. */
  async function startFromTemplate(template, start, overrides = {}) {
    return createChallenge({ ...challengeFromTemplate(template, start), ...overrides })
  }

  return {
    createChallenge,
    updateChallenge,
    deleteChallenge,
    pauseChallenge,
    resumeChallenge,
    cancelChallenge,
    completeChallenge,
    settleChallenges,
    checkInChallenge,
    updateCheckin,
    addToCheckin,
    removeCheckin,
    saveChallengeTemplate,
    startFromTemplate,
    challengeLength: durationDays,
  }
}
