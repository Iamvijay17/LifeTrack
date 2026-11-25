import { describe, expect, it } from 'vitest'
import { formatBytes, overviewFindings, perfStatus, queryFindings } from '../src/dbPerformance.js'

const base = { latency_ms: 4, tables: [], indexes: [], slow_queries: [], connections: { total: 5, max: 60 }, cache_hit_ratio: 0.999, database: { blocks_hit: 1e6, blocks_read: 1e3 } }
describe('database performance findings', () => {
  it('nothing to report on a healthy database', () => {
    const f = overviewFindings(base)
    expect(f).toEqual([])
    expect(perfStatus(base, f).status).toBe('operational')
    expect(overviewFindings(null)).toEqual([])
  })
  it('flags a big table that is mostly scanned, with priority by volume; ignores small tables', () => {
    const f = overviewFindings({ ...base, tables: [
      { table: 'tasks', rows: 80_000, dead_rows: 0, seq_scans: 900, seq_rows_read: 50_000_000, index_scans: 100 },
      { table: 'goals', rows: 40, dead_rows: 0, seq_scans: 900, seq_rows_read: 50_000_000, index_scans: 0 },
      { table: 'notes', rows: 90_000, dead_rows: 0, seq_scans: 2, seq_rows_read: 100, index_scans: 5000 },
    ] })
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ table: 'tasks', priority: 'high', area: 'index' })
    expect(f[0].evidence).toMatch(/50,000,000/)
  })
  it('unused indexes (never unique or primary ones), dead rows, cache, connections, slow statements', () => {
    const f = overviewFindings({ ...base, cache_hit_ratio: 0.85, connections: { total: 55, max: 60 },
      tables: [{ table: 'tasks', rows: 1000, dead_rows: 1500, seq_scans: 0, seq_rows_read: 0, index_scans: 5 }],
      indexes: [{ table: 'tasks', index: 'tasks_old_idx', scans: 0, size_bytes: 5e6, unique: false, primary: false }, { table: 'tasks', index: 'tasks_pkey', scans: 0, size_bytes: 5e6, unique: true, primary: true }],
      slow_queries: [{ query: 'select * from tasks where x = $1', calls: 40, mean_ms: 320, max_ms: 900, rows_per_call: 12 }] })
    expect(f.map((x) => x.id.split(':')[0]).sort()).toEqual(['cache', 'connections', 'dead', 'stmt', 'unused'])
    expect(f[0].priority).toBe('high')
    expect(f.find((x) => x.id.startsWith('unused')).priority).toBe('low')
    expect(f.some((x) => x.id.includes('pkey'))).toBe(false)
    expect(perfStatus({ ...base, cache_hit_ratio: 0.85 }, f).status).toBe('degraded')
  })
  it('does not judge the cache before there is enough traffic to judge', () => {
    expect(overviewFindings({ ...base, cache_hit_ratio: 0.5, database: { blocks_hit: 50, blocks_read: 50 } })).toEqual([])
  })
  it('query report findings: many rows per call, slow, failing; thresholds need a minimum of calls', () => {
    const f = queryFindings([
      { location: 'tasks.select', table: 'tasks', operation: 'select', calls: 30, errors: 0, avg_ms: 120, max_ms: 400, rows_avg: 3000 },
      { location: 'goals.select', table: 'goals', operation: 'select', calls: 1, errors: 0, avg_ms: 900, max_ms: 900, rows_avg: 9000 },
      { location: 'notes.update', table: 'notes', operation: 'update', calls: 20, errors: 4, avg_ms: 20, max_ms: 50, rows_avg: 1 },
    ])
    expect(f.map((x) => x.id)).toEqual(['rows:tasks.select', 'err:notes.update'])
    expect(f[0].priority).toBe('high')
  })
  it('formats bytes', () => {
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB')
  })
})
