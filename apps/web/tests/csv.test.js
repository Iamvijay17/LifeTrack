import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXPORTABLE, JOB_COLUMNS, TX_COLUMNS, download, tableToCsv, toCsv, txColumns } from '@/services/csv'
import { db } from '@/services/db'
import { setUserId } from '@/services/session'

const col = (h) => [{ header: 'v', value: (r) => r[h] }]
const cell = (v) => toCsv([{ v }], col('v')).split('\r\n')[1]

describe('CSV escaping', () => {
  it('quotes cells containing commas, quotes or newlines, doubling inner quotes', () => {
    expect(cell('a,b')).toBe('"a,b"')
    expect(cell('say "hi"')).toBe('"say ""hi"""')
    expect(cell('line1\nline2')).toBe('"line1\nline2"')
    expect(cell('plain')).toBe('plain')
    expect([cell(null), cell(undefined), cell(0), cell(false)]).toEqual(['', '', '0', 'false'])
  })
  it('neutralises spreadsheet formula injection (= + - @ tab CR) but leaves real numbers alone', () => {
    for (const evil of ['=HYPERLINK("http://evil","x")', '+cmd|calc', '-2+3', '@SUM(A1)', '\t=1', '\r=1'])
      expect(cell(evil).replace(/^"/, '')).toMatch(/^'/)
    expect(cell('-5')).toBe('-5') // a genuine negative number
    expect(cell('+12')).toBe('+12')
    expect(cell('=1+1')).toBe("'=1+1")
  })
  it('uses CRLF row separators and escapes headers too', () => {
    const out = toCsv([{ a: 1 }, { a: 2 }], [{ header: '=bad,header', value: (r) => r.a }])
    expect(out).toBe(`"'=bad,header"\r\n1\r\n2`)
  })
})

describe('module column sets', () => {
  it('transactions export exact decimal amounts; jobs export packages in LPA', () => {
    const tx = { txn_date: '2026-11-02', type: 'expense', category: 'Food', payment_method: 'UPI', amount_paise: 125050, note: 'Lunch' }
    expect(toCsv([tx], TX_COLUMNS).split('\r\n')[1]).toBe('2026-11-02,expense,Food,UPI,1250.50,Lunch')
    const job = {
      company: 'Acme',
      job_title: 'Dev',
      status: 'applied',
      applied_date: '2026-11-02',
      location: 'Pune',
      salary_paise: 185000000,
      source: '',
      contact_person: '',
      followup_date: null,
      resume_version: '',
      jd_url: '',
      notes: '',
    }
    expect(toCsv([job], JOB_COLUMNS).split('\r\n')[1]).toContain('18.5')
    expect(toCsv([{ ...job, salary_paise: null }], JOB_COLUMNS).split('\r\n')[1]).toContain(',,') // no package → empty cell
  })
  it('names the amount column after the account currency', () => {
    expect(TX_COLUMNS[4].header).toBe('Amount (INR)')
    expect(txColumns('USD')[4].header).toBe('Amount (USD)')
  })
  it('every module table in a backup can also be exported as CSV (except the profile-level settings and job history rows)', async () => {
    const { TABLES } = await import('@lifetrack/constants/schema')
    const skipped = ['application_history'] // exported inside the application detail/JSON backup
    expect(TABLES.filter((t) => !skipped.includes(t) && !EXPORTABLE.some(([e]) => e === t))).toEqual([])
  })
  it('lists the exportable tables with friendly names', () => {
    expect(EXPORTABLE.length).toBeGreaterThan(15)
    expect(new Set(EXPORTABLE.map((e) => e[0])).size).toBe(EXPORTABLE.length)
  })
})

describe('tableToCsv (reads the real adapter)', () => {
  it('exports every column except the owner id, serialises JSON, and returns "" for an empty table', async () => {
    localStorage.clear()
    setUserId('u-csv')
    expect(await tableToCsv('routines')).toBe('')
    await db.insert('routines', [{ name: 'Push, day', exercises: [{ name: 'Bench', sets: 3 }] }])
    const csv = await tableToCsv('routines')
    const [head, row] = csv.split('\r\n')
    expect(head.split(',')).toEqual(expect.arrayContaining(['id', 'name', 'exercises']))
    expect(head).not.toContain('user_id')
    expect(row).toContain('"Push, day"')
    expect(row).toContain('""name"":""Bench""') // JSON cell, quotes doubled
  })
})

describe('download', () => {
  afterEach(() => vi.restoreAllMocks())
  it('adds a UTF-8 BOM for CSV (Excel) but not for JSON, and cleans up the link', async () => {
    const blobs = []
    vi.stubGlobal('URL', {
      createObjectURL: (b) => {
        blobs.push(b)
        return 'blob:x'
      },
      revokeObjectURL: vi.fn(),
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    download('a.csv', 'x,y')
    download('a.json', '{"a":1}', 'application/json')
    expect(click).toHaveBeenCalledTimes(2)
    const bytes = async (b) => [...new Uint8Array(await b.arrayBuffer())]
    expect((await bytes(blobs[0])).slice(0, 3)).toEqual([0xef, 0xbb, 0xbf]) // raw bytes: Blob.text() would strip the BOM when decoding
    expect(await blobs[0].text()).toBe('x,y')
    expect((await bytes(blobs[1])).slice(0, 3)).not.toEqual([0xef, 0xbb, 0xbf])
    expect(await blobs[1].text()).toBe('{"a":1}')
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
    vi.unstubAllGlobals()
  })
})
