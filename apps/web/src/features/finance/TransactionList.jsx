import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Copy, Pencil, PiggyBank, Repeat, Search, SlidersHorizontal, Trash2, Wallet } from 'lucide-react'
import { AnimatePresence, ease, m } from '@/components/motion/primitives'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/form'
import { Badge } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { PAYMENT_METHODS, filterTransactions, transactionCategories } from '@/domain/finance'
import { fmtDay, monthEnd } from '@/lib/dates'
import { cn } from '@/lib/utils'

// Expenses are the normal case, so their badges stay neutral: a list of red tags reads as a list of problems.
const TYPE_TONE = { income: 'success', expense: 'neutral', savings: 'primary' }
const AMOUNT_CLASS = { income: 'text-success', expense: 'text-foreground', savings: 'text-mod-text' }
const SIGN = { income: '+', expense: '−', savings: '' }
const NO_FILTERS = { type: '', category: '', method: '', q: '', from: '', to: '' }
const TYPE_ICON = {
  income: { icon: ArrowDownLeft, cls: 'bg-emerald-500/15 text-emerald-500' },
  expense: { icon: ArrowUpRight, cls: 'bg-muted text-muted-foreground' },
  savings: { icon: PiggyBank, cls: 'bg-violet-500/15 text-violet-500' },
}

/** Consecutive transactions on the same date, as [{ date, rows }]. */
function byDay(rows) {
  const out = []
  for (const t of rows) {
    if (out.at(-1)?.date === t.txn_date) out.at(-1).rows.push(t)
    else out.push({ date: t.txn_date, rows: [t] })
  }
  return out
}

function TransactionRow({ t, money, onEdit, onDuplicate, onDelete, ctxProps }) {
  const TypeIcon = TYPE_ICON[t.type].icon
  return (
    <m.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12, transition: { duration: 0.14 } }}
      transition={{ duration: 0.2, ease: ease.out }}
      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30 md:px-5"
      {...ctxProps}
    >
      <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', TYPE_ICON[t.type].cls)}>
        <TypeIcon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{t.note || t.category}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge tone={TYPE_TONE[t.type]}>{t.category}</Badge>
          {t.payment_method && t.payment_method !== 'Other' && <span>· {t.payment_method}</span>}
          {t.recurring_date && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="h-3 w-3" aria-hidden />
              Recurring
            </span>
          )}
        </p>
      </div>
      <span className={cn('text-sm font-semibold tabular-nums', AMOUNT_CLASS[t.type])}>
        {SIGN[t.type]}
        {money(t.amount_paise)}
      </span>
      <Menu
        label="Transaction actions"
        items={[
          { label: 'Edit', icon: Pencil, onClick: () => onEdit(t) },
          { label: 'Duplicate', icon: Copy, onClick: () => onDuplicate(t) },
          { label: 'Delete', icon: Trash2, danger: true, onClick: () => onDelete(t) },
        ]}
      />
    </m.li>
  )
}

/** The month's transactions with search and filters. `month` = first day of the month; `monthTx` = its transactions. */
export function TransactionList({ monthTx, month, money, onAdd, onEdit, onDuplicate, rowProps }) {
  const [f, setF] = useState(NO_FILTERS)
  const [showFilters, setShowFilters] = useState(false) // collapsed on phones; always visible from `md` up
  const active = ['type', 'category', 'method', 'from', 'to'].filter((k) => f[k]).length
  const set = (key) => (e) => setF((cur) => ({ ...cur, [key]: e.target.value }))
  const filtered = useMemo(() => filterTransactions(monthTx, f), [monthTx, f])
  const days = useMemo(() => byDay(filtered), [filtered])
  const categories = useMemo(() => transactionCategories(monthTx), [monthTx])
  const removeTxn = useConfirmedDelete('transactions', 'Transaction deleted')
  const askDelete = (t) => removeTxn(t.id, { title: 'Delete this transaction?', description: `${money(t.amount_paise)} · ${t.category}` })

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle>Transactions</CardTitle>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <div className="relative min-w-0 max-w-64 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input className="pl-8" placeholder="Search" aria-label="Search transactions" value={f.q} onChange={set('q')} />
          </div>
          <Button variant="outline" className="md:hidden" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filters{active > 0 && ` (${active})`}
          </Button>
        </div>
        <div className={cn('w-full grid-cols-2 gap-2 md:grid md:grid-cols-5', showFilters ? 'grid' : 'hidden')}>
          <Select aria-label="Type" value={f.type} onChange={set('type')}>
            <option value="">All types</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="savings">Savings</option>
          </Select>
          <Select aria-label="Category" value={f.category} onChange={set('category')}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select aria-label="Payment method" value={f.method} onChange={set('method')}>
            <option value="">All methods</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
          <Input
            type="date"
            aria-label="From date"
            placeholder="From"
            value={f.from}
            min={month}
            max={monthEnd(month)}
            onChange={set('from')}
          />
          <Input type="date" aria-label="To date" placeholder="To" value={f.to} min={month} max={monthEnd(month)} onChange={set('to')} />
        </div>
      </CardHeader>
      <CardContent className="p-0 pt-3">
        {monthTx.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Wallet}
              title="No transactions this month"
              description="Log expenses as they happen — it takes a few seconds."
              action={
                <Button size="sm" onClick={onAdd}>
                  Add a transaction
                </Button>
              }
            />
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No transactions match these filters.</p>
        ) : (
          <div className="pb-1">
            {days.map(({ date, rows }) => (
              <section key={date}>
                <h3 className="lt-eyebrow border-y border-border/70 bg-surface-2/60 px-4 py-1.5 text-[10px] md:px-5">
                  {fmtDay(date, 'EEE, d MMM')}
                </h3>
                <ul className="divide-y divide-border/70">
                  <AnimatePresence initial={false}>
                    {rows.map((t) => (
                      <TransactionRow
                        key={t.id}
                        t={t}
                        money={money}
                        onEdit={onEdit}
                        onDuplicate={onDuplicate}
                        onDelete={askDelete}
                        ctxProps={rowProps?.(t)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
