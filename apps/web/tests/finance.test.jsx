import '@testing-library/jest-dom/vitest'
import { pickOption } from './pickers'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  monthTransactions,
  resolveBudget,
  budgetTone,
  savingsRate,
  spendingDays,
  savingsGoalPercent,
  filterTransactions,
  transactionCategories,
  summarize,
} from '@/domain/finance'
import { moneyField } from '@/lib/validation'

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  upsert: vi.fn(),
  peek: vi.fn(),
  confirm: vi.fn(),
  rows: { savings_goals: [] },
}))
vi.mock('@/hooks/store', () => ({
  insert: mocks.insert,
  update: mocks.update,
  remove: mocks.remove,
  upsert: mocks.upsert,
  peek: mocks.peek,
  useTable: (t) => ({ rows: mocks.rows[t] ?? [] }),
}))
vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ settings: { currency: 'INR' } }) }))
vi.mock('@/components/shared/Confirm', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { TransactionDialog } from '@/features/finance/TransactionDialog'
import { BudgetDialog } from '@/features/finance/BudgetDialog'
import { SavingsGoalDialog } from '@/features/finance/SavingsGoalDialog'
import { AddFundsDialog } from '@/features/finance/AddFundsDialog'
import { SavingsGoals } from '@/features/finance/SavingsGoals'
import { TransactionList } from '@/features/finance/TransactionList'
import { FinanceStats } from '@/features/finance/FinanceStats'
import { formatMoney } from '@/lib/money'

const money = (p, o) => formatMoney(p, 'INR', o)
const TODAY = '2026-11-02'
const T = (o) => ({
  id: Math.random().toString(36).slice(2),
  type: 'expense',
  amount_paise: 10000,
  category: 'Food',
  txn_date: '2026-11-02',
  note: '',
  payment_method: 'UPI',
  created_at: '2026-11-02T00:00:00Z',
  ...o,
})

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset?.())
  mocks.rows = { savings_goals: [] }
  mocks.insert.mockResolvedValue({})
  mocks.update.mockResolvedValue({})
  mocks.upsert.mockResolvedValue({})
  mocks.remove.mockResolvedValue(undefined)
})

describe('finance domain', () => {
  it('limits to a month and summarises with the resolved budget', () => {
    const tx = [T({ amount_paise: 30000 }), T({ type: 'income', amount_paise: 100000 }), T({ txn_date: '2026-10-31', amount_paise: 999 })]
    expect(monthTransactions(tx, '2026-11')).toHaveLength(2)
    const s = summarize(tx, '2026-11', 100000)
    expect(s).toMatchObject({ expense: 30000, income: 100000, remaining: 70000, budgetUsed: 0.3 })
  })
  it('uses the month override over the default budget, and falls back otherwise', () => {
    const budgets = [
      { month: '2026-11-01', category: '', amount_paise: 5000 },
      { month: '2026-11-01', category: 'Food', amount_paise: 1 },
      { month: '2026-10-01', category: '', amount_paise: 9 },
    ]
    expect(resolveBudget(budgets, '2026-11-01', 777)).toEqual({ paise: 5000, isOverride: true })
    expect(resolveBudget(budgets, '2026-12-01', 777)).toEqual({ paise: 777, isOverride: false })
  })
  it('colours budget usage at the 80% and 100% thresholds', () => {
    expect([null, 0.5, 0.8, 0.81, 1, 1.01].map(budgetTone)).toEqual(['primary', 'success', 'success', 'warning', 'warning', 'danger'])
  })
  it('savings rate is null without income (never a fake 0%)', () => {
    expect(savingsRate({ income: 0, savings: 50 })).toBeNull()
    expect(savingsRate({ income: 1000, savings: 250 })).toBe(25)
    expect(savingsRate({ income: 1000, savings: 0 })).toBe(0)
  })
  it('daily series stops at today for the current month, covers the whole month otherwise', () => {
    expect(spendingDays([], '2026-11-01', '2026-11-10')).toHaveLength(10)
    expect(spendingDays([], '2026-10-01', '2026-11-10')).toHaveLength(31)
    expect(
      spendingDays([T({ amount_paise: 500 }), T({ amount_paise: 700 })], '2026-11-01', '2026-11-03').find((d) => d.date === '2026-11-02')
        .paise,
    ).toBe(1200)
  })
  it('caps savings-goal progress at 100%', () => {
    expect(savingsGoalPercent({ saved_paise: 250, target_paise: 1000 })).toBe(25)
    expect(savingsGoalPercent({ saved_paise: 5000, target_paise: 1000 })).toBe(100)
  })
  it('filters by every field, case-insensitively, newest first', () => {
    const tx = [
      T({ id: 'a', note: 'Lunch', txn_date: '2026-11-01' }),
      T({ id: 'b', note: 'Taxi', category: 'Travel', payment_method: 'Cash', txn_date: '2026-11-03' }),
      T({ id: 'c', type: 'income', category: 'Salary', payment_method: 'Bank transfer', txn_date: '2026-11-02' }),
    ]
    expect(filterTransactions(tx).map((t) => t.id)).toEqual(['b', 'c', 'a'])
    expect(filterTransactions(tx, { q: 'TAXI' }).map((t) => t.id)).toEqual(['b'])
    expect(filterTransactions(tx, { q: 'cash' }).map((t) => t.id)).toEqual(['b'])
    expect(filterTransactions(tx, { type: 'income' }).map((t) => t.id)).toEqual(['c'])
    expect(filterTransactions(tx, { category: 'Travel' }).map((t) => t.id)).toEqual(['b'])
    expect(filterTransactions(tx, { method: 'Bank transfer' }).map((t) => t.id)).toEqual(['c'])
    expect(filterTransactions(tx, { from: '2026-11-02', to: '2026-11-02' }).map((t) => t.id)).toEqual(['c'])
    expect(transactionCategories(tx)).toEqual(['Food', 'Travel', 'Salary'])
  })
  it('moneyField enforces the minimum and 2-decimal precision', () => {
    const pos = moneyField('bad')
    const zero = moneyField('bad', { min: 0 })
    expect(pos.safeParse('0').success).toBe(false)
    expect(pos.safeParse('1,250.50').success).toBe(true)
    expect(pos.safeParse('1.005').success).toBe(false)
    expect(zero.safeParse('0').success).toBe(true)
    expect(zero.safeParse('').success).toBe(false)
    expect(zero.safeParse('abc').success).toBe(false)
  })
})

