// Sound & interaction preferences. They describe *this device* (a phone and a desktop want different volumes), so they live in localStorage
// and never touch the account or the database. A tiny external store: React reads it with useSyncExternalStore, plain code with getPrefs().
import { DEFAULT_FOCUS_PROFILE, DEFAULT_PROFILE, EVENT_KEYS, PROFILE_KEYS } from './profiles'

export const DEFAULT_PREFS = {
  enabled: true,
  muted: false,
  volume: 0.5, // 0..1, the master slider. The audible gain follows a curve (see SoundManager), so 50% is comfortable, not half-loud.
  haptics: true,
  profile: DEFAULT_PROFILE, // the everyday profile
  focusProfile: DEFAULT_FOCUS_PROFILE, // used instead while a focus block is running
  autoFocus: true, // switch to the focus profile by itself during focus blocks
  events: {}, // the person's own changes on top of the profile: { taskDone: { enabled?: boolean, volume?: 0..1 } }
}

const KEY = 'lifetrack:interaction-prefs'
const listeners = new Set()
let current = null
let focusActive = false

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null)

// The first version had five on/off groups. A group someone switched off becomes its events switched off, so nothing starts making noise.
const LEGACY_GROUPS = {
  interface: ['click'],
  completion: ['taskDone', 'habitDone', 'goalDone'],
  feedback: ['success', 'error'],
  notifications: ['notification'],
  timer: ['timerStart', 'timerPause', 'timerDone'],
}

function cleanEvents(raw, legacy) {
  const out = {}
  const src = raw && typeof raw === 'object' ? raw : {}
  for (const k of EVENT_KEYS) {
    const o = src[k]
    if (!o || typeof o !== 'object') continue
    const e = {}
    if (typeof o.enabled === 'boolean') e.enabled = o.enabled
    const v = o.volume === undefined ? null : clamp01(Number(o.volume))
    if (v !== null) e.volume = v
    if (Object.keys(e).length) out[k] = e
  }
  if (legacy && typeof legacy === 'object') {
    for (const [group, events] of Object.entries(LEGACY_GROUPS)) {
      if (legacy[group] === false) for (const k of events) out[k] = { ...out[k], enabled: false }
    }
  }
  return out
}

/** Accepts anything (a stale or hand-edited value) and returns a complete, valid preferences object. */
export function normalizePrefs(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const v = r.volume === undefined ? null : clamp01(Number(r.volume))
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_PREFS.enabled,
    muted: typeof r.muted === 'boolean' ? r.muted : DEFAULT_PREFS.muted,
    volume: v ?? DEFAULT_PREFS.volume,
    haptics: typeof r.haptics === 'boolean' ? r.haptics : DEFAULT_PREFS.haptics,
    profile: PROFILE_KEYS.includes(r.profile) ? r.profile : DEFAULT_PREFS.profile,
    focusProfile: PROFILE_KEYS.includes(r.focusProfile) ? r.focusProfile : DEFAULT_PREFS.focusProfile,
    autoFocus: typeof r.autoFocus === 'boolean' ? r.autoFocus : DEFAULT_PREFS.autoFocus,
    events: cleanEvents(r.events, r.categories),
  }
}

function read() {
  try {
    return normalizePrefs(JSON.parse(localStorage.getItem(KEY)))
  } catch {
    return normalizePrefs(null) // private mode, blocked storage or corrupt JSON: run on defaults
  }
}

export function getPrefs() {
  return (current ??= read())
}

const persist = (next) => {
  current = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* the change still applies for this visit */
  }
  listeners.forEach((l) => l())
}

/**
 * Merge a change. `events` merges per event, and an event set to `null` drops that person's override (back to the profile's value).
 * Choosing a different profile forgets the overrides: a profile is a fresh starting point, not a layer on top of the last one.
 */
export function setPrefs(patch) {
  const prev = getPrefs()
  const events = { ...prev.events }
  for (const [k, v] of Object.entries(patch.events ?? {})) {
    if (v === null) delete events[k]
    else events[k] = { ...events[k], ...v }
  }
  const next = normalizePrefs({ ...prev, ...patch, events })
  if (patch.profile !== undefined && patch.profile !== prev.profile && patch.events === undefined) next.events = {}
  persist(next)
}

/** Back to the factory settings: default profile, master volume, no overrides. */
export function resetPrefs() {
  persist(normalizePrefs(null))
}

/** Whether a focus block is running right now. Not stored: it is the timer's state, and the manager only needs to know which profile applies. */
export function setFocusActive(on) {
  if (focusActive === !!on) return
  focusActive = !!on
  listeners.forEach((l) => l())
}
export const isFocusActive = () => focusActive

export function subscribePrefs(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Test helper: forget the cached copy so the next read goes to storage again. */
export function resetPrefsCache() {
  current = null
  focusActive = false
  listeners.forEach((l) => l())
}

// Another tab changed them: follow it.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) resetPrefsCache()
  })
}
