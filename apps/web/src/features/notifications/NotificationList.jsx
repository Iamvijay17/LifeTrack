import { groupByDay } from '@lifetrack/core/notifications'
import { AnimatePresence } from '@/components/motion/primitives'
import { ShowMore } from '@/components/shared/ShowMore'
import { useShowMore } from '@/hooks/useShowMore'
import { NotificationCard } from './NotificationCard'

/**
 * Notifications under Today / Yesterday / Earlier headings (or one plain list when `grouped` is false, e.g. sorted by priority), a page at a time.
 * `items` is already filtered and sorted. `resetKey` starts the paging over when the filters change.
 */
/** `view` is 'inbox' | 'history' | 'snoozed', or a function of the notification when one list mixes them (the History tab). */
export function NotificationList({
  items,
  now,
  tz,
  view = 'inbox',
  compact = false,
  swipe = false,
  grouped = true,
  actions,
  onOpen,
  onPickTime,
  resetKey = '',
}) {
  const page = useShowMore(items, compact ? 30 : 50, resetKey)
  const groups = grouped ? groupByDay(page.visible, { tz, nowMs: now }) : [{ key: 'all', label: '', items: page.visible }]
  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label || 'Notifications'}>
          {g.label && <h3 className="lt-eyebrow mb-2 px-1">{g.label}</h3>}
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {g.items.map((n) => (
                <NotificationCard
                  key={n.id}
                  n={n}
                  now={now}
                  tz={tz}
                  view={typeof view === 'function' ? view(n) : view}
                  compact={compact}
                  swipe={swipe}
                  actions={actions}
                  onOpen={onOpen}
                  onPickTime={onPickTime}
                />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}
      <ShowMore more={page.more} step={compact ? 30 : 50} onClick={page.showMore} className="pt-0" />
    </div>
  )
}
