import { Bell, CheckCheck, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/shared/states'
import { useConfirm } from '@/components/shared/Confirm'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/misc'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

function NotificationRow({ n, onRead, onDelete }) {
  return (
    <li className={cn('flex items-start gap-3 px-4 py-3', !n.read_at && 'bg-primary/5')}>
      <span
        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-primary')}
        aria-label={n.read_at ? 'read' : 'unread'}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{n.title}</p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <Badge>{n.kind}</Badge>
          {relativeTime(n.created_at)}
          {n.link && (
            <Link to={n.link} onClick={() => onRead(n)} className="text-secondary hover:underline">
              Open
            </Link>
          )}
        </p>
      </div>
      {!n.read_at && (
        <Button variant="ghost" size="sm" onClick={() => onRead(n)}>
          Mark read
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" aria-label="Delete notification" onClick={() => onDelete(n.id)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  )
}

/** `inbox` is notifications, newest first. */
export function InboxTab({ inbox, unread, readingAll, onRead, onReadAll, onDelete, onClearRead, onCreateReminder }) {
  const confirm = useConfirm()
  const askClear = async () => {
    if (await confirm({ title: 'Clear read notifications?', description: 'Unread ones are kept.', confirmLabel: 'Clear' })) onClearRead()
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={!unread} loading={readingAll} onClick={onReadAll}>
          <CheckCheck className="h-4 w-4" />
          Mark all read
        </Button>
        <Button variant="ghost" size="sm" disabled={!inbox.some((n) => n.read_at)} onClick={askClear}>
          Clear read
        </Button>
      </div>
      {inbox.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="Create a reminder and it will show up here when it is due."
          action={
            <Button size="sm" onClick={onCreateReminder}>
              Set a reminder
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {inbox.map((n) => (
              <NotificationRow key={n.id} n={n} onRead={onRead} onDelete={onDelete} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
