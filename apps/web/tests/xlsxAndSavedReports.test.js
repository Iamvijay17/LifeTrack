import { describe, expect, it } from 'vitest'
import { inflateRawSync } from 'node:zlib'
import { buildXlsx, crc32, zipStore } from '@/services/xlsx'
import { insightsToXlsx } from '@/features/insights/xlsxExport'
import { normalizeSaved } from '@/hooks/useSavedReports'
import { buildInsightsReport } from '@/domain/insights'

/** Reads a stored ZIP back (central directory), checking every CRC: what a real unzip does. */
function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = bytes.length - 22
  while (dv.getUint32(end, true) !== 0x06054b50) end--
  const count = dv.getUint16(end + 10, true)
  let p = dv.getUint32(end + 16, true)
  const out = {}
  for (let i = 0; i < count; i++) {
    expect(dv.getUint32(p, true)).toBe(0x02014b50)
    const crc = dv.getUint32(p + 16, true),
      size = dv.getUint32(p + 24, true),
      nameLen = dv.getUint16(p + 28, true),
      local = dv.getUint32(p + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen))
    expect(dv.getUint32(local, true)).toBe(0x04034b50)
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true)
    const data = bytes.subarray(start, start + size)
    expect(crc32(data)).toBe(crc)
    out[name] = new TextDecoder().decode(data)
    p += 46 + nameLen
  }
  return out
}

describe('xlsx writer', () => {
  it('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('produces a readable archive with the parts Excel needs', () => {
    const files = unzip(
      buildXlsx([
        {
          name: 'Data',
          rows: [
            ['Name', 'Amount'],
            ['Rent', 12500],
          ],
          headerRows: 1,
        },
        { name: 'Data', rows: [['x']] },
      ]),
    )
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ])
    expect(files['xl/workbook.xml']).toContain('name="Data"')
    expect(files['xl/workbook.xml']).toContain('name="Data 2"') // names are made unique
    expect(files['xl/worksheets/sheet1.xml']).toContain('<c r="B2"><v>12500</v></c>') // numbers stay numbers
  })
  it('keeps text as text: no formulas, escaped markup, blanks for missing values', () => {
    const f = unzip(buildXlsx([{ name: 'S', rows: [['=HYPERLINK("http://evil","x")', '+1+1', 'a & <b>', null, 0]] }]))[
      'xl/worksheets/sheet1.xml'
    ]
    expect(f).not.toContain('<f>')
    expect(f).toContain('t="inlineStr"')
    expect(f).toContain('a &amp; &lt;b&gt;')
    expect(f).not.toContain('r="D1"') // null is an empty cell, not a zero
    expect(f).toContain('<c r="E1"><v>0</v></c>') // zero is a recorded zero
  })
  it('handles many columns and sheet names with forbidden characters', () => {
    const files = unzip(buildXlsx([{ name: 'a/b:c?*[x]', rows: [Array.from({ length: 30 }, (_, i) => i)] }]))
    expect(files['xl/workbook.xml']).toContain('name="a b c   x"')
    expect(files['xl/worksheets/sheet1.xml']).toContain('r="AD1"')
  })
  it('zipStore round-trips arbitrary bytes', () => {
    const data = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) % 256)
    const bytes = zipStore([{ name: 'a.bin', data }])
    expect(inflateRawSync).toBeTypeOf('function')
    expect(unzip(bytes)['a.bin'].length).toBeGreaterThan(0)
  })
})

describe("the Insights workbook carries the report's own numbers", () => {
  const data = {
    habits: [],
    habit_logs: [],
    study_sessions: [
      {
        id: 's1',
        session_date: '2026-11-10',
        started_at: '2026-11-10T10:00:00Z',
        ended_at: '2026-11-10T11:00:00Z',
        duration_seconds: 3600,
        status: 'completed',
        source: 'manual',
        problems_solved: 0,
        created_at: '2026-11-10T10:00:00Z',
        updated_at: '2026-11-10T11:00:00Z',
      },
    ],
    focus_sessions: [],
    learning_topics: [],
    goals: [],
    milestones: [],
    job_applications: [],
    application_history: [],
    interview_events: [],
    workouts: [],
    exercise_logs: [],
    health_logs: [],
    tasks: [],
    transactions: [
      {
        id: 't1',
        type: 'expense',
        amount_paise: 12550,
        category: 'Food',
        txn_date: '2026-11-12',
        note: '',
        created_at: '2026-11-12T00:00:00Z',
        updated_at: '2026-11-12T00:00:00Z',
      },
      {
        id: 't2',
        type: 'income',
        amount_paise: 500000,
        category: 'Salary',
        txn_date: '2026-11-01',
        note: '',
        created_at: '2026-11-01T00:00:00Z',
        updated_at: '2026-11-01T00:00:00Z',
      },
    ],
    habit_pauses: [],
  }
  const report = buildInsightsReport(data, {
    kind: 'month',
    range: { from: '2026-11-01', to: '2026-11-30' },
    today: '2026-11-24',
    weekStartsOn: 1,
    plan: {},
    tz: 'Asia/Kolkata',
  })
  it('has the same totals as the report, money in major units, blanks for no data', () => {
    const files = unzip(insightsToXlsx(report, { currency: 'INR', generated: '2026-11-24' }))
    const sheets = files['xl/workbook.xml']
    for (const n of ['Report', 'Summary', 'Daily', 'Expenses by category', 'Month over month']) expect(sheets).toContain(`name="${n}"`)
    const daily = files['xl/worksheets/sheet3.xml']
    expect(daily).toContain('<v>125.5</v>') // the 12 Nov expense: 12550 paise
    expect(daily).toContain('<v>5000</v>') // the 1 Nov income
    const cats = files['xl/worksheets/sheet4.xml']
    expect(cats).toContain('Food')
    expect(report.current.finance.expense).toBe(12550)
    expect(files['xl/worksheets/sheet1.xml']).toContain('2026-11-01 to 2026-11-30')
  })
})

describe('saved report configurations', () => {
  it('keeps only well-formed entries and bounds them', () => {
    const list = normalizeSaved([
      { id: 'a', name: '  Monthly  ', kind: 'month', tab: 'finance' },
      { id: 'b', name: 'Custom', kind: 'custom', from: '2026-01-01', to: '2026-02-01', tab: 'nonsense' },
      { id: 'c', name: 'Bad range', kind: 'custom', from: '2026-03-01', to: '2026-02-01' },
      { id: 'd', name: '', kind: 'week' },
      { id: 'e', name: 'Unknown', kind: 'decade' },
      null,
      'x',
      { name: 'no id', kind: 'week' },
    ])
    expect(list).toEqual([
      { id: 'a', name: 'Monthly', kind: 'month', tab: 'finance' },
      { id: 'b', name: 'Custom', kind: 'custom', tab: 'overview', from: '2026-01-01', to: '2026-02-01' },
    ])
    expect(normalizeSaved('nope')).toEqual([])
    expect(normalizeSaved(Array.from({ length: 50 }, (_, i) => ({ id: `i${i}`, name: `n${i}`, kind: 'week' })))).toHaveLength(20)
  })
})
