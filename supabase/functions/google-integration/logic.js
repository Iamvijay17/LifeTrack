// The decisions of the `google-integration` Edge Function: connect, disconnect, Google Calendar sync and Google Drive backup. Every outside thing (GoTrue,
// the database, Google, the clock, the secrets) is injected, so it is tested in Node with a fake Google (packages/core/tests/google-integration.test.js).
//
// Guarantees:
//   * Only a signed-in user can call it, and every query is for THAT user. The browser never sees a token: they live in integration_tokens (no client access).
//   * It answers only to the app's own origin (APP_ORIGIN) and refuses everything when the Google credentials are not configured.
//   * Backups are uploaded only when the person asks (the request carries the file); nothing is sent on a schedule.
//   * Calendar sync never deletes and never overwrites a change made on both sides (see _shared/calendarSync.js).
//   * Errors returned to the app are short plain messages: no tokens, no Google response bodies, no stack traces.
import { PROVIDERS, RevokedError, SCOPES, accessTokenFor, authUrl, calendar, drive, exchangeCode, revokeAtGoogle, signState, verifyState } from '../_shared/google.js'
import { fingerprint, fromGoogle, planCalendarSync, toGoogle } from '../_shared/calendarSync.js'

const MAX_BODY = 25 * 1024 * 1024
const MAX_WRITES = 500
const DAY = 86400000
const reply = (status, body, headers = {}) => ({ status, body, headers })
const fail = (status, error, message, extra = {}) => reply(status, { ok: false, error, message, ...extra })

export const isConfigured = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.OAUTH_STATE_SECRET && env.APP_ORIGIN && env.SUPABASE_URL)
export const redirectUri = (env) => `${env.SUPABASE_URL}/functions/v1/google-oauth-callback`

