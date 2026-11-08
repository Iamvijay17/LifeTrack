import { describe, expect, it } from 'vitest'
import { blankRecurringRule, blankSavingsGoal, blankTransaction, insertSchemas, recurringRuleFormSchema, recurringRuleToForm, recurringRuleToPayload, parseAmountOrThrow, savingsGoalFormSchema, savingsGoalToPayload, savingsGoalToForm, transactionFormSchema, transactionToForm, transactionToPayload } from '../src'

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

describe('recurring rule form', () => {
  const v = (o = {}) => ({ ...blankRecurringRule('Bills', '2026-11-30'), amount: '25,000', note: 'Rent', ...o })
  const row = { type: 'expense' as const, amount_paise: 2500000, category: 'Bills', payment_method: 'UPI', note: 'Rent', frequency: 'monthly' as const, anchor_day: 31, next_date: '2026-11-30', end_date: null }

  it('turns into a row the database accepts, in exact paise', () => {
    const payload = recurringRuleToPayload(recurringRuleFormSchema.parse(v()))
    expect(insertSchemas.recurring_rules.parse(payload)).toMatchObject({ amount_paise: 2500000, frequency: 'monthly', next_date: '2026-11-30', end_date: null, anchor_day: 30 })
  })
  it('rejects a missing amount, a bad date, and an end before the next date', () => {
    expect(recurringRuleFormSchema.safeParse(v({ amount: '0' })).success).toBe(false)
    expect(recurringRuleFormSchema.safeParse(v({ next_date: '' })).success).toBe(false)
    const bad = recurringRuleFormSchema.safeParse(v({ end_date: '2026-11-29' }))
    expect(bad.success ? [] : bad.error.issues[0].path).toEqual(['end_date'])
    expect(recurringRuleFormSchema.safeParse(v({ end_date: '2026-11-30' })).success).toBe(true)
  })
  it('round-trips through the form', () => {
    expect(recurringRuleToForm(row)).toMatchObject({ next_date: '2026-11-30', end_date: '' })
    expect(recurringRuleToPayload(recurringRuleToForm(row), row)).toMatchObject({ amount_paise: 2500000, end_date: null })
  })
  it('keeps the intended day while the schedule is untouched', () => {
    const form = recurringRuleToForm(row) // the 31st, currently sitting on the 30th of a short month
    expect(recurringRuleToPayload({ ...form, note: 'Flat rent' }, row).anchor_day).toBe(31)
  })
  it('moving the date or changing the frequency starts a new schedule from that date', () => {
    const form = recurringRuleToForm(row)
    expect(recurringRuleToPayload({ ...form, next_date: '2026-12-15' }, row).anchor_day).toBe(15)
    expect(recurringRuleToPayload({ ...form, frequency: 'yearly' }, row).anchor_day).toBe(30)
  })
})
