import { GripVertical, Inbox } from 'lucide-react'
import { PRIORITY_META, categoryMeta, categoryOfTask } from '@/domain/calendar'
import { cn } from '@/lib/utils'
import { useDrag } from './dnd'
import { tint } from './format'

/**
 * Open tasks with no date. Drag one onto a day, an hour slot, the all-day lane or a month cell to schedule it; or tap it to pick a date in the form.
 * Dropping writes the task's own row (due_date, and a time if dropped on the hour grid): nothing is copied.
 */
export function UnscheduledTray({ tasks, layout = 'list', onEdit, className }) {
  const { state, startDrag, wasDrag } = useDrag()
  const carried = state.active ? state.spec?.task?.id : null
  if (!tasks.length)
    return (
      <div
        className={cn('flex items-center gap-2 text-xs text-muted-foreground', layout === 'list' ? 'px-1 py-3' : 'px-1 py-2', className)}
        data-testid="tray-empty"
      >
        <Inbox className="h-4 w-4 shrink-0" aria-hidden />
        Every open task has a date.
      </div>
    )
  return (
    <ul
      aria-label="Unscheduled tasks"
      data-testid="tray"
      className={cn(layout === 'list' ? 'space-y-1' : 'scrollbar-none flex gap-1.5 overflow-x-auto pb-1', className)}
    >
      {tasks.map((t) => {
        const cat = categoryMeta(categoryOfTask(t)).color
        return (
          <li key={t.id} className={cn(layout === 'strip' && 'shrink-0')}>
            <div
              role="button"
              tabIndex={0}
              data-cal-tray={t.id}
              data-testid={`tray-${t.id}`}
              aria-label={`Unscheduled task: ${t.title}. Drag onto the calendar to schedule it, or press Enter to choose a date.`}
              onPointerDown={(e) => startDrag(e, { mode: 'move', task: t, grabMin: 0 })}
              onClick={() => !wasDrag() && onEdit(t)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onEdit(t)
                }
              }}
              className={cn(
                'cal-item flex cursor-grab items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-left text-xs outline-none transition-opacity hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/70',
                layout === 'strip' ? 'max-w-[14rem]' : 'w-full',
                carried === t.id && 'opacity-40',
              )}
              style={{ borderLeft: `3px solid ${cat}`, background: tint(cat, 0.08) }}
              data-movable="true"
            >
              <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{t.category}</span>
              </span>
              {t.priority !== 'medium' && PRIORITY_META[t.priority] && (
                <span
                  aria-label={`${PRIORITY_META[t.priority].label} priority`}
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: PRIORITY_META[t.priority].color }}
                />
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
