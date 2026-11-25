import { useRef, useState } from 'react'
import { KeyRound, Lock, LockKeyhole } from 'lucide-react'
import { toast } from 'sonner'
import { LOCKABLE_MODULES } from '@lifetrack/core/moduleLocks'
import { AUTO_LOCK_OPTIONS, formatWait } from '@lifetrack/core/security'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { Field, Select, Switch } from '@/components/ui/form'
import { Badge } from '@/components/ui/misc'
import { useAction } from '@/hooks/useAction'
import { auth } from '@/services/auth'
import { isDevMode } from '@/services/db'
import { security } from '@/services/security'
import { ModuleLockSettings } from './ModuleLockSettings'
import { PinWizard } from './PinWizard'
import { useSecurity } from './SecurityProvider'
import { ForgotPinDialog } from './ForgotPinDialog'

/** What a wrong-PIN answer from the server means for a person. */
export const explainPinResult = (r) =>
  r.signedOut
    ? 'Too many wrong PINs. For your safety you have been signed out.'
    : r.reason === 'locked_out' || r.lockoutSeconds
      ? `Too many wrong PINs. Wait ${formatWait(r.lockoutSeconds)}.`
      : `Wrong PIN. ${r.triesLeft} ${r.triesLeft === 1 ? 'try' : 'tries'} left before a short lockout.`

export function AppLockCard() {
  const sec = useSecurity()
  const st = sec.state
  const [wizard, setWizardNow] = useState(null) // 'setup' | 'change' | 'disable' | 'reset'
  const lastMode = useRef('setup') // the dialog keeps its mode while it animates closed
  const setWizard = (mode) => {
    if (mode) lastMode.current = mode
    setWizardNow(mode)
  }
  const [forgot, setForgot] = useState(false)
  const [setAuto, saving] = useAction((seconds) => security.setAutoLock(seconds).then(sec.refresh), { success: 'Auto-lock updated' })

  if (sec.status === 'unsupported') {
    return (
      <SettingsSection headingAs="h3" icon={LockKeyhole} title="App lock" desc="Lock LifeTrack behind a PIN.">
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          Your database has not had the security update yet. In Supabase → SQL Editor, run{' '}
          <code>supabase/migrations/0012_security.sql</code> once, then reload. Everything else keeps working as before.
        </p>
      </SettingsSection>
    )
  }
  if (!st) return null

  const done = (r) => ({ ok: !!r.ok, message: r.ok ? undefined : explainPinResult(r), restart: r.reason === 'wrong_pin' })
  const since = st.pinSetAt
    ? new Date(st.pinSetAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <SettingsSection
      headingAs="h3"
      icon={LockKeyhole}
      title="App lock"
      desc="Ask for a PIN (or your fingerprint) when LifeTrack has been idle or you come back to it."
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{st.appLockEnabled ? 'App lock is on' : 'App lock is off'}</p>
          <p className="text-xs text-muted-foreground">
            {st.appLockEnabled
              ? `${st.pinLength}-digit PIN${since ? ` · set ${since}` : ''}`
              : 'Anyone who opens this browser can open LifeTrack.'}
          </p>
        </div>
        <Switch label="App lock" checked={st.appLockEnabled} onChange={(on) => setWizard(on ? 'setup' : 'disable')} />
      </div>

      {st.appLockEnabled && (
        <>
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Lock automatically" hint="Counts from your last tap, key press or scroll. Leaving the tab starts the same clock.">
              <Select value={String(st.autoLockSeconds)} onChange={(e) => setAuto(Number(e.target.value))} disabled={saving}>
                {AUTO_LOCK_OPTIONS.map((o) => (
                  <option key={o.seconds} value={String(o.seconds)}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setWizard('change')}>
                <KeyRound className="h-4 w-4" /> Change PIN
              </Button>
              <Button onClick={() => sec.lockNow()}>
                <Lock className="h-4 w-4" /> Lock now
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setForgot(true)}
            className="-mt-1 rounded-md py-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            I forgot my PIN
          </button>
        </>
      )}

      <ModuleLockSettings />

      <div className="border-t border-border pt-4">
        <p className="text-xs font-medium text-muted-foreground">
          {isDevMode
            ? 'With a server, these would also stay closed while locked (DEV mode has none)'
            : 'While locked, these stay closed on the server too'}
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {LOCKABLE_MODULES.filter((m) => (st.lockScope === 'modules' ? st.lockedModules.includes(m.key) : m.legacy)).map(
            ({ key, label }) => (
              <li key={key}>
                <Badge tone={st.appLockEnabled ? 'success' : 'neutral'}>
                  <Lock className="h-3 w-3" aria-hidden /> {label}
                </Badge>
              </li>
            ),
          )}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Signing out and back in with your password opens LifeTrack without the PIN, because the password is the stronger proof.
        </p>
        <p className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Using the mobile app?</span> It has its own lock under More → Security &amp;
          Privacy: with the lock on, the phone asks for your PIN (or fingerprint / face) and opens Finance, Journal and Notes only after
          that. An older phone build without it stays closed until you mark it as{' '}
          <span className="font-medium text-foreground">trusted</span> under “Where you’re signed in” below.
        </p>
      </div>

      <PinWizard
        open={!!wizard}
        onOpenChange={(o) => !o && setWizard(null)}
        mode={wizard ?? lastMode.current}
        currentLength={st.pinLength ?? 4}
        checkCurrent={async (pin) => done(await sec.unlockWithPin(pin))}
        onSubmit={async ({ current, next }) => {
          if (wizard === 'setup') return { ok: !!(await security.setPin(next)) }
          if (wizard === 'reset') return { ok: !!(await security.resetAppLock(next)) }
          if (wizard === 'change') return done(await security.changePin(current, next))
          const r = await security.disableAppLock(current)
          if (r.signedOut) await auth.signOut().catch(() => {})
          return done(r)
        }}
        onDone={async () => {
          await sec.refresh()
          sec.announce('changed')
          toast.success({ setup: 'App lock is on', change: 'PIN changed', disable: 'App lock is off', reset: 'New PIN set' }[wizard])
        }}
      />
      <ForgotPinDialog
        open={forgot}
        onOpenChange={setForgot}
        onVerified={() => {
          setForgot(false)
          setWizard('reset')
        }}
      />
    </SettingsSection>
  )
}
