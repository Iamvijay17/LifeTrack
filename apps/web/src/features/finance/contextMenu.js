import { ArrowDownLeft, ArrowUpRight, Copy, CopyPlus, Download, ListChecks, PiggyBank, Pencil, Tags, Trash2 } from 'lucide-react'
import { SEPARATOR } from '@/components/context-menu/items'
import { bulkDelete, changeField, changeFields, copyDetails, count } from '@/components/context-menu/helpers'
import { fmtDay } from '@/lib/dates'
import { download, toCsv, txColumns } from '@/services/csv'
import * as store from '@/hooks/store'
import { categoryOptions } from './CategoryField'

const SIGN = { income: '+', expense: '−', savings: '' }

const categoryItems = (type, transactions, current, apply) =>
  categoryOptions(type, transactions).map((c) => ({ label: c, radio: true, checked: current === c, onSelect: () => apply(c) }))

/** One transaction. `d`: { money, transactions, onEdit, onDuplicate, select } */
export function transactionItems(t, d) {
  const apply = (category) => changeField('transactions', t, { category }, `Category: ${category}`)
  return [
    { label: 'Edit transaction', icon: Pencil, onSelect: () => d.onEdit(t) },
    { label: 'Duplicate', icon: CopyPlus, onSelect: () => d.onDuplicate(t) },
    { label: 'Change category', icon: Tags, items: () => categoryItems(t.type, d.transactions, t.category, apply) },
    {
      label: 'Copy transaction',
      icon: Copy,
      onSelect: () =>
        copyDetails(t.note || t.category, [
          ['Date', fmtDay(t.txn_date, 'd MMM yyyy')],
          ['Type', t.type],
          ['Category', t.category],
          ['Amount', `${SIGN[t.type]}${d.money(t.amount_paise)}`],
          ['Paid with', t.payment_method],
        ]),
    },
    { label: 'Select', icon: ListChecks, onSelect: () => d.select?.(t.id) },
    SEPARATOR,
    {
      label: 'Delete transaction',
      icon: Trash2,
      danger: true,
      confirm: { title: 'Delete this transaction?', description: `${d.money(t.amount_paise)} · ${t.category}`, confirmLabel: 'Delete' },
      onSelect: async () => {
        await store.remove('transactions', t.id)
        return { message: 'Transaction deleted' }
      },
    },
  ]
}

/** Several selected transactions: change category (when they share a type), export them, delete them. */
export function transactionBulkItems(rows, d) {
  const type = rows.every((r) => r.type === rows[0].type) ? rows[0].type : null
  return [
    {
      label: 'Change category',
      icon: Tags,
      hidden: !type,
      items: () =>
        categoryItems(type, d.transactions, null, (category) =>
          changeFields('transactions', rows, { category }, `${count(rows.length, 'transaction')} moved to ${category}`),
        ),
    },
    {
      label: `Export ${count(rows.length, 'transaction')} as CSV`,
      icon: Download,
      onSelect: () => {
        download('lifetrack-transactions-selected.csv', toCsv(rows, txColumns(d.currency)))
        return { message: 'CSV downloaded' }
      },
    },
    SEPARATOR,
    bulkDelete(
      'transactions',
      rows.map((r) => r.id),
      'transaction',
    ),
  ]
}

/** Empty space on Finance. */
export function financePageItems({ add, exportCsv, hasTransactions }) {
  return [
    { label: 'Add expense', icon: ArrowUpRight, onSelect: () => add('expense') },
    { label: 'Add income', icon: ArrowDownLeft, onSelect: () => add('income') },
    { label: 'Add savings', icon: PiggyBank, onSelect: () => add('savings') },
    SEPARATOR,
    { label: 'Export all as CSV', icon: Download, hidden: !hasTransactions, onSelect: exportCsv },
  ]
}
