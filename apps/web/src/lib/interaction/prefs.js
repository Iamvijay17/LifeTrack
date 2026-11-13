// Sound & interaction preferences. They describe *this device* (a phone and a desktop want different volumes), so they live in localStorage
// and never touch the account or the database. A tiny external store: React reads it with useSyncExternalStore, plain code with getPrefs().

/** The sound groups a person can switch on and off separately. `sounds` says which cues belong to each. */
export const CATEGORIES = {
  interface: { label: 'Clicks & navigation', desc: 'Buttons, links, tabs, switches, menus, dialogs and the calendar.', sample: 'click' },
  completion: { label: 'Completion', desc: 'Checking something off and finishing a task or goal.', sample: 'check' },
  feedback: { label: 'Success, errors & delete', desc: 'Saved, something went wrong, or an item was removed.', sample: 'success' },
  notifications: { label: 'Notifications', desc: 'A reminder or alert arriving.', sample: 'notify' },
  timer: { label: 'Focus timer', desc: 'Start, pause and stop, and a finished focus session.', sample: 'timerStart' },
}

export const DEFAULT_PREFS = {
  enabled: true,
  muted: false,
  volume: 0.5, // 0..1, the slider's value. The audible gain follows a curve (see SoundManager), so 50% is comfortable, not half-loud.
  haptics: true,
  categories: { interface: true, completion: true, feedback: true, notifications: true, timer: true },
}

const KEY = 'lifetrack:interaction-prefs'
const listeners = new Set()
let current = null

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_PREFS.volume)

/** Accepts anything (a stale or hand-edited value) and returns a complete, valid preferences object. */
export function normalizePrefs(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const cats = r.categories && typeof r.categories === 'object' ? r.categories : {}
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_PREFS.enabled,
    muted: typeof r.muted === 'boolean' ? r.muted : DEFAULT_PREFS.muted,
    volume: r.volume === undefined ? DEFAULT_PREFS.volume : clamp01(Number(r.volume)),
    haptics: typeof r.haptics === 'boolean' ? r.haptics : DEFAULT_PREFS.haptics,
    categories: Object.fromEntries(
      Object.keys(DEFAULT_PREFS.categories).map((k) => [k, typeof cats[k] === 'boolean' ? cats[k] : DEFAULT_PREFS.categories[k]]),
    ),
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

export function setPrefs(patch) {
  const next = normalizePrefs({
    ...getPrefs(),
    ...patch,
    categories: { ...getPrefs().categories, ...(patch.categories ?? {}) },
  })
  current = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* the change still applies for this visit */
  }
  listeners.forEach((l) => l())
}

export function subscribePrefs(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Test helper: forget the cached copy so the next read goes to storage again. */
export function resetPrefsCache() {
  current = null
  listeners.forEach((l) => l())
}

// Another tab changed them: follow it.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) resetPrefsCache()
  })
}
