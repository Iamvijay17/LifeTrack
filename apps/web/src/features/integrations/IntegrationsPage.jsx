import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import { AlertTriangle, CalendarSync, Cloud, Download, HardDrive, Plug, RefreshCw, Unplug } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { EmptyState } from '@/components/shared/states'
import { useConfirm } from '@/components/shared/Confirm'
import { Button } from '@/components/ui/button'
import { Badge, Skeleton } from '@/components/ui/misc'
import { Select } from '@/components/ui/form'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'
import { PROVIDERS, integrations } from '@/services/integrations'
import { buildExport } from '@/services/backup'
import { download } from '@/services/csv'

const ago = (iso) => {
  try {
    return `${formatDistanceToNowStrict(new Date(iso))} ago`
  } catch {
    return 'never'
  }
}
const KIND = {
  connected: 'Connected',
  synced: 'Synced',
  backup: 'Backup saved',
  restore: 'Backup downloaded',
  error: 'Problem',
  revoked: 'Access revoked',
  disconnected: 'Disconnected',
  conflict: 'Needs your decision',
}
const ERRORS = {
  denied: 'You chose not to allow access, so nothing was connected.',
  failed: 'Google could not be connected. Try again.',
  invalid_state: 'That sign-in link expired. Start the connection again.',
  not_configured: 'Google integrations are not set up on this server yet.',
}

function statusOf(row) {
  if (!row) return { tone: 'neutral', label: 'Not connected' }
  if (row.status === 'revoked') return { tone: 'warning', label: 'Access revoked' }
  if (row.status === 'error' || row.last_error) return { tone: 'warning', label: 'Needs attention' }
  return { tone: 'success', label: 'Connected' }
}

