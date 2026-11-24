import { AlertCircle, AlertTriangle, Check, CloudOff, RefreshCw } from 'lucide-react'
import { ButtonLoader } from '@/components/loaders/ButtonLoader'
import { useSaveStatus } from '@/hooks/store'
import { useOnline } from '@/hooks/useOnline'
import { useAuth } from '@/hooks/useAuth'
import { isDevMode } from '@/services/db'
import { cn } from '@/lib/utils'
import { useSyncStatus } from '@/sync'
import { openSyncCenter } from '@/components/sync/SyncCenter'

export function SaveStatus() {
  const s = useSaveStatus()
  if (s.status === 'idle')
    return (
      <span className="hidden whitespace-nowrap text-xs text-muted-foreground lg:inline" data-testid="save-status">
        All changes saved
      </span>
    )
  const cfg = {
    saving: { icon: <ButtonLoader size={14} />, text: 'Saving…', cls: 'text-muted-foreground' },
    saved: { icon: <Check className="h-3.5 w-3.5" />, text: 'Saved', cls: 'text-success' },
    error: { icon: <AlertCircle className="h-3.5 w-3.5" />, text: 'Save failed', cls: 'text-danger' },
  }[s.status]
  return (
    <span
      role="status"
      data-testid="save-status"
      title={s.error ?? undefined}
      className={cn('flex animate-fade-in items-center gap-1.5 text-xs font-medium', cfg.cls)}
    >
      {cfg.icon}
      {cfg.text}
    </span>
  )
}

/** Shows whether what you did is safely on the server. Appears only when something is waiting, offline or needs attention. */
export function SyncPill() {
  const s = useSyncStatus()
  if (!s.enabled || (s.state === 'synced' && s.total === 0)) return null
  const n = s.total
  const cfg = {
    offline: {
      icon: <CloudOff className="h-3.5 w-3.5" />,
      text: n ? `Offline · ${n} saved` : 'Offline',
      cls: 'text-warning border-warning/40 bg-warning/10',
    },
    attention: {
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      text: `${s.failed + s.conflicts} need${s.failed + s.conflicts === 1 ? 's' : ''} attention`,
      cls: 'text-danger border-danger/40 bg-danger/10',
    },
    signin: {
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      text: 'Sign in to sync',
      cls: 'text-warning border-warning/40 bg-warning/10',
    },
    syncing: { icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" />, text: 'Syncing…', cls: 'text-muted-foreground border-border' },
    pending: { icon: <RefreshCw className="h-3.5 w-3.5" />, text: `${s.pending} waiting`, cls: 'text-muted-foreground border-border' },
    synced: { icon: <Check className="h-3.5 w-3.5" />, text: 'Synced', cls: 'text-success border-success/30' },
  }[s.state]
  return (
    <button
      type="button"
      onClick={() => openSyncCenter(true)}
      data-testid="sync-pill"
      data-state={s.state}
      aria-label={`Sync status: ${cfg.text}. Open sync details.`}
      className={cn('flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium', cfg.cls)}
    >
      {cfg.icon}
      <span className="hidden sm:inline">{cfg.text}</span>
      <span className="sm:hidden">{n || ''}</span>
    </button>
  )
}

export function LiveDot() {
  const { realtime } = useAuth()
  const online = useOnline()
  const live = online && realtime === 'SUBSCRIBED'
  const label = !online ? 'Offline' : live ? (isDevMode ? 'Live (cross-tab)' : 'Live sync on') : 'Connecting…'
  return (
    <span title={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="relative flex h-2 w-2" aria-hidden>
        {live && <span className="lt-pulse-ring absolute inset-0 rounded-full bg-success" />}
        <span className={cn('relative h-2 w-2 rounded-full', live ? 'bg-success' : online ? 'bg-warning' : 'bg-danger')} />
      </span>
      <span className="sr-only lg:not-sr-only">{label}</span>
    </span>
  )
}

export function Banners() {
  const online = useOnline()
  const sync = useSyncStatus()
  return (
    <>
      {isDevMode && (
        <div role="note" className="border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-center text-xs text-warning">
          DEV MODE — Supabase is not configured. Data is stored only in this browser and is <b>not</b> synced across devices. See
          docs/SETUP.md.
        </div>
      )}
      {!online && (
        <div
          role="alert"
          className="flex items-center justify-center gap-2 border-b border-danger/30 bg-danger/10 px-4 py-1.5 text-xs text-danger"
        >
          <CloudOff className="h-3.5 w-3.5" />
          {sync.enabled
            ? " You're offline. You can keep working: changes are saved on this device and sync when you're back online."
            : " You're offline. Changes can't be saved until you reconnect."}
        </div>
      )}
    </>
  )
}
