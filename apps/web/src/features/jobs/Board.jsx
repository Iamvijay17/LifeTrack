import { useState } from 'react'
import { Bell, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { JOB_STATUSES, isFollowupOverdue } from '@/domain/jobs'
import { formatLpa } from '@/lib/money'
import { setApplicationStatus } from '@/services/api'
import { useAction } from '@/hooks/useAction'
import { cn } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'
import { MoveMenu } from './MoveMenu'

function AppCard({ app, today, onOpen }) {
  const package_ = formatLpa(app.salary_paise)
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', app.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className="cursor-grab rounded-md border border-border bg-background p-3 text-left transition-colors hover:border-muted-foreground/50 active:cursor-grabbing"
      data-testid="app-card"
    >
      <button type="button" onClick={() => onOpen(app)} className="block w-full text-left">
        <p className="truncate text-sm font-medium">{app.company}</p>
        <p className="truncate text-xs text-muted-foreground">{app.job_title}</p>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {app.location && (
          <Badge>
            <MapPin className="h-3 w-3" />
            {app.location}
          </Badge>
        )}
        {package_ && <Badge tone="success">{package_}</Badge>}
        {isFollowupOverdue(app, today) && (
          <Badge tone="warning">
            <Bell className="h-3 w-3" />
            Follow up
          </Badge>
        )}
      </div>
      <div className="mt-1 flex justify-end">
        <MoveMenu app={app} today={today} />
      </div>
    </div>
  )
}

/** Kanban board: one column per status; drag a card to another column (or use its Move menu) to change status. */
export function Board({ apps, today, onOpen, onAdd }) {
  const [over, setOver] = useState(null)
  const [move] = useAction((app, s) => setApplicationStatus(app, s, today), { success: 'Status updated' })
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
      {JOB_STATUSES.map((s) => {
        const items = apps.filter((a) => a.status === s)
        return (
          <div
            key={s}
            data-testid={`col-${s}`}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(s)
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(null)
              const app = apps.find((a) => a.id === e.dataTransfer.getData('text/plain'))
              if (app && app.status !== s) move(app, s)
            }}
            className={cn(
              'w-64 shrink-0 snap-start rounded-lg border border-border bg-card/50 p-2 transition-colors',
              over === s && 'border-primary bg-primary/5',
            )}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <StatusBadge status={s} />
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((a) => (
                <AppCard key={a.id} app={a} today={today} onOpen={onOpen} />
              ))}
              {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Drop here</p>}
            </div>
            {(s === 'interested' || s === 'applied') && (
              <Button variant="ghost" size="sm" className="mt-2 w-full text-muted-foreground" onClick={() => onAdd(s)}>
                + Add
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
