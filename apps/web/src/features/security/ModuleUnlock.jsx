import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Fingerprint, Lock, LockKeyhole } from 'lucide-react'
import { listModules, lockableModule, moduleLabel } from '@lifetrack/core/moduleLocks'
import { formatWait } from '@lifetrack/core/security'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { NAV } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { toAppError } from '@/services/errors'
import { FingerprintScan } from './FingerprintScan'
import { PinDots, PinKeypad } from './PinKeypad'
import { useSecurity } from './SecurityProvider'
import { useModuleLocks } from './useModuleLocks'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const iconOf = (key) => NAV.find((n) => n.module === key)?.icon ?? Lock

/**
 * PIN pad and fingerprint / face button, on a dark panel (the keypad is drawn for dark backgrounds, in every theme). It asks the server, through the
 * security provider; a right PIN or a verified passkey opens every locked module at once, and the provider then reloads what they hold.
 * `keyboard` turns the hardware keyboard on; only one pad on the screen should have it.
 */
export function UnlockPanel({ keyboard = true, autoBiometric = true, className }) {
  const sec = useSecurity()
  const st = sec.state
  const length = st.pinLength ?? 4
  const canBio = st.biometricEnabled && sec.support.platform
  const [pin, setPin] = useState('')
  const [phase, setPhase] = useState('idle') // idle | checking | error | success
  const [note, setNote] = useState('')
  const [bad, setBad] = useState(false)
  const [lockout, setLockout] = useState(st.lockoutSeconds)
  const [bio, setBio] = useState('idle')
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    if (lockout <= 0) return
    const t = setInterval(() => setLockout((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [lockout > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const fail = useCallback((message, wait = 0) => {
    setPhase('error')
    setPin('')
    setNote(message)
    setBad(true)
    if (wait) setLockout(wait)
    setTimeout(() => alive.current && setPhase('idle'), 450)
  }, [])

  const submit = useCallback(
    async (value) => {
      setPhase('checking')
      try {
        const r = await sec.unlockWithPin(value)
        if (!alive.current) return
        if (r.ok) {
          setPhase('success')
          setNote('')
          await sleep(380)
          await sec.finishUnlock() // the provider reloads the data; this panel is replaced by the module
          return
        }
        if (r.signedOut) return fail('Too many wrong PINs. For your safety you have been signed out.')
        if (r.reason === 'locked_out' || r.lockoutSeconds)
          return fail(`Too many wrong PINs. Wait ${formatWait(r.lockoutSeconds)}.`, r.lockoutSeconds)
        if (r.reason === 'not_enabled') return sec.finishUnlock()
        fail(`Wrong PIN. ${r.triesLeft} ${r.triesLeft === 1 ? 'try' : 'tries'} left before a short lockout.`)
      } catch (e) {
        if (alive.current) fail(toAppError(e).message)
      }
    },
    [sec, fail],
  )

  const busy = phase === 'checking' || phase === 'success' || lockout > 0 || bio === 'scanning' || bio === 'success'
  const onDigit = (d) => {
    if (busy) return
    const next = pin + d
    setPin(next)
    setNote('')
    setBad(false)
    if (next.length === length) submit(next)
  }

  const scan = useCallback(async () => {
    setBio('scanning')
    setNote('')
    setBad(false)
    const r = await sec.unlockWithPasskey()
    if (!alive.current) return
    if (r.ok) {
      setBio('success')
      await sleep(500)
      if (alive.current) await sec.finishUnlock()
      return
    }
    if (r.cancelled) {
      setBio('idle')
      setNote('Cancelled. Use your PIN, or tap the fingerprint to try again.')
      return
    }
    setBio('error')
    setNote(r.message)
    setBad(true)
    if (r.lockoutSeconds) setLockout(r.lockoutSeconds)
    setTimeout(() => alive.current && setBio('idle'), 1300)
  }, [sec])

  // Offer the fingerprint straight away, once, like a phone does. A cancelled prompt leaves the PIN pad ready.
  useEffect(() => {
    if (!autoBiometric || !canBio || st.lockoutSeconds > 0) return
    const t = setTimeout(scan, 450)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const waiting = lockout > 0
  return (
    <div className={cn('dark flex flex-col items-center rounded-2xl bg-[#0b0b10] px-5 py-6 text-foreground', className)}>
      {bio !== 'idle' ? (
        <FingerprintScan state={bio} size={64} />
      ) : (
        <p className="text-sm text-muted-foreground">{canBio ? 'Use your fingerprint, face or PIN' : `Enter your ${length}-digit PIN`}</p>
      )}
      <PinDots
        length={length}
        filled={pin.length}
        status={phase === 'error' ? 'error' : phase === 'success' ? 'success' : 'idle'}
        className="mt-5"
      />
      <p
        aria-live="polite"
        role="status"
        className={cn('mt-3 min-h-[2.25rem] max-w-[17rem] text-center text-xs', bad || waiting ? 'text-danger' : 'text-muted-foreground')}
      >
        {waiting ? `Too many wrong PINs. Try again in ${formatWait(lockout)}.` : note}
      </p>
      <PinKeypad
        size="sm"
        keyboard={keyboard}
        className="mt-2 gap-x-4 gap-y-3"
        disabled={busy}
        onDigit={onDigit}
        onBackspace={() => setPin((p) => p.slice(0, -1))}
        onClear={() => setPin('')}
        leftSlot={
          canBio ? (
            <button
              type="button"
              aria-label="Use fingerprint or face unlock"
              onClick={scan}
              disabled={bio === 'scanning' || waiting}
              className="lt-press grid h-14 w-14 place-items-center rounded-full text-primary outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
            >
              <Fingerprint className="h-7 w-7" aria-hidden />
            </button>
          ) : null
        }
      />
      <Link to="/security" className="mt-4 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        Forgot your PIN?
      </Link>
    </div>
  )
}

/** The prompt a locked card opens. Mounted once, by AppLockGate; it closes itself when everything is open again. */
export function ModuleUnlockDialog() {
  const sec = useSecurity()
  const open = !!sec.unlockFor && sec.closed.length > 0
  const named = sec.unlockFor && sec.unlockFor !== '*' && sec.closed.includes(sec.unlockFor) ? sec.unlockFor : null
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && sec.cancelUnlock()}
      title={named ? `Unlock ${moduleLabel(named)}` : 'Unlock your private modules'}
      description={`One PIN or fingerprint opens ${listModules(sec.closed)} until LifeTrack locks again.`}
      className="md:max-w-sm"
    >
      <div className="p-4">{open && <UnlockPanel />}</div>
    </Dialog>
  )
}

/** A module's page, while the module is locked: the unlock pad takes its place. */
export function ModuleLockedPage({ module }) {
  const sec = useSecurity()
  const Icon = iconOf(module)
  return (
    <div data-module={module} data-testid="module-locked" className="mx-auto flex max-w-sm flex-col items-center py-6 text-center md:py-12">
      <span className="lt-icon-tile grid h-14 w-14 place-items-center rounded-2xl">
        <Icon className="h-7 w-7" aria-hidden />
      </span>
      <h1 className="mt-4 flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Lock className="h-4 w-4 text-muted-foreground" aria-hidden /> {moduleLabel(module)} is locked
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter your PIN or use your fingerprint to open it.</p>
      <UnlockPanel className="mt-6 w-full" keyboard={!sec.unlockFor} />
    </div>
  )
}

/**
 * Wrap a module's page: while the module is locked, the unlock pad is shown instead and the page is not even rendered (so it loads and holds nothing).
 *   <ModuleGate module="finance"><FinancePage /></ModuleGate>
 */
export function ModuleGate({ module, children }) {
  const { isLocked } = useModuleLocks()
  return isLocked(module) ? <ModuleLockedPage module={module} /> : children
}

/** A few grey bars in a card's shape, blurred: a hint of "something is here" that is not the person's data. */
function Ghost({ rows = 3 }) {
  return (
    <div aria-hidden className="space-y-3 blur-[3px]">
      <div className="h-7 w-2/5 rounded-md bg-muted-foreground/25" />
      <div className="h-2 w-full rounded-full bg-muted-foreground/15" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-3 flex-1 rounded bg-muted-foreground/15" />
          <div className="h-3 w-12 rounded bg-muted-foreground/20" />
        </div>
      ))}
    </div>
  )
}

/**
 * The dashboard card of a locked module: the real card is NOT rendered, this is drawn in its place (so no figure is in the page behind a blur).
 * Tapping it opens the unlock prompt.
 */
export function LockedCard({ module, className }) {
  const { unlock } = useModuleLocks()
  const Icon = iconOf(module)
  const label = lockableModule(module)?.label ?? module
  return (
    <Card data-module={module} data-testid={`locked-${module}`} interactive className={cn('relative overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => unlock(module)}
        aria-label={`${label} is locked. Unlock`}
        className="flex h-full min-h-[11rem] w-full flex-col rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-mod-text" aria-hidden />
            {label}
          </CardTitle>
        </CardHeader>
        <div className="relative flex-1 p-[var(--pad)]">
          <Ghost />
          <div className="absolute inset-0 grid place-items-center bg-card/55 backdrop-blur-[2px]">
            <span className="flex flex-col items-center gap-2 text-center">
              <span className="lt-icon-tile grid h-11 w-11 place-items-center rounded-xl">
                <LockKeyhole className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-sm font-semibold">Locked</span>
              <span className="rounded-full bg-primary-solid px-3 py-1 text-xs font-medium text-white">Tap to unlock</span>
            </span>
          </div>
        </div>
      </button>
    </Card>
  )
}

/** The small-tile version of the locked card, for the "Today at a glance" row. */
export function LockedStat({ module, label, className }) {
  const { unlock } = useModuleLocks()
  const Icon = iconOf(module)
  return (
    <Card
      data-module={module}
      data-testid={`locked-stat-${module}`}
      interactive
      className={cn('group relative overflow-hidden', className)}
    >
      <button
        type="button"
        onClick={() => unlock(module)}
        aria-label={`${label} is locked. Unlock ${moduleLabel(module)}`}
        className="block h-full w-full rounded-xl p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <span className="text-xs font-medium">{label}</span>
          <span className="lt-icon-soft h-7 w-7 rounded-md">
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[1.125rem] font-semibold text-muted-foreground">
          <Lock className="h-4 w-4" aria-hidden /> Locked
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">Tap to unlock</div>
      </button>
    </Card>
  )
}

/**
 * One line for pages that add up several modules (the dashboard, Analytics, Reports): what is left out while something is locked.
 * Renders nothing when nothing is locked.
 */
export function LockedModulesNotice({ className }) {
  const { closed, unlock } = useModuleLocks()
  if (closed.length === 0) return null
  return (
    <p
      role="status"
      data-testid="locked-notice"
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground',
        className,
      )}
    >
      <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {listModules(closed)} {closed.length === 1 ? 'is' : 'are'} locked, so {closed.length === 1 ? 'it is' : 'they are'} left out of the
        figures on this page.
      </span>
      <button
        type="button"
        onClick={() => unlock('*')}
        className="rounded font-medium text-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-primary"
      >
        Unlock
      </button>
    </p>
  )
}
