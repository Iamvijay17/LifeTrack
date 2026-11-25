// Feature flags and experiments: the evaluation engine. Pure (no I/O, no clock, no randomness): the same inputs give the same answer on the web, in tests and in
// the database, where `evaluate_flags()` (migration 0028) implements exactly these rules. A parity test runs both on the same cases.
//
// What a flag is for: switching a feature on for some people or off in an emergency. What it is NOT: authorisation. Whatever a flag guards on the server is
// decided on the server (`flag_enabled()` in SQL); hiding a button because of a flag never protects anything.

export const ENVIRONMENTS = ['development', 'staging', 'production']
export const ROLES = ['user', 'admin']
export const FLAG_KINDS = ['release', 'experiment', 'ops']
export const FLAG_KEY_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){0,3}$/
export const BUCKETS = 10000 // rollout resolution: 0.01 %

/** Parts of the product that no flag, kill switch or experiment can ever turn off: signing in, security, data integrity, recovery. */
export const PROTECTED_FLAGS = [
  { key: 'core.auth', name: 'Sign-in and sessions', description: 'Signing in, sessions and account recovery. Always on.' },
  { key: 'core.security', name: 'Security and privacy', description: 'App lock, passkeys, module locks, row-level security. Always on.' },
  {
    key: 'core.data_integrity',
    name: 'Data integrity',
    description: 'Validation, the audit history, conflict detection and sync. Always on.',
  },
  { key: 'core.recovery', name: 'Backup and recovery', description: 'Export, backup, restore and the undo history. Always on.' },
]

/**
 * The flags the app ships with and their code defaults. A default is what is used when the flag service can not be reached, and it is always the
 * behaviour the app had before flags existed: on for the existing modules.
 */
export const FLAG_REGISTRY = [
  ...PROTECTED_FLAGS.map((f) => ({ ...f, kind: 'ops', module: null, protected: true, default: true })),
  {
    key: 'module.automation',
    name: 'Automation Studio',
    description: 'The Automation Studio pages and menu entry.',
    kind: 'release',
    module: 'automation',
    protected: false,
    default: true,
  },
  {
    key: 'module.challenges',
    name: 'Challenges',
    description: 'The Challenges pages and menu entry.',
    kind: 'release',
    module: 'challenges',
    protected: false,
    default: true,
  },
  {
    key: 'module.lifemap',
    name: 'Life Map',
    description: 'The Life Map page and menu entry.',
    kind: 'release',
    module: 'lifemap',
    protected: false,
    default: true,
  },
  {
    key: 'module.insights',
    name: 'Insights',
    description: 'The Insights page and menu entry.',
    kind: 'release',
    module: 'insights',
    protected: false,
    default: true,
  },
  {
    key: 'module.developers',
    name: 'Developers (API and webhooks)',
    description: 'The Developers page and menu entry.',
    kind: 'release',
    module: 'developers',
    protected: false,
    default: true,
  },
]
export const registryDefault = (key) => FLAG_REGISTRY.find((f) => f.key === key)?.default ?? false

