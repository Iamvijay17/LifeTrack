import { useCallback, useEffect, useRef, useState } from 'react'
import { Fingerprint, KeyRound, Lock, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { formatWait } from '@lifetrack/core/security'
import { Logo } from '@/components/layout/Logo'
import { InitialAppLoader } from '@/components/loaders'
import { AnimatePresence, ease, m } from '@/components/motion/primitives'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { useAuth } from '@/hooks/useAuth'
import { auth } from '@/services/auth'
import { toAppError } from '@/services/errors'
import { FingerprintScan } from './FingerprintScan'
import { PinDots, PinKeypad } from './PinKeypad'
import { useSecurity } from './SecurityProvider'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_0%,rgb(124_58_237/0.28),transparent_70%),radial-gradient(50%_40%_at_90%_100%,rgb(99_102_241/0.2),transparent_70%),radial-gradient(40%_30%_at_5%_90%,rgb(139_92_246/0.14),transparent_70%)]" />
      <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgb(255_255_255)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
    </div>
  )
}

/** The padlock (or, while the browser is listening for a fingerprint or face, the fingerprint). */
function Emblem({ bio, locked }) {
  return (
    <div className="relative grid h-24 w-24 place-items-center">
      <AnimatePresence mode="wait" initial={false}>
        {bio !== 'idle' ? (
          <m.div
            key="bio"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
          >
            <FingerprintScan state={bio} size={96} />
          </m.div>
        ) : (
          <m.div
            key="lock"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className="relative grid h-20 w-20 place-items-center rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.1] to-white/[0.03] shadow-[0_0_40px_-4px_rgb(139_92_246/0.55)]"
          >
            <Lock className="h-9 w-9 text-white" strokeWidth={1.8} aria-hidden />
            <m.span
              aria-hidden
              className="absolute inset-0 rounded-3xl border border-primary/50"
              animate={locked ? { opacity: [0.7, 0, 0.7], scale: [1, 1.18, 1] } : { opacity: 0 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PasswordUnlock({ onBack }) {
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError('')
    try {
      await auth.signIn(user.email, password) // a fresh sign-in is a fresh session: the app opens, and the PIN can be reset in Security & Privacy
      toast.success('Unlocked with your password', { description: 'You can choose a new PIN in Security & Privacy.' })
    } catch (err) {
      setError(toAppError(err).message)
      setBusy(false)
    }
  }
  return (
    <m.form
      onSubmit={submit}
      noValidate
      className="w-full space-y-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.22, ease: ease.out }}
    >
      <div className="text-center">
        <h2 className="text-lg font-semibold">Unlock with your password</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Signing in again opens LifeTrack. Then choose a new PIN in Security &amp; Privacy.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <Field label="Account password">
        <Input type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" loading={busy} disabled={!password}>
        Unlock
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="mx-auto block rounded-md px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
      >
        Back to PIN
      </button>
    </m.form>
  )
}

/** Full-screen lock. Always dark, like a vault, whatever the app theme. Mounted only while the server says the session is locked. */
export function LockScreen() {
  const sec = useSecurity()
  const { displayName } = useAuth()
  const st = sec.state
  const length = st.pinLength ?? 4
  const canBio = st.biometricEnabled && sec.support.platform

  const [view, setView] = useState('pin') // 'pin' | 'password'
  const [pin, setPin] = useState('')
  const [phase, setPhase] = useState('idle') // idle | checking | error | success
  const [note, setNote] = useState('')
  const [bad, setBad] = useState(false) // the message is about something that went wrong: it stays red until the next digit
  const [lockout, setLockout] = useState(st.lockoutSeconds)
  const [bio, setBio] = useState('idle')
  const alive = useRef(true)
  const root = useRef(null)
  useEffect(() => {
    alive.current = true
    root.current?.focus({ preventScroll: true }) // the app that held the focus is gone: put it here, so keyboard and screen-reader users land on the lock screen
    return () => {
      alive.current = false
    }
  }, [])

  // Counts the PIN lockout down so the person sees when they can try again.
  useEffect(() => {
    if (lockout <= 0) return
    const t = setInterval(() => setLockout((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [lockout > 0]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (lockout === 0 && note.startsWith('Too many')) setNote('You can try again now.')
  }, [lockout, note])

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
          await sleep(520)
          if (alive.current) await sec.finishUnlock()
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
      await sleep(650)
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
    if (!canBio || st.lockoutSeconds > 0) return
    const t = setTimeout(scan, 450)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const waiting = lockout > 0
  return (
    <m.div
      ref={root}
      tabIndex={-1}
      className="dark fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-[#07070a] text-foreground outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="LifeTrack is locked"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(6px)', transition: { duration: 0.28, ease: ease.in } }}
      transition={{ duration: 0.2 }}
    >
      <Backdrop />
      <header className="flex items-center justify-between px-5 pt-5">
        <Logo />
        <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-white/70">
          <Lock className="h-3 w-3" aria-hidden /> Locked
        </span>
      </header>

      <main className="m-auto flex w-full max-w-sm flex-col items-center px-6 py-8">
        <Emblem bio={bio} locked />
        <AnimatePresence mode="wait" initial={false}>
          {view === 'password' ? (
            <PasswordUnlock key="pw" onBack={() => setView('pin')} />
          ) : (
            <m.div
              key="pin"
              className="flex w-full flex-col items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <h1 className="mt-5 text-xl font-semibold tracking-tight">
                {displayName ? `Welcome back, ${displayName}` : 'LifeTrack is locked'}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {canBio ? 'Use your fingerprint, face or PIN.' : `Enter your ${length}-digit PIN.`}
              </p>
              <PinDots
                length={length}
                filled={pin.length}
                status={phase === 'error' ? 'error' : phase === 'success' ? 'success' : 'idle'}
                className="mt-7"
              />
              <p
                aria-live="polite"
                role="status"
                className={`mt-4 min-h-[2.5rem] max-w-[18rem] text-center text-sm ${bad || waiting ? 'text-danger' : 'text-muted-foreground'}`}
              >
                {waiting ? `Too many wrong PINs. Try again in ${formatWait(lockout)}.` : note}
              </p>
              <PinKeypad
                className="mt-3"
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
                      className="lt-press grid h-[4.25rem] w-[4.25rem] place-items-center rounded-full text-primary outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 sm:h-[4.5rem] sm:w-[4.5rem]"
                    >
                      <Fingerprint className="h-8 w-8" aria-hidden />
                    </button>
                  ) : null
                }
              />
              <div className="mt-6 flex items-center gap-1 text-sm">
                <button
                  type="button"
                  onClick={() => setView('password')}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <KeyRound className="h-3.5 w-3.5" aria-hidden /> Forgot PIN?
                </button>
                <span aria-hidden className="text-white/20">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => auth.signOut()}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
                </button>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </main>
    </m.div>
  )
}

/** Shown instead of the app when the server cannot be asked whether the app is locked: the safe answer is "don't show it". */
function SecurityUnavailable({ message, onRetry }) {
  return (
    <div className="dark fixed inset-0 z-[100] grid place-items-center bg-[#07070a] p-6 text-foreground">
      <div className="max-w-sm text-center">
        <Lock className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold">Can't check your security settings</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {message || 'Check your connection and try again.'} LifeTrack stays closed until it can.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={onRetry}>Try again</Button>
          <Button variant="outline" onClick={() => auth.signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Wraps the signed-in app. The app is mounted ONLY while the server says this session is unlocked, so nothing behind the lock renders, loads or
 * stays in memory. Before the answer is in, nothing renders either (a flash of the app would be a leak). A database without the security
 * migration answers "unsupported" and the app simply opens, as it always did.
 */
export function AppLockGate({ children }) {
  const sec = useSecurity()
  if (!sec || sec.status === 'unsupported') return children
  if (sec.status === 'idle' || sec.status === 'loading') return <InitialAppLoader />
  if (sec.status === 'error') return <SecurityUnavailable message={sec.error} onRetry={sec.retry} />
  return (
    <>
      {!sec.locked && children}
      <AnimatePresence>{sec.locked && <LockScreen key="lock" />}</AnimatePresence>
    </>
  )
}
