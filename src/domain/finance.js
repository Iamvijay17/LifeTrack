import { monthKey, eachDay, addMonths, monthStart } from '@/lib/dates'

export const EXPENSE_CATEGORIES = ['Food', 'Travel', 'Shopping', 'Bills', 'Subscriptions', 'Health', 'Entertainment', 'Other']
export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Interest', 'Gift', 'Other']
export const SAVINGS_CATEGORIES = ['Emergency fund', 'Investments', 'Goal', 'Other']
export const CATEGORIES_BY_TYPE = { expense: EXPENSE_CATEGORIES, income: INCOME_CATEGORIES, savings: SAVINGS_CATEGORIES }

const sum = (rows) => rows.reduce((a, r) => a + r.amount_paise, 0)

export function summarize(transactions, month, budgetPaise = 0) {
  const rows = transactions.filter((t) => monthKey(t.txn_date) === month)
  const income = sum(rows.filter((t) => t.type === 'income'))
  const expense = sum(rows.filter((t) => t.type === 'expense'))
  const savings = sum(rows.filter((t) => t.type === 'savings'))
  return {
    income, expense, savings,
    net: income - expense - savings,                 // what is left unallocated
    budget: budgetPaise,
    remaining: budgetPaise > 0 ? budgetPaise - expense : null,
    budgetUsed: budgetPaise > 0 ? expense / budgetPaise : null,
    count: rows.length,
  }
}

export function categoryBreakdown(transactions, type = 'expense') {
  const m = new Map()
  for (const t of transactions) if (t.type === type) m.set(t.category, (m.get(t.category) ?? 0) + t.amount_paise)
  const total = [...m.values()].reduce((a, b) => a + b, 0)
  return [...m.entries()].map(([category, paise]) => ({ category, paise, share: total ? paise / total : 0 })).sort((a, b) => b.paise - a.paise)
}

export function monthlySeries(transactions, endMonthStart, count = 6) {
  const out = []
  for (let i = count - 1; i >= 0; i--) {
    const ms = addMonths(monthStart(endMonthStart), -i)
    const key = monthKey(ms)
    const s = summarize(transactions, key)
    out.push({ month: key, income: s.income, expense: s.expense, savings: s.savings })
  }
  return out
}

export function dailySeries(transactions, from, to, type = 'expense') {
  const m = new Map()
  for (const t of transactions) if (t.type === type && t.txn_date >= from && t.txn_date <= to) m.set(t.txn_date, (m.get(t.txn_date) ?? 0) + t.amount_paise)
  return eachDay(from, to).map((date) => ({ date, paise: m.get(date) ?? 0 }))
}

export const PAYMENT_METHODS = ['Cash', 'UPI', 'Credit card', 'Debit card', 'Bank transfer', 'Other']
