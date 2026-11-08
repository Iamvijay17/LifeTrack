import { MotionGlobalConfig } from 'motion/react'

// LifeTrack's motion standards. Everything that moves uses these, so the app has one rhythm.
// Durations are in seconds. Rule of thumb: UI feedback is fast, things arriving are unhurried, nothing leaving ever makes you wait.
export const duration = { fast: 0.12, base: 0.2, slow: 0.32, count: 0.7 }
export const ease = {
  out: [0.22, 1, 0.36, 1], // arrivals: quick start, gentle landing
  in: [0.4, 0, 1, 1], // departures
  inOut: [0.65, 0, 0.35, 1],
}
export const spring = {
  snappy: { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }, // indicators, toggles
  soft: { type: 'spring', stiffness: 220, damping: 26 }, // sheets, large moves
  bouncy: { type: 'spring', stiffness: 520, damping: 18 }, // celebrations only
}

/** True when animation should not run: the visitor asked for less motion, or the tests turned it off. */
export function motionOff() {
  if (MotionGlobalConfig.skipAnimations) return true
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
