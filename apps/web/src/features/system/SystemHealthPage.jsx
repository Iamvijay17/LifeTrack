import { useEffect, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, Line, LineChart } from 'recharts'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  ShieldAlert,
  Webhook,
  XCircle,
  Workflow,
  Cloud,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { StatCard } from '@/components/shared/StatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, Segmented } from '@/components/ui/misc'
import { Select } from '@/components/ui/form'
import { Chart, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { useLoad } from '@/hooks/useLoad'
import { LATENCY_BUCKETS, availability, errorRate, overallStatus, percentileFromHistogram } from '@lifetrack/core/systemHealth'
import { isPlatformAdmin, platformAvailable, systemErrors, systemMetrics, systemOverview } from '@/services/platform'
import { UnavailableState, ago, stamp } from '@/features/developers/shared'
import { DatabasePerformance } from './DatabasePerformance'

const TONE = { operational: 'success', degraded: 'warning', down: 'danger', unknown: 'neutral' }
const LABEL = { operational: 'Operational', degraded: 'Degraded', down: 'Down', unknown: 'No data yet' }
const ICON = { operational: CheckCircle2, degraded: AlertTriangle, down: XCircle, unknown: CircleHelp }
const CATEGORIES = ['frontend', 'sync', 'network', 'auth', 'api', 'other']
const ms = (v) => (v === Infinity ? '> 1 s' : v == null ? '—' : `${v} ms`)
const pct = (v, dp = 1) => (v == null ? '—' : `${(v * 100).toFixed(dp)}%`)

function Component({ icon: Icon, name, status, detail }) {
  const S = ICON[status]
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border p-3" data-testid={`component-${name}`}>
      <span className="lt-icon-soft h-9 w-9 shrink-0 rounded-md">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{name}</span>
          <Badge tone={TONE[status]}>
            <S className="h-3 w-3" aria-hidden />
            {LABEL[status]}
          </Badge>
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
      </span>
    </li>
  )
}

function Charts({ hours }) {
  const { data, loading, error, reload } = useLoad(() => systemMetrics(hours), [hours])
  const rows = (data?.series ?? []).map((r) => ({
    ...r,
    label: new Date(r.hour).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      ...(hours > 24 ? { day: 'numeric', month: 'short' } : {}),
    }),
  }))
  const anyTraffic = rows.some((r) => r.requests > 0)
  const anyErrors = rows.some((r) => r.client_errors > 0)
  return (
    <DataGate loading={loading && !data} error={error?.message} onRetry={reload} skeleton="chart">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h3">API requests per hour</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart
              empty={!anyTraffic}
              emptyText="No API requests in this window."
              summary={`API requests per hour over the last ${hours} hours`}
            >
              <BarChart data={rows}>
                {grid()}
                {xAxis({ dataKey: 'label', interval: 'preserveStartEnd', minTickGap: 24 })}
                {yAxis({ allowDecimals: false })}
                {tooltip()}
                <Bar dataKey="requests" name="Requests" stackId="a" fill="#8B5CF6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="errors_4xx" name="Client errors" stackId="b" fill="#F59E0B" radius={[3, 3, 0, 0]} />
                <Bar dataKey="errors_5xx" name="Server errors" stackId="b" fill="#EF4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </Chart>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h3">Request latency (ms)</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart
              empty={!anyTraffic}
              emptyText="No API requests in this window."
              summary={`Average and slowest request time per hour over the last ${hours} hours`}
            >
              <LineChart data={rows}>
                {grid()}
                {xAxis({ dataKey: 'label', interval: 'preserveStartEnd', minTickGap: 24 })}
                {yAxis({ width: 44 })}
                {tooltip()}
                <Line type="monotone" dataKey="avg_ms" name="Average" stroke="#8B5CF6" strokeWidth={2} dot={false} connectNulls />
                <Line
                  type="monotone"
                  dataKey="max_ms"
                  name="Slowest"
                  stroke="#F59E0B"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </Chart>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle as="h3">Application errors per hour (browser, sync)</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart
              height={160}
              empty={!anyErrors}
              emptyText="No application errors reported in this window."
              summary={`Reported application errors per hour over the last ${hours} hours`}
            >
              <AreaChart data={rows}>
                {grid()}
                {xAxis({ dataKey: 'label', interval: 'preserveStartEnd', minTickGap: 24 })}
                {yAxis({ allowDecimals: false })}
                {tooltip()}
                <Area type="monotone" dataKey="client_errors" name="Errors" stroke="#EF4444" fill="#EF444422" strokeWidth={2} />
              </AreaChart>
            </Chart>
          </CardContent>
        </Card>
      </div>
    </DataGate>
  )
}

