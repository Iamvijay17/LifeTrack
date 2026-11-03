import { useState } from 'react'
import { Archive, CheckCircle2, ChevronDown, ChevronUp, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, Progress } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { isOverdue, periodLabel, progressSourceLabel, remainingText } from '@/domain/goals'
import { fmtDay } from '@/lib/dates'
import { useAction } from '@/hooks/useAction'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { setGoalStatus } from '@/services/api'
import { Milestones } from './Milestones'

/** One goal: status badges, progress, dates and an expandable milestone list. `row` is a goalRows() entry. */
export function GoalCard({ row, today, onEdit }) {
  const { goal: g, progress: p, milestones } = row
  const [expanded, setExpanded] = useState(false)
  const [setStatus] = useAction(setGoalStatus)
  const removeGoal = useConfirmedDelete('goals', 'Goal deleted')
  const over = isOverdue(g, today)
  const remaining = g.status === 'active' ? remainingText(g, today) : null

  return (
    <Card data-testid="goal-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{g.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone="primary">{periodLabel(g.period)}</Badge>
              <Badge>{g.category}</Badge>
              {g.status !== 'active' && <Badge tone={g.status === 'completed' ? 'success' : 'neutral'}>{g.status}</Badge>}
              {over && <Badge tone="danger">Overdue</Badge>}
            </div>
          </div>
          <Menu
            label={`Actions for ${g.title}`}
            items={[
              { label: 'Edit', icon: Pencil, onClick: () => onEdit(g) },
              { label: 'Mark completed', icon: CheckCircle2, hidden: g.status === 'completed', onClick: () => setStatus(g, 'completed') },
              { label: 'Reopen', icon: RotateCcw, hidden: g.status === 'active', onClick: () => setStatus(g, 'active') },
              { label: 'Archive', icon: Archive, hidden: g.status === 'archived', onClick: () => setStatus(g, 'archived') },
              {
                label: 'Delete',
                icon: Trash2,
                danger: true,
                onClick: () =>
                  removeGoal(g.id, {
                    title: 'Delete this goal?',
                    description: 'Its milestones are deleted too. Notes and study sessions stay.',
                  }),
              },
            ]}
          />
        </div>
        {g.notes && <p className="mt-2 line-clamp-2 text-[13px] text-muted-foreground">{g.notes}</p>}
        <div className="mt-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{progressSourceLabel(p)}</span>
            <span className="font-medium tabular-nums">{p.percent}%</span>
          </div>
          <Progress value={p.percent} tone={p.percent >= 100 ? 'success' : over ? 'danger' : 'primary'} label={`${g.title} progress`} />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {g.start_date ? `${fmtDay(g.start_date, 'd MMM')} → ` : ''}
            {g.due_date ? fmtDay(g.due_date, 'd MMM yyyy') : 'No target date'}
          </span>
          {remaining && <span>{remaining}</span>}
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="mt-3 flex w-full items-center justify-between text-xs font-medium text-secondary"
        >
          Milestones ({milestones.filter((m) => m.done).length}/{milestones.length})
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {expanded && <Milestones goal={g} milestones={milestones} />}
      </CardContent>
    </Card>
  )
}
