import { useMemo } from 'react'
import { Bar, BarChart, Cell, Legend, Line, LineChart, Pie, PieChart } from 'recharts'
import { Chart, C, PALETTE, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { categoryBreakdown, monthlySeries, spendingDays } from '@/domain/finance'
import { fmtDay } from '@/lib/dates'

/**
 * Spending by category (pie), last six months (bars) and daily spending (line).
 * `month` is the first day of the month being viewed; `monthTx` its transactions; `transactions` everything.
 */
export function FinanceCharts({ transactions, monthTx, month, today, money }) {
  const breakdown = useMemo(() => categoryBreakdown(monthTx), [monthTx])
  const series = useMemo(
    () => monthlySeries(transactions, month, 6).map((s) => ({ ...s, label: fmtDay(s.month + '-01', 'MMM') })),
    [transactions, month],
  )
  const daily = useMemo(
    () => spendingDays(transactions, month, today).map((d) => ({ ...d, label: Number(d.date.slice(8)), rupees: d.paise / 100 })),
    [transactions, month, today],
  )

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Spending by category</CardTitle>
        </CardHeader>
        <CardContent>
          <Chart height={230} empty={breakdown.length === 0} emptyText="No expenses this month.">
            <PieChart>
              <Pie
                data={breakdown.map((b) => ({ name: b.category, value: b.paise / 100 }))}
                dataKey="value"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                stroke="none"
              >
                {breakdown.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              {tooltip({ formatter: (v) => money(Math.round(v * 100)) })}
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </Chart>
          <ul className="mt-2 space-y-1.5">
            {breakdown.slice(0, 6).map((b, i) => (
              <li key={b.category} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                  {b.category}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {money(b.paise)} · {Math.round(b.share * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <div className="space-y-4 lg:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle>Last 6 months</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart
              height={200}
              empty={series.every((s) => !s.income && !s.expense && !s.savings)}
              emptyText="Add transactions to see trends."
            >
              <BarChart data={series}>
                {grid()}
                {xAxis({ dataKey: 'label' })}
                {yAxis({ tickFormatter: (v) => money(v, { compact: true }), width: 56 })}
                {tooltip({ formatter: (v) => money(v) })}
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar name="Income" dataKey="income" fill={C.success} radius={[3, 3, 0, 0]} />
                <Bar name="Expenses" dataKey="expense" fill={C.danger} radius={[3, 3, 0, 0]} />
                <Bar name="Savings" dataKey="savings" fill={C.primary} radius={[3, 3, 0, 0]} />
              </BarChart>
            </Chart>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Daily spending</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart height={140} empty={daily.every((d) => !d.paise)} emptyText="No spending this month.">
              <LineChart data={daily}>
                {xAxis({ dataKey: 'label' })}
                {tooltip({ formatter: (v) => [money(Math.round(v * 100)), 'Spent'], labelFormatter: (l) => `Day ${l}` })}
                <Line dataKey="rupees" stroke={C.danger} strokeWidth={2} dot={false} />
              </LineChart>
            </Chart>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
