import { memo, useId } from 'react'

/**
 * LifeTrack Progress Orbit — the animated brand symbol.
 * The centre is the real LifeTrack logo check + progress arrow (same path data as /brand/lifetrack-icon.svg), drawn on
 * once. Two dashed orbit rings turn in opposite directions with a few particles riding them; a soft radial-gradient glow
 * pulses behind. Decorative only (aria-hidden): the surrounding loader announces status. All motion is in index.css.
 */
export const OrbitMark = memo(function OrbitMark({ size = 96, className = '' }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg className={`lt-orbit ${className}`} width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden focusable="false">
      <defs>
        <radialGradient id={`g${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--lt-a)" stopOpacity=".55" />
          <stop offset="1" stopColor="var(--lt-a)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`c${id}`} x1="36" y1="30" x2="84" y2="72" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--lt-b)" />
          <stop offset="1" stopColor="var(--lt-a)" />
        </linearGradient>
      </defs>
      <circle className="lt-glow" cx="60" cy="60" r="34" fill={`url(#g${id})`} />
      <g className="lt-spin lt-spin-outer">
        <circle
          cx="60"
          cy="60"
          r="54"
          stroke="var(--lt-a)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="92 36 22 36"
          opacity=".9"
        />
        <circle cx="60" cy="6" r="3.4" fill="var(--lt-c)" />
        <circle cx="60" cy="114" r="2.2" fill="var(--lt-b)" />
      </g>
      <g className="lt-spin lt-spin-inner">
        <circle cx="60" cy="60" r="41" stroke="var(--lt-b)" strokeWidth="2" strokeLinecap="round" strokeDasharray="46 22" opacity=".75" />
        <circle cx="19" cy="60" r="2.8" fill="var(--lt-c)" />
        <circle cx="101" cy="60" r="2" fill="var(--lt-a)" />
      </g>
      {/* logo check + arrow tip, scaled from the 512px brand icon */}
      <g transform="translate(1.5 11.5) scale(.2)" stroke={`url(#c${id})`} strokeWidth="40" strokeLinecap="round" strokeLinejoin="round">
        <path className="lt-check" pathLength="1" d="M185 275L235 325L400 160" />
        <path className="lt-check" pathLength="1" d="M342 160H400V218" />
      </g>
    </svg>
  )
})
