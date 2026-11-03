import { describe, expect, it } from 'vitest'
import { blankSavingsGoal, blankTransaction, insertSchemas, parseAmountOrThrow, savingsGoalFormSchema, savingsGoalToPayload, savingsGoalToForm, transactionFormSchema, transactionToForm, transactionToPayload } from '../src'

describe('transaction form', () => {
  const base = blankTransaction('expense', 'Food', '2026-11-02')
  it('needs a positive amount with at most two decimals', () => {
    for (const bad of ['', '0', '-5', 'abc', '1.234', '1e3']) expect(transactionFormSchema.safeParse({ ...base, amount: bad }).success, bad).toBe(false)
    for (const ok of ['250', '1,250.5', '0.01', '₹99']) expect(transactionFormSchema.safeParse({ ...base, amount: ok }).success, ok).toBe(true)
  })
  it('converts to exact integer paise and a DB-valid payload', () => {
    const p = transactionToPayload(transactionFormSchema.parse({ ...base, amount: '1,250.5', note: 'x' }))
    expect(p.amount_paise).toBe(125050)
    expect(insertSchemas.transactions.safeParse(p).success).toBe(true)
    expect(transactionToForm({ type: 'income', amount_paise: 125050, category: 'Salary', txn_date: '2026-11-01', payment_method: null }).amount).toBe('1250.50')
    expect(transactionFormSchema.safeParse({ ...base, amount: '5', txn_date: '2026-02-30' }).success).toBe(false)
  })
})
describe('savings goal form + amounts', () => {
  it('validates and maps', () => {
    expect(savingsGoalFormSchema.safeParse(blankSavingsGoal()).success).toBe(false)
    expect(savingsGoalFormSchema.safeParse({ ...blankSavingsGoal(), name: 'Fund', target: '0' }).success).toBe(false)
    const p = savingsGoalToPayload(savingsGoalFormSchema.parse({ name: ' Fund ', target: '10,000', saved: '', target_date: '' }))
    expect(p).toEqual({ name: 'Fund', target_paise: 1000000, saved_paise: 0, target_date: null })
    expect(insertSchemas.savings_goals.safeParse(p).success).toBe(true)
    expect(savingsGoalToForm({ name: 'a', target_paise: 100, saved_paise: 50 })).toMatchObject({ target: '1', saved: '0.50' })
  })
  it('parseAmountOrThrow', () => {
    expect(parseAmountOrThrow('25000', 'bad')).toBe(2500000)
    expect(() => parseAmountOrThrow('0', 'bad')).toThrow('bad')
    expect(parseAmountOrThrow('0', 'bad', { allowZero: true })).toBe(0)
    expect(() => parseAmountOrThrow('x', 'bad')).toThrow('bad')
  })
})