// ------------------------------------------------------------------------------------------------------------------ hashing
/** FNV-1a, 32 bit, over the UTF-8 bytes of the text. Deterministic everywhere (the database implements the same loop). */
export function fnv1a(text) {
  let h = 0x811c9dc5
  const bytes = typeof TextEncoder === 'function' ? new TextEncoder().encode(text) : Buffer.from(text, 'utf8')
  for (const b of bytes) {
    h ^= b
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}
/** 0 … 9999: where this person falls for this flag. Stable, and independent between flags (the key is part of the hash). */
export const bucketOf = (flagKey, userId) => fnv1a(`${flagKey}:${userId}`) % BUCKETS

// ------------------------------------------------------------------------------------------------------------------ flags
export const DEFAULT_CONTROLS = Object.freeze({ global_disable: false, experiments_disabled: false, disabled_modules: [] })

/**
 * One flag for one person.
 * flag: { key, kind, module, protected, archived, default_value, envs: { [env]: { enabled, default_value, rollout_percent, allow_users[], block_users[], roles[] } } }
 * ctx: { userId, role, env }   controls: DEFAULT_CONTROLS shape
 * Returns { enabled, reason }: the reason is for the admin UI and for tests.
 */
export function evaluateFlag(flag, ctx = {}, controls = DEFAULT_CONTROLS) {
  if (!flag) return { enabled: false, reason: 'unknown_flag' }
  if (flag.protected) return { enabled: true, reason: 'protected' } // nothing below can switch these off
  if (flag.archived) return { enabled: Boolean(flag.default_value), reason: 'archived' }
  if (controls?.global_disable) return { enabled: false, reason: 'kill_global' }
  if (controls?.experiments_disabled && flag.kind === 'experiment') return { enabled: false, reason: 'kill_experiments' }
  if (flag.module && controls?.disabled_modules?.includes(flag.module)) return { enabled: false, reason: 'kill_module' }
  const env = flag.envs?.[ctx.env ?? 'production']
  if (!env) return { enabled: Boolean(flag.default_value), reason: 'no_environment' }
  if (!env.enabled) return { enabled: false, reason: 'disabled' }
  const uid = ctx.userId ?? null
  if (uid && env.block_users?.includes(uid)) return { enabled: false, reason: 'blocked' }
  if (uid && env.allow_users?.includes(uid)) return { enabled: true, reason: 'allowed' }
  if (env.roles?.length && !env.roles.includes(ctx.role ?? 'user')) return { enabled: false, reason: 'role_excluded' }
  const pct = Math.min(100, Math.max(0, Number(env.rollout_percent ?? 100)))
  if (pct >= 100) return { enabled: true, reason: env.roles?.length ? 'role' : 'everyone' }
  if (!uid) return { enabled: Boolean(env.default_value), reason: 'anonymous_default' }
  if (bucketOf(flag.key, uid) < Math.round(pct * 100)) return { enabled: true, reason: 'rollout' }
  return { enabled: Boolean(env.default_value), reason: 'default' }
}

/** Batch: every flag at once, as { [key]: enabled }. Missing keys fall back to the registry default. */
export function evaluateAll(flags, ctx, controls) {
  const out = {}
  for (const f of flags) out[f.key] = evaluateFlag(f, ctx, controls).enabled
  return out
}

/** The answer for one key from an evaluated map: the map's value, else the code default (safe even when nothing could be loaded). */
export const flagValue = (map, key) => (map && key in map ? Boolean(map[key]) : registryDefault(key))

/** Can this flag be switched off, changed or killed? Protected ones never. */
export const isSwitchable = (flag) => !flag?.protected

// ------------------------------------------------------------------------------------------------------------------ input checks (same limits as the database)
export function validateFlagInput(input) {
  const errors = []
  if (!FLAG_KEY_RE.test(input?.key ?? '') || input.key.length > 64)
    errors.push('The key needs lowercase letters, digits and underscores, with optional dots (for example module.insights).')
  if (!input?.name || input.name.trim().length < 1 || input.name.length > 80) errors.push('Give the flag a name of up to 80 characters.')
  if ((input?.description ?? '').length > 500) errors.push('The description can be at most 500 characters.')
  if (!FLAG_KINDS.includes(input?.kind ?? 'release')) errors.push('The kind must be release, experiment or ops.')
  if (input?.key?.startsWith('core.')) errors.push('Keys starting with “core.” are reserved for protected parts of the product.')
  return errors
}
export function validateEnvInput(env) {
  const errors = []
  const pct = Number(env?.rollout_percent ?? 100)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) errors.push('Rollout must be between 0 and 100 percent.')
  for (const k of ['allow_users', 'block_users']) {
    const list = env?.[k] ?? []
    if (!Array.isArray(list) || list.length > 200) errors.push('A user list can hold up to 200 ids.')
    else if (list.some((u) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u)))
      errors.push('User lists take user ids (UUIDs).')
  }
  if ((env?.roles ?? []).some((r) => !ROLES.includes(r))) errors.push('Roles can be user or admin.')
  return errors
}

