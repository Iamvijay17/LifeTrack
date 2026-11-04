import { useEffect, useRef, useState } from 'react'
import { Archive, CheckCircle2, ChevronDown, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { AnimatedValue, Collapse, ProgressRing } from '@/components/motion/primitives'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { isOverdue, periodLabel, progressSourceLabel, remainingText } from '@/domain/goals'
import { fmtDay } from '@/lib/dates'
import { useAction } from '@/hooks/useAction'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { setGoalStatus } from '@/services/api'
import { celebrate } from '@/lib/celebrate'
import { cn } from '@/lib/utils'
import { Milestones } from './Milestones'

/** One goal: status badges, progress, dates and an expandable milestone list. `row` is a goalRows() entry. */
export function GoalCard({ row, today, onEdit }) {
  const { goal: g, progress: p, milestones } = row
  const [expanded, setExpanded] = useState(false)
  const [setStatus] = useAction(setGoalStatus)
  const removeGoal = useConfirmedDelete('goals', 'Goal deleted')
  const over = isOverdue(g, today)
  const remaining = g.status === 'active' ? remainingText(g, today) : null

  // A goal reaching 100%, by milestones or by being marked complete, is one of the moments confetti is for.
  const finished = p.percent >= 100 || g.status === 'completed'
  const wasFinished = useRef(finished)
  useEffect(() => {
    if (finished && !wasFinished.current) celebrate()
    wasFinished.current = finished
  }, [finished])

  return (
    <Card data-testid="goal-card" className={cn(finished && 'border-mod/40')}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3.5">
          <ProgressRing
            value={p.percent}
            size={64}
            stroke={7}
            from={over ? '#FB7185' : undefined}
            to={over ? '#E11D48' : undefined}
            label={`${g.title} progress`}
          >
            <span className="text-xs font-semibold">
              <AnimatedValue value={`${p.percent}%`} />
            </span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="truncate text-sm font-semibold tracking-tight">{g.title}</h2>
              <Menu
                label={`Actions for ${g.title}`}
                items={[
                  { label: 'Edit', icon: Pencil, onClick: () => onEdit(g) },
                  {
                    label: 'Mark completed',
                    icon: CheckCircle2,
                    hidden: g.status === 'completed',
                    onClick: () => setStatus(g, 'completed'),
                  },
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
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone="primary">{periodLabel(g.period)}</Badge>
              <Badge>{g.category}</Badge>
              {g.status !== 'active' && <Badge tone={g.status === 'completed' ? 'success' : 'neutral'}>{g.status}</Badge>}
              {over && <Badge tone="danger">Overdue</Badge>}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{progressSourceLabel(p)}</p>
          </div>
        </div>
        {g.notes && <p className="mt-3 line-clamp-2 text-[13px] text-muted-foreground">{g.notes}</p>}
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {g.start_date ? `${fmtDay(g.start_date, 'd MMM')} → ` : ''}
            {g.due_date ? fmtDay(g.due_date, 'd MMM yyyy') : 'No target date'}
          </span>
          {remaining && <span>{remaining}</span>}
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="-mb-2 mt-1 flex w-full items-center justify-between rounded-md py-2 text-xs font-medium text-mod-text"
        >
          Milestones ({milestones.filter((m) => m.done).length}/{milestones.length})
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', expanded && 'rotate-180')} aria-hidden />
        </button>
        <Collapse open={expanded}>{expanded && <Milestones goal={g} milestones={milestones} />}</Collapse>
      </CardContent>
    </Card>
  )
}
