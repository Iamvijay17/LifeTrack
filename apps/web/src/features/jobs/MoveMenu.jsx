import { MoveRight } from 'lucide-react'
import { Menu } from '@/components/ui/menu'
import { JOB_STATUSES, STATUS_LABEL } from '@/domain/jobs'
import { setApplicationStatus } from '@/services/api'
import { useAction } from '@/hooks/useAction'

/** "Move to…" menu for an application (the touch-friendly alternative to dragging on the board). */
export function MoveMenu({ app, today }) {
  const [move] = useAction((s) => setApplicationStatus(app, s, today), { success: 'Status updated' })
  return (
    <Menu
      label={`Move ${app.company}`}
      trigger={
        <span className="flex items-center gap-1 rounded px-2.5 py-3 text-xs text-muted-foreground hover:bg-muted md:px-1.5 md:py-1 md:text-[11px]">
          <MoveRight className="h-3 w-3" aria-hidden />
          Move
        </span>
      }
      items={JOB_STATUSES.filter((s) => s !== app.status).map((s) => ({ label: STATUS_LABEL[s], onClick: () => move(s) }))}
    />
  )
}
