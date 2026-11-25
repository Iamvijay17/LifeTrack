// Google OAuth 2.0 and the few API calls LifeTrack makes. Every outside thing (fetch, the clock, secrets) is injected, so it runs under Deno and under
// the Node test suite with a fake Google. Secrets (client id / secret, state key) come from Edge Function environment variables, never from the app.
//
// Minimum permissions, per provider:
//   google_calendar   calendar.events (read and write events) + calendar.calendarlist.readonly (choose which calendar). Not the whole account's calendars.
//   google_drive      drive.file: ONLY files and folders LifeTrack itself creates. It cannot see anything else in the person's Drive.
// Both add `openid email`, only to show which Google account is connected.
export const SCOPES = {
  google_calendar: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'openid', 'email'],
  google_drive: ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'],
}
export const PROVIDERS = Object.keys(SCOPES)
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const STATE_TTL_MS = 10 * 60 * 1000

export class RevokedError extends Error {
  constructor() {
    super('Google access was revoked. Connect again to continue.')
    this.code = 'revoked'
  }
}

const enc = new TextEncoder()
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const unb64u = (s) => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0))
const hmacKey = (secret) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])

/** A tamper-proof, short-lived `state` value tying the Google redirect back to this person and provider. */
export async function signState({ userId, provider }, secret, now = Date.now()) {
  const body = b64u(enc.encode(JSON.stringify({ u: userId, p: provider, exp: now + STATE_TTL_MS, n: b64u(crypto.getRandomValues(new Uint8Array(12))) })))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body))
  return `${body}.${b64u(sig)}`
}
/** @returns {{ userId, provider } | null}  null when forged, altered or expired */
export async function verifyState(state, secret, now = Date.now()) {
  if (typeof state !== 'string' || !secret) return null
  const [body, sig] = state.split('.')
  if (!body || !sig) return null
  try {
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64u(sig), enc.encode(body)))) return null
    const v = JSON.parse(new TextDecoder().decode(unb64u(body)))
    if (!(v.exp > now) || !PROVIDERS.includes(v.p) || typeof v.u !== 'string') return null
    return { userId: v.u, provider: v.p }
  } catch {
    return null
  }
}

export function authUrl({ provider, state, clientId, redirectUri }) {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES[provider].join(' '),
    access_type: 'offline', // a refresh token, so sync can run without the person present
    prompt: 'consent',
    include_granted_scopes: 'false', // only what this integration needs, never what other apps were once granted
    state,
  })
  return `${AUTH_URL}?${q}`
}

const form = (o) => new URLSearchParams(o).toString()
async function tokenCall(fetch, params) {
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(params) })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}
const emailFromIdToken = (t) => {
  try {
    return JSON.parse(new TextDecoder().decode(unb64u(t.split('.')[1]))).email ?? ''
  } catch {
    return ''
  }
}

