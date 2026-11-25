import { useState } from 'react'
import { Line, LineChart } from 'recharts'
import { Database, Gauge, HardDrive, Plug, RefreshCw, Timer, Zap } from 'lucide-react'
import { DataGate } from '@/components/shared/states'
import { StatCard } from '@/components/shared/StatCard'
import { VirtualList } from '@/components/shared/VirtualList'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, Segmented } from '@/components/ui/misc'
import { Chart, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { useLoad } from '@/hooks/useLoad'
import { formatBytes, overviewFindings, perfStatus, queryFindings } from '@lifetrack/core/dbPerformance'
import { dbCacheStats, dbOverviewCached, dbQueryReportCached } from '@/services/platform'
import { ago } from '@/features/developers/shared'

const TONE = { high: 'danger', medium: 'warning', low: 'neutral' }
const pct = (v, dp = 2) => (v == null ? '—' : `${(v * 100).toFixed(dp)}%`)
const num = (v) => (v == null ? '—' : Number(v).toLocaleString())

function Findings({ findings }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3">Query analyzer report</CardTitle>
      </CardHeader>
      <CardContent>
        {!findings.length ? (
          <p className="py-4 text-center text-sm text-muted-foreground" data-testid="no-findings">
            Nothing to suggest. Findings appear when the measurements show a full-table scan, an unused index, a slow statement or a query
            that returns too many rows.
          </p>
        ) : (
          <ul className="divide-y divide-border/60" data-testid="findings">
            {findings.map((f) => (
              <li key={f.id} className="flex items-start gap-3 py-3">
                <Badge tone={TONE[f.priority]}>{f.priority}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{f.suggestion}</span>
                  <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                    {f.location ?? f.table ?? f.area} · {f.evidence}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function QueryTable({ rows }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3">Queries run by the app (as the browsers measured them)</CardTitle>
      </CardHeader>
      <CardContent>
        {!rows.length ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No measurements in this window yet. A sample of sessions reports its request timings every few minutes, so this fills as people
            use the app.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[640px] text-xs">
              <div
                className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 border-b border-border pb-1 font-medium text-muted-foreground"
                role="row"
              >
                <span>Location</span>
                <span>Calls</span>
                <span>Avg ms</span>
                <span>Slowest ms</span>
                <span>Rows / call</span>
                <span>Failed · slow</span>
              </div>
              <VirtualList
                label="Query statistics"
                items={rows}
                rowHeight={36}
                height={300}
                getKey={(r) => r.location}
                renderRow={(r) => (
                  <div className="grid h-full grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] items-center gap-2 border-b border-border/50">
                    <code className="truncate">{r.location}</code>
                    <span>{num(r.calls)}</span>
                    <span>{r.avg_ms}</span>
                    <span>{r.max_ms}</span>
                    <span>{r.rows_avg}</span>
                    <span>
                      {r.errors} · {r.slow}
                    </span>
                  </div>
                )}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Trends({ trend }) {
  const rows = trend.map((t) => ({
    label: new Date(t.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    hit: t.cache_hit_ratio == null ? null : Number((t.cache_hit_ratio * 100).toFixed(2)),
    latency: t.latency_ms,
    connections: t.connections,
  }))
  const few = rows.length < 2
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {[
        ['Cache hit rate (%)', 'hit', '#10B981'],
        ['Probe latency (ms)', 'latency', '#8B5CF6'],
        ['Connections', 'connections', '#F59E0B'],
      ].map(([title, key, colour]) => (
        <Card key={key}>
          <CardHeader>
            <CardTitle as="h3">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart
              height={150}
              empty={few}
              emptyText="Trend points are recorded each time this view is opened (at most one per 10 minutes)."
              summary={`${title} over time`}
            >
              <LineChart data={rows}>
                {grid()}
                {xAxis({ dataKey: 'label', interval: 'preserveStartEnd', minTickGap: 40 })}
                {yAxis({ width: 40, domain: key === 'hit' ? ['auto', 100] : undefined })}
                {tooltip()}
                <Line type="monotone" dataKey={key} name={title} stroke={colour} strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </Chart>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function DatabasePerformance() {
  const [hours, setHours] = useState(24)
  const { data: o, loading, error, reload } = useLoad(() => dbOverviewCached(hours), [hours])
  const { data: q } = useLoad(() => dbQueryReportCached(hours), [hours])
  const findings = o
    ? [...overviewFindings(o), ...queryFindings(q?.rows)].sort(
        (a, b) => ['high', 'medium', 'low'].indexOf(a.priority) - ['high', 'medium', 'low'].indexOf(b.priority),
      )
    : []
  const status = o ? perfStatus(o, findings) : null
  const refresh = () => Promise.all([dbOverviewCached(hours, { force: true }), dbQueryReportCached(hours, { force: true })]).then(reload)
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Segmented
          aria-label="Time range"
          value={hours}
          onChange={setHours}
          options={[
            { value: 24, label: '24 hours' },
            { value: 72, label: '3 days' },
            { value: 168, label: '7 days' },
            { value: 720, label: '30 days' },
          ]}
        />
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          {o && <span>Updated {ago(o.generated_at)}</span>}
          <Button variant="outline" size="sm" onClick={refresh} loading={loading}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
          </Button>
        </span>
      </div>
      <DataGate loading={loading && !o} error={error?.message} onRetry={reload} skeleton="page">
        {o && (
          <div className="space-y-4" data-testid="db-performance">
            <Card className={status.status === 'operational' ? 'border-success/40' : 'border-warning/50'}>
              <CardContent className="flex items-center gap-3 text-sm" data-testid="perf-status" data-status={status.status}>
                <Gauge className={`h-6 w-6 ${status.status === 'operational' ? 'text-success' : 'text-warning'}`} aria-hidden />
                <span>
                  <span className="font-medium">
                    {status.status === 'operational' ? 'Database is healthy' : 'Database needs attention'}
                  </span>
                  <span className="block text-muted-foreground">{status.reason}</span>
                </span>
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={Plug}
                label="Connections"
                value={`${o.connections.total} / ${o.connections.max}`}
                sub={`${o.connections.active} active · ${o.connections.idle_in_transaction} idle in transaction`}
              />
              <StatCard
                icon={Timer}
                label="Probe latency"
                value={`${o.latency_ms} ms`}
                sub={`Count of audit history ${o.aggregation?.count_audit_ms ?? '—'} ms · by day ${o.aggregation?.group_by_day_ms ?? '—'} ms`}
              />
              <StatCard
                icon={HardDrive}
                label="Database size"
                value={formatBytes(o.database.size_bytes)}
                sub={`${num(o.database.rollbacks)} rollbacks · ${o.database.deadlocks} deadlocks`}
              />
              <StatCard
                icon={Zap}
                label="Cache hit rate"
                value={pct(o.cache_hit_ratio)}
                sub={
                  dbCacheStats().hitRate == null
                    ? 'Rows served from memory, not disk'
                    : `This view's own cache: ${pct(dbCacheStats().hitRate, 0)} hits`
                }
                tone={o.cache_hit_ratio != null && o.cache_hit_ratio < 0.99 ? 'danger' : 'primary'}
              />
            </div>

            <Findings findings={findings} />
            <QueryTable rows={q?.rows ?? []} />
            <Trends trend={o.trend} />

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle as="h3">Largest tables</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        {['Table', 'Rows', 'Size', 'Full scans', 'Index scans'].map((h) => (
                          <th key={h} scope="col" className="py-1 pr-2">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {o.tables.slice(0, 10).map((t) => (
                        <tr key={t.table} className="border-t border-border/60">
                          <th scope="row" className="py-1.5 pr-2 font-medium">
                            {t.table}
                          </th>
                          <td className="pr-2">{num(t.rows)}</td>
                          <td className="pr-2">{formatBytes(t.size_bytes)}</td>
                          <td className="pr-2">{num(t.seq_scans)}</td>
                          <td>{num(t.index_scans)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle as="h3">Index usage</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        {['Index', 'Scans', 'Size'].map((h) => (
                          <th key={h} scope="col" className="py-1 pr-2">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {o.indexes.slice(0, 10).map((i) => (
                        <tr key={i.index} className="border-t border-border/60">
                          <th scope="row" className="max-w-[16rem] truncate py-1.5 pr-2 font-medium" title={`${i.table}.${i.index}`}>
                            {i.index}
                          </th>
                          <td className="pr-2">
                            {i.scans === 0 && !i.unique && !i.primary ? <Badge tone="warning">0 · unused</Badge> : num(i.scans)}
                          </td>
                          <td>{formatBytes(i.size_bytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle as="h3">Slow statements (database side)</CardTitle>
                </CardHeader>
                <CardContent>
                  {!o.statements_available ? (
                    <p className="py-3 text-sm text-muted-foreground">
                      The pg_stat_statements extension is not enabled on this database, so statement timings are not available. Enable it in
                      the Supabase dashboard (Database → Extensions); nothing is estimated in its place.
                    </p>
                  ) : !o.slow_queries?.length ? (
                    <p className="py-3 text-center text-sm text-muted-foreground">
                      No statement averaged over 50 ms (with at least 3 calls).
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {o.slow_queries.map((s, k) => (
                        <li key={k} className="rounded-md bg-muted/40 p-2 text-xs">
                          <code className="block break-all">{s.query}</code>
                          <span className="text-muted-foreground">
                            {s.mean_ms} ms average · {s.max_ms} ms worst · {s.calls} calls · {s.rows_per_call} rows per call
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Database className="h-3.5 w-3.5" aria-hidden /> Figures come from the database's own statistics and from timings the browsers
              report about their own requests (a sample of sessions; table and operation names only, never filters, ids or content).
            </p>
          </div>
        )}
      </DataGate>
    </>
  )
}
