import { CalendarClock, Pencil, Target, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, Progress } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { goalProgress } from '@/domain/learning'
import { fmtDay, fmtDuration } from '@/lib/dates'

export function GoalsTab({ goals, sessions, today, onCreate, onEdit }) {
  const removeGoal = useConfirmedDelete('goals', 'Goal deleted')
  if (goals.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No goals yet"
        description="Set a target in hours, then log sessions against it to see real progress."
        action={<Button onClick={onCreate}>Create a goal</Button>}
      />
    )
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {goals.map((g) => {
        const p = goalProgress(g, sessions)
        const overdue = g.due_date && g.due_date < today && g.status === 'active'
        return (
          <Card key={g.id}>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{g.title}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone="primary">{g.category}</Badge>
                    {g.status !== 'active' && <Badge tone={g.status === 'completed' ? 'success' : 'neutral'}>{g.status}</Badge>}
                    {g.due_date && (
                      <Badge tone={overdue ? 'danger' : 'neutral'}>
                        <CalendarClock className="h-3 w-3" />
                        {fmtDay(g.due_date, 'd MMM')}
                      </Badge>
                    )}
                  </div>
                </div>
                <Menu
                  label={`Actions for ${g.title}`}
                  items={[
                    { label: 'Edit', icon: Pencil, onClick: () => onEdit(g) },
                    {
                      label: 'Delete',
                      icon: Trash2,
                      danger: true,
                      onClick: () => removeGoal(g.id, { title: 'Delete this goal?', description: 'Study sessions stay in your history.' }),
                    },
                  ]}
                />
              </div>
              <Progress value={p.percent ?? 0} tone={p.percent >= 100 ? 'success' : 'primary'} label={g.title} />
              <p className="text-xs text-muted-foreground">
                {fmtDuration(p.done)} {p.target ? `of ${fmtDuration(p.target)} · ${p.percent}%` : '· no target set'}
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