/** Trades the one-time code for tokens. Returns what to store; throws a plain message (never the response body) on failure. */
export async function exchangeCode({ fetch, code, clientId, clientSecret, redirectUri, provider, now = Date.now() }) {
  const r = await tokenCall(fetch, { code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' })
  if (!r.ok || !r.json.access_token) throw new Error('Google did not accept the sign-in. Try connecting again.')
  if (!r.json.refresh_token) throw new Error('Google did not grant offline access. Remove LifeTrack at myaccount.google.com/permissions and connect again.')
  const granted = String(r.json.scope ?? '').split(' ')
  const missing = SCOPES[provider].filter((s) => !granted.includes(s) && !['openid', 'email'].includes(s))
  if (missing.length) throw new Error('Not every permission LifeTrack needs was granted. Connect again and allow them.')
  return {
    refreshToken: r.json.refresh_token,
    accessToken: r.json.access_token,
    expiresAt: new Date(now + (r.json.expires_in ?? 3600) * 1000).toISOString(),
    email: emailFromIdToken(r.json.id_token ?? ''),
    scopes: granted.filter((s) => SCOPES[provider].includes(s)),
  }
}

/**
 * A usable access token for this person. Refreshes an expired one. If Google says the grant is gone (the person removed LifeTrack in their Google
 * account, or the password changed), the integration is marked revoked, the stored token deleted, and RevokedError thrown.
 */
export async function accessTokenFor({ fetch, store, userId, provider, clientId, clientSecret, now = Date.now() }) {
  const t = await store.getToken(userId, provider)
  if (!t) throw new RevokedError()
  if (t.access_token && t.access_expires_at && Date.parse(t.access_expires_at) - now > 60_000) return t.access_token
  const r = await tokenCall(fetch, { refresh_token: t.refresh_token, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' })
  if (!r.ok) {
    if (r.json.error === 'invalid_grant') {
      await store.deleteToken(userId, provider)
      await store.setIntegration(userId, provider, { status: 'revoked', last_error: 'Access was revoked in your Google account.' })
      await store.addEvent(userId, provider, 'revoked', 'Access was revoked in your Google account.')
      throw new RevokedError()
    }
    throw new Error('Could not refresh the Google connection. Try again in a moment.')
  }
  await store.saveAccessToken(userId, provider, r.json.access_token, new Date(now + (r.json.expires_in ?? 3600) * 1000).toISOString())
  return r.json.access_token
}

/** Tell Google to forget the grant. Best effort: the local token is deleted whether or not this succeeds. */
export async function revokeAtGoogle(fetch, token) {
  try {
    const res = await fetch(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ token }) })
    return res.ok
  } catch {
    return false
  }
}

// ----------------------------------------------------------------------- API calls
async function api(fetch, token, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })
  if (res.status === 401 || res.status === 403) {
    const body = await res.json().catch(() => ({}))
    const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status
    if (res.status === 401 || ['authError', 'UNAUTHENTICATED'].includes(reason)) throw new RevokedError()
    throw Object.assign(new Error('Google refused that request (permission or quota).'), { code: 'forbidden' })
  }
  if (res.status === 404) throw Object.assign(new Error('Not found on Google.'), { code: 'not_found' })
  if (!res.ok) throw Object.assign(new Error(`Google answered ${res.status}.`), { code: 'google_error' })
  return res.status === 204 ? null : res
}
const json = async (res) => (res ? res.json() : null)

export const calendar = {
  async listCalendars(fetch, token) {
    const out = await json(await api(fetch, token, 'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=50'))
    return (out.items ?? []).map((c) => ({ id: c.id, name: c.summary, primary: !!c.primary }))
  },
  async listEvents(fetch, token, calendarId, { from, to }) {
    const items = []
    let pageToken = ''
    do {
      const q = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: 'true', showDeleted: 'false', maxResults: '250' })
      if (pageToken) q.set('pageToken', pageToken)
      const out = await json(await api(fetch, token, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${q}`))
      items.push(...(out.items ?? []))
      pageToken = out.nextPageToken ?? ''
    } while (pageToken && items.length < 2500)
    return items
  },
  insert: async (fetch, token, calendarId, body) =>
    json(await api(fetch, token, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })),
  patch: async (fetch, token, calendarId, id, body) =>
    json(await api(fetch, token, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })),
}

const FOLDER = 'LifeTrack Backups'
export const drive = {
  /** The backup folder (only a folder LifeTrack made is visible under drive.file), created on first use. */
  async folder(fetch, token) {
    const q = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
    const found = await json(await api(fetch, token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`))
    if (found.files?.[0]) return found.files[0].id
    const made = await json(await api(fetch, token, 'https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }) }))
    return made.id
  },
  async upload(fetch, token, folderId, name, text) {
    const boundary = `lt${Date.now().toString(36)}`
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId], mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`
    return json(await api(fetch, token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }))
  },
  async list(fetch, token, folderId) {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`)
    const out = await json(await api(fetch, token, `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=50&fields=files(id,name,size,createdTime)`))
    return out.files ?? []
  },
  /** Only a file inside the backup folder can be downloaded, whatever id is asked for. */
  async download(fetch, token, folderId, fileId) {
    const meta = await json(await api(fetch, token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,parents,trashed`))
    if (meta.trashed || !(meta.parents ?? []).includes(folderId)) throw Object.assign(new Error('That is not one of your LifeTrack backups.'), { code: 'not_found' })
    return (await api(fetch, token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`)).text()
  },
}
