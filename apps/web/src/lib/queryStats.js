// What this browser measured about its own database requests, summed per "table.operation" and sent to the administrators' Database Performance view in a
// small batch now and then (`report_query_stats`, migration 0028). It records the table or function name, the HTTP verb, how long the response took to start,
// and how many rows came back. Never a URL query string, a filter value, a header, an id or any row content. Only a sample of sessions reports at all.
const SLOW_MS = 500
const FLUSH_EVERY_MS = 5 * 60_000
const MAX_KEYS = 60
export const SAMPLE_RATE = 0.25

/** `/rest/v1/tasks?select=*&…` → { table: 'tasks', op: 'select' }; `/rest/v1/rpc/evaluate_flags` → { table: 'evaluate_flags', op: 'rpc' }. */
export function classifyRequest(url, method = 'GET') {
  const m = /\/rest\/v1\/(rpc\/)?([a-z][a-z0-9_]{0,47})(?:[?/]|$)/.exec(url ?? '')
  if (!m) return null
  if (m[1]) return { table: m[2], op: 'rpc' }
  const op = { GET: 'select', HEAD: 'select', POST: 'insert', PUT: 'insert', PATCH: 'update', DELETE: 'delete' }[
    String(method).toUpperCase()
  ]
  return op ? { table: m[2], op } : null
}
// Rows from a PostgREST content-range header such as 0-24/130 (the first and last row of the page), else 0.
export function rowsFromRange(header) {
  const m = /^(\d+)-(\d+)\//.exec(header ?? '')
  return m ? Number(m[2]) - Number(m[1]) + 1 : 0
}

export function createQueryRecorder({ sample = SAMPLE_RATE, random = Math.random, now = () => Date.now() } = {}) {
  const enabled = random() < sample
  const acc = new Map()
  let sink = null
  let timer = null
  const NOT_MEASURED = new Set(['report_query_stats', 'report_client_error'])
  const api = {
    enabled,
    /** Called with every finished request. `ok` false for a failed response or a thrown fetch. */
    record({ url, method, ms, ok, rows }) {
      if (!enabled || !sink) return
      const c = classifyRequest(url, method)
      if (!c || NOT_MEASURED.has(c.table)) return
      const key = `${c.table}.${c.op}`
      if (!acc.has(key) && acc.size >= MAX_KEYS) return
      const a = acc.get(key) ?? { table: c.table, op: c.op, calls: 0, errors: 0, slow: 0, total_ms: 0, max_ms: 0, rows: 0 }
      a.calls++
      if (!ok) a.errors++
      if (ms >= SLOW_MS) a.slow++
      a.total_ms += Math.round(ms)
      a.max_ms = Math.max(a.max_ms, Math.round(ms))
      a.rows += rows ?? 0
      acc.set(key, a)
    },
    pending: () => [...acc.values()],
    async flush() {
      if (!sink || !acc.size) return 0
      const batch = [...acc.values()]
      acc.clear()
      try {
        await sink(batch)
        return batch.length
      } catch {
        return 0 // measuring never matters enough to retry or to bother the person
      }
    },
    /** Connects the recorder to the thing that sends the batch and starts the slow timer (never in a background tab loop: it is only one timer). */
    start(send) {
      sink = send
      if (!enabled || timer || typeof setInterval !== 'function') return
      timer = setInterval(() => void api.flush(), FLUSH_EVERY_MS)
      if (typeof document !== 'undefined')
        document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void api.flush())
    },
    stop() {
      clearInterval(timer)
      timer = null
      sink = null
      acc.clear()
    },
    _now: now,
  }
  return api
}

export const queryRecorder = createQueryRecorder()

/** Wraps a fetch so every finished database request is timed. The response is returned untouched (its body is never read). */
export const timedFetch =
  (inner, recorder = queryRecorder, clock = () => performance.now()) =>
  async (input, init) => {
    const url = typeof input === 'string' ? input : (input?.url ?? '')
    if (!recorder.enabled || !url.includes('/rest/v1/')) return inner(input, init)
    const method = init?.method ?? (typeof input === 'object' ? input.method : 'GET') ?? 'GET'
    const t0 = clock()
    try {
      const res = await inner(input, init)
      recorder.record({ url, method, ms: clock() - t0, ok: res.ok, rows: rowsFromRange(res.headers?.get?.('content-range')) })
      return res
    } catch (e) {
      recorder.record({ url, method, ms: clock() - t0, ok: false, rows: 0 })
      throw e
    }
  }
