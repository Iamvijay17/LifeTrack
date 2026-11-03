import { useState } from 'react'
import { PiggyBank, Pencil, Plus, Trash2, PlusCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { EmptyState } from '@/components/shared/states'
import { useTable } from '@/hooks/store'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { savingsGoalPercent } from '@/domain/finance'
import { fmtDay } from '@/lib/dates'
import { SavingsGoalDialog } from './SavingsGoalDialog'
import { AddFundsDialog } from './AddFundsDialog'

export function SavingsGoals({ money }) {
  const { rows } = useTable('savings_goals')
  const [dlg, setDlg] = useState({ open: false, goal: null })
  const [funds, setFunds] = useState(null)
  const removeGoal = useConfirmedDelete('savings_goals', 'Savings goal deleted')
  const newGoal = () => setDlg({ open: true, goal: null })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Savings goals</CardTitle>
        <Button variant="outline" size="sm" onClick={newGoal}>
          <Plus className="h-4 w-4" />
          Goal
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={PiggyBank}
            title="No savings goals"
            description="Set a target — an emergency fund, a laptop, a trip — and track what you've put aside."
            action={
              <Button size="sm" onClick={newGoal}>
                Create a savings goal
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map((g) => {
              const pct = savingsGoalPercent(g)
              return (
                <li key={g.id} className="rounded-lg border border-border p-3" data-testid="savings-goal">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {money(g.saved_paise)} of {money(g.target_paise)}
                        {g.target_date ? ` · by ${fmtDay(g.target_date, 'd MMM yyyy')}` : ''}
                      </p>
                    </div>
                    <Menu
                      label={`Actions for ${g.name}`}
                      items={[
                        { label: 'Add funds', icon: PlusCircle, onClick: () => setFunds(g) },
                        { label: 'Edit', icon: Pencil, onClick: () => setDlg({ open: true, goal: g }) },
                        {
                          label: 'Delete',
                          icon: Trash2,
                          danger: true,
                          onClick: () => removeGoal(g.id, { title: 'Delete this savings goal?', description: g.name }),
                        },
                      ]}
                    />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Progress value={pct} tone={pct >= 100 ? 'success' : 'primary'} label={`${g.name} progress`} />
                    <span className="w-10 text-right text-xs tabular-nums">{pct}%</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
      <SavingsGoalDialog open={dlg.open} goal={dlg.goal} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))} />
      {funds && <AddFundsDialog goal={funds} money={money} onClose={() => setFunds(null)} />}
    </Card>
  )
}