describe('TransactionDialog', () => {
  const open = (p = {}) => render(<TransactionDialog open onOpenChange={() => {}} today={TODAY} {...p} />)
  it('rejects a zero/invalid amount, then stores integer paise', async () => {
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText(/Amount/), '0')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Enter an amount greater than 0 (max 2 decimals)')).toBeInTheDocument()
    await user.clear(screen.getByLabelText(/Amount/))
    await user.type(screen.getByLabelText(/Amount/), '99.5')
    await pickOption(user, screen.getByLabelText('Payment method'), 'Cash')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith(
        'transactions',
        expect.objectContaining({ type: 'expense', amount_paise: 9950, payment_method: 'Cash', txn_date: TODAY, category: 'Food' }),
      ),
    )
  })
  it('switching type swaps to a valid category for that type', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('tab', { name: 'Income' }))
    expect(screen.getByLabelText('Category')).toHavePickerValue('Salary')
  })
  it('prefills when editing and updates the same record', async () => {
    const user = userEvent.setup()
    open({ txn: T({ id: 't1', amount_paise: 123456, note: 'Rent', category: 'Bills' }) })
    expect(screen.getByLabelText(/Amount/)).toHaveValue('1234.56')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith('transactions', 't1', expect.objectContaining({ amount_paise: 123456, note: 'Rent' })),
    )
  })
})

describe('BudgetDialog', () => {
  it('prefills the current budget and upserts for the first of that month', async () => {
    const user = userEvent.setup()
    render(<BudgetDialog open onOpenChange={() => {}} month="2026-11-01" currentPaise={3000000} />)
    expect(screen.getByLabelText('Monthly expense budget')).toHaveValue('30000')
    await user.clear(screen.getByLabelText('Monthly expense budget'))
    await user.type(screen.getByLabelText('Monthly expense budget'), '25000.50')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocks.upsert).toHaveBeenCalledWith('budgets', { month: '2026-11-01', category: '', amount_paise: 2500050 }, expect.anything()),
    )
  })
  it('allows 0 (no budget) but not blank or text, and shows the error inline', async () => {
    const user = userEvent.setup()
    render(<BudgetDialog open onOpenChange={() => {}} month="2026-11-01" currentPaise={0} />)
    await user.clear(screen.getByLabelText('Monthly expense budget'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Enter a valid amount, e.g. 25000')).toBeInTheDocument()
    expect(mocks.upsert).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Monthly expense budget'), '0')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocks.upsert).toHaveBeenCalledWith('budgets', expect.objectContaining({ amount_paise: 0 }), expect.anything()),
    )
  })
})

