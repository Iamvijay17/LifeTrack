import { describe, expect, it } from 'vitest'
import { budgetTone, filterTransactions, financeMonth, savingsGoalPercent, savingsShareOfIncome, signFor } from '../src/finance'

const T = (o) => ({ id: o.id, type: 'expense', category: 'Food', payment_method: 'UPI', note: '', created_at: '2026-11-01T00:00:00Z', amount_paise: 10000, ...o })
const txs = [
  T({ id: 'sal', type: 'income', category: 'Salary', amount_paise: 5000000, txn_date: '2026-11-01' }),
  T({ id: 'a', txn_date: '2026-11-02', amount_paise: 25050, note: 'Lunch' }), T({ id: 'b', txn_date: '2026-11-02', category: 'Travel', amount_paise: 10000, payment_method: 'Cash' }),
  T({ id: 'sv', type: 'savings', category: 'Goal', txn_date: '2026-11-01', amount_paise: 100000 }),
  T({ id: 'old', txn_date: '2026-10-15', amount_paise: 99900 }), T({ id: 'future', txn_date: '2026-11-20', amount_paise: 5000 }),
]
describe('financeMonth', () => {
  const m = financeMonth({ transactions: txs, budgets: [], defaultBudget: 100000, month: '2026-11-01', today: '2026-11-02' })
  it('summarises exactly in paise with the default budget', () => {
    expect(m.summary).toMatchObject({ income: 5000000, expense: 40050, savings: 100000, remaining: 59950, count: 5 })
    expect(m.budget).toBe(100000)
    expect(m.expenseCount).toBe(3)
    expect(m.breakdown[0]).toMatchObject({ category: 'Food', paise: 30050 })
    expect(m.categories.sort()).toEqual(['Food', 'Goal', 'Salary', 'Travel'])
  })
  it('daily series stops at today in the current month', () => {
    expect(m.daily.at(-1).date).toBe('2026-11-02')
    expect(m.daily.at(-1)).toMatchObject({ paise: 35050, day: 2 })
    expect(financeMonth({ transactions: txs, budgets: [], month: '2026-10-01', today: '2026-11-02' }).daily).toHaveLength(31)
  })
  it('a per-month budget overrides the default; six-month series is oldest first', () => {
    const o = financeMonth({ transactions: txs, budgets: [{ month: '2026-11-01', category: '', amount_paise: 50000 }, { month: '2026-11-01', category: 'Food', amount_paise: 1 }], defaultBudget: 100000, month: '2026-11-01', today: '2026-11-02' })
    expect(o.budget).toBe(50000)
    expect(o.summary.remaining).toBe(9950)
    expect(o.series.map((s) => s.label)).toEqual(['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'])
    expect(o.series.at(-2).expense).toBe(99900)
  })
  it('filters and sorts newest first', () => {
    expect(filterTransactions(m.monthTx, { q: 'lunch' }).map((t) => t.id)).toEqual(['a'])
    expect(filterTransactions(m.monthTx, { method: 'Cash' }).map((t) => t.id)).toEqual(['b'])
    expect(filterTransactions(m.monthTx, { from: '2026-11-02', to: '2026-11-02' }).map((t) => t.id).sort()).toEqual(['a', 'b'])
    expect(filterTransactions(m.monthTx, { type: 'expense' })[0].id).toBe('future')
  })
  it('tones, signs and percentages', () => {
    expect([null, 0.5, 0.9, 1, 1.2].map(budgetTone)).toEqual(['primary', 'success', 'warning', 'warning', 'danger'])
    expect(['income', 'expense', 'savings'].map(signFor)).toEqual(['+', '−', ''])
    expect(savingsShareOfIncome(m.summary)).toBe(2)
    expect(savingsShareOfIncome({ income: 0, savings: 5 })).toBeNull()
    expect(savingsGoalPercent({ saved_paise: 150, target_paise: 100 })).toBe(100)
    expect(savingsGoalPercent({ saved_paise: 1, target_paise: 3 })).toBe(33)
  })
})
