import { monthKey, eachDay, addMonths, monthStart, monthEnd, fmtDay } from '@lifetrack/utils'

export const EXPENSE_CATEGORIES = ['Food', 'Travel', 'Shopping', 'Bills', 'Subscriptions', 'EMI', 'Health', 'Entertainment', 'Other']
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

// ---- presentation helpers shared by the Finance screens
export const TX_TYPES = [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'savings', label: 'Savings' }]
export const TYPE_TONE = { income: 'success', expense: 'danger', savings: 'primary' }
export const signFor = (type) => (type === 'income' ? '+' : type === 'expense' ? '−' : '')
export const savingsShareOfIncome = (s) => (s.income ? Math.round((s.savings / s.income) * 100) : null)
/** How worried to look about the budget: success < 80%, warning ≤ 100%, danger over. */
export const budgetTone = (used) => (used == null ? 'primary' : used > 1 ? 'danger' : used > 0.8 ? 'warning' : 'success')
export const savingsGoalPercent = (g) => Math.min(100, Math.round((g.saved_paise / g.target_paise) * 100))

/**
 * Everything one month of the Finance screen needs. `month` is a first-of-month date ('yyyy-MM-01').
 * A per-month overall budget (category '') overrides the default monthly budget from settings.
 */
export function financeMonth({ transactions, budgets, defaultBudget = 0, month, today }) {
  const mk = monthKey(month)
  const overall = budgets.find((b) => b.month === month && b.category === '')
  const budget = overall ? overall.amount_paise : defaultBudget
  const monthTx = transactions.filter((t) => monthKey(t.txn_date) === mk)
  const through = monthEnd(month) > today && mk === monthKey(today) ? today : monthEnd(month)
  return {
    mk, overall, budget, monthTx,
    summary: summarize(transactions, mk, budget),
    breakdown: categoryBreakdown(monthTx),
    series: monthlySeries(transactions, month, 6).map((s) => ({ ...s, label: fmtDay(s.month + '-01', 'MMM') })),
    daily: dailySeries(transactions, month, through).map((d) => ({ ...d, day: Number(d.date.slice(8)) })),
    expenseCount: monthTx.filter((t) => t.type === 'expense').length,
    categories: [...new Set(monthTx.map((t) => t.category))],
  }
}

/** Transactions of a month matching the filters, newest first. `f`: { type, category, method, q, from, to }. */
export function filterTransactions(monthTx, f = {}) {
  const q = (f.q ?? '').trim().toLowerCase()
  return monthTx
    .filter((t) => (!f.type || t.type === f.type) && (!f.category || t.category === f.category) && (!f.method || t.payment_method === f.method) && (!f.from || t.txn_date >= f.from) && (!f.to || t.txn_date <= f.to) && (!q || `${t.note} ${t.category} ${t.payment_method}`.toLowerCase().includes(q)))
    .sort((a, b) => (b.txn_date + b.created_at).localeCompare(a.txn_date + a.created_at))
}