function ProviderCard({ meta, row, available, loading, children }) {
  const confirm = useConfirm()
  const status = statusOf(row)
  const [connect, connecting] = useAction(async () => {
    window.location.assign(await integrations.start(meta.key)) // Google's own consent page; it sends the browser back here
  })
  const [disconnect, disconnecting] = useAction(
    async () => {
      if (
        await confirm({
          title: `Disconnect ${meta.name}?`,
          description:
            'LifeTrack asks Google to forget the connection and deletes its copy of the access. Your data in LifeTrack and in Google is not deleted.',
          confirmLabel: 'Disconnect',
        })
      )
        await integrations.disconnect(meta.key)
    },
    { success: 'Disconnected' },
  )
  const connected = row?.status === 'connected'
  return (
    <SettingsSection headingAs="h3" icon={meta.key === 'google_drive' ? HardDrive : CalendarSync} title={meta.name} desc={meta.blurb}>
      <div className="flex flex-wrap items-center gap-2" aria-busy={loading || undefined}>
        {loading ? <Skeleton className="h-5 w-24 rounded-full" /> : <Badge tone={status.tone}>{status.label}</Badge>}
        {row?.account_email && <span className="text-xs text-muted-foreground">{row.account_email}</span>}
        {connected && row.last_sync_at && <span className="text-xs text-muted-foreground">Last sync {ago(row.last_sync_at)}</span>}
      </div>
      {row?.last_error && connected && (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {row.last_error}
        </p>
      )}
      {row?.status === 'revoked' && (
        <p className="text-xs text-warning">
          Google no longer lets LifeTrack in (you removed it in your Google account, or the grant expired). Connect again to continue.
        </p>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground/80">What LifeTrack can do with your Google account</summary>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
          {meta.permissions.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </details>
      {connected && children}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {loading && <Skeleton className="h-9 w-48 rounded-lg" />}
        {!loading && !connected && (
          <Button
            onClick={() => connect()}
            loading={connecting}
            disabled={!available}
            title={available ? undefined : 'Not set up on this server yet'}
          >
            <Plug className="h-4 w-4" aria-hidden /> {row?.status === 'revoked' ? 'Connect again' : `Connect ${meta.name}`}
          </Button>
        )}
        {row && (
          <Button variant="outline" onClick={() => disconnect()} loading={disconnecting}>
            <Unplug className="h-4 w-4" aria-hidden /> Disconnect
          </Button>
        )}
      </div>
    </SettingsSection>
  )
}

function CalendarControls({ row }) {
  const [calendars, setCalendars] = useState(null)
  const [calendarId, setCalendarId] = useState(row.settings?.calendarId ?? 'primary')
  const [result, setResult] = useState(null)
  useEffect(() => {
    integrations.calendars().then(setCalendars, () => setCalendars([]))
  }, [])
  const [sync, syncing] = useAction(async (resolutions) => {
    const r = await integrations.syncCalendar(calendarId, resolutions)
    setResult(r)
    // The Edge Function wrote straight to the database, so the calendar's in-memory list is stale until it is re-read.
    store.refetch('calendar_events')
    store.refetch('integration_events')
    const c = r.counts
    toast.success(r.conflicts.length ? 'Synced, with changes waiting for you' : 'Calendar synced', {
      description: `${c.imported} imported, ${c.exported} sent, ${c.updated} updated.`,
    })
  })
  const pick = (localId, keep) => sync({ [localId]: keep })
  return (
    <div className="space-y-3">
      {calendars?.length > 0 && (
        <label className="block space-y-1 text-[13px] font-medium">
          Calendar to sync
          <Select value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.primary ? ' (main)' : ''}
              </option>
            ))}
          </Select>
        </label>
      )}
      <Button variant="outline" onClick={() => sync({})} loading={syncing}>
        <RefreshCw className="h-4 w-4" aria-hidden /> Sync now
      </Button>
      <p className="text-xs text-muted-foreground">
        Looks at events from 30 days ago to 6 months ahead. Repeating Google events arrive as one event per date; repeating LifeTrack events go to Google as a repeating event.
      </p>
      {result?.conflicts.length > 0 && (
        <div
          role="region"
          aria-label="Changes that need your decision"
          className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-[13px]"
        >
          <p className="font-medium text-warning">Changed in both places</p>
          {result.conflicts.map((c) => (
            <div key={c.localId} className="space-y-1.5 rounded-md border border-border bg-card/70 p-2.5">
              <p>
                <b>LifeTrack:</b> {c.local.title} · {format(new Date(c.local.starts_at), 'd MMM, HH:mm')}
              </p>
              <p>
                <b>Google:</b> {c.remote.title} · {format(new Date(c.remote.starts_at), 'd MMM, HH:mm')}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => pick(c.localId, 'local')} disabled={syncing}>
                  Keep LifeTrack's
                </Button>
                <Button size="sm" variant="outline" onClick={() => pick(c.localId, 'remote')} disabled={syncing}>
                  Use Google's
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {result?.remoteGone.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {result.remoteGone.length} event(s) no longer exist on Google (
          {result.remoteGone
            .slice(0, 3)
            .map((e) => e.title)
            .join(', ')}
          ). They were kept in LifeTrack.
        </p>
      )}
    </div>
  )
}

function DriveControls() {
  const confirm = useConfirm()
  const [files, setFiles] = useState(null)
  const load = useCallback(() => integrations.backups().then(setFiles, () => setFiles([])), [])
  useEffect(() => void load(), [load])
  const [backup, backingUp] = useAction(async () => {
    const ok = await confirm({
      title: 'Back up to Google Drive?',
      description:
        'This uploads a complete copy of your LifeTrack data (every module, as JSON) to the "LifeTrack Backups" folder in your Drive. Only you and anyone with access to that Drive account can read it.',
      confirmLabel: 'Upload backup',
      destructive: false,
    })
    if (!ok) return
    const file = await integrations.backup(JSON.stringify(await buildExport()))
    toast.success('Backup saved to Google Drive', { description: file.name })
    await load()
  })
  const [fetchIt, fetching] = useAction(
    async (f) => {
      download(f.name, await integrations.downloadBackup(f.id), 'application/json')
    },
    { success: 'Backup downloaded. Restore it from Data Export.' },
  )
  return (
    <div className="space-y-3">
      <Button variant="outline" onClick={() => backup()} loading={backingUp}>
        <Cloud className="h-4 w-4" aria-hidden /> Back up now
      </Button>
      <p className="text-xs text-muted-foreground">Nothing is uploaded unless you press this button.</p>
      <div>
        <h4 className="lt-eyebrow pb-1 text-[11px]">Your backups</h4>
        {files === null ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : files.length === 0 ? (
          <p className="text-xs text-muted-foreground">No backups yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[13px]">
                <span className="min-w-0 truncate">
                  {f.name} <span className="text-xs text-muted-foreground">· {ago(f.createdTime)}</span>
                </span>
                <Button size="sm" variant="ghost" loading={fetching} onClick={() => fetchIt(f)} aria-label={`Download ${f.name}`}>
                  <Download className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function IntegrationsPage() {
  const [params, setParams] = useSearchParams()
  const [caps, setCaps] = useState({ state: 'checking' })
  const { rows: rowList, loading: loadingRows } = store.useTable('integrations')
  const { rows: events } = store.useTable('integration_events')
  const byProvider = useMemo(() => Object.fromEntries(rowList.map((r) => [r.provider, r])), [rowList])

  useEffect(() => {
    integrations.capabilities().then(
      (c) => setCaps({ state: c.configured ? 'ready' : 'unconfigured' }),
      (e) => setCaps({ state: 'unreachable', message: e.message }),
    )
  }, [])
  // Back from Google: say what happened once, then clean the address bar.
  useEffect(() => {
    const ok = params.get('connected')
    const err = params.get('error')
    if (!ok && !err) return
    if (ok) {
      toast.success(`${PROVIDERS[ok]?.name ?? 'Google'} connected`)
      store.refetch('integrations')
      store.refetch('integration_events')
    } else toast.error(ERRORS[err] ?? ERRORS.failed)
    setParams({}, { replace: true })
  }, [params, setParams])

  const available = caps.state === 'ready'
  const history = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20)
  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect other services, and move your data in and out. Everything is opt-in and can be disconnected."
        icon={Plug}
      />
      <div className="mx-auto max-w-4xl space-y-4">
        {caps.state === 'unconfigured' && (
          <div role="note" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-[13px] text-warning">
            Google integrations are not set up on this server yet, so nothing can be connected. The steps are in docs/INTEGRATIONS.md (a
            Google Cloud OAuth client and four secrets).
          </div>
        )}
        {caps.state === 'unreachable' && (
          <div role="note" className="rounded-lg border border-border bg-surface-2/60 p-3 text-[13px] text-muted-foreground">
            {caps.message}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <ProviderCard meta={PROVIDERS.google_calendar} row={byProvider.google_calendar} available={available} loading={loadingRows}>
            <CalendarControls row={byProvider.google_calendar} />
          </ProviderCard>
          <ProviderCard meta={PROVIDERS.google_drive} row={byProvider.google_drive} available={available} loading={loadingRows}>
            <DriveControls />
          </ProviderCard>
        </div>
        <SettingsSection
          headingAs="h3"
          icon={Download}
          title="Files on this device"
          desc="No account needed: export everything as JSON or per-module CSV, import a CSV, or restore a backup."
        >
          <Link to="/export" className="text-sm font-medium text-mod-text underline underline-offset-2">
            Open Data Export →
          </Link>
        </SettingsSection>
        <SettingsSection
          headingAs="h3"
          title="Activity"
          desc="What your connections have done. Tokens and file contents are never shown here."
        >
          {history.length === 0 ? (
            <EmptyState title="No activity yet" description="Connecting, syncing and backing up will appear here." />
          ) : (
            <ul className="divide-y divide-border">
              {history.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-[13px]">
                  <span className="min-w-0">
                    <b>{KIND[e.kind] ?? e.kind}</b> <span className="text-muted-foreground">· {PROVIDERS[e.provider]?.name}</span>
                    {e.message && <span className="block truncate text-xs text-muted-foreground">{e.message}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{ago(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </SettingsSection>
      </div>
    </>
  )
}
