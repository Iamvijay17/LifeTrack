import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { PIN_LENGTHS, validatePin } from '@lifetrack/core/security'
import { toAppError } from '@lifetrack/data'
import { Sheet } from '../../ui/Sheet'
import { LOCK, PinDots, PinKeypad } from './PinKeypad'

export type PinMode = 'setup' | 'change' | 'disable' | 'reset'
export interface PinOutcome { ok: boolean; message?: string; /** wrong current PIN: start again from the first step */ restart?: boolean }

const STEPS: Record<PinMode, ('current' | 'new' | 'confirm')[]> = { setup: ['new', 'confirm'], reset: ['new', 'confirm'], change: ['current', 'new', 'confirm'], disable: ['current'] }
const TITLES: Record<PinMode, string> = { setup: 'Turn on app lock', reset: 'Choose a new PIN', change: 'Change PIN', disable: 'Turn off app lock' }
const PROMPT: Record<'current' | 'new' | 'confirm', Record<PinMode, string>> = {
  current: { setup: '', reset: '', change: 'Enter your current PIN', disable: 'Enter your PIN to turn the lock off' },
  new: { setup: 'Choose a PIN', reset: 'Choose a new PIN', change: 'Choose a new PIN', disable: '' },
  confirm: { setup: 'Enter it again to confirm', reset: 'Enter it again to confirm', change: 'Enter it again to confirm', disable: '' },
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Collects a PIN (and its confirmation) on an on-screen pad. The PIN only ever lives in this component's state, is sent over TLS to the database to be hashed
 * there, and is dropped as soon as the sheet closes. Easy PINs are refused on the spot with the reason (the database refuses them too).
 *
 * @param currentLength digits in the existing PIN (change / disable)
 * @param checkCurrent  asks the server whether the current PIN is right (change)
 * @param onSubmit      does the work; { ok: false, message } to show a message
 * @param onDone        runs after the success tick, when the sheet closes
 */
export function PinWizard({ visible, onClose, mode, currentLength = 4, checkCurrent, onSubmit, onDone }: {
  visible: boolean; onClose: () => void; mode: PinMode; currentLength?: number
  checkCurrent: (pin: string) => Promise<PinOutcome>
  onSubmit: (v: { current?: string; next?: string; length: number }) => Promise<PinOutcome>
  onDone: () => void
}) {
  const steps = STEPS[mode]
  const [length, setLength] = useState(4)
  const [step, setStep] = useState(0)
  const [values, setValues] = useState<{ current?: string; next?: string }>({})
  const [pin, setPin] = useState('')
  const [phase, setPhase] = useState<'idle' | 'checking' | 'error' | 'success'>('idle')
  const [note, setNote] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (visible) { setLength(4); setStep(0); setValues({}); setPin(''); setPhase('idle'); setNote('') }
  }, [visible, mode])

  const name = steps[step] ?? steps[0] // a stale step (the sheet is closing while its mode changes) must never be able to throw
  const want = name === 'current' ? currentLength : length
  const flash = useCallback((message: string, to: number | null = null) => {
    setPhase('error'); setNote(message); setPin('')
    setTimeout(() => { if (!alive.current) return; setPhase('idle'); if (to != null) setStep(to) }, 500)
  }, [])

  /** Returns null on success (after the success tick), or the failure to show. */
  async function runSubmit(payload: { current?: string; next?: string; length: number }): Promise<PinOutcome | null> {
    let r: PinOutcome
    try { r = await onSubmit(payload) } catch (e) { r = { ok: false, message: toAppError(e).message } }
    if (!alive.current) return null
    if (!r?.ok) return r ?? { ok: false, message: 'That did not work.' }
    setPhase('success'); setNote('')
    await sleep(750)
    if (alive.current) { onClose(); onDone() }
    return null
  }

  const complete = async (value: string) => {
    if (name === 'current') {
      setPhase('checking')
      if (mode === 'disable') {
        const r = await runSubmit({ current: value, length })
        if (r) flash(r.message ?? 'That did not work.')
        return
      }
      const r = await checkCurrent(value).catch((e): PinOutcome => ({ ok: false, message: toAppError(e).message }))
      if (!alive.current) return
      if (!r.ok) return flash(r.message ?? 'Wrong PIN.')
      setValues((v) => ({ ...v, current: value })); setPin(''); setNote(''); setPhase('idle')
      return setStep(step + 1)
    }
    if (name === 'new') {
      const v = validatePin(value, length)
      if (!v.ok) return flash(v.reason ?? 'Choose another PIN.')
      if (mode === 'change' && value === values.current) return flash('Choose a PIN different from the current one.')
      setValues((x) => ({ ...x, next: value })); setPin(''); setNote('')
      return setStep(step + 1)
    }
    // confirm
    if (value !== values.next) return flash('The PINs do not match. Start again.', steps.indexOf('new'))
    setPhase('checking')
    const r = await runSubmit({ current: values.current, next: value, length })
    if (r) flash(r.message ?? 'That did not work.', r.restart ? 0 : steps.indexOf('new'))
  }

  const busy = phase === 'checking' || phase === 'success'
  const onDigit = (d: string) => {
    if (busy) return
    const next = pin + d
    setPin(next); setNote('')
    if (next.length === want) void complete(next)
  }
  const choosingLength = name === 'new' && PIN_LENGTHS.length > 1 && mode !== 'disable'
  const prompt = PROMPT[name][mode]
  const hint = note || (name === 'new' && mode !== 'change' ? 'Avoid 1234, 0000 and other easy guesses.' : '')

  return (
    <Sheet visible={visible} title={TITLES[mode]} onClose={onClose}>
      <View style={{ backgroundColor: LOCK.panel, borderRadius: 20, paddingVertical: 20, paddingHorizontal: 12, alignItems: 'center', gap: 12 }}>
        <View style={{ minHeight: 34, justifyContent: 'center' }}>
          {choosingLength ? (
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', borderRadius: 12, borderWidth: 1, borderColor: LOCK.border, overflow: 'hidden' }}>
              {PIN_LENGTHS.map((n) => (
                <Pressable key={n} accessibilityRole="radio" accessibilityLabel={`${n} digits`} accessibilityState={{ selected: length === n }} onPress={() => { setLength(n); setPin('') }}
                  style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: length === n ? LOCK.primary : 'transparent' }}>
                  <Text style={{ color: length === n ? '#fff' : LOCK.muted, fontWeight: '500' }}>{n} digits</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
        <Text accessibilityRole="header" style={{ color: LOCK.text, fontSize: 17, fontWeight: '500', textAlign: 'center', minHeight: 24 }}>{prompt}</Text>
        <View style={{ minHeight: 24, justifyContent: 'center' }}>
          {phase === 'success'
            ? <View accessibilityLabel="Done" style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: LOCK.success, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="checkmark" size={16} color="#fff" /></View>
            : <PinDots length={want} filled={pin.length} status={phase === 'error' ? 'error' : 'idle'} />}
        </View>
        <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ color: phase === 'error' ? LOCK.danger : LOCK.muted, fontSize: 14, textAlign: 'center', minHeight: 40, maxWidth: 280 }}>{hint}</Text>
        <PinKeypad size="sm" disabled={busy} onDigit={onDigit} onBackspace={() => setPin((p) => p.slice(0, -1))} onClear={() => setPin('')} />
      </View>
    </Sheet>
  )
}
