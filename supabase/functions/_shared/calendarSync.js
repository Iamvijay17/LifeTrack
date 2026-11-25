// Google Calendar ⇄ LifeTrack: decides what to do, and does nothing itself. Pure functions (no network, no database), so it is tested in Node and run
// by the Edge Function under Deno.
//
// Rules this encodes:
//  * An event is never created twice. A LifeTrack event is linked to its Google copy by `external_id`; a copy LifeTrack made is also tagged on Google
//    with `extendedProperties.private.lifetrackId`, so a lost link is recovered instead of duplicated. An unlinked event that matches by title and time
//    is linked, not copied.
//  * Each linked event carries `external_hash`: the fingerprint both sides had when they last agreed. A side that differs from it has changed.
//    Only one side changed → copy that change over. BOTH changed (and differently) → a conflict: nothing is overwritten until the person chooses.
//  * Nothing is ever deleted. An event gone from Google is reported (`remoteGone`) and kept in LifeTrack.
//  * Recurring events are not synced (reported as skipped), so a series is never flattened into copies.

/** A short stable fingerprint of the fields that sync (FNV-1a over the canonical text). */
export function fingerprint(e) {
  const text = JSON.stringify([e.title ?? '', e.description ?? '', e.location ?? '', e.starts_at, e.ends_at, !!e.all_day])
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** The instant (ISO, UTC) at which the calendar day `ymd` begins in `timeZone`. */
export function zonedMidnight(ymd, timeZone) {
  const [y, m, d] = ymd.split('-').map(Number)
  let t = Date.UTC(y, m - 1, d)
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]))
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
    const diff = shown - Date.UTC(y, m - 1, d)
    if (diff === 0) break
    t -= diff
  }
  return new Date(t).toISOString()
}
/** The calendar day (YYYY-MM-DD) an instant falls on in `timeZone`. */
export const dayInZone = (iso, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

/** A Google event as the LifeTrack shape, or null when it cannot be mapped (recurring, no times). */
export function fromGoogle(g, timeZone) {
  if (!g || g.status === 'cancelled') return null
  const s = g.start?.dateTime ?? g.start?.date
  const e = g.end?.dateTime ?? g.end?.date
  if (!s || !e) return null
  const all_day = !g.start.dateTime
  const starts_at = all_day ? zonedMidnight(s, timeZone) : new Date(s).toISOString()
  const ends_at = all_day ? zonedMidnight(e, timeZone) : new Date(e).toISOString()
  if (!(Date.parse(ends_at) > Date.parse(starts_at))) return null
  return {
    title: (g.summary ?? '').trim().slice(0, 200) || '(No title)',
    description: (g.description ?? '').slice(0, 4000),
    location: (g.location ?? '').slice(0, 200),
    starts_at,
    ends_at,
    all_day,
  }
}

/** A LifeTrack event as a Google event body. */
export function toGoogle(l, timeZone) {
  const body = { summary: l.title, description: l.description ?? '', location: l.location ?? '', extendedProperties: { private: { lifetrackId: l.id } } }
  if (l.all_day) {
    body.start = { date: dayInZone(l.starts_at, timeZone) }
    body.end = { date: dayInZone(l.ends_at, timeZone) }
  } else {
    body.start = { dateTime: l.starts_at, timeZone }
    body.end = { dateTime: l.ends_at, timeZone }
  }
  return body
}

const keyOf = (e) => `${(e.title ?? '').trim().toLowerCase()}|${new Date(e.starts_at).getTime()}|${new Date(e.ends_at).getTime()}`

/**
 * @param local        LifeTrack events (rows) in the sync window
 * @param remote       Google events (API items) in the same window
 * @param timeZone     the person's time zone
 * @param resolutions  { [localId]: 'local' | 'remote' } choices made for earlier conflicts
 */
export function planCalendarSync({ local, remote, timeZone, resolutions = {} }) {
  const plan = { importLocal: [], exportRemote: [], updateLocal: [], updateRemote: [], link: [], conflicts: [], remoteGone: [], unchanged: 0, skippedRecurring: 0 }
  const syncable = (l) => !l.rrule
  const byExternal = new Map(local.filter((l) => l.external_id).map((l) => [l.external_id, l]))
  const byId = new Map(local.map((l) => [l.id, l]))
  const seenLocal = new Set()
  const unlinked = new Map()
  for (const l of local) if (!l.external_id && syncable(l)) unlinked.set(keyOf(l), [...(unlinked.get(keyOf(l)) ?? []), l])

  for (const g of remote) {
    if (g.recurrence || g.recurringEventId) {
      plan.skippedRecurring++
      continue
    }
    const r = fromGoogle(g, timeZone)
    if (!r) continue
    const tagged = g.extendedProperties?.private?.lifetrackId
    let l = byExternal.get(g.id) ?? (tagged ? byId.get(tagged) : undefined)
    if (!l) {
      const same = unlinked.get(keyOf(r))?.shift() // an identical, unlinked event is the same event
      if (same) l = same
    }
    if (!l) {
      plan.importLocal.push({ remoteId: g.id, remote: r, hash: fingerprint(r) })
      continue
    }
    seenLocal.add(l.id)
    if (!syncable(l)) {
      plan.skippedRecurring++
      continue
    }
    const rh = fingerprint(r)
    const lh = fingerprint(l)
    const base = l.external_id === g.id ? l.external_hash : null // what both agreed last time (none when only just linked)
    if (lh === rh) {
      if (base === rh && l.external_id === g.id) plan.unchanged++
      else plan.link.push({ localId: l.id, remoteId: g.id, hash: rh })
      continue
    }
    const localChanged = base == null || lh !== base
    const remoteChanged = base == null || rh !== base
    const choice = resolutions[l.id]
    if (localChanged && remoteChanged && !choice) plan.conflicts.push({ localId: l.id, remoteId: g.id, local: pick(l), remote: r })
    else if ((localChanged && !remoteChanged) || choice === 'local') plan.updateRemote.push({ local: l, remoteId: g.id })
    else plan.updateLocal.push({ localId: l.id, remoteId: g.id, fields: r, hash: rh })
  }

  for (const l of local) {
    if (seenLocal.has(l.id) || !syncable(l)) continue
    if (l.external_id) plan.remoteGone.push({ localId: l.id, title: l.title }) // linked, but not on Google any more: keep it, tell the person
    else if (![...unlinked.values()].some((list) => list.includes(l))) continue // it was linked above
    else plan.exportRemote.push(l)
  }
  return plan
}
const pick = (e) => ({ title: e.title, description: e.description ?? '', location: e.location ?? '', starts_at: e.starts_at, ends_at: e.ends_at, all_day: !!e.all_day })
