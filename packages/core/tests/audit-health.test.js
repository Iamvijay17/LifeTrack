import { describe, expect, it } from 'vitest'
import { AUDIT_ENTITIES, auditExportRows, canOfferRestore, changeRows, describeEvent, entitiesOfModule, formatValue } from '../src/audit.js'
import { componentStatuses, errorRate, overallStatus, percentileFromHistogram } from '../src/systemHealth.js'
import { readFileSync } from 'node:fs'

const ev = (o) => ({ id: 'e1', action: 'update', operation: 'update', entity: 'tasks', record_id: '3f2de126-0ce4-4c08-926d-1ada427b105f', summary: 'Pay rent', changed_fields: [], old_values: null, new_values: null, truncated: false, source: 'web', occurred_at: '2026-11-24T10:00:00Z', ...o })

describe('audit descriptions', () => {
  it('describes each action in plain words', () => {
    expect(describeEvent(ev({ action: 'create', operation: 'insert' }))).toBe('Created task “Pay rent”')
    expect(describeEvent(ev({ changed_fields: ['priority', 'due_date'] }))).toBe('Updated task “Pay rent”: changed priority, due date')
    expect(describeEvent(ev({ changed_fields: ['a', 'b', 'c', 'd', 'e'] }))).toMatch(/and 2 more/)
    expect(describeEvent(ev({ action: 'delete', operation: 'delete', entity: 'transactions', summary: '' }))).toBe('Deleted transaction')
    expect(describeEvent(ev({ action: 'restore', operation: 'delete' }))).toBe('Restored deleted task “Pay rent”')
    expect(describeEvent(ev({ action: 'login', operation: null, entity: 'auth', summary: 'Signed in' }))).toBe('Signed in')
  })
  it('compares before and after, formatting money and empties', () => {
    const rows = changeRows(ev({ entity: 'transactions', changed_fields: ['amount_paise', 'note'], old_values: { amount_paise: 12500, note: '' }, new_values: { amount_paise: 15000, note: 'Lunch' } }))
    expect(rows).toEqual([
      expect.objectContaining({ label: 'Amount', before: '125.00', after: '150.00' }),
      expect.objectContaining({ label: 'Note', before: '(empty)', after: 'Lunch' }),
    ])
    const created = changeRows(ev({ action: 'create', operation: 'insert', new_values: { id: 'x', user_id: 'u', title: 'A', notes: '', created_at: 'z', priority: 'low' } }))
    expect(created.map((r) => r.field)).toEqual(['priority', 'title'])
    const removed = changeRows(ev({ action: 'delete', operation: 'delete', old_values: { title: 'Gone', due_date: null } }))
    expect(removed).toEqual([expect.objectContaining({ field: 'title', before: 'Gone', after: '—' })])
    expect(formatValue('x', null)).toBe('—')
    expect(formatValue('x', true)).toBe('Yes')
  })
  it('offers restore only where the database could do it', () => {
    expect(canOfferRestore(ev())).toBe(true)
    expect(canOfferRestore(ev({ operation: 'insert' }))).toBe(false)
    expect(canOfferRestore(ev({ truncated: true }))).toBe(false)
    expect(canOfferRestore(ev({ entity: 'user_settings' }))).toBe(false)
    expect(canOfferRestore(ev({ operation: null, entity: 'auth', record_id: null }))).toBe(false)
  })
  it('exports the log without copying the values', () => {
    const rows = auditExportRows([ev({ changed_fields: ['title'], old_values: { title: 'secret old' }, new_values: { title: 'secret new' } })])
    expect(JSON.stringify(rows)).not.toMatch(/secret/)
    expect(rows[0]).toMatchObject({ module: 'Tasks & Goals', entity: 'Task', changed_fields: 'title', source: 'Web app' })
  })
  it('knows every audited table of the migration', () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/0027_platform.sql', import.meta.url), 'utf8')
    const list = [...new RegExp('function public\\._audit_tables\\(\\)[\\s\\S]*?array\\[([\\s\\S]*?)\\]').exec(sql)[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    for (const t of list) expect(AUDIT_ENTITIES[t], t).toBeTruthy()
    expect(entitiesOfModule('Finance & Expenses')).toContain('transactions')
  })
})

describe('system health status', () => {
  const now = Date.parse('2026-11-24T12:00:00Z')
  const healthy = () => ({
    database: { ok: true, latency_ms: 4 }, api: { requests: 100, errors_5xx: 0, avg_ms: 90, hist: [60, 30, 8, 2, 0, 0] }, errors: { sync_24h: 0 },
    jobs: [{ job: 'webhook-dispatch', last_run: '2026-11-24T11:58:00Z', last_status: 'ok' }], webhooks: { pending: 0, dead: 0, delivered_24h: 5 }, last_backup_at: '2026-11-23T00:00:00Z',
  })
  it('is operational when everything is fine', () => {
    const r = overallStatus(healthy(), now)
    expect(r.status).toBe('operational')
    expect(r.reasons).toEqual([])
  })
  it('degrades or goes down on the stated thresholds, and says why', () => {
    const o = healthy(); o.api = { ...o.api, errors_5xx: 5 }
    expect(overallStatus(o, now)).toMatchObject({ status: 'degraded' })
    o.api.errors_5xx = 30
    expect(overallStatus(o, now).status).toBe('down')
    const d = healthy(); d.database.ok = false
    expect(overallStatus(d, now).status).toBe('down')
    const j = healthy(); j.jobs[0].last_run = '2026-11-24T11:00:00Z'
    expect(overallStatus(j, now).reasons[0]).toMatch(/15 minutes/)
    const w = healthy(); w.webhooks.dead = 2
    expect(overallStatus(w, now).reasons[0]).toBe('2 deliveries in the dead-letter queue')
  })
  it('does not call a quiet system broken: no traffic and no job report are "unknown", and tiny samples do not trip the error rate', () => {
    const o = healthy(); o.api = { requests: 0 }; o.jobs = []; o.last_backup_at = null
    const r = overallStatus(o, now)
    expect(r.status).toBe('operational')
    expect(r.components.api.status).toBe('unknown')
    expect(r.components.jobs.status).toBe('unknown')
    const tiny = healthy(); tiny.api = { requests: 2, errors_5xx: 2, avg_ms: 10, hist: [2, 0, 0, 0, 0, 0] }
    expect(componentStatuses(tiny, now).api.status).toBe('operational')
  })
  it('estimates percentiles from the histogram and the error rate from counts', () => {
    expect(percentileFromHistogram([60, 30, 8, 2, 0, 0], 0.5)).toBe(50)
    expect(percentileFromHistogram([60, 30, 8, 2, 0, 0], 0.95)).toBe(250)
    expect(percentileFromHistogram([0, 0, 0, 0, 0, 5], 0.95)).toBe(Infinity)
    expect(percentileFromHistogram([0, 0, 0, 0, 0, 0], 0.5)).toBeNull()
    expect(errorRate({ requests: 0 })).toBeNull()
    expect(errorRate({ requests: 50, errors_5xx: 5 })).toBe(0.1)
  })
})
