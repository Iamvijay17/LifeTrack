import { CUES } from './recipes'
import { haptic } from './haptics'
import { getPrefs } from './prefs'

// One place that decides whether, and how, any sound plays. The rules, in order:
//  1. Off means off: master switch, mute, the cue's category, and a hidden tab all stop it.
//  2. One voice at a time. A new cue either cuts the one still sounding (when it matters at least as much) or is dropped. Cues are 40-650 ms,
//     so this is what keeps a click + a close + a success toast from becoming a pile-up.
//  3. The same cue can't repeat faster than its own `gap` (a double-fire, a held key).
//  4. Browsers keep audio locked until the person has touched the page. `unlock()` runs on the first real gesture; until then cues are dropped,
//     not queued, so nothing plays late and out of context.

const gainFor = (volume) => 1.6 * Math.pow(volume, 1.5) // a curve, not a line: 50% is comfortable, 100% is still tame

const lengthOf = (cue) => Math.max(...cue.tones.map((t) => (t.at ?? 0) + t.d), ...(cue.clicks ?? []).map((c) => (c.at ?? 0) + c.d))
const LENGTH = Object.fromEntries(Object.entries(CUES).map(([k, c]) => [k, lengthOf(c)]))

class SoundManager {
  ctx = null
  master = null
  noise = null
  active = null // { key, priority, endsAt (performance.now ms), node }
  lastAt = new Map()
  aliases = new Map()
  /** Bumped by every explicit cue request. The global click listener compares it before and after an event: if something specific already
   *  spoke for this click, the generic click sound stays quiet. */
  requests = 0

  /** Create/resume the audio context. Must run inside a user gesture the first time; harmless afterwards. Returns whether audio is running. */
  unlock() {
    const ctx = this.#context()
    if (!ctx) return false
    if (ctx.state === 'suspended') ctx.resume?.().catch(() => {})
    // iOS: treat our cues as ambient UI sound, which respects the silent switch and never interrupts the person's music.
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'ambient'
    } catch {
      /* not supported */
    }
    return ctx.state === 'running'
  }

  get running() {
    return this.ctx?.state === 'running'
  }

  /** Make the next `from` cues sound like `to` for a moment. A confirmed delete says "success" to the toaster; the person should hear "delete". */
  alias(from, to, ttlMs = 4000) {
    this.aliases.set(from, { to, until: performance.now() + ttlMs })
  }

  clearAlias(from) {
    from ? this.aliases.delete(from) : this.aliases.clear()
  }

  /**
   * Play a cue (and its haptic). Returns the key that actually played, or null when it was gated or dropped.
   * opts.generic: the automatic click sound of the global listener, which does not count as an explicit request.
   * opts.preview: Settings' preview button: plays even if the category or master switch is off, but never while muted.
   */
  play(key, { generic = false, preview = false } = {}) {
    if (!generic) this.requests++
    const now = performance.now()
    const alias = this.aliases.get(key)
    if (alias) {
      if (now > alias.until) this.aliases.delete(key)
      else {
        // Stays valid a moment longer so the toast that follows the same action maps the same way, then retires.
        this.aliases.set(key, { ...alias, until: Math.min(alias.until, now + 400) })
        key = alias.to
      }
    }
    const cue = CUES[key]
    if (!cue) return null
    // A finished focus block is the one cue that matters while you are in another tab.
    if (typeof document !== 'undefined' && document.hidden && !preview && !cue.hiddenOk) return null

    const prefs = getPrefs()
    const lastAt = this.lastAt.get(key)
    if (!preview && lastAt !== undefined && now - lastAt < cue.gap * 1000) return null
    if (!preview && this.active && now < this.active.endsAt) {
      if (cue.priority < this.active.priority) return null
      this.#cut()
    }
    if (preview) this.#cut()
    this.lastAt.set(key, now)

    const soundOn = preview ? !prefs.muted : prefs.enabled && !prefs.muted && prefs.categories[cue.category]
    // Haptics follow their own switch, so they still fire when the sounds are off.
    if (!preview) haptic(key)
    this.active = { key, priority: cue.priority, endsAt: now + LENGTH[key] * 1000, node: null }
    if (!soundOn || prefs.volume <= 0) return null
    if (!this.running) {
      this.unlock()
      return null
    }
    this.active.node = this.#voice(cue, prefs.volume)
    return key
  }

  #context() {
    if (this.ctx) return this.ctx
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
    if (!AC) return null
    try {
      const ctx = new AC({ latencyHint: 'interactive' })
      const master = ctx.createGain()
      // A gentle limiter: even a stack of tones at full volume cannot clip.
      const limiter = ctx.createDynamicsCompressor()
      limiter.threshold.value = -14
      limiter.ratio.value = 8
      master.connect(limiter).connect(ctx.destination)
      this.ctx = ctx
      this.master = master
      // 80 ms of white noise, shared by every cue that has a click in it.
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.08), ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      this.noise = buf
      return ctx
    } catch {
      return null
    }
  }

  #cut() {
    const node = this.active?.node
    this.active = null
    if (!node || !this.ctx) return
    const t = this.ctx.currentTime
    node.gain.cancelScheduledValues(t)
    node.gain.setValueAtTime(node.gain.value, t)
    node.gain.linearRampToValueAtTime(0, t + 0.02)
    setTimeout(() => node.disconnect(), 80)
  }

  #voice(cue, volume) {
    const ctx = this.ctx
    const t0 = ctx.currentTime + 0.005
    this.master.gain.setValueAtTime(gainFor(volume), ctx.currentTime)
    const voice = ctx.createGain()
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = cue.lowpass ?? 5000
    voice.connect(tone).connect(this.master)

    const envelope = (g, at, d, peak) => {
      g.gain.setValueAtTime(0.0001, at)
      g.gain.linearRampToValueAtTime(peak, at + Math.min(0.004, d / 3))
      g.gain.exponentialRampToValueAtTime(0.0001, at + d)
    }
    for (const t of cue.tones) {
      const at = t0 + (t.at ?? 0)
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = t.type ?? 'sine'
      osc.frequency.setValueAtTime(t.f, at)
      if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, at + t.d)
      envelope(g, at, t.d, t.g)
      osc.connect(g).connect(voice)
      osc.start(at)
      osc.stop(at + t.d + 0.02)
    }
    for (const c of cue.clicks ?? []) {
      const at = t0 + (c.at ?? 0)
      const src = ctx.createBufferSource()
      const band = ctx.createBiquadFilter()
      const g = ctx.createGain()
      src.buffer = this.noise
      band.type = 'bandpass'
      band.frequency.value = c.f
      band.Q.value = 1.2
      envelope(g, at, c.d, c.g)
      src.connect(band).connect(g).connect(voice)
      src.start(at)
      src.stop(at + c.d + 0.02)
    }
    setTimeout(() => voice.disconnect(), (lengthOf(cue) + 0.15) * 1000)
    return voice
  }

  /** Tests: back to a clean slate. */
  reset() {
    this.active = null
    this.lastAt.clear()
    this.aliases.clear()
    this.requests = 0
  }
}

export const sound = new SoundManager()
export { CUES }
