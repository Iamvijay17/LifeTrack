import { useMemo } from 'react'
import { Area, AreaChart, Bar, BarChart, Cell, Legend, Pie, PieChart } from 'recharts'
import { Chart, C, PALETTE, grid, tooltip, xAxis, yAxis, G } from '@/components/shared/charts'
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Spending by category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {breakdown.length > 0 && (
              <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="text-[11px] text-muted-foreground">Most on</p>
                  <p className="max-w-[6.5rem] truncate text-sm font-semibold tracking-tight">{breakdown[0].category}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">{Math.round(breakdown[0].share * 100)}%</p>
                </div>
              </div>
            )}
            <Chart
              height={200}
              empty={breakdown.length === 0}
              emptyText="No expenses this month."
              summary={breakdown.map((b) => `${b.category} ${money(b.paise)}, ${Math.round(b.share * 100)}%`).join('; ')}
            >
              <PieChart>
                <Pie
                  data={breakdown.map((b) => ({ name: b.category, value: b.paise / 100 }))}
                  dataKey="value"
                  innerRadius={64}
                  outerRadius={90}
                  paddingAngle={3}
                  cornerRadius={5}
                  stroke="none"
                >
                  {breakdown.map((b, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} aria-label={b.category} />
                  ))}
                </Pie>
                {tooltip({ formatter: (v) => money(Math.round(v * 100)) })}
              </PieChart>
            </Chart>
          </div>
          <ul className="mt-3 space-y-2">
            {breakdown.slice(0, 6).map((b, i) => (
              <li key={b.category} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <span className="truncate">{b.category}</span>
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
              summary={series
                .map((s) => `${s.label}: income ${money(s.income)}, expenses ${money(s.expense)}, savings ${money(s.savings)}`)
                .join('; ')}
            >
              <BarChart data={series}>
                {grid()}
                {xAxis({ dataKey: 'label' })}
                {yAxis({ tickFormatter: (v) => money(v, { compact: true }), width: 56 })}
                {tooltip({ formatter: (v) => money(v) })}
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar name="Income" dataKey="income" fill={G.success} radius={[5, 5, 2, 2]} />
                <Bar name="Expenses" dataKey="expense" fill={G.danger} radius={[5, 5, 2, 2]} />
                <Bar name="Savings" dataKey="savings" fill={G.violet} radius={[5, 5, 2, 2]} />
              </BarChart>
            </Chart>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Daily spending</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart
              height={140}
              empty={daily.every((d) => !d.paise)}
              emptyText="No spending this month."
              summary={`Spending by day. Highest ${money(Math.max(...daily.map((d) => d.paise), 0))} of ${money(daily.reduce((a, d) => a + d.paise, 0))} in total.`}
            >
              <AreaChart data={daily}>
                {xAxis({ dataKey: 'label', minTickGap: 18 })}
                {tooltip({ formatter: (v) => [money(Math.round(v * 100)), 'Spent'], labelFormatter: (l) => `Day ${l}` })}
                <Area
                  type="monotone"
                  dataKey="rupees"
                  stroke={C.danger}
                  strokeWidth={2.5}
                  fill={G.dangerArea}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </Chart>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
