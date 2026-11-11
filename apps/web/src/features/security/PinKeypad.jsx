import { useEffect, useRef, useState } from 'react'
import { Delete } from 'lucide-react'
import { m, spring } from '@/components/motion/primitives'
import { cn } from '@/lib/utils'

const tick = () => {
  try {
    navigator.vibrate?.(8) // a light tap on phones that support it
  } catch {
    /* no haptics */
  }
}

/** The PIN so far, as dots. `status` colours it: 'error' shakes and turns red, 'success' turns green and pulses. Never shows the digits. */
export function PinDots({ length, filled, status = 'idle', className }) {
  return (
    <m.div
      role="status"
      aria-live="polite"
      aria-label={`${filled} of ${length} digits entered`}
      className={cn('flex items-center justify-center gap-3.5', className)}
      animate={status === 'error' ? { x: [0, -12, 12, -9, 9, -5, 5, 0] } : { x: 0 }}
      transition={{ duration: 0.45 }}
    >
      {Array.from({ length }, (_, i) => {
        const on = i < filled || status === 'success'
        return (
          <m.span
            key={i}
            aria-hidden
            className={cn(
              'block h-3.5 w-3.5 rounded-full border-2 transition-colors duration-200',
              status === 'error' ? 'border-danger' : status === 'success' ? 'border-success' : on ? 'border-primary' : 'border-white/30',
              on &&
                (status === 'error'
                  ? 'bg-danger'
                  : status === 'success'
                    ? 'bg-success'
                    : 'bg-primary shadow-[0_0_14px_rgb(var(--primary)/0.8)]'),
            )}
            animate={on ? { scale: status === 'success' ? [1, 1.35, 1] : [0.6, 1.25, 1] } : { scale: 1 }}
            transition={
              status === 'success' ? { duration: 0.5, delay: i * 0.05 } : (spring.snappy ?? { type: 'spring', stiffness: 520, damping: 18 })
            }
          />
        )
      })}
    </m.div>
  )
}

function Key({ children, label, onPress, disabled, size, className }) {
  const [pulse, setPulse] = useState(0)
  return (
    <m.button
      type="button"
      aria-label={label}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      whileHover={disabled ? undefined : { backgroundColor: 'rgba(255,255,255,0.11)' }}
      transition={{ type: 'spring', stiffness: 600, damping: 26 }}
      onPointerDown={() => {
        if (disabled) return
        setPulse((n) => n + 1)
        tick()
      }}
      onClick={onPress}
      className={cn(
        'relative grid select-none place-items-center overflow-hidden rounded-full border border-white/10 bg-white/[0.06] font-medium text-white outline-none',
        'focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40',
        size === 'sm' ? 'h-14 w-14 text-xl' : 'h-[4.25rem] w-[4.25rem] text-2xl sm:h-[4.5rem] sm:w-[4.5rem]',
        className,
      )}
    >
      {pulse > 0 && (
        <m.span
          key={pulse}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-primary/60"
          initial={{ scale: 0.4, opacity: 0.8 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        />
      )}
      <span className="relative">{children}</span>
    </m.button>
  )
}

/**
 * The 0-9 pad. `leftSlot` takes the bottom-left cell (the fingerprint button on the lock screen). The hardware keyboard works too: digits,
 * Backspace, and Escape to clear, while `keyboard` is on and nothing else (a text field, a dialog's close button) has the focus.
 */
export function PinKeypad({ onDigit, onBackspace, onClear, disabled, leftSlot, size = 'lg', keyboard = true, className }) {
  const handlers = useRef({})
  handlers.current = { onDigit, onBackspace, onClear, disabled }
  useEffect(() => {
    if (!keyboard) return
    const onKey = (e) => {
      const h = handlers.current
      if (h.disabled || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        h.onDigit?.(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        h.onBackspace?.()
      } else if (e.key === 'Escape') h.onClear?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyboard])

  return (
    <div role="group" aria-label="PIN keypad" className={cn('grid grid-cols-3 justify-items-center gap-x-5 gap-y-4', className)}>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <Key key={d} label={d} size={size} disabled={disabled} onPress={() => onDigit?.(d)}>
          {d}
        </Key>
      ))}
      <div className="grid place-items-center">{leftSlot}</div>
      <Key label="0" size={size} disabled={disabled} onPress={() => onDigit?.('0')}>
        0
      </Key>
      <Key label="Delete" size={size} disabled={disabled} onPress={() => onBackspace?.()} className="border-transparent bg-transparent">
        <Delete className="h-6 w-6 text-white/80" aria-hidden />
      </Key>
    </div>
  )
}
