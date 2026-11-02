import { monthKey, eachDay, addMonths, monthStart, monthEnd } from '@/lib/dates'

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
    income,
    expense,
    savings,
    net: income - expense - savings, // what is left unallocated
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
  return [...m.entries()]
    .map(([category, paise]) => ({ category, paise, share: total ? paise / total : 0 }))
    .sort((a, b) => b.paise - a.paise)
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
  for (const t of transactions)
    if (t.type === type && t.txn_date >= from && t.txn_date <= to) m.set(t.txn_date, (m.get(t.txn_date) ?? 0) + t.amount_paise)
  return eachDay(from, to).map((date) => ({ date, paise: m.get(date) ?? 0 }))
}

export const PAYMENT_METHODS = ['Cash', 'UPI', 'Credit card', 'Debit card', 'Bank transfer', 'Other']

// ------------------------------------------------------------- month helpers
export const monthTransactions = (transactions, mk) => transactions.filter((t) => monthKey(t.txn_date) === mk)

/** The budget that applies to a month: that month's override if there is one, else the default from settings. */
export function resolveBudget(budgets, monthStartDate, defaultPaise) {
  const override = budgets.find((b) => b.month === monthStartDate && b.category === '')
  return { paise: override ? override.amount_paise : defaultPaise, isOverride: !!override }
}

/** Colour tone for budget usage: green until 80%, amber to 100%, red beyond. */
export const budgetTone = (used) => (used == null ? 'primary' : used > 1 ? 'danger' : used > 0.8 ? 'warning' : 'success')

/** Savings as a whole percentage of income, or null when there is no income to compare with. */
export const savingsRate = (sum) => (sum.income ? Math.round((sum.savings / sum.income) * 100) : null)

/** Daily expense series for a month — the whole month, or only up to today when viewing the current month. */
export function spendingDays(transactions, monthStartDate, today) {
  const end = monthEnd(monthStartDate)
  const to = end > today && monthKey(monthStartDate) === monthKey(today) ? today : end
  return dailySeries(transactions, monthStartDate, to)
}

export const savingsGoalPercent = (g) => Math.min(100, Math.round((g.saved_paise / g.target_paise) * 100))

// ---------------------------------------------------------------- filtering
export const transactionCategories = (transactions) => [...new Set(transactions.map((t) => t.category))]

/** Filter by type / category / payment method / date range / free text; newest first. */
export function filterTransactions(transactions, { type = '', category = '', method = '', from = '', to = '', q = '' } = {}) {
  const s = q.trim().toLowerCase()
  return transactions
    .filter(
      (t) =>
        (!type || t.type === type) &&
        (!category || t.category === category) &&
        (!method || t.payment_method === method) &&
        (!from || t.txn_date >= from) &&
        (!to || t.txn_date <= to) &&
        (!s || `${t.note} ${t.category} ${t.payment_method}`.toLowerCase().includes(s)),
    )
    .sort((a, b) => (b.txn_date + b.created_at).localeCompare(a.txn_date + a.created_at))
}
