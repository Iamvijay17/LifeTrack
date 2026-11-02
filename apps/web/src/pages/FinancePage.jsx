import { useMemo, useState } from 'react'
import { Bar, BarChart, Cell, Legend, Line, LineChart, Pie, PieChart } from 'recharts'
import { ChevronLeft, ChevronRight, Download, Pencil, PiggyBank, Plus, Search, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { StatCard } from '@/components/shared/StatCard'
import { Chart, C, PALETTE, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { TransactionDialog } from '@/features/finance/TransactionDialog'
import { SavingsGoals } from '@/features/finance/SavingsGoals'
import { FormDialog } from '@/components/shared/FormDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form'
import { Badge, Progress } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { useConfirm } from '@/components/shared/Confirm'
import { useTables } from '@/hooks/store'
import * as store from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { useAction } from '@/hooks/useAction'
import { PAYMENT_METHODS, budgetTone, filterTransactions, financeMonth, savingsShareOfIncome, signFor, TYPE_TONE } from '@lifetrack/core/finance'
import { parseAmountOrThrow } from '@lifetrack/schemas'
import { setMonthBudget } from '@/services/api'
import { addMonths, fmtDay, monthEnd, monthStart } from '@/lib/dates'
import { formatMoney as fm, paiseToInput } from '@/lib/money'
import { download, toCsv, TX_COLUMNS } from '@/services/csv'
import { cn } from '@/lib/utils'

export default function FinancePage() {
  const today = useToday()
  const confirm = useConfirm()
  const { settings } = useSettings()
  const cur = settings.currency
  const money = (p, o) => fm(p, cur, o)
  const { data, loading, error, refetch } = useTables('transactions', 'budgets')
  const [month, setMonth] = useState(null)
  const m = month ?? monthStart(today)
  const [dlg, setDlg] = useState({ open: false, txn: null, type: 'expense' })
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [budgetInput, setBudgetInput] = useState('')
  const [f, setF] = useState({ type: '', category: '', method: '', q: '', from: '', to: '' })

  const fin = useMemo(() => financeMonth({ transactions: data.transactions, budgets: data.budgets, defaultBudget: settings.monthly_budget_paise, month: m, today }), [data.transactions, data.budgets, settings.monthly_budget_paise, m, today])
  const { overall, budget, monthTx, summary: sum, breakdown, series } = fin
  const daily = useMemo(() => fin.daily.map((d) => ({ ...d, label: d.day, rupees: d.paise / 100 })), [fin.daily])
  const filtered = useMemo(() => filterTransactions(monthTx, f), [monthTx, f])
  const [del] = useAction((id) => store.remove('transactions', id), { success: 'Transaction deleted' })
  const [saveBudget, savingBudget] = useAction(async () => {
    await setMonthBudget(m, parseAmountOrThrow(budgetInput, 'Enter a valid amount, e.g. 25000', { allowZero: true }))
    setBudgetOpen(false)
  }, { success: 'Budget saved' })

  const used = sum.budgetUsed
  const tone = budgetTone(used)
  const allCats = fin.categories

  return (
    <>
      <PageHeader title="Finance" description="Income, spending and savings — all stored as exact paise."
        actions={<><Button variant="outline" size="sm" disabled={!data.transactions.length} onClick={() => download('lifetrack-transactions.csv', toCsv(data.transactions, TX_COLUMNS))}><Download className="h-4 w-4" />CSV</Button><Button onClick={() => setDlg({ open: true, txn: null, type: 'expense' })}><Plus className="h-4 w-4" />Add</Button></>} />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(addMonths(m, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-32 text-center text-sm font-medium">{fmtDay(m, 'MMMM yyyy')}</span>
            <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setMonth(addMonths(m, 1))}><ChevronRight className="h-4 w-4" /></Button>
            {m !== monthStart(today) && <Button variant="ghost" size="sm" onClick={() => setMonth(null)}>This month</Button>}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={TrendingUp} label="Income" value={money(sum.income)} />
            <StatCard icon={TrendingDown} label="Expenses" value={money(sum.expense)} sub={`${fin.expenseCount} transactions`} />
            <StatCard icon={PiggyBank} label="Savings" value={money(sum.savings)} sub={sum.income ? `${savingsShareOfIncome(sum)}% of income` : undefined} />
            <StatCard icon={Wallet} label="Budget left" value={sum.remaining == null ? 'No budget' : money(sum.remaining)} sub={sum.budget ? `of ${money(sum.budget)}${overall ? '' : ' (default)'}` : 'Set a monthly budget'} progress={used == null ? null : Math.min(100, used * 100)} tone={tone} onClick={() => { setBudgetInput(paiseToInput(budget || 0)); setBudgetOpen(true) }} />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-2"><CardHeader><CardTitle>Spending by category</CardTitle></CardHeader><CardContent>
              <Chart height={230} empty={breakdown.length === 0} emptyText="No expenses this month.">
                <PieChart><Pie data={breakdown.map((b) => ({ name: b.category, value: b.paise / 100 }))} dataKey="value" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">{breakdown.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie>{tooltip({ formatter: (v) => money(Math.round(v * 100)) })}<Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} /></PieChart>
              </Chart>
              <ul className="mt-2 space-y-1.5">{breakdown.slice(0, 6).map((b, i) => <li key={b.category} className="flex items-center justify-between text-xs"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{b.category}</span><span className="tabular-nums text-muted-foreground">{money(b.paise)} · {Math.round(b.share * 100)}%</span></li>)}</ul>
            </CardContent></Card>
            <div className="space-y-4 lg:col-span-3">
              <Card><CardHeader><CardTitle>Last 6 months</CardTitle></CardHeader><CardContent>
                <Chart height={200} empty={series.every((s) => !s.income && !s.expense && !s.savings)} emptyText="Add transactions to see trends.">
                  <BarChart data={series}>{grid()}{xAxis({ dataKey: 'label' })}{yAxis({ tickFormatter: (v) => money(v, { compact: true }), width: 56 })}{tooltip({ formatter: (v) => money(v) })}<Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} /><Bar name="Income" dataKey="income" fill={C.success} radius={[3, 3, 0, 0]} /><Bar name="Expenses" dataKey="expense" fill={C.danger} radius={[3, 3, 0, 0]} /><Bar name="Savings" dataKey="savings" fill={C.primary} radius={[3, 3, 0, 0]} /></BarChart>
                </Chart></CardContent></Card>
              <Card><CardHeader><CardTitle>Daily spending</CardTitle></CardHeader><CardContent>
                <Chart height={140} empty={daily.every((d) => !d.paise)} emptyText="No spending this month."><LineChart data={daily}>{xAxis({ dataKey: 'label' })}{tooltip({ formatter: (v) => [money(Math.round(v * 100)), 'Spent'], labelFormatter: (l) => `Day ${l}` })}<Line dataKey="rupees" stroke={C.danger} strokeWidth={2} dot={false} /></LineChart></Chart></CardContent></Card>
            </div>
          </div>

          <SavingsGoals money={money} today={today} />

          <Card><CardHeader className="flex-wrap"><CardTitle>Transactions</CardTitle>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <div className="relative min-w-32 max-w-48 flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-9 pl-8" placeholder="Search" aria-label="Search transactions" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
              <Select aria-label="Type" className="w-28" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">All types</option><option value="expense">Expense</option><option value="income">Income</option><option value="savings">Savings</option></Select>
              <Select aria-label="Category" className="w-36" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">All categories</option>{allCats.map((c) => <option key={c}>{c}</option>)}</Select>
              <Select aria-label="Payment method" className="w-36" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="">All methods</option>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select>
              <Input type="date" aria-label="From date" className="w-36" value={f.from} min={m} max={monthEnd(m)} onChange={(e) => setF({ ...f, from: e.target.value })} />
              <Input type="date" aria-label="To date" className="w-36" value={f.to} min={m} max={monthEnd(m)} onChange={(e) => setF({ ...f, to: e.target.value })} />
            </div></CardHeader>
            <CardContent className="p-0 pt-3">
              {monthTx.length === 0 ? <div className="p-4"><EmptyState icon={Wallet} title="No transactions this month" description="Log expenses as they happen — it takes a few seconds." action={<Button size="sm" onClick={() => setDlg({ open: true, txn: null, type: 'expense' })}>Add a transaction</Button>} /></div>
              : filtered.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No transactions match these filters.</p>
              : <ul className="divide-y divide-border">{filtered.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{t.note || t.category}</p><p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{fmtDay(t.txn_date, 'EEE, d MMM')}<Badge tone={TYPE_TONE[t.type]}>{t.category}</Badge>{t.payment_method && t.payment_method !== 'Other' && <span>· {t.payment_method}</span>}</p></div>
                  <span className={cn('text-sm font-semibold tabular-nums', t.type === 'income' ? 'text-success' : t.type === 'expense' ? 'text-foreground' : 'text-secondary')}>{signFor(t.type)}{money(t.amount_paise)}</span>
                  <Menu label="Transaction actions" items={[{ label: 'Edit', icon: Pencil, onClick: () => setDlg({ open: true, txn: t, type: t.type }) }, { label: 'Delete', icon: Trash2, danger: true, onClick: async () => { if (await confirm({ title: 'Delete this transaction?', description: `${money(t.amount_paise)} · ${t.category}` })) del(t.id) } }]} />
                </li>))}</ul>}
            </CardContent></Card>
        </div>
      </DataGate>
      <TransactionDialog open={dlg.open} txn={dlg.txn} defaultType={dlg.type} today={today} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))} />
      <FormDialog open={budgetOpen} onOpenChange={setBudgetOpen} title={`Budget for ${fmtDay(m, 'MMMM yyyy')}`} description="Overrides your default monthly budget for this month only." pending={savingBudget} onSubmit={(e) => { e.preventDefault(); saveBudget() }}>
        <Field label="Monthly expense budget"><Input autoFocus inputMode="decimal" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} placeholder="e.g. 30000" /></Field>
      </FormDialog>
    </>
  )
}
