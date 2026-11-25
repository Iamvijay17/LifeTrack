import { describe, expect, it } from 'vitest'
import {
  BUCKETS, DEFAULT_CONTROLS, FLAG_REGISTRY, MIN_SAMPLE_PER_VARIANT, assignVariant, bucketOf, evaluateAll, evaluateFlag, flagValue, fnv1a, registryDefault,
  summariseExperiment, validateEnvInput, validateFlagInput, validateVariants, wilson,
} from '../src/flags.js'

const uid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const flag = (over = {}, env = {}) => ({
  key: 'exp.thing', kind: 'release', module: null, protected: false, archived: false, default_value: false,
  envs: { production: { enabled: true, default_value: false, rollout_percent: 100, allow_users: [], block_users: [], roles: [], ...env } },
  ...over,
})
const on = (f, ctx = {}, controls) => evaluateFlag(f, { env: 'production', userId: uid(1), role: 'user', ...ctx }, controls)

describe('hashing', () => {
  it('is deterministic and matches known FNV-1a vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5)
    expect(fnv1a('a')).toBe(0xe40c292c)
    expect(fnv1a('foobar')).toBe(0xbf9cf968)
    expect(bucketOf('f', uid(1))).toBe(bucketOf('f', uid(1)))
    expect(bucketOf('f', uid(1))).toBeLessThan(BUCKETS)
  })
  it('spreads people evenly and independently per flag', () => {
    const n = 20000
    let below = 0
    let both = 0
    for (let i = 0; i < n; i++) {
      const a = bucketOf('flag.a', uid(i)) < 2500
      const b = bucketOf('flag.b', uid(i)) < 2500
      below += a
      both += a && b
    }
    expect(below / n).toBeGreaterThan(0.23)
    expect(below / n).toBeLessThan(0.27)
    expect(both / n).toBeLessThan(0.09) // ≈ 6.25% if independent
  })
})

