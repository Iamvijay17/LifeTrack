import { HAPTICS } from './recipes'
import { getPrefs } from './prefs'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const touchScreen = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
let last = 0

/**
 * A short vibration for a cue, where the browser has one (Android Chrome/Firefox; iOS Safari has no web vibration API). Quiet by design:
 * off when the person turned haptics off or asked their system for reduced motion, never while the page is hidden, and the plain
 * click/select ticks only fire on touch screens, so a laptop that happens to expose the API stays still.
 * `pattern` overrides the cue's own (a number of ms, or an array of vibrate/pause/vibrate...).
 */
export function haptic(cue, pattern) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false
  if (!getPrefs().haptics || reducedMotion() || document.hidden) return false
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false // browsers refuse (and log an error) before the first tap
  const p = pattern ?? HAPTICS[cue]
  if (p == null) return false
  if ((cue === 'click' || cue === 'select') && !touchScreen()) return false
  const now = performance.now()
  if (now - last < 40) return false // a burst of taps is one buzz, not a rattle
  last = now
  try {
    return navigator.vibrate(p)
  } catch {
    return false
  }
}
