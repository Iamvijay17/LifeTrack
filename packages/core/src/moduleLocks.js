// Which parts of LifeTrack can be locked on their own ("module locks"), and the rules for choosing them. Pure functions, no I/O: the web app, the
// in-browser dev backend and the database all use this same list. The database copy of the table list is in supabase/migrations/0015_module_locks.sql
// (a test compares the two, so they cannot drift apart).
//
// A module lock is a second way to use the app lock: instead of closing the whole app behind the PIN, the person picks the modules that ask for it
// (Finance, Health, …). One PIN (or fingerprint / face) opens all of them, until the auto-lock time runs out or they lock again.

export const LOCK_SCOPES = ['app', 'modules']

/**
 * Every module that can be locked.
 *  - `tables`   the Postgres tables the server refuses to a locked session.
 *  - `widgets`  the dashboard cards that show this module's data (replaced by a locked card).
 *  - `routes`   the pages that are replaced by an unlock screen.
 *  - `legacy`   true for the modules the whole-app lock has always protected on the server (Finance, Journal & notes); the others are only closed
 *               on the server when the person chooses to lock them as a module, so a lock set up before this feature keeps its exact behaviour.
 */
export const LOCKABLE_MODULES = [
  {
    key: 'finance',
    label: 'Finance',
    blurb: 'Transactions, budgets, savings goals and recurring payments',
    tables: ['transactions', 'budgets', 'savings_goals', 'recurring_rules'],
    widgets: ['spending'],
    routes: ['/finance'],
    legacy: true,
  },
  {
    key: 'notes',
    label: 'Journal & notes',
    blurb: 'Your notes and journal entries',
    tables: ['notes', 'journal_entries'],
    widgets: [],
    routes: ['/notes'],
    legacy: true,
  },
  {
    key: 'health',
    label: 'Health & sleep',
    blurb: 'Sleep, water, steps, weight and body measurements',
    tables: ['health_logs', 'body_measurements'],
    widgets: ['sleep'],
    routes: ['/health'],
    legacy: false,
  },
  {
    key: 'fitness',
    label: 'Gym & fitness',
    blurb: 'Workouts and exercise logs',
    tables: ['workouts', 'exercise_logs'],
    widgets: ['fitness'],
    routes: ['/fitness'],
    legacy: false,
  },
  {
    key: 'nutrition',
    label: 'Food & nutrition',
    blurb: 'Meals, calories, macros and water',
    tables: ['food_logs', 'nutrition_settings', 'water_logs'],
    widgets: ['nutrition'],
    routes: ['/nutrition'],
    legacy: false,
  },
  {
    key: 'jobs',
    label: 'Job switch',
    blurb: 'Applications, interviews and their history',
    tables: ['job_applications', 'application_history', 'interview_events'],
    widgets: ['jobs'],
    routes: ['/jobs'],
    legacy: false,
  },
]

export const MODULE_KEYS = LOCKABLE_MODULES.map((m) => m.key)
const BY_KEY = new Map(LOCKABLE_MODULES.map((m) => [m.key, m])) // a Map: 'toString' and friends are not modules

export const lockableModule = (key) => BY_KEY.get(key) ?? null
export const isLockableModule = (key) => BY_KEY.has(key)
export const moduleLabel = (key) => BY_KEY.get(key)?.label ?? key

/** Drops unknown names and duplicates, and puts the rest in the order the app lists them. */
export const normalizeModules = (keys) => {
  const wanted = new Set(Array.isArray(keys) ? keys : [])
  return MODULE_KEYS.filter((k) => wanted.has(k))
}

/** The module that owns a dashboard widget, or null for a widget that belongs to no lockable module. */
export const moduleOfWidget = (widgetKey) => LOCKABLE_MODULES.find((m) => m.widgets.includes(widgetKey))?.key ?? null

/** The module whose page this path is (`/finance`, `/finance?tab=budgets`), or null. Sub-pages count only when listed. */
export function moduleOfPath(pathname) {
  const path = String(pathname ?? '').split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  return LOCKABLE_MODULES.find((m) => m.routes.includes(path))?.key ?? null
}

/**
 * Which modules are closed right now. `state` is the security state: `{ appLockEnabled, lockScope, lockedModules, sessionUnlocked }`.
 * With the whole-app lock the app is closed as a whole (the lock screen), so no single module is reported; with module locks it is the chosen
 * modules while this session has not been unlocked.
 */
export function closedModules(state) {
  if (!state?.appLockEnabled || state.lockScope !== 'modules' || state.sessionUnlocked) return []
  return normalizeModules(state.lockedModules)
}

/** Is this table one of those the database closes for the given closed modules? */
export const tableClosed = (closed, table) => (closed ?? []).some((k) => BY_KEY.get(k)?.tables.includes(table))

/** The tables the database closes for a set of modules, for a locked session. */
export const tablesOf = (keys) => normalizeModules(keys).flatMap((k) => BY_KEY.get(k).tables)

/** "Finance", "Finance and Health & sleep", "Finance, Health & sleep and Gym & fitness". */
export function listModules(keys) {
  const names = normalizeModules(keys).map(moduleLabel)
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
