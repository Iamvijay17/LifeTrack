import { useEffect, useRef, useState } from 'react'
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
import { celebrate } from '@/lib/celebrate'
import { SavingsGoalDialog } from './SavingsGoalDialog'
import { AddFundsDialog } from './AddFundsDialog'

function GoalTile({ goal: g, money, onFunds, onEdit, onDelete }) {
  const pct = savingsGoalPercent(g)
  // Hitting the target is worth a moment, once, as it happens.
  const wasReached = useRef(pct >= 100)
  useEffect(() => {
    if (pct >= 100 && !wasReached.current) celebrate()
    wasReached.current = pct >= 100
  }, [pct])
  return (
    <li className="lt-lift rounded-lg border border-border bg-surface-2/50 p-3.5" data-testid="savings-goal">
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
            { label: 'Add funds', icon: PlusCircle, onClick: () => onFunds(g) },
            { label: 'Edit', icon: Pencil, onClick: () => onEdit(g) },
            { label: 'Delete', icon: Trash2, danger: true, onClick: () => onDelete(g) },
          ]}
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Progress value={pct} tone={pct >= 100 ? 'success' : 'primary'} label={`${g.name} progress`} />
        <span className="w-10 text-right text-xs font-medium tabular-nums">{pct}%</span>
      </div>
    </li>
  )
}

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
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {rows.map((g) => (
              <GoalTile
                key={g.id}
                goal={g}
                money={money}
                onFunds={setFunds}
                onEdit={(goal) => setDlg({ open: true, goal })}
                onDelete={(goal) => removeGoal(goal.id, { title: 'Delete this savings goal?', description: goal.name })}
              />
            ))}
          </ul>
        )}
      </CardContent>
      <SavingsGoalDialog open={dlg.open} goal={dlg.goal} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))} />
      {funds && <AddFundsDialog goal={funds} money={money} onClose={() => setFunds(null)} />}
    </Card>
  )
}
