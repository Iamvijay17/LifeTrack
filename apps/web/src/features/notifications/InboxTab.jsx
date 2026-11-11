import { useMemo, useState } from 'react'
import { Bell, BellOff, CheckCheck, ChevronDown, Inbox } from 'lucide-react'
import { categoryCounts, countUnread, filterNotifications, inInbox, isSnoozed, sortNotifications } from '@lifetrack/core/notifications'
import { AnimatePresence, m } from '@/components/motion/primitives'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FilterBar } from './FilterBar'
import { NotificationList } from './NotificationList'

const BLANK = { query: '', kind: 'all', priority: 'all', status: 'inbox', sort: 'newest' }

/**
 * What needs your attention: everything that is not dismissed and not snoozed. `rows` is every notification; the tab narrows it itself so the
 * counts on the category chips stay right while you search. Snoozed ones wait in a section underneath and can be brought back early.
 */
export function InboxTab({ rows, now, tz, swipe, actions, onOpen, onPickTime, onCreateReminder }) {
  const [filter, setFilter] = useState(BLANK)
  const [showSnoozed, setShowSnoozed] = useState(false)
  const patch = (p) => setFilter((f) => ({ ...f, ...p }))

  const view = { ...filter, status: 'inbox' }
  const items = useMemo(() => sortNotifications(filterNotifications(rows, view, now), filter.sort, now), [rows, filter, now]) // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => categoryCounts(rows, view, now), [rows, filter, now]) // eslint-disable-line react-hooks/exhaustive-deps
  const snoozed = useMemo(
    () =>
      sortNotifications(
        rows.filter((n) => isSnoozed(n, now)),
        'newest',
        now,
      ).reverse(),
    [rows, now],
  )
  const inbox = rows.filter((n) => inInbox(n, now))
  const unread = countUnread(rows, now)
  const read = inbox.filter((n) => n.read_at)
  const filtering = !!filter.query || filter.kind !== 'all' || filter.priority !== 'all'

  if (!rows.length)
    return (
      <EmptyState
        icon={Bell}
        title="No notifications"
        description="Reminders you set, calendar alerts, and nudges from your tasks, habits and bills show up here."
        action={
          <Button size="sm" onClick={onCreateReminder}>
            Set a reminder
          </Button>
        }
      />
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {unread ? (
            <>
              <span className="font-semibold text-foreground">{unread}</span> unread
            </>
          ) : (
            'You’re all caught up'
          )}
          {snoozed.length > 0 && ` · ${snoozed.length} snoozed`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!unread} onClick={() => actions.readAll()}>
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!read.length}
            onClick={() => actions.dismissAll(read, 'Read notifications dismissed')}
          >
            Dismiss read
          </Button>
        </div>
      </div>

      <FilterBar value={filter} onChange={patch} counts={counts} />

      {items.length === 0 ? (
        <EmptyState
          icon={filtering ? BellOff : Inbox}
          title={filtering ? 'Nothing matches' : 'Inbox zero'}
          description={
            filtering
              ? 'Try a different search, category or priority.'
              : 'Everything has been dealt with. Dismissed notifications are kept in History.'
          }
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
          swipe={swipe}
          grouped={filter.sort === 'newest'}
          actions={actions}
          onOpen={onOpen}
          onPickTime={onPickTime}
          resetKey={`${filter.query}|${filter.kind}|${filter.priority}|${filter.sort}`}
        />
      )}

      {snoozed.length > 0 && (
        <section className="pt-2">
          <button
            type="button"
            aria-expanded={showSnoozed}
            onClick={() => setShowSnoozed((s) => !s)}
            className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>Snoozed ({snoozed.length})</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', showSnoozed && 'rotate-180')} aria-hidden />
          </button>
          <AnimatePresence initial={false}>
            {showSnoozed && (
              <m.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-1">
                  <NotificationList
                    items={snoozed}
                    now={now}
                    tz={tz}
                    view="snoozed"
                    grouped={false}
                    actions={actions}
                    onOpen={onOpen}
                    onPickTime={onPickTime}
                  />
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </section>
      )}
    </div>
  )
}
