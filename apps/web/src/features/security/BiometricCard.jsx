import { useCallback, useEffect, useState } from 'react'
import { Cloud, Fingerprint, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Switch } from '@/components/ui/form'
import { Badge } from '@/components/ui/misc'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/shared/Confirm'
import { describeDevice } from '@/lib/device'
import { createPasskey, explainPasskeyError } from '@/lib/webauthn'
import { toAppError } from '@/services/errors'
import { security } from '@/services/security'
import { FingerprintScan } from './FingerprintScan'
import { useSecurity } from './SecurityProvider'

const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null)

/** Walks through adding a fingerprint / face unlock: name it, the browser asks the sensor, the server checks the signed answer. */
function AddDialog({ open, onOpenChange, onAdded }) {
  const [label, setLabel] = useState('')
  const [scan, setScan] = useState('idle')
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (open) {
      setLabel(describeDevice(navigator.userAgent).label)
      setScan('idle')
      setMessage('')
    }
  }, [open])
  const start = async () => {
    setScan('scanning')
    setMessage('')
    try {
      const options = await security.passkeys.beginRegistration()
      const { credential, transports } = await createPasskey(options)
      await security.passkeys.finishRegistration({ credential, transports, label })
      setScan('success')
      setTimeout(() => {
        onOpenChange(false)
        onAdded()
      }, 900)
    } catch (e) {
      const known = e?.name && e.name !== 'AppError' ? explainPasskeyError(e) : null
      setScan(known?.cancelled ? 'idle' : 'error')
      setMessage(known ? known.message : toAppError(e).message)
    }
  }
  const busy = scan === 'scanning' || scan === 'success'
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Add fingerprint or face unlock"
      description="Your device checks you. LifeTrack only learns that it was you, never your fingerprint or face."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={start} loading={scan === 'scanning'} disabled={busy || !label.trim()}>
            {scan === 'error' ? 'Try again' : 'Continue'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="dark grid place-items-center rounded-2xl bg-[#0b0b10] py-6">
          <FingerprintScan state={scan} size={104} />
        </div>
        <p
          aria-live="polite"
          role="status"
          className={`min-h-[1.25rem] text-center text-sm ${scan === 'error' ? 'text-danger' : 'text-muted-foreground'}`}
        >
          {scan === 'scanning' ? 'Follow your browser’s prompt…' : scan === 'success' ? 'Added' : message}
        </p>
        <Field label="Name this device" hint="So you can tell it apart in the list.">
          <Input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} disabled={busy} />
        </Field>
      </div>
    </Dialog>
  )
}

function RenameDialog({ passkey, onOpenChange, onSaved }) {
  const [label, setLabel] = useState('')
  useEffect(() => setLabel(passkey?.label ?? ''), [passkey])
  const [save, saving] = useAction(async () => {
    await security.passkeys.rename(passkey.id, label)
    onOpenChange(false)
    onSaved()
  })
  return (
    <Dialog
      open={!!passkey}
      onOpenChange={onOpenChange}
      title="Rename"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="rename-passkey" loading={saving} disabled={!label.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="rename-passkey"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label="Name">
          <Input autoFocus value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  )
}

export function BiometricCard() {
  const sec = useSecurity()
  const confirm = useConfirm()
  const st = sec.state
  const [keys, setKeys] = useState(null)
  const [serverReady, setServerReady] = useState(null) // can the server do passkeys at all (Edge Function deployed + configured)?
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(null)

  const load = useCallback(async () => {
    try {
      setKeys(await security.passkeys.list())
    } catch {
      setKeys([])
    }
  }, [])
  const enabled = sec.status === 'ready' && st?.appLockEnabled
  useEffect(() => {
    if (!enabled) return
    load()
    security.passkeys.available().then(setServerReady)
  }, [enabled, load])

  const [toggle, toggling] = useAction(async (on) => {
    if (on && !keys?.length) return setAdding(true)
    await security.setBiometricEnabled(on)
    await sec.refresh()
    sec.announce('changed')
  })
  const [remove] = useAction(async (key) => {
    await security.passkeys.remove(key.id)
    await Promise.all([load(), sec.refresh()])
    toast.success('Removed')
  })

  if (sec.status === 'unsupported' || !st) return null

  const { supported, platform, reason } = sec.support
  const blocker = !st.appLockEnabled
    ? 'Turn on the app lock first. Fingerprint and face unlock is a faster way to open it.'
    : !supported || !platform
      ? reason
      : serverReady === false
        ? 'Fingerprint and face unlock is not set up on this server yet. Your PIN works.'
        : null

  return (
    <SettingsSection
      headingAs="h3"
      icon={Fingerprint}
      title="Fingerprint & face unlock"
      desc="Uses your device’s own sensor through the browser’s passkey support: Touch ID, Windows Hello or your phone’s biometrics. Your PIN is always the fallback."
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{st.biometricEnabled ? 'On' : 'Off'}</p>
          <p className="text-xs text-muted-foreground">
            {blocker ?? (st.biometricEnabled ? 'Offered first on the lock screen.' : 'Add a device below to turn it on.')}
          </p>
        </div>
        <Switch label="Fingerprint or face unlock" checked={st.biometricEnabled} onChange={(on) => !toggling && !blocker && toggle(on)} />
      </div>

      {st.appLockEnabled && (
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">Registered devices</p>
            <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={!!blocker}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          {keys === null ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
              {keys.map((k) => {
                const Icon = k.backedUp ? Cloud : Fingerprint // a synced passkey lives in the platform's cloud keychain; the rest are tied to one device
                return (
                  <li key={k.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="lt-icon-soft h-8 w-8 shrink-0 rounded-md">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                        <span className="truncate">{k.label}</span>
                        <Badge tone={k.backedUp ? 'primary' : 'neutral'}>{k.backedUp ? 'Synced' : 'This device only'}</Badge>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Added {when(k.createdAt)} · {k.lastUsedAt ? `used ${when(k.lastUsedAt)}` : 'not used yet'}
                      </p>
                    </div>
                    <Button size="icon-sm" variant="ghost" aria-label={`Rename ${k.label}`} onClick={() => setRenaming(k)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-danger"
                      aria-label={`Remove ${k.label}`}
                      onClick={async () => {
                        if (
                          await confirm({
                            title: `Remove ${k.label}?`,
                            description: 'It will no longer unlock LifeTrack. Your PIN still works.',
                            confirmLabel: 'Remove',
                          })
                        )
                          remove(k)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
      <AddDialog
        open={adding}
        onOpenChange={setAdding}
        onAdded={async () => {
          await Promise.all([load(), sec.refresh()])
          sec.announce('changed')
          toast.success('Fingerprint or face unlock is on')
        }}
      />
      <RenameDialog passkey={renaming} onOpenChange={(o) => !o && setRenaming(null)} onSaved={load} />
    </SettingsSection>
  )
}
