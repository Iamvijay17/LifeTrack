import { describe, expect, it } from 'vitest'
import { COMMAND_KEYS } from '../src/commandCenter'
import {
  LOCKABLE_MODULES,
  LOCK_SCOPES,
  MODULE_KEYS,
  closedModules,
  isLockableModule,
  listModules,
  lockableModule,
  moduleLabel,
  moduleOfPath,
  moduleOfWidget,
  normalizeModules,
  tableClosed,
  tablesOf,
} from '../src/moduleLocks'

describe('the module list', () => {
  it('has unique keys, labels and tables, so a table is never claimed by two modules', () => {
    expect(new Set(MODULE_KEYS).size).toBe(MODULE_KEYS.length)
    expect(new Set(LOCKABLE_MODULES.map((m) => m.label)).size).toBe(MODULE_KEYS.length)
    const tables = LOCKABLE_MODULES.flatMap((m) => m.tables)
    expect(new Set(tables).size).toBe(tables.length)
  })
  it('names real dashboard widgets and real, distinct pages', () => {
    for (const w of LOCKABLE_MODULES.flatMap((m) => m.widgets)) expect(COMMAND_KEYS).toContain(w)
    const routes = LOCKABLE_MODULES.flatMap((m) => m.routes)
    expect(new Set(routes).size).toBe(routes.length)
    for (const r of routes) expect(r).toMatch(/^\/[a-z]+$/)
  })
  it('keeps the modules the whole-app lock always closed marked as legacy', () => {
    expect(LOCKABLE_MODULES.filter((m) => m.legacy).flatMap((m) => m.tables).sort()).toEqual(
      ['budgets', 'journal_entries', 'notes', 'recurring_rules', 'savings_goals', 'transactions'].sort(),
    )
  })
  it('knows the two scopes', () => expect(LOCK_SCOPES).toEqual(['app', 'modules']))
})

describe('lookups', () => {
  it('finds a module, its label and whether a name is lockable', () => {
    expect(lockableModule('finance').label).toBe('Finance')
    expect(lockableModule('nope')).toBeNull()
    expect(moduleLabel('health')).toBe('Health & sleep')
    expect(moduleLabel('unknown')).toBe('unknown')
    expect(isLockableModule('jobs')).toBe(true)
    expect(isLockableModule('toString')).toBe(false) // not an inherited property
    expect(isLockableModule('planner')).toBe(false)
  })
  it('maps a dashboard widget to its module', () => {
    expect(moduleOfWidget('spending')).toBe('finance')
    expect(moduleOfWidget('sleep')).toBe('health')
    expect(moduleOfWidget('score')).toBeNull()
    expect(moduleOfWidget(undefined)).toBeNull()
  })
  it('maps a page to its module, ignoring the query, a trailing slash and sub-pages that are not listed', () => {
    expect(moduleOfPath('/finance')).toBe('finance')
    expect(moduleOfPath('/finance/')).toBe('finance')
    expect(moduleOfPath('/finance?tab=budgets')).toBe('finance')
    expect(moduleOfPath('/fitness#top')).toBe('fitness')
    expect(moduleOfPath('/fitness/exercises/abc')).toBeNull() // the public exercise library is not private
    expect(moduleOfPath('/')).toBeNull()
    expect(moduleOfPath(undefined)).toBeNull()
  })
})

describe('normalizeModules', () => {
  it('drops unknown names and duplicates and lists the rest in app order', () => {
    expect(normalizeModules(['jobs', 'finance', 'jobs', 'banking', 7])).toEqual(['finance', 'jobs'])
  })
  it('copes with anything that is not a list', () => {
    for (const v of [undefined, null, 'finance', 3, {}]) expect(normalizeModules(v)).toEqual([])
  })
})

describe('closedModules', () => {
  const base = { appLockEnabled: true, lockScope: 'modules', lockedModules: ['health', 'finance'], sessionUnlocked: false }
  it('is the chosen modules, while this session has not unlocked', () => {
    expect(closedModules(base)).toEqual(['finance', 'health'])
  })
  it('is empty once unlocked, with no lock, with the whole-app lock, or with no state', () => {
    expect(closedModules({ ...base, sessionUnlocked: true })).toEqual([])
    expect(closedModules({ ...base, appLockEnabled: false })).toEqual([])
    expect(closedModules({ ...base, lockScope: 'app' })).toEqual([]) // the lock screen replaces the app instead
    expect(closedModules(null)).toEqual([])
    expect(closedModules(undefined)).toEqual([])
  })
  it('ignores names it does not know', () => {
    expect(closedModules({ ...base, lockedModules: ['banking'] })).toEqual([])
  })
})

describe('tables', () => {
  it('lists the tables of the chosen modules', () => {
    expect(tablesOf(['health'])).toEqual(['health_logs', 'body_measurements'])
    expect(tablesOf(['nope'])).toEqual([])
  })
  it('says whether a table is closed', () => {
    expect(tableClosed(['finance'], 'transactions')).toBe(true)
    expect(tableClosed(['finance'], 'workouts')).toBe(false)
    expect(tableClosed([], 'transactions')).toBe(false)
    expect(tableClosed(undefined, 'transactions')).toBe(false)
    expect(tableClosed(['banking'], 'transactions')).toBe(false)
  })
})

describe('listModules', () => {
  it('reads like a sentence', () => {
    expect(listModules([])).toBe('')
    expect(listModules(['finance'])).toBe('Finance')
    expect(listModules(['health', 'finance'])).toBe('Finance and Health & sleep')
    expect(listModules(['jobs', 'health', 'finance'])).toBe('Finance, Health & sleep and Job switch')
  })
})