describe('evaluation', () => {
  it('safe defaults: unknown flags are off, the registry keeps the shipped modules on, the map falls back to code defaults', () => {
    expect(evaluateFlag(undefined)).toEqual({ enabled: false, reason: 'unknown_flag' })
    expect(registryDefault('module.insights')).toBe(true)
    expect(registryDefault('exp.nothing')).toBe(false)
    expect(flagValue(null, 'module.insights')).toBe(true) // nothing loaded: behaviour is unchanged
    expect(flagValue({ 'module.insights': false }, 'module.insights')).toBe(false)
  })
  it('enabled / disabled and the default for a missing environment', () => {
    expect(on(flag())).toEqual({ enabled: true, reason: 'everyone' })
    expect(on(flag({}, { enabled: false })).enabled).toBe(false)
    expect(on(flag({ default_value: true }), { env: 'staging' })).toEqual({ enabled: true, reason: 'no_environment' })
    expect(on(flag(), { env: 'staging' }).enabled).toBe(false)
  })
  it('rollout is deterministic, monotonic (raising the percentage only adds people) and roughly the right size', () => {
    const people = Array.from({ length: 5000 }, (_, i) => uid(i))
    const at = (p) => new Set(people.filter((u) => on(flag({}, { rollout_percent: p }), { userId: u }).enabled))
    const s10 = at(10)
    const s30 = at(30)
    expect(at(10)).toEqual(s10) // same answer every time
    for (const u of s10) expect(s30.has(u)).toBe(true) // monotonic
    expect(s10.size / 5000).toBeGreaterThan(0.08)
    expect(s10.size / 5000).toBeLessThan(0.12)
    expect(at(0).size).toBe(0)
    expect(at(100).size).toBe(5000)
  })
  it('allow list > role > rollout, block list > everything, roles restrict the audience', () => {
    const f = flag({}, { rollout_percent: 0, allow_users: [uid(7)], block_users: [uid(8)], roles: [] })
    expect(on(f, { userId: uid(7) })).toEqual({ enabled: true, reason: 'allowed' })
    expect(on(f, { userId: uid(1) }).enabled).toBe(false)
    expect(on(flag({}, { allow_users: [uid(8)], block_users: [uid(8)] }), { userId: uid(8) })).toEqual({ enabled: false, reason: 'blocked' })
    const adminsOnly = flag({}, { roles: ['admin'] })
    expect(on(adminsOnly, { role: 'admin' }).enabled).toBe(true)
    expect(on(adminsOnly, { role: 'user' })).toEqual({ enabled: false, reason: 'role_excluded' })
    expect(on(flag({}, { rollout_percent: 50 }), { userId: null }).enabled).toBe(false) // can not bucket a stranger: default
  })
  it('kill switches: global, experiments, per module; protected flags ignore all of them', () => {
    const rel = flag({ module: 'insights' })
    const exp = flag({ kind: 'experiment' })
    expect(on(rel, {}, { ...DEFAULT_CONTROLS, global_disable: true })).toEqual({ enabled: false, reason: 'kill_global' })
    expect(on(exp, {}, { ...DEFAULT_CONTROLS, experiments_disabled: true })).toEqual({ enabled: false, reason: 'kill_experiments' })
    expect(on(rel, {}, { ...DEFAULT_CONTROLS, experiments_disabled: true }).enabled).toBe(true) // a release flag is not an experiment
    expect(on(rel, {}, { ...DEFAULT_CONTROLS, disabled_modules: ['insights'] })).toEqual({ enabled: false, reason: 'kill_module' })
    expect(on(flag({ module: 'other' }), {}, { ...DEFAULT_CONTROLS, disabled_modules: ['insights'] }).enabled).toBe(true)
    const worst = { global_disable: true, experiments_disabled: true, disabled_modules: ['auth', 'security', 'recovery', 'data_integrity'] }
    for (const f of FLAG_REGISTRY.filter((r) => r.protected)) expect(evaluateFlag({ ...f, envs: {} }, { userId: uid(1) }, worst)).toEqual({ enabled: true, reason: 'protected' })
    expect(FLAG_REGISTRY.filter((f) => f.protected).map((f) => f.key)).toEqual(['core.auth', 'core.security', 'core.data_integrity', 'core.recovery'])
  })
  it('archived flags give their default; batch evaluation returns every key', () => {
    expect(on(flag({ archived: true, default_value: true }))).toEqual({ enabled: true, reason: 'archived' })
    expect(evaluateAll([flag(), flag({ key: 'b.c', envs: {} })], { env: 'production', userId: uid(1) })).toEqual({ 'exp.thing': true, 'b.c': false })
  })
})

describe('input validation', () => {
  it('flags: keys, names, descriptions, kinds, reserved prefix', () => {
    expect(validateFlagInput({ key: 'module.new_thing', name: 'New', kind: 'release' })).toEqual([])
    expect(validateFlagInput({ key: 'Bad Key', name: 'x' })).not.toEqual([])
    expect(validateFlagInput({ key: 'core.mine', name: 'x' }).join()).toMatch(/reserved/)
    expect(validateFlagInput({ key: 'a.b', name: '' })).not.toEqual([])
    expect(validateFlagInput({ key: 'a.b', name: 'x', description: 'y'.repeat(501) })).not.toEqual([])
    expect(validateFlagInput({ key: 'a.b', name: 'x', kind: 'weird' })).not.toEqual([])
  })
  it('environments: rollout range, user lists, roles', () => {
    expect(validateEnvInput({ rollout_percent: 50, allow_users: [uid(1)], roles: ['admin'] })).toEqual([])
    expect(validateEnvInput({ rollout_percent: 101 })).not.toEqual([])
    expect(validateEnvInput({ allow_users: ['x'] })).not.toEqual([])
    expect(validateEnvInput({ roles: ['root'] })).not.toEqual([])
    expect(validateEnvInput({ block_users: Array.from({ length: 201 }, (_, i) => uid(i)) })).not.toEqual([])
  })
})

