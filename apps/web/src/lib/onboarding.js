// Onboarding: the steps, the saved shape, and how the answers turn into settings. Pure functions only; the store is hooks/useOnboarding.js.
//
// Nothing here is required. Every answer is optional, and only the fields a person actually filled in are written when they finish, so
// skipping a step never overwrites a setting they already had.

export const STEPS = [
  { key: 'welcome', title: 'Welcome to LifeTrack', optional: false },
  { key: 'profile', title: 'About you', optional: true },
  { key: 'modules', title: 'What do you want to track?', optional: true },
  { key: 'learning', title: 'Career & learning', optional: true },
  { key: 'fitness', title: 'Fitness & wellness', optional: true },
  { key: 'finance', title: 'Finance', optional: true },
  { key: 'routine', title: 'Daily routine', optional: true },
  { key: 'look', title: 'Your dashboard', optional: true },
  { key: 'confirm', title: 'All set', optional: false },
]

/** Modules a person can pick as favourites; `to` is the nav path they are pinned to. */
export const MODULE_CHOICES = [
  { key: 'planner', to: '/planner', label: 'Daily planner', hint: 'Tasks and priorities' },
  { key: 'habits', to: '/habits', label: 'Habits', hint: 'Streaks and routines' },
  { key: 'learning', to: '/learning', label: 'Career & learning', hint: 'Study sessions and topics' },
  { key: 'jobs', to: '/jobs', label: 'Job search', hint: 'Applications and interviews' },
  { key: 'fitness', to: '/fitness', label: 'Gym & fitness', hint: 'Workouts and body stats' },
  { key: 'health', to: '/health', label: 'Sleep & health', hint: 'Sleep, water and steps' },
  { key: 'nutrition', to: '/nutrition', label: 'Food & nutrition', hint: 'Meals and macros' },
  { key: 'finance', to: '/finance', label: 'Finance', hint: 'Spending and budgets' },
  { key: 'goals', to: '/goals', label: 'Goals', hint: 'Milestones and progress' },
  { key: 'notes', to: '/notes', label: 'Notes & journal', hint: 'Capture and reflect' },
]

export const MAX_FAVOURITES = 4
const STATUSES = ['in_progress', 'later', 'done', 'existing']
const TOUR_RESULTS = ['done', 'skipped']

const int = (v, min, max) => {
  if (v === '' || v == null) return undefined
  const n = Number(v)
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : undefined
}
const oneOf = (list, v) => (list.includes(v) ? v : undefined)
const time = (v) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined)

/** Anything stored (older versions, hand-edited, another device) becomes a complete, valid answers object. Unknown or invalid fields drop out. */
export function normalizeAnswers(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const out = {
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 80) : undefined,
    timezone: typeof r.timezone === 'string' && r.timezone.length < 60 ? r.timezone : undefined,
    modules: Array.isArray(r.modules)
      ? [...new Set(r.modules.filter((k) => MODULE_CHOICES.some((c) => c.key === k)))].slice(0, MAX_FAVOURITES)
      : undefined,
    study_minutes: int(r.study_minutes, 0, 1440),
    job_search: typeof r.job_search === 'boolean' ? r.job_search : undefined,
    water_goal_ml: int(r.water_goal_ml, 0, 20000),
    steps_goal: int(r.steps_goal, 0, 200000),
    sleep_hours:
      r.sleep_hours === '' || r.sleep_hours == null
        ? undefined
        : Number.isFinite(Number(r.sleep_hours)) && Number(r.sleep_hours) >= 4 && Number(r.sleep_hours) <= 12
          ? Number(r.sleep_hours)
          : undefined,
    currency: oneOf(['INR', 'USD', 'EUR'], r.currency),
    monthly_budget:
      typeof r.monthly_budget === 'string' && /^\d{1,9}(\.\d{1,2})?$/.test(r.monthly_budget.trim()) ? r.monthly_budget.trim() : undefined,
    week_starts_on: r.week_starts_on === 0 || r.week_starts_on === 1 ? r.week_starts_on : undefined,
    wake: time(r.wake),
    bedtime: time(r.bedtime),
    theme: oneOf(['dark', 'light', 'system'], r.theme),
    accent: oneOf(['violet', 'blue', 'emerald', 'rose', 'orange', 'cyan'], r.accent),
    density: oneOf(['comfortable', 'compact'], r.density),
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined))
}

const flags = (v, allowed) =>
  Object.fromEntries(
    Object.entries(v && typeof v === 'object' && !Array.isArray(v) ? v : {}).filter(([k, x]) => k.length < 40 && allowed(x)),
  )

