import { useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { categoryCounts, filterNotifications, isDismissed, isSnoozed, sortNotifications } from '@lifetrack/core/notifications'
import { EmptyState } from '@/components/shared/states'
import { useConfirm } from '@/components/shared/Confirm'
import { Button } from '@/components/ui/button'
import { FilterBar } from './FilterBar'
import { NotificationList } from './NotificationList'

const BLANK = { query: '', kind: 'all', priority: 'all', status: 'all', sort: 'newest' }

/**
 * Every notification you have received that has not been deleted: read, unread, snoozed and dismissed. Search and filter it like the inbox.
 * A dismissed one can be restored to the inbox or deleted for good.
 */
export function HistoryTab({ rows, now, tz, actions, onOpen, onPickTime }) {
  const confirm = useConfirm()
  const [filter, setFilter] = useState(BLANK)
  const patch = (p) => setFilter((f) => ({ ...f, ...p }))
  const items = useMemo(() => sortNotifications(filterNotifications(rows, filter, now), filter.sort, now), [rows, filter, now])
  const counts = useMemo(() => categoryCounts(rows, filter, now), [rows, filter, now])
  const dismissed = rows.filter(isDismissed)
  const filtering = !!filter.query || filter.kind !== 'all' || filter.priority !== 'all' || filter.status !== 'all'

  const deleteDismissed = async () => {
    const ok = await confirm({
      title: `Delete ${dismissed.length} dismissed notification${dismissed.length === 1 ? '' : 's'}?`,
      description: 'They are removed for good. Anything still in your inbox is kept.',
      confirmLabel: 'Delete',
    })
    if (ok) actions.remove(dismissed)
  }

  if (!rows.length)
    return (
      <EmptyState
        icon={History}
        title="No history yet"
        description="Every notification you receive is kept here, so you can look back at what you were told and when."
      />
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {rows.length} notification{rows.length === 1 ? '' : 's'} · {dismissed.length} dismissed
        </p>
        <Button variant="ghost" size="sm" disabled={!dismissed.length} onClick={deleteDismissed}>
          Delete dismissed
        </Button>
      </div>
      <FilterBar value={filter} onChange={patch} counts={counts} showStatus />
      {items.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          description="Try a different search or filter."
          action={
            filtering ? (
              <Button variant="outline" size="sm" onClick={() => setFilter(BLANK)}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <NotificationList
          items={items}
          now={now}
          tz={tz}
          swipe={false}
          grouped={filter.sort === 'newest'}
          view={(n) => (isDismissed(n) ? 'history' : isSnoozed(n, now) ? 'snoozed' : 'inbox')}
          actions={actions}
          onOpen={onOpen}
          onPickTime={onPickTime}
          resetKey={`${filter.query}|${filter.kind}|${filter.priority}|${filter.status}|${filter.sort}`}
        />
      )}
    </div>
  )
}