describe('experiments', () => {
  const exp = { key: 'checkout', traffic_percent: 100, variants: [{ key: 'control', weight: 50 }, { key: 'treatment', weight: 50 }] }
  it('validates variants', () => {
    expect(validateVariants(exp.variants)).toEqual([])
    expect(validateVariants([{ key: 'control', weight: 100 }])).not.toEqual([])
    expect(validateVariants([{ key: 'a', weight: 50 }, { key: 'b', weight: 50 }]).join()).toMatch(/control/)
    expect(validateVariants([{ key: 'control', weight: 70 }, { key: 'b', weight: 40 }]).join()).toMatch(/100/)
    expect(validateVariants([{ key: 'control', weight: 50 }, { key: 'control', weight: 50 }]).join()).toMatch(/different/)
  })
  it('assigns consistently and in the configured proportions; traffic share limits enrollment', () => {
    expect(assignVariant(exp, uid(5))).toBe(assignVariant(exp, uid(5)))
    expect(assignVariant(exp, null)).toBe(null)
    const counts = { control: 0, treatment: 0 }
    for (let i = 0; i < 10000; i++) counts[assignVariant(exp, uid(i))]++
    expect(counts.control / 10000).toBeGreaterThan(0.47)
    expect(counts.control / 10000).toBeLessThan(0.53)
    const quarter = { ...exp, traffic_percent: 25 }
    let enrolled = 0
    for (let i = 0; i < 10000; i++) enrolled += assignVariant(quarter, uid(i)) ? 1 : 0
    expect(enrolled / 10000).toBeGreaterThan(0.22)
    expect(enrolled / 10000).toBeLessThan(0.28)
    expect(assignVariant({ ...exp, traffic_percent: 0 }, uid(1))).toBe(null)
    const three = { ...exp, variants: [{ key: 'control', weight: 20 }, { key: 'b', weight: 30 }, { key: 'c', weight: 50 }] }
    const c3 = { control: 0, b: 0, c: 0 }
    for (let i = 0; i < 10000; i++) c3[assignVariant(three, uid(i))]++
    expect(c3.c / 10000).toBeGreaterThan(0.47)
  })
  it('summaries describe, never claim: no winner, no significance, "not enough data" below the minimum sample', () => {
    const small = summariseExperiment([{ variant: 'control', participants: 40, conversions: 4 }, { variant: 'treatment', participants: 38, conversions: 9 }], exp.variants)
    expect(small.enough).toBe(false)
    expect(small.note).toMatch(/Not enough data/)
    const big = summariseExperiment([{ variant: 'control', participants: 1000, conversions: 100 }, { variant: 'treatment', participants: 1000, conversions: 130 }], exp.variants)
    expect(big.enough).toBe(true)
    expect(big.variants[1].differencePoints).toBeCloseTo(3)
    expect(big.variants[0].rate).toBeCloseTo(0.1)
    expect(big.variants[0].interval[0]).toBeLessThan(0.1)
    expect(big.variants[0].interval[1]).toBeGreaterThan(0.1)
    expect(big.variants[0].expectedShare).toBe(0.5)
    const text = JSON.stringify(big)
    for (const banned of ['significan', 'winner', 'p-value', 'confident']) expect(text.toLowerCase().includes(banned) && !/does not declare a winner|not .*significan/.test(text.toLowerCase())).toBe(false)
    expect(big.note).toMatch(/does not declare a winner/)
    expect(MIN_SAMPLE_PER_VARIANT).toBeGreaterThanOrEqual(100)
    expect(summariseExperiment([], []).enough).toBe(false)
  })
  it('wilson intervals behave at 0, 1 and tiny samples', () => {
    expect(wilson(0, 0)).toBe(null)
    const [lo, hi] = wilson(0, 10)
    expect(lo).toBe(0)
    expect(hi).toBeGreaterThan(0.2)
    expect(wilson(10, 10)[1]).toBe(1)
  })
})
