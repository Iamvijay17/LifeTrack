import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronDown, ChevronLeft, ChevronRight, Download, History, RotateCcw, Search, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { Input, Select } from '@/components/ui/form'
import { Card, CardContent } from '@/components/ui/card'
import { useLoad } from '@/hooks/useLoad'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/shared/Confirm'
import {
  AUDIT_ACTIONS,
  AUDIT_MODULES,
  SOURCES,
  auditExportRows,
  canOfferRestore,
  changeRows,
  describeEvent,
  entitiesOfModule,
  entityMeta,
} from '@lifetrack/core/audit'
import { download, toCsv } from '@/services/csv'
import { eraseAuditHistory, exportAuditEvents, listAuditEvents, platformAvailable, verifyAuditChain } from '@/services/platform'
import { TypedConfirmDialog } from '@/components/shared/TypedConfirmDialog'
import { logAudit } from '@/services/auditLog'
import { UnavailableState, stamp } from '@/features/developers/shared'
import { RestoreDialog } from './RestoreDialog'

const PAGE_SIZE = 25
const dayKey = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function EventRow({ ev, open, onToggle, onRestore }) {
  const meta = AUDIT_ACTIONS[ev.action] ?? { label: ev.action, tone: 'neutral' }
  const rows = open ? changeRows(ev) : []
  return (
    <li className="border-b border-border/60 last:border-0" data-testid="audit-event">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-1 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Badge tone={meta.tone} className="mt-0.5 w-[5.5rem] justify-center">
          {meta.label}
        </Badge>
        <span className="min-w-0 flex-1">
          <span className="block text-sm">{describeEvent(ev)}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {entityMeta(ev.entity).module} · {new Date(ev.occurred_at).toLocaleTimeString(undefined, { timeStyle: 'short' })} ·{' '}
            {SOURCES[ev.source] ?? ev.source}
          </span>
        </span>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="space-y-3 pb-4 pl-[6.25rem] pr-1" data-testid="audit-detail">
          {rows.length ? (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Before and after values</caption>
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Field
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Before
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      After
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.field} className="border-t border-border/60 align-top">
                      <th scope="row" className="px-3 py-2 font-medium">
                        {r.label}
                      </th>
                      <td className="max-w-[16rem] break-words px-3 py-2 text-danger/90">{r.before}</td>
                      <td className="max-w-[16rem] break-words px-3 py-2 text-success">{r.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No field values were recorded for this event.</p>
          )}
          {ev.truncated && <p className="text-xs text-warning">A long text in this event was cut short in the log.</p>}
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <dt>Time</dt>
            <dd>{stamp(ev.occurred_at)}</dd>
            <dt>Event</dt>
            <dd className="break-all font-mono">{ev.id}</dd>
            {ev.record_id && (
              <>
                <dt>Record</dt>
                <dd className="break-all font-mono">{ev.record_id}</dd>
              </>
            )}
            {ev.request_id && (
              <>
                <dt>Request</dt>
                <dd className="break-all font-mono">{ev.request_id}</dd>
              </>
            )}
          </dl>
          {canOfferRestore(ev) && (
            <Button variant="outline" size="sm" onClick={() => onRestore(ev)}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />{' '}
              {ev.operation === 'delete' ? 'Restore this record…' : 'Restore earlier values…'}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

export default function AuditPage() {
  const available = platformAvailable()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState(null)
  const [restoring, setRestoring] = useState(null)
  const [erasing, setErasing] = useState(false)
  const module = AUDIT_MODULES.includes(params.get('module')) ? params.get('module') : ''
  const action = Object.keys(AUDIT_ACTIONS).includes(params.get('action')) ? params.get('action') : ''
  const source = Object.keys(SOURCES).includes(params.get('source')) ? params.get('source') : ''
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.get('from') ?? '') ? params.get('from') : ''
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.get('to') ?? '') ? params.get('to') : ''
  const q = params.get('q') ?? ''
  const [typed, setTyped] = useState(q)
  useEffect(() => {
    const t = setTimeout(() => typed !== q && set({ q: typed }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `set` only reads `params`, which `q` already tracks
  }, [typed])
  const set = (patch) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k)
    setParams(next, { replace: true })
    setPage(0)
  }
  // Day boundaries are the person's own: "from" starts at local midnight, "to" includes the whole day.
  const filters = useMemo(
    () => ({
      actions: action ? [action] : undefined,
      entities: module ? entitiesOfModule(module) : undefined,
      source: source || undefined,
      from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      to: to ? new Date(new Date(`${to}T00:00:00`).getTime() + 86400000).toISOString() : undefined,
      search: q || undefined,
    }),
    [action, module, source, from, to, q],
  )
  const { data, loading, error, reload } = useLoad(
    () => listAuditEvents({ filters, page, pageSize: PAGE_SIZE }),
    [JSON.stringify(filters), page],
    { enabled: available },
  )
  const rows = useMemo(() => data?.rows ?? [], [data])
  const total = data?.total ?? 0
  const grouped = useMemo(() => {
    const m = new Map()
    for (const r of rows) m.set(dayKey(r.occurred_at), [...(m.get(dayKey(r.occurred_at)) ?? []), r])
    return [...m]
  }, [rows])
  const filtered = Boolean(module || action || source || from || to || q)

  const [exportCsv, exporting] = useAction(async () => {
    const events = await exportAuditEvents(filters)
    if (!events.length) throw new Error('Nothing to export for these filters.')
    const cols = Object.keys(auditExportRows(events)[0]).map((k) => ({ header: k, value: (r) => r[k] }))
    download(`lifetrack-audit-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(auditExportRows(events), cols))
    void logAudit('export', 'audit', 'Audit history exported', { events: events.length })
    toast.success(`Exported ${events.length} event${events.length === 1 ? '' : 's'}`)
  })
  const [verify, verifying] = useAction(async () => {
    const r = await verifyAuditChain()
    if (r.ok) toast.success(`History intact`, { description: `${r.checked} events checked: none was changed, removed or inserted.` })
    else
      await confirm({
        title: 'The history does not verify',
        description: `An event (${r.broken_at}) does not match its record. The log is append-only, so this should never happen: contact your administrator.`,
        confirmLabel: 'OK',
        cancelLabel: 'Close',
        destructive: false,
      })
  })

  const [erase, erasingNow] = useAction(async () => {
    const n = await eraseAuditHistory()
    setErasing(false)
    toast.success(`Erased ${n} event${n === 1 ? '' : 's'}`, { description: 'One note that the history was erased has been kept.' })
    await reload()
  })

  return (
    <>
      <PageHeader
        title="Audit History"
        description="Every change to your data and account, with before and after values. Append-only: nothing here can be edited or hidden."
        actions={
          available && (
            <>
              <Button variant="outline" onClick={() => verify()} loading={verifying}>
                <ShieldCheck className="h-4 w-4" aria-hidden /> Verify integrity
              </Button>
              <Button variant="outline" onClick={() => exportCsv()} loading={exporting} disabled={!total}>
                <Download className="h-4 w-4" aria-hidden /> Export CSV
              </Button>
            </>
          )
        }
      />
      {!available ? (
        <UnavailableState />
      ) : (
        <>
          <Card className="mb-4 print:hidden">
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <label className="relative sm:col-span-2">
                <span className="sr-only">Search the history</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  className="pl-9"
                  placeholder="Search record, event or request id"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
              </label>
              <Select aria-label="Module" value={module} onChange={(e) => set({ module: e.target.value })}>
                <option value="">All modules</option>
                {AUDIT_MODULES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
              <Select aria-label="Action" value={action} onChange={(e) => set({ action: e.target.value })}>
                <option value="">All actions</option>
                {Object.entries(AUDIT_ACTIONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
              <Select aria-label="Source" value={source} onChange={(e) => set({ source: e.target.value })}>
                <option value="">Any source</option>
                {Object.entries(SOURCES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  aria-label="From date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => set({ from: e.target.value })}
                />
                <span className="text-muted-foreground" aria-hidden>
                  →
                </span>
                <Input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => set({ to: e.target.value })} />
              </div>
              {filtered && (
                <div className="sm:col-span-2 lg:col-span-6">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTyped('')
                      setParams({}, { replace: true })
                      setPage(0)
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <DataGate loading={loading && !data} error={error?.message} onRetry={reload} skeleton="list">
            {!rows.length ? (
              <EmptyState
                icon={History}
                title={filtered ? 'No events match these filters' : 'No history yet'}
                description={
                  filtered
                    ? 'Try a wider date range or fewer filters.'
                    : 'Changes to your tasks, habits, money, health and settings appear here as you make them.'
                }
              />
            ) : (
              <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
                {grouped.map(([day, events]) => (
                  <section key={day} className="mb-5" aria-label={day}>
                    <h2 className="lt-eyebrow mb-1 text-[11px]">{day}</h2>
                    <Card>
                      <CardContent className="!py-1">
                        <ul>
                          {events.map((ev) => (
                            <EventRow
                              key={ev.id}
                              ev={ev}
                              open={openId === ev.id}
                              onToggle={() => setOpenId(openId === ev.id ? null : ev.id)}
                              onRestore={setRestoring}
                            />
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </section>
                ))}
                <nav aria-label="Pages" className="flex items-center justify-between text-xs text-muted-foreground">
                  <span aria-live="polite">
                    {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + rows.length} of {total}
                  </span>
                  <span className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0 || loading}>
                      <ChevronLeft className="h-4 w-4" aria-hidden /> Newer
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={(page + 1) * PAGE_SIZE >= total || loading}
                    >
                      Older <ChevronRight className="h-4 w-4" aria-hidden />
                    </Button>
                  </span>
                </nav>
              </div>
            )}
          </DataGate>
          <p className="mt-6 text-xs text-muted-foreground print:hidden">
            Nothing here can be edited or hidden. If you want your history gone,{' '}
            <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setErasing(true)}>
              erase it
            </button>
            : it leaves one note saying that you did.
          </p>
          <TypedConfirmDialog
            open={erasing}
            onOpenChange={setErasing}
            title="Erase your audit history?"
            description="Every event is removed permanently, and so is your ability to restore from them. LifeTrack keeps one note that the history was erased. Your data itself is not touched."
            phrase="ERASE"
            confirmLabel="Erase history"
            pending={erasingNow}
            onConfirm={() => erase()}
          />
        </>
      )}
      <RestoreDialog
        event={restoring}
        onClose={() => setRestoring(null)}
        onDone={() => {
          setRestoring(null)
          reload()
        }}
      />
    </>
  )
}
