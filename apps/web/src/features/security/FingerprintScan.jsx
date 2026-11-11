import { Check, X } from 'lucide-react'
import { m } from '@/components/motion/primitives'
import { cn } from '@/lib/utils'

// Nested arches that read as a fingerprint. Drawn one ridge after another (pathLength), then lit while the device is listening.
const RIDGES = [
  'M60 20C35 20 20 39 20 62C20 78 26 91 35 100',
  'M60 20C85 20 100 39 100 62C100 73 98 82 93 91',
  'M60 30C41 30 30 45 30 62C30 76 36 87 45 95',
  'M60 30C79 30 90 45 90 62C90 70 88 78 84 86',
  'M60 40C47 40 40 51 40 62C40 74 46 83 53 90',
  'M60 40C73 40 80 51 80 62C80 68 78 74 75 80',
  'M60 50C53 50 50 56 50 62C50 70 53 76 57 81',
  'M60 50C67 50 70 56 70 62C70 66 69 70 67 74',
  'M60 60C57 60 56 62 56 64C56 69 58 72 60 75',
]

const LABEL = {
  idle: 'Fingerprint or face unlock',
  scanning: 'Waiting for your fingerprint or face',
  success: 'Verified',
  error: 'Not recognised',
}

/**
 * The biometric prompt, animated. `state`: 'idle' | 'scanning' (the browser's prompt is open) | 'success' | 'error'.
 * Purely a picture of what is happening: LifeTrack never sees the fingerprint, only the browser's signed "the user was verified".
 */
export function FingerprintScan({ state = 'idle', size = 112, className }) {
  const tone = state === 'success' ? 'success' : state === 'error' ? 'danger' : 'primary'
  const stroke = { stroke: `rgb(var(--${tone}))` }
  return (
    <m.div
      role="img"
      aria-label={LABEL[state]}
      className={cn('relative grid place-items-center', className)}
      style={{ width: size, height: size }}
      animate={state === 'error' ? { x: [0, -10, 10, -7, 7, -3, 0] } : { x: 0 }}
      transition={{ duration: 0.45 }}
    >
      {state === 'scanning' &&
        [0, 1].map((i) => (
          <m.span
            key={i}
            aria-hidden
            className="absolute inset-0 rounded-full border border-primary/60"
            initial={{ scale: 0.85, opacity: 0.55 }}
            animate={{ scale: 1.45, opacity: 0 }}
            transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.9, ease: 'easeOut' }}
          />
        ))}
      <span
        aria-hidden
        className={cn(
          'absolute inset-[8%] rounded-full blur-xl transition-colors duration-300',
          state === 'success'
            ? 'bg-success/25'
            : state === 'error'
              ? 'bg-danger/25'
              : state === 'scanning'
                ? 'bg-primary/30'
                : 'bg-primary/10',
        )}
      />
      <svg viewBox="0 0 120 120" className="relative h-full w-full" fill="none" aria-hidden>
        <defs>
          <linearGradient id="fp-scan" x1="0" x2="1">
            <stop offset="0" stopColor="rgb(var(--primary))" stopOpacity="0" />
            <stop offset="0.5" stopColor="rgb(var(--primary))" stopOpacity="0.95" />
            <stop offset="1" stopColor="rgb(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {RIDGES.map((d, i) => (
          <m.path
            key={d}
            d={d}
            strokeWidth="3.4"
            strokeLinecap="round"
            style={stroke}
            className="transition-[stroke] duration-300"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: state === 'idle' ? 0.7 : 1 }}
            transition={{ pathLength: { delay: i * 0.07, duration: 0.7, ease: 'easeOut' }, opacity: { delay: i * 0.07, duration: 0.3 } }}
          />
        ))}
        {state === 'scanning' && (
          <m.rect
            x="16"
            width="88"
            height="3"
            rx="1.5"
            fill="url(#fp-scan)"
            initial={{ y: 22 }}
            animate={{ y: [22, 94, 22] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </svg>
      {(state === 'success' || state === 'error') && (
        <m.span
          className={cn(
            'absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full text-white shadow-lg',
            state === 'success' ? 'bg-success' : 'bg-danger-solid',
          )}
          initial={{ scale: 0, rotate: -40 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 460, damping: 18 }}
        >
          {state === 'success' ? (
            <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
          ) : (
            <X className="h-4 w-4" strokeWidth={3} aria-hidden />
          )}
        </m.span>
      )}
    </m.div>
  )
}
