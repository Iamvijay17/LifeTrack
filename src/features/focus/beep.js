/** A short tone when a block ends. Sound is optional: any failure (no audio support, autoplay policy) is ignored. */
export function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 660
    gain.gain.value = 0.08
    osc.start()
    osc.stop(ctx.currentTime + 0.35)
  } catch {
    /* sound is optional */
  }
}
