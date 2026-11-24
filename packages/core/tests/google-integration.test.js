import { beforeEach, describe, expect, it } from 'vitest'
import { handleCallback, handleRequest } from '../../../supabase/functions/google-integration/logic.js'
import { authUrl, signState, verifyState } from '../../../supabase/functions/_shared/google.js'
import { fingerprint, fromGoogle, planCalendarSync, toGoogle, zonedMidnight } from '../../../supabase/functions/_shared/calendarSync.js'

const ENV = { SUPABASE_URL: 'https://proj.supabase.co', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', OAUTH_STATE_SECRET: 'state-secret-state-secret', APP_ORIGIN: 'https://app.example.com' }
const TZ = 'Asia/Kolkata'
const NOW = Date.parse('2026-11-24T10:00:00Z')

// ------------------------------------------------------------------ fakes
function fakeStore() {
  const s = { tokens: new Map(), integrations: new Map(), events: [], calendar: [], seq: 0 }
  const k = (u, p) => `${u}|${p}`
  return {
    s,
    getToken: async (u, p) => s.tokens.get(k(u, p)) ?? null,
    saveToken: async (u, p, t) => void s.tokens.set(k(u, p), { user_id: u, provider: p, ...t }),
    saveAccessToken: async (u, p, a, e) => void Object.assign(s.tokens.get(k(u, p)), { access_token: a, access_expires_at: e }),
    deleteToken: async (u, p) => void s.tokens.delete(k(u, p)),
    getIntegration: async (u, p) => s.integrations.get(k(u, p)) ?? null,
    setIntegration: async (u, p, patch) => void s.integrations.set(k(u, p), { user_id: u, provider: p, status: 'connected', settings: {}, ...(s.integrations.get(k(u, p)) ?? {}), ...patch }),
    deleteIntegration: async (u, p) => void s.integrations.delete(k(u, p)),
    addEvent: async (u, p, kind, message) => void s.events.push({ u, p, kind, message }),
    getTimezone: async () => TZ,
    listCalendarEvents: async (u) => s.calendar.filter((e) => e.user_id === u),
    insertCalendarEvent: async (u, row) => {
      const r = { id: `L${++s.seq}`, user_id: u, rrule: null, ...row }
      s.calendar.push(r)
      return r
    },
    updateCalendarEvent: async (u, id, patch) => void Object.assign(s.calendar.find((e) => e.id === id && e.user_id === u), patch),
  }
}

/** A tiny Google: token endpoint, calendar events, Drive files. Records every call so tests can assert what was (not) sent. */
function fakeGoogle() {
  const g = { calls: [], events: [], files: [], revoked: false, refreshFails: false, folderId: null, seq: 0, grantScopes: null }
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })
  g.fetch = async (url, init = {}) => {
    const u = new URL(url)
    g.calls.push({ url, method: init.method ?? 'GET', headers: init.headers, body: init.body })
    if (u.host === 'oauth2.googleapis.com' && u.pathname === '/token') {
      const p = new URLSearchParams(init.body)
      if (p.get('grant_type') === 'refresh_token') return g.refreshFails ? json(400, { error: 'invalid_grant' }) : json(200, { access_token: 'access-2', expires_in: 3600 })
      const email = btoa(JSON.stringify({ email: 'me@gmail.com' })).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
      return json(200, { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600, id_token: `x.${email}.y`, scope: g.grantScopes ?? p.get('scope') ?? 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly openid email' })
    }
    if (u.host === 'oauth2.googleapis.com' && u.pathname === '/revoke') return ((g.revoked = true), json(200, {}))
    if (u.pathname.endsWith('/calendarList')) return json(200, { items: [{ id: 'primary', summary: 'Me', primary: true }] })
    if (/\/calendars\/[^/]+\/events$/.test(u.pathname) && (init.method ?? 'GET') === 'GET') return json(200, { items: g.events })
    if (/\/calendars\/[^/]+\/events$/.test(u.pathname) && init.method === 'POST') {
      const e = { id: `G${++g.seq}`, ...JSON.parse(init.body) }
      g.events.push(e)
      return json(200, e)
    }
    const m = u.pathname.match(/\/events\/([^/]+)$/)
    if (m && init.method === 'PATCH') return json(200, Object.assign(g.events.find((e) => e.id === decodeURIComponent(m[1])), JSON.parse(init.body)))
    if (u.pathname === '/drive/v3/files' && (init.method ?? 'GET') === 'GET') {
      const q = u.searchParams.get('q')
      if (q.includes('application/vnd.google-apps.folder')) return json(200, { files: g.folderId ? [{ id: g.folderId }] : [] })
      return json(200, { files: g.files.filter((f) => q.includes(`'${f.parents[0]}' in parents`)) })
    }
    if (u.pathname === '/drive/v3/files' && init.method === 'POST') return json(200, { id: (g.folderId = 'FOLDER') })
    if (u.pathname === '/upload/drive/v3/files') {
      const text = init.body.split('\r\n\r\n')[2].split('\r\n--')[0]
      const f = { id: `F${++g.seq}`, name: 'b.json', size: String(text.length), createdTime: new Date(NOW).toISOString(), parents: ['FOLDER'], text }
      g.files.push(f)
      return json(200, f)
    }
    const f = u.pathname.match(/\/drive\/v3\/files\/([^/]+)$/)
    if (f) {
      const file = g.files.find((x) => x.id === f[1]) ?? { id: f[1], parents: ['SOMEWHERE_ELSE'], text: 'private' }
      return u.searchParams.get('alt') === 'media' ? json(200, file.text) : json(200, { id: file.id, parents: file.parents })
    }
    return json(404, {})
  }
  return g
}

let store, google
const call = (body, over = {}) =>
  handleRequest({ method: 'POST', origin: ENV.APP_ORIGIN, authorization: 'Bearer ok', body, rawLength: 100, ...over }, { authenticate: async (a) => (a === 'Bearer ok' ? { userId: 'U1' } : null), store, fetch: google.fetch, env: ENV, now: () => NOW })
const connect = async (provider) => {
  const state = await signState({ userId: 'U1', provider }, ENV.OAUTH_STATE_SECRET, NOW)
  return handleCallback({ code: 'c', state }, { store, fetch: google.fetch, env: ENV, now: () => NOW })
}
beforeEach(() => {
  store = fakeStore()
  google = fakeGoogle()
})

// ------------------------------------------------------------------ OAuth
describe('OAuth state and the consent URL', () => {
  it('accepts its own state and rejects forged, altered or expired ones', async () => {
    const st = await signState({ userId: 'U1', provider: 'google_drive' }, 'k', NOW)
    expect(await verifyState(st, 'k', NOW)).toEqual({ userId: 'U1', provider: 'google_drive' })
    expect(await verifyState(st, 'other-key', NOW)).toBeNull()
    expect(await verifyState(st.replace(/^./, 'A'), 'k', NOW)).toBeNull()
    expect(await verifyState(st, 'k', NOW + 11 * 60_000)).toBeNull()
    expect(await verifyState('garbage', 'k', NOW)).toBeNull()
  })
  it('asks for the minimum scopes only', () => {
    const drive = new URL(authUrl({ provider: 'google_drive', state: 's', clientId: 'c', redirectUri: 'r' }))
    expect(drive.searchParams.get('scope').split(' ')).toEqual(['https://www.googleapis.com/auth/drive.file', 'openid', 'email'])
    expect(drive.searchParams.get('include_granted_scopes')).toBe('false')
    expect(drive.searchParams.get('access_type')).toBe('offline')
    const cal = new URL(authUrl({ provider: 'google_calendar', state: 's', clientId: 'c', redirectUri: 'r' }))
    expect(cal.searchParams.get('scope')).not.toMatch(/auth\/calendar(\s|$)/) // never the all-powerful calendar scope
  })
})

describe('the request gate', () => {
  it('refuses strangers, other origins, GET and big bodies', async () => {
    expect((await call({ action: 'capabilities' }, { authorization: 'Bearer nope' })).status).toBe(401)
    expect((await call({ action: 'capabilities' }, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await call({ action: 'capabilities' }, { method: 'GET' })).status).toBe(405)
    expect((await call({ action: 'capabilities' }, { rawLength: 30 * 1024 * 1024 })).status).toBe(400)
  })
  it('answers a preflight only for the app origin', async () => {
    const ok = await handleRequest({ method: 'OPTIONS', origin: ENV.APP_ORIGIN }, { env: ENV })
    expect(ok.status).toBe(204)
    expect(ok.headers['Access-Control-Allow-Origin']).toBe(ENV.APP_ORIGIN)
    expect((await handleRequest({ method: 'OPTIONS', origin: 'https://evil.example' }, { env: ENV })).status).toBe(403)
  })
  it('says it is not configured, instead of pretending, when the credentials are missing', async () => {
    const r = await handleRequest({ method: 'POST', origin: ENV.APP_ORIGIN, authorization: 'Bearer ok', body: { action: 'start', provider: 'google_drive' }, rawLength: 10 }, { authenticate: async () => ({ userId: 'U1' }), store, fetch: google.fetch, env: { ...ENV, GOOGLE_CLIENT_ID: '' } })
    expect(r.status).toBe(503)
    expect(r.body.error).toBe('not_configured')
    const cap = await handleRequest({ method: 'POST', origin: ENV.APP_ORIGIN, authorization: 'Bearer ok', body: { action: 'capabilities' }, rawLength: 10 }, { authenticate: async () => ({ userId: 'U1' }), store, fetch: google.fetch, env: { APP_ORIGIN: ENV.APP_ORIGIN } })
    expect(cap.body.configured).toBe(false)
  })
})

describe('connect and disconnect', () => {
  it('start returns a Google URL; the callback stores tokens server-side and records the account', async () => {
    const start = await call({ action: 'start', provider: 'google_drive' })
    expect(start.body.url).toMatch(/^https:\/\/accounts\.google\.com\//)
    const { location } = await connect('google_drive')
    expect(location).toBe(`${ENV.APP_ORIGIN}/integrations?connected=google_drive`)
    expect(store.s.tokens.get('U1|google_drive').refresh_token).toBe('refresh-1')
    expect(store.s.integrations.get('U1|google_drive')).toMatchObject({ status: 'connected', account_email: 'me@gmail.com' })
    expect(JSON.stringify(store.s.events)).not.toMatch(/refresh-1|access-1/) // no credentials in the activity log
  })
  it('refuses a callback with a bad state or a denied consent, and stores nothing', async () => {
    expect((await handleCallback({ code: 'c', state: 'forged' }, { store, fetch: google.fetch, env: ENV, now: () => NOW })).location).toMatch(/error=invalid_state/)
    const state = await signState({ userId: 'U1', provider: 'google_drive' }, ENV.OAUTH_STATE_SECRET, NOW)
    expect((await handleCallback({ error: 'access_denied', state }, { store, fetch: google.fetch, env: ENV, now: () => NOW })).location).toMatch(/error=denied/)
    expect(store.s.tokens.size).toBe(0)
  })
  it('does not connect when Google did not grant every permission needed', async () => {
    google.grantScopes = 'openid email'
    expect((await connect('google_drive')).location).toMatch(/error=failed/)
    expect(store.s.tokens.size).toBe(0)
  })
  it('disconnect revokes at Google, deletes the token and the row, and logs it', async () => {
    await connect('google_drive')
    expect((await call({ action: 'disconnect', provider: 'google_drive' })).status).toBe(200)
    expect(google.revoked).toBe(true)
    expect(store.s.tokens.size).toBe(0)
    expect(store.s.integrations.size).toBe(0)
    expect(store.s.events.at(-1).kind).toBe('disconnected')
  })
  it('a revoked grant is detected, cleaned up and reported', async () => {
    await connect('google_drive')
    store.s.tokens.get('U1|google_drive').access_expires_at = new Date(NOW - 1000).toISOString()
    google.refreshFails = true
    const r = await call({ action: 'drive-list', provider: 'google_drive' })
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('revoked')
    expect(store.s.tokens.size).toBe(0)
    expect(store.s.integrations.get('U1|google_drive').status).toBe('revoked')
  })
})

// ------------------------------------------------------------------ Drive
describe('Drive backups', () => {
  const backup = JSON.stringify({ app: 'lifetrack', version: 1, tables: { tasks: [] } })
  it('uploads only what the person sends, into LifeTrack\'s own folder, and lists and downloads it', async () => {
    await connect('google_drive')
    const up = await call({ action: 'drive-backup', provider: 'google_drive', text: backup })
    expect(up.status).toBe(200)
    expect(up.body.file.id).toBeTruthy()
    const list = await call({ action: 'drive-list', provider: 'google_drive' })
    expect(list.body.files).toHaveLength(1)
    const dl = await call({ action: 'drive-download', provider: 'google_drive', fileId: up.body.file.id })
    expect(dl.body.text).toBe(backup)
  })
  it('will not upload something that is not a backup, nor download a file outside its folder', async () => {
    await connect('google_drive')
    expect((await call({ action: 'drive-backup', provider: 'google_drive', text: '{"hello":1}' })).status).toBe(400)
    expect((await call({ action: 'drive-backup', provider: 'google_drive', text: 'not json' })).status).toBe(400)
    const r = await call({ action: 'drive-download', provider: 'google_drive', fileId: 'SOMEONES_OTHER_FILE' })
    expect(r.status).toBe(404)
  })
  it('needs a connection first, and sends nothing to Google without one', async () => {
    const r = await call({ action: 'drive-backup', provider: 'google_drive', text: backup })
    expect(r.status).toBe(409)
    expect(google.calls.filter((c) => /drive/.test(c.url))).toHaveLength(0)
  })
  it('turns a Google failure into a short message without leaking details', async () => {
    await connect('google_drive')
    const real = google.fetch
    google.fetch = async (url, init) => (/drive\/v3\/files\?q=/.test(url) ? { ok: false, status: 500, json: async () => ({ secret: 'stack trace' }) } : real(url, init))
    const r = await call({ action: 'drive-list', provider: 'google_drive' })
    expect(r.status).toBe(502)
    expect(JSON.stringify(r.body)).not.toMatch(/stack trace|access-1/)
    expect(store.s.events.at(-1).kind).toBe('error')
  })
})

// ------------------------------------------------------------------ Calendar
const local = (o = {}) => ({ id: 'L0', title: 'Dentist', description: '', location: '', starts_at: '2026-11-25T04:30:00.000Z', ends_at: '2026-11-25T05:30:00.000Z', all_day: false, rrule: null, external_id: null, external_hash: null, ...o })
const remote = (o = {}) => ({ id: 'G0', summary: 'Dentist', start: { dateTime: '2026-11-25T10:00:00+05:30' }, end: { dateTime: '2026-11-25T11:00:00+05:30' }, ...o })

describe('planCalendarSync', () => {
  it('sends unlinked LifeTrack events and imports unknown Google ones', () => {
    const p = planCalendarSync({ local: [local()], remote: [remote({ id: 'G9', summary: 'Gym', start: { dateTime: '2026-11-26T01:00:00Z' }, end: { dateTime: '2026-11-26T02:00:00Z' } })], timeZone: TZ })
    expect(p.exportRemote.map((e) => e.title)).toEqual(['Dentist'])
    expect(p.importLocal.map((e) => e.remote.title)).toEqual(['Gym'])
  })
  it('links an identical event instead of duplicating it', () => {
    const p = planCalendarSync({ local: [local()], remote: [remote()], timeZone: TZ })
    expect(p.exportRemote).toHaveLength(0)
    expect(p.importLocal).toHaveLength(0)
    expect(p.link).toEqual([{ localId: 'L0', remoteId: 'G0', hash: fingerprint(fromGoogle(remote(), TZ)) }])
  })
  it('recovers a lost link from the tag LifeTrack put on the Google copy', () => {
    const p = planCalendarSync({ local: [local()], remote: [remote({ summary: 'Dentist (edited)', extendedProperties: { private: { lifetrackId: 'L0' } } })], timeZone: TZ })
    expect(p.importLocal).toHaveLength(0)
    expect(p.exportRemote).toHaveLength(0)
  })
  it('copies a one-sided change in the right direction', () => {
    const base = fingerprint(local())
    const l = local({ external_id: 'G0', external_hash: base })
    const edited = remote({ summary: 'Dentist (moved)' })
    expect(planCalendarSync({ local: [l], remote: [edited], timeZone: TZ }).updateLocal).toHaveLength(1)
    expect(planCalendarSync({ local: [{ ...l, title: 'Dentist!!' }], remote: [remote()], timeZone: TZ }).updateRemote).toHaveLength(1)
  })
  it('reports a change on both sides as a conflict and overwrites neither, until resolved', () => {
    const l = local({ external_id: 'G0', external_hash: fingerprint(local()), title: 'Mine' })
    const r = remote({ summary: 'Theirs' })
    const p = planCalendarSync({ local: [l], remote: [r], timeZone: TZ })
    expect(p.conflicts).toHaveLength(1)
    expect(p.updateLocal.concat(p.updateRemote)).toHaveLength(0)
    expect(planCalendarSync({ local: [l], remote: [r], timeZone: TZ, resolutions: { L0: 'local' } }).updateRemote).toHaveLength(1)
    expect(planCalendarSync({ local: [l], remote: [r], timeZone: TZ, resolutions: { L0: 'remote' } }).updateLocal).toHaveLength(1)
  })
  it('never deletes: an event gone from Google is only reported', () => {
    const p = planCalendarSync({ local: [local({ external_id: 'G0', external_hash: fingerprint(local()) })], remote: [], timeZone: TZ })
    expect(p.remoteGone).toEqual([{ localId: 'L0', title: 'Dentist' }])
    expect(p.exportRemote).toHaveLength(0)
  })
  it('skips recurring events on both sides', () => {
    const p = planCalendarSync({ local: [local({ rrule: { freq: 'weekly' } })], remote: [remote({ recurrence: ['RRULE:FREQ=WEEKLY'] })], timeZone: TZ })
    expect(p.skippedRecurring).toBe(1)
    expect(p.exportRemote).toHaveLength(0)
  })
  it('handles all-day events across the time zone', () => {
    const iso = zonedMidnight('2026-11-25', TZ)
    expect(iso).toBe('2026-11-24T18:30:00.000Z')
    const e = fromGoogle({ summary: 'Holiday', start: { date: '2026-11-25' }, end: { date: '2026-11-26' } }, TZ)
    expect(e).toMatchObject({ all_day: true, starts_at: '2026-11-24T18:30:00.000Z', ends_at: '2026-11-25T18:30:00.000Z' })
    expect(toGoogle({ id: 'x', title: 'Holiday', all_day: true, starts_at: e.starts_at, ends_at: e.ends_at }, TZ).start).toEqual({ date: '2026-11-25' })
  })
})

describe('calendar-sync end to end', () => {
  const addLocal = (o) => store.s.calendar.push({ id: `L${++store.s.seq}`, user_id: 'U1', rrule: null, category: 'personal', external_id: null, external_hash: null, description: '', location: '', all_day: false, ...o })
  it('exports, imports, and a second run changes nothing (no duplicates)', async () => {
    await connect('google_calendar')
    addLocal({ title: 'Dentist', starts_at: new Date(NOW + 86400000).toISOString(), ends_at: new Date(NOW + 90000000).toISOString() })
    google.events.push({ id: 'GX', summary: 'From Google', start: { dateTime: new Date(NOW + 172800000).toISOString() }, end: { dateTime: new Date(NOW + 176400000).toISOString() } })
    const first = await call({ action: 'calendar-sync', provider: 'google_calendar' })
    expect(first.body.counts).toMatchObject({ imported: 1, exported: 1 })
    expect(google.events).toHaveLength(2)
    expect(store.s.calendar).toHaveLength(2)
    const second = await call({ action: 'calendar-sync', provider: 'google_calendar' })
    expect(second.body.counts).toEqual({ imported: 0, exported: 0, updated: 0, linked: 0 })
    expect(google.events).toHaveLength(2)
    expect(store.s.calendar).toHaveLength(2)
  })
  it('stops on a conflict, overwrites nothing, and applies the person\'s choice on the next run', async () => {
    await connect('google_calendar')
    const when = { starts_at: new Date(NOW + 86400000).toISOString(), ends_at: new Date(NOW + 90000000).toISOString() }
    addLocal({ title: 'Dentist', ...when })
    await call({ action: 'calendar-sync', provider: 'google_calendar' })
    store.s.calendar[0].title = 'Dentist (mine)'
    google.events[0].summary = 'Dentist (theirs)'
    const r = await call({ action: 'calendar-sync', provider: 'google_calendar' })
    expect(r.body.conflicts).toHaveLength(1)
    expect(store.s.calendar[0].title).toBe('Dentist (mine)')
    expect(google.events[0].summary).toBe('Dentist (theirs)')
    const id = store.s.calendar[0].id
    await call({ action: 'calendar-sync', provider: 'google_calendar', resolutions: { [id]: 'remote' } })
    expect(store.s.calendar[0].title).toBe('Dentist (theirs)')
  })
  it('refuses a sync that would rewrite hundreds of events at once', async () => {
    await connect('google_calendar')
    for (let i = 0; i < 600; i++) addLocal({ title: `E${i}`, starts_at: new Date(NOW + 3600000 * (i + 1)).toISOString(), ends_at: new Date(NOW + 3600000 * (i + 2)).toISOString() })
    expect((await call({ action: 'calendar-sync', provider: 'google_calendar' })).status).toBe(413)
    expect(google.events).toHaveLength(0)
  })
})
