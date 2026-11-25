// The Sound & Feedback Studio's vocabulary: the ten things a person can hear, and the four built-in profiles that set sensible defaults for them.
//
// A *cue* (recipes.js) is one synthesised sound. An *event* is what a person thinks in: "when I complete a task". Several cues can belong to
// one event (every click, toggle and menu open is a "button click"). A *profile* gives each event an on/off and a loudness, and may swap a cue
// for a richer variant. A person's own changes are stored as small overrides on top of the profile, so switching profile never loses the
// master volume and "Restore defaults" is just "forget the overrides".

/** The events, in the order the Studio lists them. `sample` is the cue that previews the event. */
export const EVENTS = {
  click: { label: 'Button clicks', desc: 'Buttons, links, tabs, switches and menus.', sample: 'click' },
  taskDone: { label: 'Task completion', desc: 'Checking a task off.', sample: 'check' },
  habitDone: { label: 'Habit completion', desc: 'Checking a habit in.', sample: 'habitCheck' },
  goalDone: { label: 'Goal achievement', desc: 'Finishing a goal or a day, and other celebrations.', sample: 'complete' },
  timerStart: { label: 'Timer start', desc: 'Starting or resuming the focus timer.', sample: 'timerStart' },
  timerPause: { label: 'Timer pause', desc: 'Pausing or stopping the focus timer.', sample: 'timerPause' },
  timerDone: { label: 'Timer completion', desc: 'A focus block finishing, even from another tab.', sample: 'focusDone' },
  notification: { label: 'Notifications', desc: 'A reminder or alert arriving.', sample: 'notify' },
  error: { label: 'Error feedback', desc: 'Something went wrong, or needs your attention.', sample: 'error' },
  success: { label: 'Successful actions', desc: 'Saved, added or removed.', sample: 'success' },
}
export const EVENT_KEYS = Object.keys(EVENTS)

const ev = (enabled, volume) => ({ enabled, volume })
const all = (enabled, volume = 0.5) => Object.fromEntries(EVENT_KEYS.map((k) => [k, ev(enabled, volume)]))

/** `variants` swaps one cue for another while the profile is active. `sample` is the event a profile's preview plays. */
export const PROFILES = {
  minimal: {
    label: 'Minimal',
    desc: 'Quiet ticks and soft confirmations. Present, never loud.',
    sample: 'taskDone',
    variants: {},
    events: {
      ...all(true, 0.55),
      click: ev(true, 0.4),
      success: ev(false, 0.5),
      timerDone: ev(true, 0.8),
      error: ev(true, 0.8),
    },
  },
  focus: {
    label: 'Focus',
    desc: 'Only what you cannot miss: the timer, alerts and errors. No clicks or celebrations.',
    sample: 'timerDone',
    variants: {},
    events: {
      ...all(false, 0.5),
      timerStart: ev(true, 0.4),
      timerPause: ev(true, 0.4),
      timerDone: ev(true, 0.8),
      notification: ev(true, 0.4),
      error: ev(true, 0.7),
    },
  },
  productivity: {
    label: 'Productivity',
    desc: 'Satisfying completion feedback: brighter chimes for tasks, habits and goals.',
    sample: 'taskDone',
    variants: { check: 'checkBright', habitCheck: 'habitCheckBright', complete: 'goalFanfare' },
    events: {
      ...all(true, 0.8),
      click: ev(true, 0.5),
      taskDone: ev(true, 1),
      habitDone: ev(true, 1),
      goalDone: ev(true, 1),
      timerDone: ev(true, 1),
      success: ev(true, 0.7),
    },
  },
  silent: {
    label: 'Silent',
    desc: 'No interaction sounds at all.',
    sample: null,
    variants: {},
    events: all(false, 0.5),
  },
}
export const PROFILE_KEYS = Object.keys(PROFILES)
export const DEFAULT_PROFILE = 'productivity'
export const DEFAULT_FOCUS_PROFILE = 'focus'

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null)

/**
 * The profile in force: the focus profile while a focus block is running (unless the person switched that off), else the everyday one.
 * @param {{profile:string, focusProfile:string, autoFocus:boolean}} prefs
 */
export const activeProfileKey = (prefs, focusActive) => (focusActive && prefs.autoFocus ? prefs.focusProfile : prefs.profile)

/** What an event does right now: the person's own override if there is one, otherwise the profile's value. */
export function resolveEvent(prefs, event, profileKey) {
  const base = PROFILES[profileKey]?.events[event] ?? ev(true, 0.5)
  const own = prefs.events?.[event]
  return {
    enabled: typeof own?.enabled === 'boolean' ? own.enabled : base.enabled,
    volume: clamp01(own?.volume) ?? base.volume,
    customised: !!own && (typeof own.enabled === 'boolean' || clamp01(own.volume) !== null),
  }
}

/** Which cue plays for `cue` under this profile (a profile may swap in a richer one). */
export const variantFor = (profileKey, cue) => PROFILES[profileKey]?.variants[cue] ?? cue
