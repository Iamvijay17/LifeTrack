// System Health: turning the numbers of `admin_system_overview()` into statuses. Pure functions; thresholds are stated here once.

export const LATENCY_BUCKETS = [50, 100, 250, 500, 1000] // upper bounds in ms; the sixth bucket is "slower than 1 s"
export const THRESHOLDS = { errorRateDegraded: 0.02, errorRateDown: 0.2, minRequests: 5, jobStaleMinutes: 15, retentionStaleHours: 36, avgSlowMs: 800 }

/** Estimated latency percentile from the histogram (upper bound of the bucket that contains it), or null with no data. */
export function percentileFromHistogram(hist, p) {
  const total = (hist ?? []).reduce((a, b) => a + b, 0)
  if (!total) return null
  let seen = 0
  for (let i = 0; i < hist.length; i++) {
    seen += hist[i]
    if (seen / total >= p) return i < LATENCY_BUCKETS.length ? LATENCY_BUCKETS[i] : Infinity
  }
  return null
}
export const errorRate = (api) => (api?.requests > 0 ? (api.errors_5xx ?? 0) / api.requests : null)
/** Share of requests that did not fail with a server error. */
export const availability = (api) => (api?.requests > 0 ? 1 - (api.errors_5xx ?? 0) / api.requests : null)

const minutesSince = (iso, now) => (iso ? (now - Date.parse(iso)) / 60000 : Infinity)
const worst = (...s) => (s.includes('down') ? 'down' : s.includes('degraded') ? 'degraded' : s.every((x) => x === 'unknown') ? 'unknown' : 'operational')

/** Status of each part, with the reason in words. `now` is injectable for tests. */
export function componentStatuses(o, now = Date.now()) {
  const api = o?.api ?? {}
  const rate = errorRate(api)
  const jobs = Object.fromEntries((o?.jobs ?? []).map((j) => [j.job, j]))
  const dispatcher = jobs['webhook-dispatch']
  const comp = {}
  comp.database = o?.database?.ok ? { status: 'operational', detail: `Answered in ${o.database.latency_ms} ms` } : { status: 'down', detail: 'The database did not answer' }
  if (!api.requests) comp.api = { status: 'unknown', detail: 'No API requests in the last 24 hours' }
  else if (api.requests >= THRESHOLDS.minRequests && rate >= THRESHOLDS.errorRateDown) comp.api = { status: 'down', detail: `${(rate * 100).toFixed(1)}% of requests failed` }
  else if (api.requests >= THRESHOLDS.minRequests && (rate >= THRESHOLDS.errorRateDegraded || api.avg_ms > THRESHOLDS.avgSlowMs)) comp.api = { status: 'degraded', detail: rate >= THRESHOLDS.errorRateDegraded ? `${(rate * 100).toFixed(1)}% of requests failed` : `Slow: ${api.avg_ms} ms on average` }
  else comp.api = { status: 'operational', detail: `${api.requests} requests, ${api.avg_ms ?? 0} ms on average` }
  const syncFailures = o?.errors?.sync_24h ?? 0
  comp.sync = syncFailures >= 10 ? { status: 'degraded', detail: `${syncFailures} sync failures in 24 hours` } : { status: 'operational', detail: syncFailures ? `${syncFailures} sync failure${syncFailures === 1 ? '' : 's'} in 24 hours` : 'No sync failures reported' }
  if (!dispatcher) comp.jobs = { status: 'unknown', detail: 'The webhook dispatcher has not reported yet (is it scheduled?)' }
  else if (dispatcher.last_status === 'error') comp.jobs = { status: 'degraded', detail: `Last run failed: ${dispatcher.last_error || 'unknown error'}` }
  else if (minutesSince(dispatcher.last_run, now) > THRESHOLDS.jobStaleMinutes) comp.jobs = { status: 'degraded', detail: 'The webhook dispatcher has not run for over 15 minutes' }
  else comp.jobs = { status: 'operational', detail: `${(o.jobs ?? []).length} job${(o.jobs ?? []).length === 1 ? '' : 's'} reporting` }
  const wh = o?.webhooks ?? {}
  comp.webhooks = (wh.dead ?? 0) > 0 ? { status: 'degraded', detail: `${wh.dead} ${wh.dead === 1 ? 'delivery' : 'deliveries'} in the dead-letter queue` } : { status: 'operational', detail: `${wh.pending ?? 0} waiting, ${wh.delivered_24h ?? 0} delivered in 24 hours` }
  comp.backend = { status: worst(comp.database.status, comp.api.status === 'unknown' ? 'operational' : comp.api.status), detail: 'Database and API gateway' }
  comp.backup = o?.last_backup_at ? { status: 'operational', detail: `Last cloud backup ${new Date(o.last_backup_at).toISOString().slice(0, 16).replace('T', ' ')} UTC` } : { status: 'unknown', detail: 'No cloud backup has been recorded (device downloads are not tracked)' }
  return comp
}

/** The headline: down if any core part is down, degraded if any is, otherwise operational. Backup and "unknown" parts never make the system look broken. */
export function overallStatus(o, now = Date.now()) {
  const c = componentStatuses(o, now)
  const core = [c.database, c.api, c.sync, c.jobs, c.webhooks]
  const status = core.some((x) => x.status === 'down') ? 'down' : core.some((x) => x.status === 'degraded') ? 'degraded' : 'operational'
  return { status, reasons: core.filter((x) => x.status === 'down' || x.status === 'degraded').map((x) => x.detail), components: c }
}
