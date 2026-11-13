// The sound set, as recipes. Every cue is synthesised with the Web Audio API when it is played: nothing to download, nothing to license,
// and no decode step, so it is "preloaded" by construction. Each cue is a few soft sine/triangle notes (or a faint filtered click) with a fast
// envelope, 40-650 ms long, peaking well under full scale.
//
// tone:  { f: start Hz, to?: end Hz, at?: start offset s, d: duration s, g: peak gain, type?: 'sine'|'triangle' }
// click: a few ms of band-passed noise, the "mechanical" part of a switch or button. { at, d, f: centre Hz, g }
// priority: when two cues collide, the higher one wins and the other is cut (never two at once). `gap`: min seconds between the same cue.

const n = (f, at, d, g = 0.16, type = 'sine') => ({ f, at, d, g, type })

export const CUES = {
  // — interface —
  click: {
    category: 'interface',
    priority: 0,
    gap: 0.045,
    lowpass: 5200,
    tones: [{ f: 1500, to: 950, d: 0.04, g: 0.13 }],
    clicks: [{ d: 0.006, f: 3200, g: 0.05 }],
  },
  navigate: {
    category: 'interface',
    priority: 1,
    gap: 0.12,
    lowpass: 4200,
    tones: [{ f: 420, to: 640, d: 0.11, g: 0.1, type: 'triangle' }],
  },
  select: { category: 'interface', priority: 1, gap: 0.05, lowpass: 5000, tones: [n(880, 0, 0.06, 0.12)] },
  toggleOn: {
    category: 'interface',
    priority: 1,
    gap: 0.08,
    lowpass: 5200,
    tones: [
      { f: 620, to: 900, d: 0.07, g: 0.12 },
      { f: 170, d: 0.03, g: 0.1 },
    ],
    clicks: [{ d: 0.008, f: 2400, g: 0.07 }],
  },
  toggleOff: {
    category: 'interface',
    priority: 1,
    gap: 0.08,
    lowpass: 5200,
    tones: [
      { f: 880, to: 520, d: 0.07, g: 0.11 },
      { f: 150, d: 0.03, g: 0.1 },
    ],
    clicks: [{ d: 0.008, f: 1800, g: 0.07 }],
  },
  open: { category: 'interface', priority: 1, gap: 0.1, lowpass: 4200, tones: [{ f: 560, to: 760, d: 0.08, g: 0.09 }] },
  close: { category: 'interface', priority: 1, gap: 0.1, lowpass: 4200, tones: [{ f: 760, to: 540, d: 0.07, g: 0.08 }] },
  // — completion —
  check: { category: 'completion', priority: 3, gap: 0.12, lowpass: 6000, tones: [n(784, 0, 0.1, 0.15), n(1175, 0.06, 0.16, 0.15)] },
  complete: {
    category: 'completion',
    priority: 4,
    gap: 0.3,
    lowpass: 6000,
    tones: [n(523, 0, 0.14, 0.14), n(659, 0.07, 0.14, 0.14), n(784, 0.14, 0.2, 0.14), n(1047, 0.14, 0.26, 0.05)],
  },
  // — feedback —
  success: { category: 'feedback', priority: 2, gap: 0.25, lowpass: 5200, tones: [n(660, 0, 0.1, 0.13), n(880, 0.08, 0.16, 0.13)] },
  error: {
    category: 'feedback',
    priority: 5,
    gap: 0.3,
    lowpass: 1800,
    tones: [n(220, 0, 0.09, 0.16, 'triangle'), n(185, 0.1, 0.14, 0.16, 'triangle')],
  },
  warning: { category: 'feedback', priority: 4, gap: 0.3, lowpass: 2400, tones: [n(330, 0, 0.14, 0.13, 'triangle')] },
  delete: {
    category: 'feedback',
    priority: 4,
    gap: 0.25,
    lowpass: 1600,
    tones: [{ f: 480, to: 190, d: 0.13, g: 0.13, type: 'triangle' }],
    clicks: [{ d: 0.07, f: 900, g: 0.05 }],
  },
  // — notifications —
  notify: { category: 'notifications', priority: 2, gap: 0.6, lowpass: 6500, tones: [n(988, 0, 0.32, 0.1), n(1480, 0, 0.22, 0.04)] },
  // — focus timer —
  timerStart: { category: 'timer', priority: 3, gap: 0.2, lowpass: 5000, tones: [n(440, 0, 0.09, 0.13), n(660, 0.08, 0.16, 0.13)] },
  timerPause: { category: 'timer', priority: 3, gap: 0.2, lowpass: 4200, tones: [{ f: 600, to: 450, d: 0.1, g: 0.12 }] },
  timerStop: { category: 'timer', priority: 3, gap: 0.2, lowpass: 4200, tones: [{ f: 660, to: 330, d: 0.16, g: 0.12 }] },
  focusDone: {
    category: 'timer',
    priority: 4,
    hiddenOk: true,
    gap: 1,
    lowpass: 6500,
    tones: [n(523, 0, 0.5, 0.11), n(784, 0.1, 0.5, 0.11), n(1047, 0.2, 0.62, 0.11), n(1568, 0.2, 0.4, 0.03)],
  },
}

/** A short vibration pattern per cue, for the phones that support it. Anything not listed gets nothing (clicks only tick on touch screens). */
export const HAPTICS = {
  click: 6,
  select: 6,
  toggleOn: 10,
  toggleOff: 8,
  check: 12,
  complete: [10, 40, 14],
  success: [8, 40, 10],
  error: [20, 50, 20],
  warning: 16,
  delete: [14, 30, 8],
  notify: [10, 60, 10],
  timerStart: 10,
  timerStop: 12,
  focusDone: [12, 50, 12, 50, 18],
}
