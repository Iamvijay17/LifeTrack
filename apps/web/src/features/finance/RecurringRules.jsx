import { useMemo, useState } from 'react'
import { Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react'
import { signFor } from '@lifetrack/core/finance'
import { frequencyLabel, ruleSchedule, ruleStatus, ruleTitle, sortRules } from '@lifetrack/core/recurring'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { useTable } from '@/hooks/store'
import { useAction } from '@/hooks/useAction'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { cn } from '@/lib/utils'
import { toggleRecurringRule } from '@/services/api'
import { RecurringRuleDialog } from './RecurringRuleDialog'

/** Rent, EMI, subscriptions: rules that add their transactions by themselves when they fall due. */
export function RecurringRules({ money, transactions, today }) {
  const { rows } = useTable('recurring_rules')
  const rules = useMemo(() => sortRules(rows), [rows])
  const [dlg, setDlg] = useState({ open: false, rule: null })
  const [toggle] = useAction((rule) => toggleRecurringRule(rule, today))
  const removeRule = useConfirmedDelete('recurring_rules', 'Recurring rule deleted')
  const newRule = () => setDlg({ open: true, rule: null })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring</CardTitle>
        <Button variant="outline" size="sm" onClick={newRule}>
          <Plus className="h-4 w-4" />
          Rule
        </Button>
      </CardHeader>
      <CardContent className={rules.length ? 'p-0 pt-3' : undefined}>
        {rules.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="No recurring transactions"
            description="Add rent, EMI or a subscription once, and it's logged for you each time it falls due."
            action={
              <Button size="sm" onClick={newRule}>
                Add a recurring rule
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {rules.map((r) => {
              const status = ruleStatus(r)
              const title = ruleTitle(r)
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5" data-testid="recurring-rule">
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm font-medium', status !== 'active' && 'text-muted-foreground')}>{title}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {frequencyLabel(r.frequency)} · {ruleSchedule(r)}
                      <Badge tone="neutral">{r.category}</Badge>
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {signFor(r.type)}
                    {money(r.amount_paise)}
                  </span>
                  <Menu
                    label={`Actions for ${title}`}
                    items={[
                      ...(status === 'active' ? [{ label: 'Pause', icon: Pause, onClick: () => toggle(r) }] : []),
                      ...(status === 'paused' ? [{ label: 'Resume', icon: Play, onClick: () => toggle(r) }] : []),
                      { label: 'Edit', icon: Pencil, onClick: () => setDlg({ open: true, rule: r }) },
                      {
                        label: 'Delete',
                        icon: Trash2,
                        danger: true,
                        onClick: () =>
                          removeRule(r.id, {
                            title: 'Delete this recurring rule?',
                            description: `${title}. Transactions it already added stay.`,
                          }),
                      },
                    ]}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
      <RecurringRuleDialog
        open={dlg.open}
        rule={dlg.rule}
        transactions={transactions}
        today={today}
        onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))}
      />
    </Card>
  )
}
