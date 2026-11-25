// The decisions of the `webhook-dispatch` Edge Function: take due webhook deliveries, send them signed, record each attempt, and schedule the retry or the
// dead letter. Everything outside the decision (the database, the network, DNS, the clock, randomness) is injected, so it is tested in Node
// (packages/core/tests/webhook-dispatch.test.js).
//
// Guarantees:
//   * A delivery is LEASED when claimed (see claim_webhook_deliveries), so overlapping runs cannot send the same one twice, and a run that dies simply lets
//     the lease expire. The recipient also gets a stable delivery id in X-LifeTrack-Delivery, so a retry after a lost answer is recognisable.
//   * Signed with HMAC-SHA256 over `${timestamp}.${body}`; the timestamp is renewed on every attempt and is part of what is signed (replay protection).
//   * SSRF: the address is checked before the call (https only, no credentials, no internal names or IP literals), the host name is RESOLVED and every
//     address must be public, and redirects are never followed. Nothing about the response body is kept.
//   * Retries use exponential backoff with jitter; after max_attempts a delivery becomes `dead` (dead letter) and can be retried by hand.
import { backoffSeconds, checkWebhookUrl, isPublicIp, signWebhook } from '../_shared/platformApi.js'

const RETENTION_JOB = 'retention-purge'
const DAY = 24 * 3600 * 1000

/** Sends one claimed delivery and reports the attempt. Never throws. */
export async function deliverOne(d, deps) {
  const { fetch, resolve, now = Date.now, random = Math.random, allowHttp = false } = deps
  const t0 = now()
  const finish = async (ok, status, error, { dead = false } = {}) => {
    const attempt = d.attempts + 1
    const exhausted = dead || attempt >= d.max_attempts
    const next = ok || exhausted ? null : new Date(now() + backoffSeconds(attempt, random()) * 1000).toISOString()
    await deps.store.complete({ id: d.id, ok, status: status ?? null, error: error ?? '', durationMs: Math.max(0, Math.round(now() - t0)), next, dead: !ok && exhausted })
    return { id: d.id, ok, status: status ?? null, dead: !ok && exhausted, error: error ?? '' }
  }
  try {
    const check = checkWebhookUrl(d.url, { allowHttp })
    if (!check.ok) return await finish(false, null, 'blocked_address', { dead: true })
    const host = check.host
    let addresses
    try {
      addresses = await resolve(host)
    } catch {
      return await finish(false, null, 'dns_failed')
    }
    if (!addresses?.length) return await finish(false, null, 'dns_failed')
    if (!(allowHttp && /^(localhost|127\.0\.0\.1)$/.test(host)) && addresses.some((a) => !isPublicIp(a))) return await finish(false, null, 'blocked_address', { dead: true })

    const body = JSON.stringify({ id: d.id, ...d.payload })
    const timestamp = String(Math.floor(now() / 1000))
    const signature = await signWebhook(d.secret, timestamp, body)
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), d.timeout_ms)
    try {
      const res = await fetch(check.url, {
        method: 'POST',
        redirect: 'manual',
        signal: ctl.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'LifeTrack-Webhooks/1',
          'X-LifeTrack-Delivery': d.id,
          'X-LifeTrack-Event': d.event_type,
          'X-LifeTrack-Timestamp': timestamp,
          'X-LifeTrack-Signature': signature,
        },
        body,
      })
      try { await res.body?.cancel() } catch { /* the body is never read */ }
      if (res.status >= 200 && res.status < 300) return await finish(true, res.status, '')
      if (res.status >= 300 && res.status < 400) return await finish(false, res.status, 'redirect_not_followed')
      return await finish(false, res.status, `HTTP ${res.status}`, { dead: res.status === 410 }) // 410 Gone: the receiver asked us to stop
    } catch (e) {
      return await finish(false, null, e?.name === 'AbortError' ? 'timeout' : 'network_error')
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    console.error('webhook-dispatch: delivery', d.id, (e?.message ?? '').slice(0, 120))
    try { return await finish(false, null, 'internal_error') } catch { return { id: d.id, ok: false, error: 'internal_error' } }
  }
}

/**
 * One run. `userId` limits it to one person's deliveries (the "deliver now" button); without it, everything due is sent (the scheduler).
 * @param deps { store: { claim, complete, lastJobRun, recordJob, purge }, fetch, resolve, now?, random?, env? }
 */
export async function runDispatch({ userId = null, limit = 25 } = {}, deps) {
  const now = deps.now ?? Date.now
  const t0 = now()
  const out = { claimed: 0, delivered: 0, failed: 0, dead: 0, purged: null }
  try {
    const batch = await deps.store.claim(limit, userId)
    out.claimed = batch.length
    // A few at a time: a slow receiver must not hold up the rest, and one run must not open hundreds of connections.
    for (let i = 0; i < batch.length; i += 5) {
      const results = await Promise.all(batch.slice(i, i + 5).map((d) => deliverOne(d, { ...deps, allowHttp: deps.env?.WEBHOOK_ALLOW_HTTP === 'true' })))
      for (const r of results) r.ok ? out.delivered++ : (out.failed++, r.dead && out.dead++)
    }
    if (!userId) {
      // Retention runs at most once a day, from the scheduler's own runs.
      const last = await deps.store.lastJobRun(RETENTION_JOB)
      if (!last || now() - Date.parse(last) > DAY) {
        const t1 = now()
        const e = deps.env ?? {}
        out.purged = await deps.store.purge({
          p_request_days: Number(e.RETAIN_API_LOG_DAYS) || 30, p_metric_days: Number(e.RETAIN_METRICS_DAYS) || 90, p_error_days: Number(e.RETAIN_ERROR_DAYS) || 60,
          p_job_days: Number(e.RETAIN_JOB_DAYS) || 30, p_webhook_days: Number(e.RETAIN_WEBHOOK_DAYS) || 30, p_audit_days: e.RETAIN_AUDIT_DAYS === '0' ? 0 : Number(e.RETAIN_AUDIT_DAYS) || 730,
        })
        await deps.store.recordJob(RETENTION_JOB, 'ok', Math.round(now() - t1), `removed ${Object.values(out.purged).reduce((a, b) => a + b, 0)} old rows`, '')
      }
      await deps.store.recordJob('webhook-dispatch', 'ok', Math.round(now() - t0), `claimed ${out.claimed}, delivered ${out.delivered}, failed ${out.failed}`, '')
    }
  } catch (e) {
    console.error('webhook-dispatch: run failed:', (e?.message ?? '').slice(0, 160))
    if (!userId) {
      try { await deps.store.recordJob('webhook-dispatch', 'error', Math.round(now() - t0), '', (e?.message ?? 'failed').slice(0, 280)) } catch { /* nothing more to do */ }
    }
    throw e
  }
  return out
}
