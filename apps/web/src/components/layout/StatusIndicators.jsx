import { AlertCircle, Check, CloudOff } from 'lucide-react'
import { ButtonLoader } from '@/components/loaders/ButtonLoader'
import { useSaveStatus } from '@/hooks/store'
import { useOnline } from '@/hooks/useOnline'
import { useAuth } from '@/hooks/useAuth'
import { isDevMode } from '@/services/db'
import { cn } from '@/lib/utils'

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
          <CloudOff className="h-3.5 w-3.5" /> You're offline. LifeTrack is online-only, so changes can't be saved until you reconnect.
        </div>
      )}
    </>
  )
}
