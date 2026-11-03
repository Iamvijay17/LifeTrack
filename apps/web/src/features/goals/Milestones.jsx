import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Circle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { nextMilestonePosition } from '@/domain/goals'
import { fmtDay } from '@/lib/dates'
import { optionalDay } from '@/lib/validation'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'
import { toggleMilestone } from '@/services/api'
import { cn } from '@/lib/utils'

const schema = z.object({
  title: z.string().trim().min(1, 'Name the milestone first.').max(160, 'Keep it under 160 characters'),
  due: optionalDay,
})

/** The milestones of one goal (`milestones`, already in order) with an inline "add" form. */
export function Milestones({ goal, milestones }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { title: '', due: '' } })

  const [add, adding] = useAction(async (v) => {
    await store.insert('milestones', {
      goal_id: goal.id,
      title: v.title,
      due_date: v.due || null,
      position: nextMilestonePosition(milestones),
    })
    reset()
  })
  const [toggle] = useAction(toggleMilestone)
  const [remove] = useAction((id) => store.remove('milestones', id))
  const error = errors.title?.message ?? errors.due?.message

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <ul className="space-y-1">
        {milestones.map((m) => (
          <li key={m.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/40">
            <button onClick={() => toggle(m)} aria-label={`${m.done ? 'Mark not done' : 'Mark done'}: ${m.title}`} aria-pressed={m.done}>
              {m.done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
            </button>
            <span className={cn('min-w-0 flex-1 truncate', m.done && 'text-muted-foreground line-through')}>{m.title}</span>
            {m.due_date && <span className="text-xs text-muted-foreground">{fmtDay(m.due_date, 'd MMM')}</span>}
            <button
              onClick={() => remove(m.id)}
              aria-label={`Delete milestone ${m.title}`}
              className="text-muted-foreground hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" noValidate onSubmit={handleSubmit(add)}>
        <Input aria-label="New milestone" placeholder="Add a milestone" maxLength={160} {...register('title')} />
        <Input aria-label="Milestone due date" type="date" className="w-36 shrink-0" {...register('due')} />
        <Button type="submit" variant="outline" loading={adding}>
          Add
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
