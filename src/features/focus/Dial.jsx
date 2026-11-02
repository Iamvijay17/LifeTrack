import { fmtClock } from '@/domain/focus'

const RADIUS = 88
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** The countdown ring. `left` and `total` are seconds; the ring drains as time runs out. */
export function Dial({ left, total, mode }) {
  const fraction = total ? Math.max(0, Math.min(1, left / total)) : 1
  return (
    <svg viewBox="0 0 200 200" className="mx-auto h-56 w-56 -rotate-90" role="timer" aria-label={`${fmtClock(left)} remaining`}>
      <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="rgb(var(--muted))" strokeWidth="8" />
      <circle
        cx="100"
        cy="100"
        r={RADIUS}
        fill="none"
        stroke={mode === 'focus' ? 'var(--c-primary)' : 'var(--c-success)'}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
      />
      <text
        x="100"
        y="100"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground text-[40px] font-semibold tabular-nums"
        style={{ transform: 'rotate(90deg)', transformOrigin: '100px 100px' }}
      >
        {fmtClock(left)}
      </text>
    </svg>
  )
}
