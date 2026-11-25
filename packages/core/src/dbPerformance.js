// Database Performance: turns the numbers `admin_db_overview()` and `admin_db_query_report()` return (real catalog statistics and the browsers' own timings)
// into findings with a priority and a suggestion. Pure; thresholds are stated once, here. Nothing is estimated: a finding exists only if the numbers show it.

export const PERF_THRESHOLDS = {
  seqRowsMedium: 1_000_000, // rows read by sequential scans before a table is worth a look
  seqRowsHigh: 20_000_000,
  seqShare: 0.5, // share of scans that were sequential
  minTableRows: 5_000, // small tables are fine to scan
  unusedIndexBytes: 1_048_576,
  cacheHitMedium: 0.99,
  cacheHitHigh: 0.9,
  deadShare: 0.2,
  minDeadRows: 1_000,
  connectionShare: 0.8,
  slowStatementMs: 50,
  veryslowStatementMs: 200,
  slowAvgMs: 300,
  errorShare: 0.05,
  manyRows: 500,
}
const RANK = { high: 0, medium: 1, low: 2 }
export const PRIORITIES = ['high', 'medium', 'low']

export const formatBytes = (n) => {
  if (n == null) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = Number(n)
  let i = 0
  while (v >= 1024 && i < u.length - 1) ((v /= 1024), i++)
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`
}

/** Findings from the overview: [{ id, area, table, priority, suggestion, evidence }], most important first. */
export function overviewFindings(o, t = PERF_THRESHOLDS) {
  const out = []
  if (!o) return out
  const push = (f) => out.push(f)
  for (const tb of o.tables ?? []) {
    const scans = (tb.seq_scans ?? 0) + (tb.index_scans ?? 0)
    if (tb.rows >= t.minTableRows && tb.seq_rows_read >= t.seqRowsMedium && scans > 0 && tb.seq_scans / scans >= t.seqShare)
      push({
        id: `seq:${tb.table}`,
        area: 'index',
        table: tb.table,
        priority: tb.seq_rows_read >= t.seqRowsHigh ? 'high' : 'medium',
        suggestion: `Most reads of “${tb.table}” scan the whole table. Find the filter or sort used by its busiest queries and add an index that starts with user_id and matches it.`,
        evidence: `${tb.seq_scans.toLocaleString()} full scans read ${tb.seq_rows_read.toLocaleString()} rows (${Math.round((tb.seq_scans / scans) * 100)}% of scans); about ${tb.rows.toLocaleString()} rows`,
      })
    if (tb.dead_rows >= t.minDeadRows && tb.rows + tb.dead_rows > 0 && tb.dead_rows / (tb.rows + tb.dead_rows) >= t.deadShare)
      push({
        id: `dead:${tb.table}`,
        area: 'maintenance',
        table: tb.table,
        priority: 'medium',
        suggestion: `“${tb.table}” holds many dead rows. Autovacuum should clear them: check it is running, or run VACUUM (ANALYZE) on this table.`,
        evidence: `${tb.dead_rows.toLocaleString()} dead rows against ${tb.rows.toLocaleString()} live`,
      })
  }
  for (const ix of o.indexes ?? [])
    if (ix.scans === 0 && !ix.unique && !ix.primary && ix.size_bytes >= t.unusedIndexBytes)
      push({
        id: `unused:${ix.index}`,
        area: 'index',
        table: ix.table,
        priority: 'low',
        suggestion: `Index “${ix.index}” has not been used since the statistics were last reset. Dropping it would speed up writes, but check it is not needed by a rare job first.`,
        evidence: `0 scans, ${formatBytes(ix.size_bytes)}`,
      })
  if (o.cache_hit_ratio != null && (o.database?.blocks_hit ?? 0) + (o.database?.blocks_read ?? 0) > 10_000) {
    if (o.cache_hit_ratio < t.cacheHitMedium)
      push({
        id: 'cache',
        area: 'memory',
        table: null,
        priority: o.cache_hit_ratio < t.cacheHitHigh ? 'high' : 'medium',
        suggestion:
          'The database is reading from disk more than usual. The working set may not fit in memory: check large tables and unused indexes, or consider a larger instance.',
        evidence: `cache hit rate ${(o.cache_hit_ratio * 100).toFixed(2)}%`,
      })
  }
  const c = o.connections
  if (c?.max && c.total / c.max >= t.connectionShare)
    push({
      id: 'connections',
      area: 'connections',
      table: null,
      priority: 'high',
      suggestion:
        'Connections are close to the limit. Use the pooled connection string for server code and check for clients that keep connections open.',
      evidence: `${c.total} of ${c.max} connections in use`,
    })
  for (const q of o.slow_queries ?? [])
    push({
      id: `stmt:${q.query.slice(0, 40)}`,
      area: 'query',
      table: null,
      priority: q.mean_ms >= t.veryslowStatementMs ? 'high' : 'medium',
      suggestion:
        'This statement is slow on average. Run EXPLAIN (ANALYZE) on it; a missing index on its filter or sort is the usual cause, or it reads more rows than it needs.',
      evidence: `${q.mean_ms} ms average, ${q.max_ms} ms worst, ${q.calls} calls, ${q.rows_per_call} rows per call — ${q.query}`,
    })
  return out.sort((a, b) => RANK[a.priority] - RANK[b.priority])
}

/** Findings from the browsers' own timings ("table.operation"). */
export function queryFindings(rows, t = PERF_THRESHOLDS) {
  const out = []
  for (const r of rows ?? []) {
    if (r.operation === 'select' && r.rows_avg >= t.manyRows && r.calls >= 3)
      out.push({
        id: `rows:${r.location}`,
        area: 'pagination',
        table: r.table,
        location: r.location,
        priority: r.rows_avg >= t.manyRows * 4 ? 'high' : 'medium',
        suggestion: `Reads of “${r.table}” return many rows per call. Use the paged list (listPage) or narrow the query so only what is shown is fetched.`,
        evidence: `${r.rows_avg} rows per call, ${r.calls} calls, ${r.avg_ms} ms average`,
      })
    if (r.avg_ms >= t.slowAvgMs && r.calls >= 3)
      out.push({
        id: `slow:${r.location}`,
        area: 'query',
        table: r.table,
        location: r.location,
        priority: r.avg_ms >= t.slowAvgMs * 3 ? 'high' : 'medium',
        suggestion: `Requests to “${r.location}” are slow as the browser sees them (network included). Compare with the database-side numbers to tell whether it is the query or the connection.`,
        evidence: `${r.avg_ms} ms average, ${r.max_ms} ms slowest, ${r.calls} calls`,
      })
    if (r.calls >= 10 && r.errors / r.calls >= t.errorShare)
      out.push({
        id: `err:${r.location}`,
        area: 'errors',
        table: r.table,
        location: r.location,
        priority: 'medium',
        suggestion: `A noticeable share of “${r.location}” requests fail. Look at the recent errors in System Health.`,
        evidence: `${r.errors} of ${r.calls} calls failed`,
      })
  }
  return out.sort((a, b) => RANK[a.priority] - RANK[b.priority])
}

/** A short headline: how the database is doing, from the numbers alone. */
export function perfStatus(o, findings = overviewFindings(o)) {
  if (!o) return { status: 'unknown', reason: 'No data' }
  if (findings.some((f) => f.priority === 'high'))
    return { status: 'degraded', reason: findings.find((f) => f.priority === 'high').suggestion }
  if (o.latency_ms > 500) return { status: 'degraded', reason: `The database answered in ${o.latency_ms} ms` }
  return {
    status: 'operational',
    reason: findings.length ? `${findings.length} suggestion${findings.length === 1 ? '' : 's'} to look at` : 'Nothing needs attention',
  }
}
