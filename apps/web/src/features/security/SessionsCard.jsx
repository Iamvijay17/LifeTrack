import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { Laptop, LogOut, MonitorSmartphone, Smartphone, Tablet } from 'lucide-react'
import { toast } from 'sonner'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { useConfirm } from '@/components/shared/Confirm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { useAction } from '@/hooks/useAction'
import { describeDevice } from '@/lib/device'
import { isDevMode } from '@/services/db'
import { security } from '@/services/security'
import { useSecurity } from './SecurityProvider'

const ICON = { phone: Smartphone, tablet: Tablet, desktop: Laptop, unknown: Laptop }
const ago = (iso) => {
  try {
    return `${formatDistanceToNowStrict(new Date(iso))} ago`
  } catch {
    return 'unknown'
  }
}

export function SessionsCard() {
  const sec = useSecurity()
  const confirm = useConfirm()
  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState('')
  const ready = sec.status === 'ready' && !sec.locked

  const load = useCallback(async () => {
    try {
      setSessions(await security.sessions.list())
      setError('')
    } catch (e) {
      setSessions([])
      setError(e?.message || 'Could not load your sessions.')
    }
  }, [])
  useEffect(() => {
    if (ready) load()
  }, [ready, load])

  const [setTrust] = useAction(async (s, on) => {
    await (on ? security.sessions.trust(s.id) : security.sessions.untrust(s.id))
    await load()
    toast.success(on ? 'That device will no longer ask for the PIN' : 'That device will ask for the PIN again')
  })
  const [revoke] = useAction(async (s) => {
    await security.sessions.revoke(s.id)
    await load()
    toast.success('Signed out of that device')
  })
  const [others, signingOthers] = useAction(async () => {
    await security.sessions.signOutOthers()
    await load()
    toast.success('Signed out of every other device')
  })
  const [everywhere, signingAll] = useAction(() => security.sessions.signOutEverywhere())

  if (sec.status === 'unsupported') return null
  const many = (sessions?.length ?? 0) > 1

  return (
    <SettingsSection
      headingAs="h3"
      icon={MonitorSmartphone}
      title="Where you're signed in"
      desc={
        isDevMode
          ? 'DEV mode has one session: this browser.'
          : 'Each browser or phone that is signed in to your account. Sign out any you do not recognise.'
      }
    >
      {error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {sessions === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border" aria-label="Active sessions">
          {sessions.map((s) => {
            const d = describeDevice(s.userAgent)
            const Icon = ICON[d.kind]
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                <span className="lt-icon-soft h-8 w-8 shrink-0 rounded-md">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                    <span className="truncate">{d.label}</span>
                    {s.current && <Badge tone="primary">This device</Badge>}
                    {sec.state?.appLockEnabled &&
                      (s.trusted ? (
                        <Badge tone="warning">Trusted: no PIN</Badge>
                      ) : (
                        <Badge tone={s.unlocked ? 'success' : 'neutral'}>{s.unlocked ? 'Unlocked' : 'Locked'}</Badge>
                      ))}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[s.ip, `active ${ago(s.lastActiveAt)}`, `signed in ${ago(s.createdAt)}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {!s.current && (
                  <div className="ml-auto flex shrink-0 flex-wrap gap-2">
                    {sec.state?.appLockEnabled && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`${s.trusted ? 'Ask for the PIN on' : 'Trust'} ${d.label}`}
                        onClick={async () => {
                          if (s.trusted) return setTrust(s, false)
                          if (
                            await confirm({
                              title: `Trust ${d.label}?`,
                              description:
                                'It will open LifeTrack without the PIN, including Finance, Journal and Notes, until you change this. Meant for an older phone build that has no lock screen. Anyone holding that device can see them.',
                              confirmLabel: 'Trust this device',
                              destructive: false,
                            })
                          )
                            setTrust(s, true)
                        }}
                      >
                        {s.trusted ? 'Ask for PIN' : 'Trust'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Sign out ${d.label}`}
                      onClick={async () => {
                        if (
                          await confirm({
                            title: `Sign out ${d.label}?`,
                            description: 'That device will have to sign in again.',
                            confirmLabel: 'Sign out',
                          })
                        )
                          revoke(s)
                      }}
                    >
                      Sign out
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => others()} loading={signingOthers} disabled={!many || isDevMode}>
          Sign out other devices
        </Button>
        <Button
          variant="ghost"
          className="text-danger"
          loading={signingAll}
          onClick={async () => {
            if (
              await confirm({
                title: 'Sign out everywhere?',
                description: 'Every device, including this one, will have to sign in again.',
                confirmLabel: 'Sign out everywhere',
              })
            )
              everywhere()
          }}
        >
          <LogOut className="h-4 w-4" /> Sign out everywhere
        </Button>
      </div>
      {!isDevMode && (
        <p className="text-xs text-muted-foreground">
          A device you sign out loses access to your account at once, apart from pages it already has open, which stop working within an
          hour. With the app lock on, your finance and notes close immediately.
        </p>
      )}
    </SettingsSection>
  )
}
