import { Bar, BarChart } from 'recharts'
import { Wallet } from 'lucide-react'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { StatCard } from '@/components/shared/StatCard'
import { Progress } from '@/components/ui/misc'
import { Block, EmptyNote, Panel } from './Layout'

/** `money(paise)` formats in the user's currency. */
export function FinanceSection({ finance: f, money }) {
  return (
    <Block icon={Wallet} title="Finance">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Income" value={money(f.income)} />
        <StatCard label="Expenses" value={money(f.expense)} />
        <StatCard label="Savings" value={money(f.savings)} sub={f.savingsRate == null ? undefined : `${f.savingsRate}% of income`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Spending per ${f.unit}`}>
          <Chart height={190} empty={f.expense === 0} emptyText="No expenses in this range.">
            <BarChart data={f.chart}>
              {grid()}
              {xAxis({ dataKey: 'label', minTickGap: 16 })}
              {yAxis({ width: 48 })}
              {tooltip({ formatter: (v) => [money(Math.round(v * 100)), 'Spent'] })}
              <Bar dataKey="value" fill={C.danger} radius={[3, 3, 0, 0]} />
            </BarChart>
          </Chart>
        </Panel>
        <Panel title="Top expense categories">
          {f.categories.length === 0 ? (
            <EmptyNote>No expenses in this range.</EmptyNote>
          ) : (
            <ul className="space-y-3">
              {f.categories.slice(0, 6).map((c) => (
                <li key={c.category}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{c.category}</span>
                    <span className="text-muted-foreground">
                      {money(c.paise)} · {Math.round(c.share * 100)}%
                    </span>
                  </div>
                  <Progress value={c.share * 100} label={c.category} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </Block>
  )
}
