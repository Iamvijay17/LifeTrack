import { describe, expect, it } from 'vitest'
import { financeMonth } from '@lifetrack/core/finance'
import { blankSavingsGoal, blankTransaction, savingsGoalFormSchema, savingsGoalToPayload, transactionFormSchema, transactionToPayload } from '@lifetrack/schemas'
import { setup } from './helpers'

const TODAY = '2026-11-02', MONTH = '2026-11-01'
const tx = (o: object) => transactionToPayload(transactionFormSchema.parse({ ...blankTransaction('expense', 'Food', TODAY), ...o }))

describe('finance flows', () => {
  it('stores money as exact integer paise; no floating point drift', async () => {
    const { store, tables } = setup()
    for (const amount of ['0.1', '0.2', '19.99', '1,250.50']) await store.insert('transactions', tx({ amount }))
    expect(tables.transactions.map((t) => t.amount_paise)).toEqual([10, 20, 1999, 125050])
    const m = financeMonth({ transactions: store.peek('transactions') as any, budgets: [], month: MONTH, today: TODAY })
    expect(m.summary.expense).toBe(127079) // 0.10 + 0.20 + 19.99 + 1250.50 = 1270.79
  })
  it('income and savings are tracked separately from expenses', async () => {
    const { store } = setup()
    await store.insert('transactions', tx({ type: 'income', category: 'Salary', amount: '50000' }))
    await store.insert('transactions', tx({ type: 'savings', category: 'Goal', amount: '5000' }))
    await store.insert('transactions', tx({ amount: '1200' }))
    const m = financeMonth({ transactions: store.peek('transactions') as any, budgets: [], month: MONTH, today: TODAY })
    expect(m.summary).toMatchObject({ income: 5000000, expense: 120000, savings: 500000, net: 4380000 })
  })
  it('edit and delete keep the cache consistent', async () => {
    const { store, tables } = setup()
    const t = await store.insert('transactions', tx({ amount: '100' })) as any
    await store.update('transactions', t.id, tx({ amount: '250.75', note: 'fixed' }))
    expect(tables.transactions[0]).toMatchObject({ amount_paise: 25075, note: 'fixed' })
    await store.remove('transactions', t.id)
    expect(store.peek('transactions')).toHaveLength(0)
  })
  it('a month budget overrides the default and re-saving updates the same row', async () => {
    const { store, api, tables } = setup()
    await store.load('budgets')
    await api.setMonthBudget(MONTH, 3000000)
    await api.setMonthBudget(MONTH, 2500000)
    expect(tables.budgets).toHaveLength(1)
    expect(tables.budgets[0]).toMatchObject({ month: MONTH, category: '', amount_paise: 2500000 })
    await store.refetch('budgets')
    const m = financeMonth({ transactions: [], budgets: store.peek('budgets') as any, defaultBudget: 100, month: MONTH, today: TODAY })
    expect(m.budget).toBe(2500000)
  })
  it('rejects a budget that is not the first of a month (database rule mirrored in the schema)', async () => {
    const { api } = setup()
    await expect(api.setMonthBudget('2026-11-15', 1000)).rejects.toThrow(/Invalid upsert payload for budgets/)
  })
  it('savings goals: add funds twice quickly without losing either (freshest cached value), reject non-positive', async () => {
    const { store, api, tables } = setup()
    const g = await store.insert('savings_goals', savingsGoalToPayload(savingsGoalFormSchema.parse({ ...blankSavingsGoal(), name: 'Fund', target: '1000', saved: '100' }))) as any
    await api.addSavingsFunds(g, 25000)
    await api.addSavingsFunds(g, 5000) // `g` is stale (10000) but the cache has 35000
    expect(tables.savings_goals[0].saved_paise).toBe(10000 + 25000 + 5000)
    await expect(api.addSavingsFunds(g, 0)).rejects.toThrow(/greater than 0/)
    await expect(api.addSavingsFunds(g, 12.5)).rejects.toThrow()
  })
})