function Errors() {
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState(null)
  const { data, loading, error, reload } = useLoad(
    () => systemErrors({ category: category || undefined, page, pageSize: 10 }),
    [category, page],
  )
  const items = data?.items ?? []
  return (
    <Card>
      <CardHeader className="flex-wrap gap-2">
        <CardTitle as="h3">Latest application errors</CardTitle>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Category
          <Select
            className="w-36"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              setPage(0)
            }}
            aria-label="Error category"
          >
            <option value="">All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </label>
      </CardHeader>
      <CardContent>
        <DataGate loading={loading && !data} error={error?.message} onRetry={reload} skeleton="list">
          {!items.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No errors reported{category ? ` in “${category}”` : ''}. Errors appear here when the app hits something unexpected.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {items.map((e) => (
                <li key={e.id} className="py-2.5">
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 text-left"
                    aria-expanded={open === e.id}
                    onClick={() => setOpen(open === e.id ? null : e.id)}
                  >
                    <Badge tone={e.category === 'sync' ? 'warning' : 'danger'}>{e.category}</Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm">{e.message}</span>
                      <span className="text-xs text-muted-foreground">
                        {e.occurrences}× · last {ago(e.last_seen)} · {e.route || 'no route'}
                        {e.release ? ` · v${e.release}` : ''}
                      </span>
                    </span>
                  </button>
                  {open === e.id && (
                    <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted/40 p-3 text-[11px]" data-testid="error-stack">
                      {e.stack || 'No stack trace was captured.'}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(data?.total ?? 0) > 10 && (
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {page * 10 + 1}–{page * 10 + items.length} of {data.total}
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Newer
                </Button>
                <Button size="sm" variant="outline" disabled={(page + 1) * 10 >= data.total} onClick={() => setPage(page + 1)}>
                  Older
                </Button>
              </span>
            </div>
          )}
        </DataGate>
      </CardContent>
    </Card>
  )
}

function Dashboard() {
  const [hours, setHours] = useState(24)
  const { data: o, loading, error, reload } = useLoad(systemOverview, [])
  useEffect(() => {
    const id = setInterval(reload, 60_000)
    return () => clearInterval(id)
  }, [reload])
  const view = o ? overallStatus(o) : null
  const api = o?.api ?? {}
  const c = view?.components
  const OverallIcon = view ? ICON[view.status] : CircleHelp
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Segmented
          aria-label="Time window"
          value={hours}
          onChange={setHours}
          options={[
            { value: 24, label: '24 hours' },
            { value: 72, label: '3 days' },
            { value: 168, label: '7 days' },
          ]}
        />
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          {o && <span>Updated {ago(o.generated_at)}</span>}
          <Button variant="outline" size="sm" onClick={reload} loading={loading}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
          </Button>
        </span>
      </div>
      <DataGate loading={loading && !o} error={error?.message} onRetry={reload} skeleton="page">
        {o && (
          <div className="space-y-4">
            <Card
              className={
                view.status === 'operational' ? 'border-success/40' : view.status === 'degraded' ? 'border-warning/50' : 'border-danger/50'
              }
            >
              <CardContent className="flex flex-wrap items-center gap-4" data-testid="overall-status" data-status={view.status}>
                <OverallIcon
                  className={`h-9 w-9 ${view.status === 'operational' ? 'text-success' : view.status === 'degraded' ? 'text-warning' : 'text-danger'}`}
                  aria-hidden
                />
                <div>
                  <p className="text-lg font-semibold">
                    {view.status === 'operational'
                      ? 'All systems operational'
                      : view.status === 'degraded'
                        ? 'Some systems are degraded'
                        : 'A core system is down'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {view.reasons.length ? view.reasons.join(' · ') : 'Everything that reports is healthy.'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Components">
              <Component icon={Server} name="Backend" status={c.backend.status} detail={c.backend.detail} />
              <Component icon={Database} name="Database" status={c.database.status} detail={c.database.detail} />
              <Component icon={Activity} name="API" status={c.api.status} detail={c.api.detail} />
              <Component icon={Workflow} name="Sync engine" status={c.sync.status} detail={c.sync.detail} />
              <Component icon={HardDrive} name="Background jobs" status={c.jobs.status} detail={c.jobs.detail} />
              <Component icon={Webhook} name="Webhook delivery" status={c.webhooks.status} detail={c.webhooks.detail} />
            </ul>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={Activity}
                label="API requests (24 h)"
                value={String(api.requests ?? 0)}
                sub={`${api.rate_limited ?? 0} rate-limited`}
              />
              <StatCard
                icon={ShieldAlert}
                label="Server error rate"
                value={pct(errorRate(api))}
                sub={`Availability ${pct(availability(api))} · ${api.errors_4xx ?? 0} client errors`}
                tone={errorRate(api) > 0.02 ? 'danger' : 'primary'}
              />
              <StatCard
                icon={Activity}
                label="Latency (avg · p95)"
                value={`${api.avg_ms ?? '—'}${api.avg_ms != null ? ' ms' : ''}`}
                sub={`p95 ${ms(percentileFromHistogram(api.hist, 0.95))} · ${api.slow ?? 0} slow`}
              />
              <StatCard
                icon={ShieldAlert}
                label="Authentication failures"
                value={String(api.auth_failures ?? 0)}
                sub="Bad, revoked or expired API keys (24 h)"
                tone={api.auth_failures > 20 ? 'danger' : 'primary'}
              />
            </div>

            <Charts hours={hours} />

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle as="h3">Recent incidents</CardTitle>
                </CardHeader>
                <CardContent>
                  {!o.incidents.length ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">No incidents in the last 7 days.</p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {o.incidents.slice(0, 10).map((i, k) => (
                        <li key={`${i.at}${k}`} className="flex items-start gap-3 py-2">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                          <span className="min-w-0">
                            <span className="block text-sm">{i.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {stamp(i.at)}
                              {i.detail ? ` · ${i.detail}` : ''}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle as="h3">Background jobs</CardTitle>
                </CardHeader>
                <CardContent>
                  {!o.jobs.length ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      No job has reported yet. Schedule the <code>webhook-dispatch</code> function (docs/WEBHOOKS_API.md).
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-muted-foreground">
                          <tr>
                            <th scope="col" className="py-1 pr-2">
                              Job
                            </th>
                            <th scope="col" className="pr-2">
                              Last run
                            </th>
                            <th scope="col" className="pr-2">
                              Status
                            </th>
                            <th scope="col" className="pr-2">
                              Runs / failed (24 h)
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {o.jobs.map((j) => (
                            <tr key={j.job} className="border-t border-border/60">
                              <th scope="row" className="py-2 pr-2 font-medium">
                                {j.job}
                              </th>
                              <td className="pr-2">{ago(j.last_run)}</td>
                              <td className="pr-2">
                                <Badge tone={j.last_status === 'ok' ? 'success' : 'danger'}>{j.last_status}</Badge>
                              </td>
                              <td>
                                {j.runs_24h} / {j.failures_24h}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle as="h3">Slow database queries</CardTitle>
                </CardHeader>
                <CardContent>
                  {!o.database.slow_queries?.length ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      None over 100 ms on average (or the statistics extension is not enabled).
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {o.database.slow_queries.map((q, k) => (
                        <li key={k} className="rounded-md bg-muted/40 p-2 text-xs">
                          <code className="block break-all">{q.query}</code>
                          <span className="text-muted-foreground">
                            {q.mean_ms} ms average · {q.max_ms} ms worst · {q.calls} calls
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle as="h3">Backups and storage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  <p className="flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-muted-foreground" aria-hidden /> {c.backup.detail}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Retained rows: {o.storage.errors_rows} error types, {o.storage.request_log_rows} API requests, {o.storage.job_runs_rows}{' '}
                    job runs, {o.storage.audit_rows} audit events. Old rows are removed daily (see docs/SYSTEM_HEALTH.md for the retention
                    settings).
                  </p>
                </CardContent>
              </Card>
            </div>
            <Errors />
            <p className="text-xs text-muted-foreground">
              Latency buckets: {LATENCY_BUCKETS.join(' / ')} ms and slower. Request volume covers the public API; the database's own request
              log is in the Supabase dashboard.
            </p>
          </div>
        )}
      </DataGate>
    </>
  )
}

export default function SystemHealthPage() {
  const available = platformAvailable()
  const { data: admin, loading } = useLoad(isPlatformAdmin, [], { enabled: available })
  const [section, setSection] = useState('overview')
  return (
    <>
      <PageHeader
        title="System Health"
        description="Availability, performance and errors across the backend, database, API and background jobs."
      />
      {!available ? (
        <UnavailableState />
      ) : loading ? (
        <DataGate loading skeleton="page" />
      ) : !admin ? (
        <EmptyState
          icon={ShieldAlert}
          title="Administrator access required"
          description="System Health shows information about the whole installation, so only administrators can open it. An administrator is added by the project owner with one SQL statement (docs/SYSTEM_HEALTH.md). Nothing about other people's data is shown here."
        />
      ) : (
        <>
          <Segmented
            className="mb-4 print:hidden"
            aria-label="System Health section"
            value={section}
            onChange={setSection}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'database', label: 'Database performance' },
            ]}
          />
          {section === 'database' ? <DatabasePerformance /> : <Dashboard />}
        </>
      )}
    </>
  )
}
