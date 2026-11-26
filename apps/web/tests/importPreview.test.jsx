import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { analyzeTransactionsCsv, parseCsv } from '@/services/csvImport'
import { analyzeBackup, buildExport } from '@/services/backup'
import { toCsv } from '@/services/csv'
import { txColumns } from '@/services/csv'
import { db } from '@/services/db'
import { freshBackend, renderApp, signedInUser } from './components/helpers'

const HEAD = 'Date,Type,Category,Payment method,Amount (INR),Note'

describe('parseCsv', () => {
  it('handles quotes, commas and line breaks inside cells, CRLF and a BOM', () => {
    const t = parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\r\n\r\nlast,')
    expect(t).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"\nthere'],
      ['last', ''],
    ])
  })
  it('refuses an unclosed quote', () => {
    expect(() => parseCsv('a,"b')).toThrow(/never closed/)
  })
})

describe('analyzeTransactionsCsv', () => {
  const row = (o = {}) => ({ type: 'expense', amount_paise: 12000, category: 'Food', txn_date: '2026-11-01', note: 'Lunch', ...o })
  it('counts new, duplicate and invalid rows without writing anything', () => {
    const csv = [
      HEAD,
      '2026-11-01,expense,Food,UPI,120.00,Lunch',
      '2026-11-02,income,Salary,Bank transfer,5000,',
      'yesterday,expense,Food,UPI,10,x',
      '2026-11-03,gift,Food,UPI,10,x',
      '2026-11-04,expense,Food,UPI,abc,x',
    ].join('\n')
    const r = analyzeTransactionsCsv(csv, [row()])
    expect(r.total).toBe(5)
    expect(r.duplicates).toHaveLength(1)
    expect(r.fresh).toEqual([
      { type: 'income', amount_paise: 500000, category: 'Salary', txn_date: '2026-11-02', note: '', payment_method: 'Bank transfer' },
    ])
    expect(r.errors.map((e) => e.line)).toEqual([4, 5, 6])
  })
  it('treats repeated identical rows as separate purchases, matching only as many as are already saved', () => {
    const line = '2026-11-01,expense,Food,UPI,120.00,Coffee'
    const r = analyzeTransactionsCsv([HEAD, line, line, line].join('\n'), [row({ note: 'Coffee' })])
    expect(r.duplicates).toHaveLength(1)
    expect(r.fresh).toHaveLength(2)
  })
  it('round-trips what the export writes', () => {
    const rows = [
      row({ note: '=SUM(A1)', payment_method: 'UPI' }),
      row({ note: 'plain, with comma', txn_date: '2026-11-02', payment_method: 'Cash' }),
    ]
    const r = analyzeTransactionsCsv(toCsv(rows, txColumns('INR')), [])
    expect(r.errors).toEqual([])
    expect(r.fresh.map((x) => x.note)).toEqual(['=SUM(A1)', 'plain, with comma'])
  })
  it('rejects calendar dates that do not exist instead of letting the database refuse the whole chunk', () => {
    const lines = ['2026-02-30', '2025-02-29', '2026-04-31', '2026-13-01'].map((d) => `${d},expense,Food,UPI,100.00,x`)
    const r = analyzeTransactionsCsv([HEAD, ...lines, '2024-02-29,expense,Food,UPI,100.00,leap day'].join('\n'), [])
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4, 5])
    expect(r.errors[0].message).toMatch(/not a date/)
    expect(r.fresh.map((x) => x.txn_date)).toEqual(['2024-02-29'])
  })

  it('reads amounts as people type them in India: ₹, thousands commas, paise', () => {
    const r = analyzeTransactionsCsv(
      [HEAD, '2026-11-01,expense,Food,UPI,"₹1,250.50",x', '2026-11-02,income,Salary,Bank,"1,00,000",y'].join('\n'),
      [],
    )
    expect(r.errors).toEqual([])
    expect(r.fresh.map((x) => x.amount_paise)).toEqual([125050, 10000000])
  })

  it('asks for the columns it needs', () => {
    expect(() => analyzeTransactionsCsv('Foo,Bar\n1,2', [])).toThrow(/needs a "Date", "Type", "Amount"/)
    expect(() => analyzeTransactionsCsv(HEAD, [])).toThrow(/no rows/)
  })
})

describe('import preview UI', () => {
  beforeEach(freshBackend)
  it('shows the preview first, then adds only the new rows, and a second import adds nothing', async () => {
    const user = userEvent.setup()
    await signedInUser()
    renderApp('/export')
    const csv = [HEAD, '2026-11-01,expense,Food,UPI,120.00,Lunch', '2026-11-01,expense,Food,UPI,oops,Bad'].join('\n')
    const upload = async () => user.upload(await screen.findByTestId('import-csv-file'), new File([csv], 'tx.csv', { type: 'text/csv' }))
    await upload()
    const preview = await screen.findByTestId('csv-preview')
    expect(preview).toHaveTextContent('Line 3')
    expect((await db.list('transactions')).length).toBe(0) // nothing written yet
    await user.click(screen.getByRole('button', { name: /import 1 transaction/i }))
    await screen.findByText(/1 transaction imported/i)
    expect((await db.list('transactions')).length).toBe(1)
    await upload()
    expect(await screen.findByTestId('csv-preview')).toHaveTextContent('Already saved')
    expect(screen.getByRole('button', { name: /import 0 transactions/i })).toBeDisabled()
  })
})

describe('analyzeBackup', () => {
  beforeEach(freshBackend)
  it('counts what a restore would add and what it would update', async () => {
    await signedInUser()
    await db.insert('tasks', [{ title: 'Keep', due_date: '2026-11-01' }])
    const backup = await buildExport()
    backup.tables.tasks.push({ ...backup.tables.tasks[0], id: 'brand-new-id', title: 'New one' })
    const plan = await analyzeBackup(backup)
    expect(plan.find((p) => p.table === 'tasks')).toMatchObject({ total: 2, existing: 1, fresh: 1 })
  })
})