// ------------------------------------------------------------------------------------------------------------------ experiments
export const MIN_SAMPLE_PER_VARIANT = 100 // below this the page says "not enough data" and shows no comparison verdict
export const EXPERIMENT_STATUSES = ['draft', 'running', 'paused', 'completed']

/** Variants must include "control", have unique keys and weights adding up to 100. */
export function validateVariants(variants) {
  const errors = []
  if (!Array.isArray(variants) || variants.length < 2 || variants.length > 5) return ['An experiment needs 2 to 5 variants.']
  const keys = variants.map((v) => v.key)
  if (new Set(keys).size !== keys.length) errors.push('Variant keys must be different.')
  if (!keys.includes('control')) errors.push('One variant must be named “control”.')
  if (keys.some((k) => !/^[a-z][a-z0-9_]{0,31}$/.test(k ?? ''))) errors.push('Variant keys use lowercase letters, digits and underscores.')
  if (variants.some((v) => !Number.isInteger(v.weight) || v.weight < 1))
    errors.push('Each variant needs a whole-number weight of at least 1.')
  else if (variants.reduce((a, v) => a + v.weight, 0) !== 100) errors.push('Variant weights must add up to 100.')
  return errors
}

/**
 * Which variant does this person get? Deterministic: the same person always gets the same one while the experiment's definition is unchanged.
 * Returns null when the person is outside the traffic allocation. experiment: { key, traffic_percent, variants[{key, weight}] }
 */
export function assignVariant(experiment, userId) {
  if (!userId) return null
  const traffic = Math.min(100, Math.max(0, Number(experiment.traffic_percent ?? 100)))
  if (fnv1a(`exp:${experiment.key}:${userId}`) % BUCKETS >= Math.round(traffic * 100)) return null
  const point = fnv1a(`var:${experiment.key}:${userId}`) % 100
  let acc = 0
  for (const v of experiment.variants) {
    acc += v.weight
    if (point < acc) return v.key
  }
  return experiment.variants[experiment.variants.length - 1].key
}

/** 95 % Wilson score interval for a rate (a standard method that behaves at small samples and at 0 / 1). */
export function wilson(successes, n, z = 1.96) {
  if (!n) return null
  const p = successes / n
  const d = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / d
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

/**
 * Turns per-variant counts into what the results page shows. This describes what happened; it does NOT say a variant "won": no significance test is run, and
 * `enough` stays false until every variant has MIN_SAMPLE_PER_VARIANT participants. rows: [{ variant, participants, conversions }]
 */
export function summariseExperiment(rows, allocation = []) {
  const control = rows.find((r) => r.variant === 'control')
  const total = rows.reduce((a, r) => a + r.participants, 0)
  const variants = rows.map((r) => {
    const rate = r.participants ? r.conversions / r.participants : null
    const base = control?.participants ? control.conversions / control.participants : null
    return {
      variant: r.variant,
      participants: r.participants,
      conversions: r.conversions,
      rate,
      interval: wilson(r.conversions, r.participants),
      share: total ? r.participants / total : null,
      expectedShare:
        (allocation.find((a) => a.key === r.variant)?.weight ?? null) == null
          ? null
          : allocation.find((a) => a.key === r.variant).weight / 100,
      // A plain difference against control, shown only when both sides have data. A description, not a verdict.
      differencePoints: r.variant !== 'control' && rate != null && base != null ? (rate - base) * 100 : null,
    }
  })
  const enough = rows.length >= 2 && rows.every((r) => r.participants >= MIN_SAMPLE_PER_VARIANT)
  return {
    total,
    variants,
    enough,
    note: enough
      ? 'Rates are shown with 95% ranges. This page does not declare a winner: a difference smaller than the ranges can be chance.'
      : `Not enough data yet: each variant needs at least ${MIN_SAMPLE_PER_VARIANT} participants before the rates are worth comparing.`,
  }
}
