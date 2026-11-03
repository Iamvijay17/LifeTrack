import { memo } from 'react'

/**
 * Compact in-button indicator: two counter-rotating arcs around a still dot — a miniature of the orbit, not a plain spinner.
 * Inherits the button's text colour. Decorative; the button itself exposes aria-busy.
 */
export const ButtonLoader = memo(function ButtonLoader({ size = 16, className = '' }) {
  return (
    <svg
      className={`lt-orbit ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden
      focusable="false"
    >
      <g className="lt-spin lt-spin-outer" style={{ transformOrigin: '12px 12px', transformBox: 'view-box', animationDuration: '1.6s' }}>
        <circle cx="12" cy="12" r="10" strokeWidth="2.4" strokeDasharray="22 41" />
      </g>
      <g className="lt-spin lt-spin-inner" style={{ transformOrigin: '12px 12px', transformBox: 'view-box', animationDuration: '1.1s' }}>
        <circle cx="12" cy="12" r="5.5" strokeWidth="2" strokeDasharray="12 23" opacity=".7" />
      </g>
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
})
