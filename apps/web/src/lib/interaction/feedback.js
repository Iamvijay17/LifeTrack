import { sound } from './SoundManager'

// "Something you did just worked": a soft glow on the button you pressed, plus the success cue. Used by useAction, so every save, add and
// delete in the app gets it without each form wiring it up. The pressed button is tracked by the global listener (see InteractionProvider).

/** Marks a toast as a notification arriving, so it gets the notification chime rather than an error or warning tone. */
export const ARRIVAL_CLASS = 'lt-arrival'

let pressed = null
let pressedAt = 0
const FRESH_MS = 20_000 // an action slower than this is no longer "the thing I just pressed"
const GLOW_MS = 900

export function trackPress(el) {
  pressed = el
  pressedAt = performance.now()
}

export function flashSaved() {
  const el = pressed
  if (!el || !el.isConnected || performance.now() - pressedAt > FRESH_MS) return
  el.classList.remove('lt-saved')
  void el.offsetWidth // restart the animation if it is still running from a moment ago
  el.classList.add('lt-saved')
  setTimeout(() => el.classList.remove('lt-saved'), GLOW_MS)
}

/** The shared "that worked" response. Safe to call from anywhere; it does nothing visible if no button was pressed. */
export function actionSucceeded() {
  sound.play('success')
  flashSaved()
}