describe('savings goals', () => {
  it('SavingsGoalDialog needs a name and a positive target; saved defaults to 0', async () => {
    const user = userEvent.setup()
    render(<SavingsGoalDialog open onOpenChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Name the goal')).toBeInTheDocument()
    await user.type(screen.getByLabelText('What are you saving for?'), 'Laptop')
    await user.type(screen.getByLabelText('Target amount'), '50000')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith('savings_goals', {
        name: 'Laptop',
        target_paise: 5000000,
        saved_paise: 0,
        target_date: null,
      }),
    )
  })
  it('AddFundsDialog adds to the freshest cached total, not a stale prop', async () => {
    const user = userEvent.setup()
    mocks.peek.mockReturnValue([{ id: 'g1', saved_paise: 400000 }]) // another quick add already landed
    const onClose = vi.fn()
    render(
      <AddFundsDialog goal={{ id: 'g1', name: 'Laptop', saved_paise: 100000, target_paise: 5000000 }} money={money} onClose={onClose} />,
    )
    await user.type(screen.getByLabelText('Amount'), '500')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('savings_goals', 'g1', { saved_paise: 450000 }))
    expect(onClose).toHaveBeenCalled()
  })
  it('AddFundsDialog rejects zero', async () => {
    const user = userEvent.setup()
    render(<AddFundsDialog goal={{ id: 'g1', name: 'L', saved_paise: 0, target_paise: 100 }} money={money} onClose={() => {}} />)
    await user.type(screen.getByLabelText('Amount'), '0')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Enter an amount greater than 0.')).toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('SavingsGoals shows progress capped at 100% and an empty state', () => {
    const { unmount } = render(<SavingsGoals money={money} />)
    expect(screen.getByText('No savings goals')).toBeInTheDocument()
    unmount()
    mocks.rows.savings_goals = [{ id: 'g1', name: 'Trip', saved_paise: 900000, target_paise: 500000, target_date: null }]
    render(<SavingsGoals money={money} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })
})

describe('TransactionList', () => {
  const tx = [
    T({ id: 'a', note: 'Lunch', category: 'Food', amount_paise: 25000 }),
    T({ id: 'b', note: 'Salary', type: 'income', category: 'Salary', amount_paise: 5000000, payment_method: 'Bank transfer' }),
  ]
  const list = (p = {}) =>
    render(<TransactionList monthTx={tx} month="2026-11-01" money={money} onAdd={() => {}} onEdit={() => {}} {...p} />)
  it('signs amounts by type', () => {
    list()
    expect(within(screen.getByText('Lunch').closest('li')).getByText(/^−/)).toBeInTheDocument()
    expect(within(screen.getByText('Salary', { selector: 'p' }).closest('li')).getByText(/^\+/)).toBeInTheDocument()
  })
  it('search and filters narrow the list, with a "no match" message', async () => {
    const user = userEvent.setup()
    list()
    await user.type(screen.getByLabelText('Search transactions'), 'lunch')
    expect(screen.getByText('Lunch')).toBeInTheDocument()
    expect(screen.queryByText('Salary', { selector: 'p' })).toBeNull()
    await user.clear(screen.getByLabelText('Search transactions'))
    await user.type(screen.getByLabelText('Search transactions'), 'zzz')
    expect(screen.getByText('No transactions match these filters.')).toBeInTheDocument()
  })
  it('shows an empty state with an add action when the month has nothing', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    list({ monthTx: [], onAdd })
    await user.click(screen.getByRole('button', { name: 'Add a transaction' }))
    expect(onAdd).toHaveBeenCalled()
  })
  it('edit passes the row; delete confirms first and describes the amount', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    mocks.confirm.mockResolvedValue(true)
    list({ onEdit })
    const row = screen.getByText('Lunch').closest('li')
    await user.click(within(row).getByRole('button', { name: 'Transaction actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
    await user.click(within(row).getByRole('button', { name: 'Transaction actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('transactions', 'a'))
    expect(mocks.confirm.mock.calls[0][0]).toMatchObject({ title: 'Delete this transaction?', description: '₹250 · Food' })
  })
  it('does not delete when the confirmation is declined', async () => {
    const user = userEvent.setup()
    mocks.confirm.mockResolvedValue(false)
    list()
    const row = screen.getByText('Lunch').closest('li')
    await user.click(within(row).getByRole('button', { name: 'Transaction actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled())
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})

describe('FinanceStats', () => {
  const stats = (sum, p = {}) =>
    render(<FinanceStats sum={sum} expenseCount={3} isOverride={false} money={money} onEditBudget={() => {}} {...p} />)
  it('prompts to set a budget when there is none', () => {
    stats({ income: 0, expense: 0, savings: 0, budget: 0, remaining: null, budgetUsed: null })
    expect(screen.getByText('No budget')).toBeInTheDocument()
    expect(screen.getByText('Set a monthly budget')).toBeInTheDocument()
  })
  it('marks the default budget and opens the editor on click', async () => {
    const user = userEvent.setup()
    const onEditBudget = vi.fn()
    stats({ income: 100000, expense: 90000, savings: 0, budget: 100000, remaining: 10000, budgetUsed: 0.9 }, { onEditBudget })
    expect(screen.getByText(/\(default\)/)).toBeInTheDocument()
    expect(screen.getByText('0% of income')).toBeInTheDocument()
    await user.click(screen.getByText('Budget left'))
    expect(onEditBudget).toHaveBeenCalled()
  })
})
