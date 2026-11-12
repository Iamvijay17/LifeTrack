/** Normalise any thrown value into an Error with a safe, human message. Never leaks internals to the UI. */
export class AppError extends Error {
  constructor(message, { code, isNetwork = false, cause } = {}) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.isNetwork = isNetwork
    this.cause = cause
  }
}

// Which migration creates which table, so a missing-table error names the right file.
const TABLE_MIGRATION = {
  calendar_events: '0011_calendar.sql',
  calendar_event_exceptions: '0011_calendar.sql',
  recurring_rules: '0008_recurring_rules.sql',
  foods: '0009_nutrition.sql',
  food_logs: '0009_nutrition.sql',
  water_logs: '0009_nutrition.sql',
  nutrition_settings: '0009_nutrition.sql',
  device_push_tokens: '0006_push_tokens.sql',
  user_security: '0012_security.sql',
  app_unlocks: '0012_security.sql',
  passkeys: '0012_security.sql',
  webauthn_challenges: '0012_security.sql',
  password_attempts: '0012_security.sql',
}

function missingTableMessage(e) {
  const table = /(?:table|relation)\s+'?"?(?:public\.)?([a-z_]+)/i.exec(String(e?.message ?? ''))?.[1]
  const file = TABLE_MIGRATION[table] ?? '0003_focus_notes_goals_reminders.sql'
  return `Your database is missing the latest LifeTrack tables${table ? ` (${table})` : ''}. In Supabase → SQL Editor, run supabase/migrations/${file} once, then reload.`
}

const PG = {
  23505: 'That record already exists.',
  23503: 'This item is linked to something that no longer exists.',
  23514: 'One of the values is not allowed.',
  23502: 'A required value is missing.',
  42501: 'You do not have permission to do that. Try signing in again.',
  PGRST301: 'Your session has expired. Please sign in again.',
  PGRST116: 'That record could not be found.',
}

export function toAppError(e) {
  if (e instanceof AppError) return e
  const msg = String(e?.message ?? e ?? '')
  const network =
    (e?.name === 'TypeError' && /fetch|network|load failed/i.test(msg)) ||
    /Failed to fetch|NetworkError|Load failed|network request failed/i.test(msg)
  if (network || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return new AppError("Can't reach the server. Check your internet connection. Nothing was saved yet.", { isNetwork: true, cause: e })
  }
  if (e?.code === 'PGRST205' || e?.code === '42P01') return new AppError(missingTableMessage(e), { code: e.code, cause: e })
  if (e?.code && PG[e.code]) return new AppError(PG[e.code], { code: e.code, cause: e })
  if (/JWT|token.*expired/i.test(msg)) return new AppError('Your session has expired. Please sign in again.', { code: 'jwt', cause: e })
  return new AppError(e?.userMessage ?? (msg && msg.length < 160 ? msg : 'Something went wrong. Please try again.'), {
    code: e?.code,
    cause: e,
  })
}
