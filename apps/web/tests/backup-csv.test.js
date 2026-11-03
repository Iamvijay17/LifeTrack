import { describe, it, expect } from 'vitest'
import { parseBackup, summarizeBackup } from '@/services/backup'
import { toCsv } from '@/services/csv'
describe('backup + csv', () => {
  const ok = { app: 'lifetrack', version: 1, exported_at: 'x', tables: { tasks: [{ id: 'a', title: 't' }], habits: [] } }
  it('parses valid backups, including one with a BOM', () => {
    expect(parseBackup(JSON.stringify(ok)).tables.tasks).toHaveLength(1)
    expect(parseBackup('﻿' + JSON.stringify(ok)).app).toBe('lifetrack')
    expect(summarizeBackup(ok)).toEqual([{ table: 'tasks', count: 1 }])
  })
  it('rejects wrong / newer / malformed / unknown-table files', () => {
    expect(() => parseBackup('nope')).toThrow(/valid JSON/)
    expect(() => parseBackup(JSON.stringify({ hello: 1 }))).toThrow(/not a LifeTrack backup/)
    expect(() => parseBackup(JSON.stringify({ ...ok, version: 99 }))).toThrow(/newer version/)
    expect(() => parseBackup(JSON.stringify({ ...ok, tables: { evil: [{ id: '1' }] } }))).toThrow(/Unknown table/)
    expect(() => parseBackup(JSON.stringify({ ...ok, tables: { tasks: [{ title: 'no id' }] } }))).toThrow()
  })
  it('CSV escapes quotes/commas and neutralises spreadsheet formulas', () => {
    const csv = toCsv(
      [
        { a: 'He said "hi", ok', b: '=SUM(A1)' },
        { a: '-5', b: '@cmd' },
      ],
      [
        { header: 'A', value: (r) => r.a },
        { header: 'B', value: (r) => r.b },
      ],
    )
    expect(csv).toContain('"He said ""hi"", ok",\'=SUM(A1)')
    expect(csv).toContain("-5,'@cmd") // plain numbers are untouched
  })
})