/** @param request { method, origin, authorization, body, rawLength }   @param deps { authenticate, store, fetch, env, now? } */
export async function handleRequest(request, deps) {
  const { authenticate, store, fetch, env } = deps
  const now = deps.now ?? (() => Date.now())
  const done = (r) => ({
    ...r,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(request.origin && request.origin === env.APP_ORIGIN ? { 'Access-Control-Allow-Origin': env.APP_ORIGIN, 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' } : {}),
      ...r.headers,
    },
  })
  if (request.method === 'OPTIONS') return done(request.origin === env.APP_ORIGIN ? reply(204, null) : fail(403, 'forbidden_origin', 'Not allowed.'))
  if (request.origin && request.origin !== env.APP_ORIGIN) return done(fail(403, 'forbidden_origin', 'Not allowed.'))
  if (request.method !== 'POST') return done(fail(405, 'method_not_allowed', 'Use POST.'))
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body) || (request.rawLength ?? 0) > MAX_BODY) return done(fail(400, 'bad_request', 'Send a JSON object.'))
  const me = await authenticate(request.authorization)
  if (!me?.userId) return done(fail(401, 'not_signed_in', 'Sign in again.'))

  const { action, provider } = request.body
  if (action === 'capabilities') return done(reply(200, { ok: true, configured: isConfigured(env), providers: PROVIDERS, scopes: SCOPES }))
  if (!isConfigured(env)) return done(fail(503, 'not_configured', 'Google integrations are not set up on this server yet. See docs/INTEGRATIONS.md.'))
  if (!PROVIDERS.includes(provider)) return done(fail(400, 'bad_provider', 'Unknown integration.'))

  const creds = { fetch, store, userId: me.userId, provider, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, now: now() }
  const token = () => accessTokenFor(creds)
  const ensureConnected = async () => {
    const row = await store.getIntegration(me.userId, provider)
    if (!row || row.status !== 'connected') throw Object.assign(new Error('Connect Google first.'), { code: 'not_connected' })
    return row
  }

  try {
    switch (action) {
      case 'start': {
        const state = await signState({ userId: me.userId, provider }, env.OAUTH_STATE_SECRET, now())
        return done(reply(200, { ok: true, url: authUrl({ provider, state, clientId: env.GOOGLE_CLIENT_ID, redirectUri: redirectUri(env) }) }))
      }
      case 'disconnect': {
        const t = await store.getToken(me.userId, provider)
        if (t) await revokeAtGoogle(fetch, t.refresh_token) // tell Google first; our copy is deleted whether or not that worked
        await store.deleteToken(me.userId, provider)
        await store.deleteIntegration(me.userId, provider)
        await store.addEvent(me.userId, provider, 'disconnected', 'Disconnected. LifeTrack no longer has access.')
        return done(reply(200, { ok: true }))
      }
      case 'calendars': {
        await ensureConnected()
        return done(reply(200, { ok: true, calendars: await calendar.listCalendars(fetch, await token()) }))
      }
      case 'calendar-sync': {
        if (provider !== 'google_calendar') return done(fail(400, 'bad_provider', 'Not a calendar integration.'))
        const row = await ensureConnected()
        const calendarId = String(request.body.calendarId || row.settings?.calendarId || 'primary')
        const resolutions = request.body.resolutions && typeof request.body.resolutions === 'object' ? request.body.resolutions : {}
        const tz = (await store.getTimezone(me.userId)) || 'UTC'
        const from = new Date(now() - 30 * DAY).toISOString()
        const to = new Date(now() + 180 * DAY).toISOString()
        const access = await token()
        const [local, remote] = await Promise.all([store.listCalendarEvents(me.userId, from, to), calendar.listEvents(fetch, access, calendarId, { from, to })])
        const plan = planCalendarSync({ local, remote, timeZone: tz, resolutions })
        const writes = plan.importLocal.length + plan.exportRemote.length + plan.updateLocal.length + plan.updateRemote.length + plan.link.length
        if (writes > MAX_WRITES) return done(fail(413, 'too_many_changes', `That would change ${writes} events at once. Narrow the calendar and try again.`))
        const counts = { imported: 0, exported: 0, updated: 0, linked: 0 }
        const link = (id, remoteId, hash) => store.updateCalendarEvent(me.userId, id, { external_provider: 'google_calendar', external_id: remoteId, external_hash: hash })
        for (const x of plan.importLocal) {
          await store.insertCalendarEvent(me.userId, { ...x.remote, category: 'personal', timezone: tz, external_provider: 'google_calendar', external_id: x.remoteId, external_hash: x.hash })
          counts.imported++
        }
        for (const l of plan.exportRemote) {
          const g = await calendar.insert(fetch, access, calendarId, toGoogle(l, tz))
          await link(l.id, g.id, fingerprint(l))
          counts.exported++
        }
        for (const u of plan.updateRemote) {
          await calendar.patch(fetch, access, calendarId, u.remoteId, toGoogle(u.local, tz))
          await link(u.local.id, u.remoteId, fingerprint(u.local))
          counts.updated++
        }
        for (const u of plan.updateLocal) {
          await store.updateCalendarEvent(me.userId, u.localId, { ...u.fields, external_provider: 'google_calendar', external_id: u.remoteId, external_hash: u.hash })
          counts.updated++
        }
        for (const k of plan.link) (await link(k.localId, k.remoteId, k.hash), counts.linked++)
        await store.setIntegration(me.userId, provider, { last_sync_at: new Date(now()).toISOString(), last_error: '', settings: { ...(row.settings ?? {}), calendarId } })
        const bits = [`${counts.imported} imported`, `${counts.exported} sent to Google`, `${counts.updated} updated`]
        if (plan.conflicts.length) bits.push(`${plan.conflicts.length} need your decision`)
        await store.addEvent(me.userId, provider, plan.conflicts.length ? 'conflict' : 'synced', bits.join(', '))
        return done(reply(200, { ok: true, counts, conflicts: plan.conflicts, remoteGone: plan.remoteGone, skippedRecurring: plan.skippedRecurring }))
      }
      case 'drive-backup': {
        if (provider !== 'google_drive') return done(fail(400, 'bad_provider', 'Not a Drive integration.'))
        await ensureConnected()
        const text = request.body.text
        let parsed
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = null
        }
        if (typeof text !== 'string' || parsed?.app !== 'lifetrack' || !parsed.tables) return done(fail(400, 'bad_backup', 'That is not a LifeTrack backup.'))
        const access = await token()
        const folder = await drive.folder(fetch, access)
        const name = `lifetrack-backup-${new Date(now()).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
        const file = await drive.upload(fetch, access, folder, name, text)
        await store.setIntegration(me.userId, provider, { last_sync_at: new Date(now()).toISOString(), last_error: '' })
        await store.addEvent(me.userId, provider, 'backup', `Backup saved to your Drive: ${name}`)
        return done(reply(200, { ok: true, file: { id: file.id, name: file.name, size: Number(file.size ?? text.length), createdTime: file.createdTime } }))
      }
      case 'drive-list': {
        await ensureConnected()
        const access = await token()
        return done(reply(200, { ok: true, files: await drive.list(fetch, access, await drive.folder(fetch, access)) }))
      }
      case 'drive-download': {
        await ensureConnected()
        const access = await token()
        const text = await drive.download(fetch, access, await drive.folder(fetch, access), String(request.body.fileId ?? ''))
        await store.addEvent(me.userId, provider, 'restore', 'A backup was downloaded from your Drive.')
        return done(reply(200, { ok: true, text }))
      }
      default:
        return done(fail(400, 'unknown_action', 'Unknown action.'))
    }
  } catch (e) {
    if (e instanceof RevokedError) return done(fail(409, 'revoked', e.message))
    if (e.code === 'not_connected') return done(fail(409, 'not_connected', e.message))
    if (e.code === 'not_found') return done(fail(404, 'not_found', e.message))
    // Whatever went wrong is recorded for the person in plain words; the details stay in the server log.
    const message = e.code === 'forbidden' || e.code === 'google_error' ? e.message : 'Something went wrong talking to Google. Try again.'
    try {
      await store.setIntegration(me.userId, provider, { last_error: message })
      await store.addEvent(me.userId, provider, 'error', message)
    } catch {
      /* reporting the failure must not hide it */
    }
    return done(fail(502, 'google_failed', message))
  }
}

/**
 * Google redirects the browser here after consent (no sign-in header: the signed `state` identifies the person). Returns where to send the browser.
 * @param query { code?, state?, error? }   @param deps { store, fetch, env, now? }
 */
export async function handleCallback(query, deps) {
  const { store, fetch, env } = deps
  const now = deps.now ?? (() => Date.now())
  const back = (qs) => `${env.APP_ORIGIN}/integrations?${qs}`
  if (!isConfigured(env)) return { location: `${env.APP_ORIGIN ?? ''}/integrations?error=not_configured` }
  const who = await verifyState(query.state, env.OAUTH_STATE_SECRET, now())
  if (!who) return { location: back('error=invalid_state') }
  if (query.error || !query.code) return { location: back(`error=${query.error === 'access_denied' ? 'denied' : 'failed'}`) }
  try {
    const t = await exchangeCode({ fetch, code: query.code, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: redirectUri(env), provider: who.provider, now: now() })
    await store.saveToken(who.userId, who.provider, { refresh_token: t.refreshToken, access_token: t.accessToken, access_expires_at: t.expiresAt })
    await store.setIntegration(who.userId, who.provider, { status: 'connected', scopes: t.scopes, account_email: t.email, connected_at: new Date(now()).toISOString(), last_error: '' })
    await store.addEvent(who.userId, who.provider, 'connected', t.email ? `Connected ${t.email}` : 'Connected')
    return { location: back(`connected=${who.provider}`) }
  } catch (e) {
    await store.addEvent(who.userId, who.provider, 'error', String(e.message).slice(0, 280)).catch(() => {})
    return { location: back('error=failed') }
  }
}
