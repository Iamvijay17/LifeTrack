import { useState, useSyncExternalStore } from 'react'
import { AlertTriangle, CloudOff, RefreshCw, Check, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { discard, resolve, retry, syncNow, useQueue, useSyncStatus } from '@/sync'
import { describeEntry, fieldLabel, showValue, timeAgo } from '@/sync/describe'

// Open/close state lives outside React so the header pill, the offline banner and the profile menu can all open the same dialog.
let isOpen = false
const subs = new Set()
export const openSyncCenter = (v = true) => {
  isOpen = v
  subs.forEach((f) => f())
}
const useOpen = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => isOpen,
  )

function Conflict({ entry }) {
  const c = entry.conflict
  const [picks, setPicks] = useState({})
  const pick = (key, side) => setPicks((p) => ({ ...p, [key]: side }))
  const remove = entry.kind === 'remove'
  const deleted = c.reason === 'deleted'
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs">
      <p className="text-muted-foreground">
        {remove
          ? 'You deleted this while offline, but it was changed on another device.'
          : deleted
            ? 'You changed this while offline, but it was deleted on another device.'
            : 'This was changed on another device while you were offline. Pick the version to keep for each field.'}
      </p>
      {!deleted &&
        c.fields.map((f) => (
          <fieldset key={f.key} className="space-y-1">
            <legend className="font-medium">{fieldLabel(f.key)}</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {!remove && (
                <label
                  className={cn(
                    'flex cursor-pointer gap-2 rounded-md border p-2',
                    (picks[f.key] ?? 'mine') === 'mine' ? 'border-primary-solid bg-primary-solid/10' : 'border-border',
                  )}
                >
                  <input
                    type="radio"
                    name={`${entry.id}-${f.key}`}
                    checked={(picks[f.key] ?? 'mine') === 'mine'}
                    onChange={() => pick(f.key, 'mine')}
                  />
                  <span className="min-w-0">
                    <span className="block text-muted-foreground">This device</span>
                    <span className="block break-words">{showValue(f.mine)}</span>
                  </span>
                </label>
              )}
              <label
                className={cn(
                  'flex cursor-pointer gap-2 rounded-md border p-2',
                  (picks[f.key] ?? 'mine') === 'theirs' ? 'border-primary-solid bg-primary-solid/10' : 'border-border',
                )}
              >
                <input
                  type="radio"
                  name={`${entry.id}-${f.key}`}
                  checked={(picks[f.key] ?? 'mine') === 'theirs'}
                  onChange={() => pick(f.key, 'theirs')}
                />
                <span className="min-w-0">
                  <span className="block text-muted-foreground">Other device</span>
                  <span className="block break-words">{showValue(f.theirs)}</span>
                </span>
              </label>
            </div>
          </fieldset>
        ))}
      <div className="flex flex-wrap gap-2 pt-1">
        {remove || deleted ? (
          <>
            <Button size="sm" variant="outline" onClick={() => resolve(entry.id, 'theirs')}>
              {remove ? 'Keep it' : 'Let it stay deleted'}
            </Button>
            <Button size="sm" onClick={() => resolve(entry.id, 'mine')}>
              {remove ? 'Delete anyway' : 'Restore my version'}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => resolve(entry.id, 'theirs')}>
              Keep other device
            </Button>
            <Button size="sm" onClick={() => resolve(entry.id, Object.fromEntries(c.fields.map((f) => [f.key, picks[f.key] ?? 'mine'])))}>
              Save my choices
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function Entry({ entry }) {
  const d = describeEntry(entry)
  const tone = entry.status === 'conflict' ? 'text-warning' : entry.status === 'failed' ? 'text-danger' : 'text-muted-foreground'
  const label =
    entry.status === 'conflict'
      ? 'Needs your choice'
      : entry.status === 'failed'
        ? 'Could not be saved'
        : entry.nextAt > Date.now()
          ? 'Waiting to retry'
          : 'Waiting to sync'
  return (
    <li className="rounded-lg border border-border p-3" data-testid="sync-entry" data-status={entry.status}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{d.title}</p>
          <p className="text-xs text-muted-foreground">
            {d.what} · {timeAgo(entry.createdAt)}
          </p>
        </div>
        <span className={cn('shrink-0 text-xs font-medium', tone)}>{label}</span>
      </div>
      {entry.status === 'failed' && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-danger">{entry.lastError || 'The server did not accept this change.'}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => retry(entry.id)}>
              Try again
            </Button>
            <Button size="sm" variant="ghost" onClick={() => confirmDiscard(entry)}>
              Discard
            </Button>
          </div>
        </div>
      )}
      {entry.status === 'conflict' && <Conflict entry={entry} />}
    </li>
  )
}

function confirmDiscard(entry) {
  // Discarding is the one way a change can be lost, so it asks first.
  if (window.confirm('Discard this change? It will not be saved to your account and cannot be recovered.')) discard(entry.id)
}

export function SyncCenter() {
  const open = useOpen()
  const s = useSyncStatus()
  const queue = useQueue()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      await syncNow()
    } catch {
      toast.error("Couldn't sync. We'll keep trying.")
    } finally {
      setBusy(false)
    }
  }
  const headline = !s.online
    ? { icon: <CloudOff className="h-4 w-4" />, text: "You're offline. Your changes are saved on this device." }
    : s.state === 'signin'
      ? { icon: <LogIn className="h-4 w-4" />, text: 'Your session needs to be refreshed. Sign in again to finish syncing.' }
      : s.state === 'attention'
        ? { icon: <AlertTriangle className="h-4 w-4" />, text: 'Some changes need your attention.' }
        : s.pending > 0
          ? { icon: <RefreshCw className="h-4 w-4" />, text: `${s.pending} change${s.pending === 1 ? '' : 's'} waiting to sync.` }
          : { icon: <Check className="h-4 w-4" />, text: 'Everything is saved to your account.' }
  return (
    <Dialog
      open={open}
      onOpenChange={openSyncCenter}
      title="Sync"
      description={s.lastSyncAt ? `Last synced ${timeAgo(s.lastSyncAt)}.` : 'Changes made offline are kept here until they are saved.'}
      footer={
        <Button onClick={run} loading={busy} disabled={!s.online || !s.enabled} variant="outline">
          <RefreshCw className="h-4 w-4" /> Sync now
        </Button>
      }
    >
      <div className="space-y-3 px-5 pb-2">
        <p className="flex items-center gap-2 text-sm" role="status">
          {headline.icon}
          {headline.text}
        </p>
        {!s.enabled && (
          <p className="text-xs text-muted-foreground">Offline saving isn't available in this browser, so changes need a connection.</p>
        )}
        {queue.length > 0 && (
          <ul className="space-y-2" aria-label="Changes not yet saved">
            {queue.map((e) => (
              <Entry key={e.id} entry={e} />
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  )
}
