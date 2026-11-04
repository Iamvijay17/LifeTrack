import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { useTables } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { monthTransactions, resolveBudget, summarize } from '@/domain/finance'
import { monthKey, monthStart } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { download, toCsv, TX_COLUMNS } from '@/services/csv'
import { MonthNav } from './MonthNav'
import { FinanceStats } from './FinanceStats'
import { BudgetAlert } from './BudgetAlert'
import { FinanceCharts } from './FinanceCharts'
import { RecurringRules } from './RecurringRules'
import { SavingsGoals } from './SavingsGoals'
import { TransactionList } from './TransactionList'
import { TransactionDialog } from './TransactionDialog'
import { BudgetDialog } from './BudgetDialog'

export default function FinancePage() {
  const today = useToday()
  const { settings } = useSettings()
  const money = (paise, opts) => formatMoney(paise, settings.currency, opts)
  const { data, loading, error, refetch } = useTables('transactions', 'budgets')
  const [chosen, setChosen] = useState(null)
  const [params, setParams] = useSearchParams()
  // Deep link from global search: /finance?month=yyyy-MM-01
  useEffect(() => {
    const target = params.get('month')
    if (!target) return
    setChosen(target)
    setParams({}, { replace: true })
  }, [params, setParams])
  const month = chosen ?? monthStart(today)
  const mk = monthKey(month)
  const [txnDialog, setTxnDialog] = useState({ open: false, txn: null, type: 'expense' })
  const [budgetOpen, setBudgetOpen] = useState(false)

  const budget = resolveBudget(data.budgets, month, settings.monthly_budget_paise)
  const sum = useMemo(() => summarize(data.transactions, mk, budget.paise), [data.transactions, mk, budget.paise])
  const monthTx = useMemo(() => monthTransactions(data.transactions, mk), [data.transactions, mk])
  const expenseCount = useMemo(() => monthTx.filter((t) => t.type === 'expense').length, [monthTx])

  const addTransaction = () => setTxnDialog({ open: true, txn: null, copyOf: null, type: 'expense' })
  return (
    <>
      <PageHeader
        title="Finance"
        description="Income, spending and savings at a glance."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.transactions.length}
              onClick={() => download('lifetrack-transactions.csv', toCsv(data.transactions, TX_COLUMNS))}
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button onClick={addTransaction}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </>
        }
      />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-5">
          <MonthNav month={month} today={today} onChange={setChosen} />
          <FinanceStats
            sum={sum}
            expenseCount={expenseCount}
            isOverride={budget.isOverride}
            money={money}
            onEditBudget={() => setBudgetOpen(true)}
          />
          <BudgetAlert sum={sum} money={money} onEdit={() => setBudgetOpen(true)} />
          <FinanceCharts transactions={data.transactions} monthTx={monthTx} month={month} today={today} money={money} />
          <SavingsGoals money={money} />
          <RecurringRules money={money} transactions={data.transactions} today={today} />
          <TransactionList
            monthTx={monthTx}
            month={month}
            money={money}
            onAdd={addTransaction}
            onEdit={(txn) => setTxnDialog({ open: true, txn, type: txn.type })}
            onDuplicate={(txn) => setTxnDialog({ open: true, txn: null, copyOf: txn, type: txn.type })}
          />
        </div>
      </DataGate>
      <TransactionDialog
        open={txnDialog.open}
        txn={txnDialog.txn}
        copyOf={txnDialog.copyOf}
        transactions={data.transactions}
        defaultType={txnDialog.type}
        today={today}
        onOpenChange={(o) => setTxnDialog((d) => ({ ...d, open: o }))}
      />
      <BudgetDialog open={budgetOpen} onOpenChange={setBudgetOpen} month={month} currentPaise={budget.paise} />
    </>
  )
}
