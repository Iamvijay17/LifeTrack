// CSV import (transactions). Everything is checked and counted BEFORE anything is written: the person sees how many rows are new, how many
// already exist, and which rows are invalid and why. Nothing here touches the database except `importTransactions`, called after they agree.
import { parseMoney } from '@/lib/money'
import { PAYMENT_METHODS } from '@lifetrack/core/finance'
import * as store from '@/hooks/store'
import { AppError } from './errors'

export const MAX_CSV_BYTES = 5 * 1024 * 1024
export const MAX_CSV_ROWS = 20_000
const TYPES = ['income', 'expense', 'savings']
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** RFC 4180-style parser: quoted cells, doubled quotes, commas and line breaks inside quotes, CRLF or LF, a leading BOM. */
export function parseCsv(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') ((cell += '"'), i++)
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === ',') (row.push(cell), (cell = ''))
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
      if (rows.length > MAX_CSV_ROWS + 1) throw new AppError(`That file has more than ${MAX_CSV_ROWS} rows.`)
    } else cell += c
  }
  if (quoted) throw new AppError('A quoted cell is never closed. The file may be damaged.')
  row.push(cell)
  if (row.some((x) => x !== '')) rows.push(row)
  return rows
}

// The export prefixes a cell that starts with = + - @ with an apostrophe (formula-injection guard); reading it back undoes that.
const unguard = (s) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s)

const keyOf = (r) =>
  [r.txn_date, r.type, r.amount_paise, (r.category ?? '').toLowerCase(), (r.note ?? '').trim().toLowerCase()].join('\u0001')

/**
 * @param text      the file's text
 * @param existing  the account's current transactions (for duplicate detection)
 * @returns {{ total: number, fresh: object[], duplicates: object[], errors: { line: number, message: string }[], columns: string[] }}
 */
export function analyzeTransactionsCsv(text, existing = []) {
  if (typeof text !== 'string' || text.length > MAX_CSV_BYTES) throw new AppError('That file is too large (5 MB at most).')
  const table = parseCsv(text)
  if (table.length < 2) throw new AppError('That file has no rows to import.')
  const head = table[0].map((h) => h.trim().toLowerCase())
  const col = (pred) => head.findIndex(pred)
  const at = {
    date: col((h) => h === 'date'),
    type: col((h) => h === 'type'),
    category: col((h) => h === 'category'),
    method: col((h) => h === 'payment method'),
    amount: col((h) => h.startsWith('amount')),
    note: col((h) => h === 'note'),
  }
  const missing = ['date', 'type', 'amount'].filter((k) => at[k] < 0)
  if (missing.length)
    throw new AppError(
      `The file needs a ${missing.map((m) => `"${m[0].toUpperCase() + m.slice(1)}"`).join(', ')} column. Export transactions from LifeTrack to see the expected layout.`,
    )

  const budget = new Map()
  for (const t of existing) budget.set(keyOf(t), (budget.get(keyOf(t)) ?? 0) + 1)
  const out = { total: table.length - 1, fresh: [], duplicates: [], errors: [], columns: table[0] }
  table.slice(1).forEach((cells, i) => {
    const line = i + 2
    const get = (k) => (at[k] >= 0 ? unguard((cells[at[k]] ?? '').trim()) : '')
    const fail = (message) => out.errors.push({ line, message })
    const txn_date = get('date')
    if (!DAY.test(txn_date) || Number.isNaN(Date.parse(`${txn_date}T00:00:00Z`)))
      return fail(`"${txn_date || 'empty'}" is not a date. Use YYYY-MM-DD.`)
    const type = get('type').toLowerCase()
    if (!TYPES.includes(type)) return fail(`Type must be income, expense or savings (found "${get('type') || 'empty'}").`)
    const amount_paise = parseMoney(get('amount'))
    if (!amount_paise || amount_paise <= 0) return fail(`"${get('amount') || 'empty'}" is not a valid amount.`)
    const method = PAYMENT_METHODS.find((m) => m.toLowerCase() === get('method').toLowerCase())
    const category = get('category').slice(0, 40) || 'Other'
    const note = get('note').slice(0, 300)
    const row = { type, amount_paise, category, txn_date, note, payment_method: method ?? 'Other' }
    const left = budget.get(keyOf(row)) ?? 0
    if (left > 0) {
      budget.set(keyOf(row), left - 1)
      out.duplicates.push({ ...row, line })
    } else out.fresh.push(row)
  })
  return out
}

/** Writes the new rows (after the person has seen the preview). Duplicates and invalid rows were already left out. */
export async function importTransactions(rows, onProgress) {
  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    try {
      await store.insert('transactions', rows.slice(i, i + CHUNK))
    } catch (e) {
      throw new AppError(
        `Import stopped after ${i} of ${rows.length} rows: ${e.message} Importing the same file again skips the rows already added.`,
        { cause: e },
      )
    }
    onProgress?.(Math.min(i + CHUNK, rows.length), rows.length)
  }
}
