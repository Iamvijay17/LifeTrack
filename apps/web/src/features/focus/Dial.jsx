import { useId } from 'react'
import { fmtClock } from '@/domain/focus'
import { cn } from '@/lib/utils'

const RADIUS = 88
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** The countdown ring. `left` and `total` are seconds; the ring drains as time runs out, and breathes while it's running. */
export function Dial({ left, total, mode, running }) {
  const id = useId().replaceAll(':', '')
  const fraction = total ? Math.max(0, Math.min(1, left / total)) : 1
  const focus = mode === 'focus'
  return (
    <div className="relative mx-auto h-60 w-60">
      {running && (
        <span
          aria-hidden
          className={cn('lt-pulse-ring absolute inset-6 rounded-full border-2', focus ? 'border-mod/40' : 'border-success/40')}
          style={{ animationDuration: '3.2s' }}
        />
      )}
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" role="timer" aria-label={`${fmtClock(left)} remaining`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: focus ? 'rgb(var(--mod))' : '#34D399' }} />
            <stop offset="1" style={{ stopColor: focus ? 'rgb(var(--mod-2))' : '#14B8A6' }} />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="rgb(var(--muted))" strokeWidth="9" />
        <circle
          cx="100"
          cy="100"
          r={RADIUS}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
        <text
          x="100"
          y="100"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground text-[42px] font-semibold tabular-nums tracking-tight"
          style={{ transform: 'rotate(90deg)', transformOrigin: '100px 100px' }}
        >
          {fmtClock(left)}
        </text>
      </svg>
    </div>
  )
}
