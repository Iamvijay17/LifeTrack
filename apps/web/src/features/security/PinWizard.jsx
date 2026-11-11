import { useCallback, useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { PIN_LENGTHS, validatePin } from '@lifetrack/core/security'
import { AnimatePresence, m } from '@/components/motion/primitives'
import { Dialog } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/misc'
import { toAppError } from '@/services/errors'
import { PinDots, PinKeypad } from './PinKeypad'

const STEPS = { setup: ['new', 'confirm'], reset: ['new', 'confirm'], change: ['current', 'new', 'confirm'], disable: ['current'] }
const TITLES = {
  setup: 'Turn on app lock',
  reset: 'Choose a new PIN',
  change: 'Change PIN',
  disable: 'Turn off app lock',
}
const PROMPT = {
  current: { setup: '', reset: '', change: 'Enter your current PIN', disable: 'Enter your PIN to turn the lock off' },
  new: { setup: 'Choose a PIN', reset: 'Choose a new PIN', change: 'Choose a new PIN', disable: '' },
  confirm: { setup: 'Enter it again to confirm', reset: 'Enter it again to confirm', change: 'Enter it again to confirm', disable: '' },
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Collects a PIN (and its confirmation) on an on-screen pad. The PIN only ever lives in this component's state, is sent to the server over TLS to
 * be hashed there, and is dropped as soon as the wizard closes.
 *
 * @param mode           'setup' | 'change' | 'disable' | 'reset'
 * @param currentLength  digits in the existing PIN (change / disable)
 * @param checkCurrent   (pin) → Promise<{ ok, message? }>: asks the server if the current PIN is right (change)
 * @param onSubmit       ({ current, next, length }) → Promise<{ ok, message?, restart? }>; throw or { ok: false } to show a message
 * @param onDone         runs after the success animation, when the dialog closes
 */
export function PinWizard({ open, onOpenChange, mode, currentLength = 4, checkCurrent, onSubmit, onDone }) {
  const steps = STEPS[mode]
  const [length, setLength] = useState(4)
  const [step, setStep] = useState(0)
  const [values, setValues] = useState({})
  const [pin, setPin] = useState('')
  const [phase, setPhase] = useState('idle') // idle | checking | error | success
  const [note, setNote] = useState('')
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    if (open) {
      setLength(4)
      setStep(0)
      setValues({})
      setPin('')
      setPhase('idle')
      setNote('')
    }
  }, [open, mode])

  const name = steps[step] ?? steps[0] // a stale step (the dialog is closing while its mode changes) must never be able to throw
  const want = name === 'current' ? currentLength : length
  const flash = useCallback((message, to = null) => {
    setPhase('error')
    setNote(message)
    setPin('')
    setTimeout(() => {
      if (!alive.current) return
      setPhase('idle')
      if (to != null) setStep(to)
    }, 500)
  }, [])

  const complete = useCallback(
    async (value) => {
      if (name === 'current') {
        setPhase('checking')
        if (mode === 'disable') {
          const r = await runSubmit({ current: value })
          if (r) flash(r.message ?? 'That did not work.')
          return
        }
        const r = await checkCurrent(value).catch((e) => ({ ok: false, message: toAppError(e).message }))
        if (!alive.current) return
        if (!r.ok) return flash(r.message ?? 'Wrong PIN.')
        setValues((v) => ({ ...v, current: value }))
        setPin('')
        setNote('')
        setPhase('idle')
        return setStep(step + 1)
      }
      if (name === 'new') {
        const v = validatePin(value, length)
        if (!v.ok) return flash(v.reason)
        if (mode === 'change' && value === values.current) return flash('Choose a PIN different from the current one.')
        setValues((x) => ({ ...x, next: value }))
        setPin('')
        setNote('')
        return setStep(step + 1)
      }
      // confirm
      if (value !== values.next) return flash('The PINs do not match. Start again.', steps.indexOf('new'))
      setPhase('checking')
      const r = await runSubmit({ current: values.current, next: value, length })
      if (r) flash(r.message ?? 'That did not work.', r.restart ? 0 : steps.indexOf('new'))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, mode, length, step, values, checkCurrent, onSubmit, flash],
  )
  /** Returns null on success (after playing the success animation), or the failure to show. */
  async function runSubmit(payload) {
    let r
    try {
      r = await onSubmit(payload)
    } catch (e) {
      r = { ok: false, message: toAppError(e).message }
    }
    if (!alive.current) return null
    if (!r?.ok) return r ?? { message: 'That did not work.' }
    setPhase('success')
    setNote('')
    await sleep(750)
    if (alive.current) {
      onOpenChange(false)
      onDone?.(r)
    }
    return null
  }

  const busy = phase === 'checking' || phase === 'success'
  const onDigit = (d) => {
    if (busy) return
    const next = pin + d
    setPin(next)
    setNote('')
    if (next.length === want) complete(next)
  }
  const prompt = PROMPT[name][mode]

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={TITLES[mode]}
      description={mode === 'setup' ? 'A PIN opens LifeTrack on this device after it locks.' : undefined}
    >
      <div className="dark -mx-2 rounded-2xl bg-[#0b0b10] px-4 pb-5 pt-5 text-foreground">
        <div className="flex min-h-[1.75rem] justify-center">
          {name === 'new' && PIN_LENGTHS.length > 1 && (mode === 'setup' || mode === 'change' || mode === 'reset') && (
            <Segmented
              value={String(length)}
              onChange={(v) => {
                setLength(Number(v))
                setPin('')
              }}
              options={PIN_LENGTHS.map((n) => ({ value: String(n), label: `${n} digits` }))}
            />
          )}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <m.p
            key={`${mode}-${name}`}
            className="mt-4 text-center text-base font-medium"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {prompt}
          </m.p>
        </AnimatePresence>
        <div className="relative mt-5 h-5">
          {phase === 'success' ? (
            <m.span
              className="mx-auto grid h-5 w-5 place-items-center rounded-full bg-success text-white"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 16 }}
            >
              <Check className="h-3 w-3" strokeWidth={3.5} aria-label="Done" />
            </m.span>
          ) : (
            <PinDots length={want} filled={pin.length} status={phase === 'error' ? 'error' : 'idle'} />
          )}
        </div>
        <p
          aria-live="polite"
          role="status"
          className={`mt-3 min-h-[2.5rem] px-2 text-center text-sm ${phase === 'error' ? 'text-danger' : 'text-muted-foreground'}`}
        >
          {note || (name === 'new' && mode !== 'change' ? 'Avoid 1234, 0000 and other easy guesses.' : '')}
        </p>
        <PinKeypad
          className="mt-1"
          size="sm"
          disabled={busy}
          onDigit={onDigit}
          onBackspace={() => setPin((p) => p.slice(0, -1))}
          onClear={() => setPin('')}
        />
      </div>
    </Dialog>
  )
}