/** The whole saved object, always valid. `{}` (nothing decided yet) stays `{}`-like: status undefined. */
export function normalizeOnboarding(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  return {
    status: oneOf(STATUSES, r.status),
    step: Number.isInteger(r.step) ? Math.max(0, Math.min(STEPS.length - 1, r.step)) : 0,
    answers: normalizeAnswers(r.answers),
    tours: flags(r.tours, (x) => TOUR_RESULTS.includes(x)),
    offered: flags(r.offered, (x) => x === true),
    // When this was last changed (ms). Whichever copy, device or account, is newer wins, so a slow save never overwrites a newer choice.
    at: Number.isFinite(r.at) && r.at > 0 ? r.at : 0,
  }
}

/** Whether to start onboarding for an account we have never decided about: only for a brand-new account (no defaults seeded yet). */
export const isNewAccount = (row) => !row || !row.defaults_seeded

/** Onboarding is open for a person who has not finished or put it off. */
export const onboardingOpen = (s) => s.status === 'in_progress'
/** Finished or put off, so the setup guide in Settings can offer to resume. */
export const canResume = (s) => s.status === 'later' || s.status === 'in_progress'

/** How far along, 0–100, for the progress bar. */
export const progressOf = (step) => Math.round((step / (STEPS.length - 1)) * 100)

/** Which steps have an answer, for the summary and the step dots. */
export function answeredSteps(answers) {
  const a = answers ?? {}
  const has = (...keys) => keys.some((k) => a[k] !== undefined && !(Array.isArray(a[k]) && a[k].length === 0))
  return {
    profile: has('name', 'timezone'),
    modules: has('modules'),
    learning: has('study_minutes', 'job_search'),
    fitness: has('water_goal_ml', 'steps_goal', 'sleep_hours'),
    finance: has('currency', 'monthly_budget'),
    routine: has('week_starts_on', 'wake', 'bedtime'),
    look: has('theme', 'accent', 'density'),
  }
}

const minutesBetween = (from, to) => {
  const [fh, fm] = from.split(':').map(Number)
  const [th, tm] = to.split(':').map(Number)
  const diff = (th * 60 + tm - (fh * 60 + fm) + 1440) % 1440
  return diff
}

/**
 * Turns the answers into the writes to make. Only answered fields appear, so a skipped step changes nothing.
 * `settings` is the current user_settings (for merging into habit_prefs); `parseMoney` converts "30000" to paise.
 * @returns {{ name?: string, settings: object, appearance: object, theme?: string, pinned?: string[] }}
 */
export function planApply(answers, settings, parseMoney) {
  const a = normalizeAnswers(answers)
  const s = {}
  if (a.timezone) s.timezone = a.timezone
  if (a.currency) s.currency = a.currency
  if (a.week_starts_on !== undefined) s.week_starts_on = a.week_starts_on
  if (a.study_minutes !== undefined) s.daily_study_target_minutes = a.study_minutes
  if (a.water_goal_ml !== undefined) s.water_goal_ml = a.water_goal_ml
  if (a.steps_goal !== undefined) s.steps_goal = a.steps_goal
  if (a.monthly_budget) {
    const paise = parseMoney(a.monthly_budget)
    if (paise) s.monthly_budget_paise = paise
  }
  const sleepMinutes =
    a.sleep_hours !== undefined ? Math.round(a.sleep_hours * 60) : a.wake && a.bedtime ? minutesBetween(a.bedtime, a.wake) : undefined
  const prefs = { ...(settings?.habit_prefs ?? {}) }
  let touchedPrefs = false
  if (sleepMinutes && sleepMinutes >= 240 && sleepMinutes <= 720) {
    prefs.sleep_goal_minutes = sleepMinutes
    touchedPrefs = true
  }
  if (a.wake) ((prefs.routine = { ...(prefs.routine ?? {}), wake: a.wake }), (touchedPrefs = true))
  if (a.bedtime) ((prefs.routine = { ...(prefs.routine ?? {}), bedtime: a.bedtime }), (touchedPrefs = true))
  if (touchedPrefs) s.habit_prefs = prefs
  if (a.theme) s.theme = a.theme
  const appearance = {}
  if (a.accent) appearance.accent = a.accent
  if (a.density) appearance.density = a.density
  const pinned = a.modules?.length ? a.modules.map((k) => MODULE_CHOICES.find((c) => c.key === k).to) : undefined
  return { name: a.name, settings: s, appearance, theme: a.theme, pinned }
}
