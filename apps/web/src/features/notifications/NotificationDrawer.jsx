import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import * as D from '@radix-ui/react-dialog'
import { BellOff, CheckCheck, Settings2, X } from 'lucide-react'
import { useDragControls } from 'motion/react'
import { categoryCounts, countUnread, filterNotifications, isSnoozed, sortNotifications } from '@lifetrack/core/notifications'
import { AnimatePresence, duration, ease, m, spring } from '@/components/motion/primitives'
import { EmptyState } from '@/components/shared/states'
import { Segmented } from '@/components/ui/misc'
import { useTable } from '@/hooks/store'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import { closeNotificationDrawer, useNotificationDrawerOpen } from './drawerState'
import { FilterBar } from './FilterBar'
import { NotificationList } from './NotificationList'
import { SnoozeDialog } from './SnoozeDialog'
import { useNotificationActions } from './useNotificationActions'
import { useNotificationSettings } from './useNotificationSettings'

const CLOSE_DRAG_PX = 110
const CLOSE_DRAG_SPEED = 600
const BLANK = { query: '', kind: 'all', priority: 'all', status: 'inbox', sort: 'newest' }

/**
 * The notification drawer: the whole inbox without leaving the page you are on. It slides in from the right on a computer and rises from the bottom
 * on a phone (drag the handle down to close). It is the same list the Notifications page shows, with the same actions, in a narrower column.
 */
export function NotificationDrawer() {
  const open = useNotificationDrawerOpen()
  const desktop = useIsDesktop()
  const drag = useDragControls()
  const { pathname } = useLocation()
  const { rows } = useTable('notifications')
  const { tz } = useNotificationSettings()
  const now = useNow(15_000, open)
  const actions = useNotificationActions()
  const [filter, setFilter] = useState(BLANK)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [pick, setPick] = useState(null) // the notification being given a custom snooze time

  // Start clean each time it opens, and close when you go somewhere.
  useEffect(() => {
    if (open) {
      setFilter(BLANK)
      setUnreadOnly(false)
    }
  }, [open])
  useEffect(() => closeNotificationDrawer(), [pathname])
  useEffect(() => closeNotificationDrawer, []) // signing out unmounts the shell: the drawer must not still be "open" for the next person

  const status = unreadOnly ? 'unread' : 'inbox'
  const items = useMemo(
    () => sortNotifications(filterNotifications(rows, { ...filter, status }, now), 'newest', now),
    [rows, filter, status, now],
  )
  const counts = useMemo(() => categoryCounts(rows, { ...filter, status }, now), [rows, filter, status, now])
  const unread = countUnread(rows, now)
  const snoozed = rows.filter((n) => isSnoozed(n, now)).length
  const filtered = filter.query || filter.kind !== 'all'
  const onOpen = (n) => {
    actions.read(n)
    closeNotificationDrawer()
  }

  return (
    <>
      {/* Not modal on purpose: a modal dialog makes everything behind it inert, which would also make the toast's Undo and View buttons unclickable while the drawer is open. */}
      <D.Root open={open} onOpenChange={(o) => !o && closeNotificationDrawer()} modal={false}>
        <AnimatePresence>
          {open && (
            <D.Portal forceMount>
              <m.div
                aria-hidden
                className="fixed inset-0 z-40 touch-none bg-black/55 md:backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: duration.fast } }}
                transition={{ duration: duration.base, ease: ease.out }}
              />
              <D.Content
                asChild
                forceMount
                aria-describedby={undefined}
                // The bell is not a Dialog.Trigger, so put focus back on it by hand when the drawer closes.
                onCloseAutoFocus={(e) => {
                  e.preventDefault()
                  document.querySelector('[data-notification-bell]')?.focus()
                }}
                // Pressing a toast (its Undo or View button) is not "clicking away".
                onInteractOutside={(e) => e.target instanceof Element && e.target.closest('[data-sonner-toaster]') && e.preventDefault()}
              >
                <m.aside
                  className={cn(
                    'fixed z-50 flex flex-col overflow-hidden border-border bg-card shadow-overlay outline-none',
                    desktop ? 'inset-y-0 right-0 w-full max-w-[27rem] border-l' : 'inset-x-0 bottom-0 h-[90dvh] rounded-t-2xl border-t',
                  )}
                  initial={desktop ? { x: '100%' } : { y: '100%' }}
                  animate={desktop ? { x: 0 } : { y: 0 }}
                  exit={
                    desktop
                      ? { x: '100%', transition: { duration: duration.base, ease: ease.in } }
                      : { y: '100%', transition: { duration: duration.base, ease: ease.in } }
                  }
                  transition={spring.soft}
                  drag={desktop ? false : 'y'}
                  dragControls={drag}
                  dragListener={false}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.8 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.y > CLOSE_DRAG_PX || info.velocity.y > CLOSE_DRAG_SPEED) closeNotificationDrawer()
                  }}
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_90%_at_50%_0%,rgb(var(--mod)/0.16),transparent)]"
                  />
                  {!desktop && (
                    <div
                      aria-hidden
                      className="relative flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5"
                      onPointerDown={(e) => drag.start(e)}
                    >
                      <span className="h-1 w-9 rounded-full bg-muted-foreground/35" />
                    </div>
                  )}
                  <header className="relative flex items-start justify-between gap-3 px-4 pb-3 pt-3 md:px-5 md:pt-5">
                    <div className="min-w-0">
                      <D.Title className="text-lg font-semibold tracking-tight">Notifications</D.Title>
                      <p className="mt-0.5 text-[13px] text-muted-foreground" aria-live="polite">
                        {unread ? `${unread} unread` : 'You’re all caught up'}
                        {snoozed ? ` · ${snoozed} snoozed` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        disabled={!unread}
                        onClick={() => actions.readAll()}
                        aria-label="Mark all as read"
                        title="Mark all as read"
                        className="lt-press grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                      >
                        <CheckCheck className="h-4 w-4" />
                      </button>
                      <Link
                        to="/notifications?tab=prefs"
                        aria-label="Notification preferences"
                        title="Preferences"
                        className="lt-press grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Settings2 className="h-4 w-4" />
                      </Link>
                      <D.Close
                        aria-label="Close notifications"
                        className="lt-press grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </D.Close>
                    </div>
                  </header>

                  <div className="relative space-y-3 border-b border-border px-4 pb-3 md:px-5">
                    <Segmented
                      value={unreadOnly ? 'unread' : 'all'}
                      onChange={(v) => setUnreadOnly(v === 'unread')}
                      options={[
                        { value: 'all', label: 'All' },
                        { value: 'unread', label: unread ? `Unread (${unread})` : 'Unread' },
                      ]}
                    />
                    <FilterBar value={filter} onChange={(patch) => setFilter((f) => ({ ...f, ...patch }))} counts={counts} compact />
                  </div>

                  <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 md:px-4">
                    {items.length === 0 ? (
                      <EmptyState
                        icon={BellOff}
                        title={filtered ? 'Nothing matches' : unreadOnly ? 'No unread notifications' : 'No notifications'}
                        description={
                          filtered
                            ? 'Try a different search or category.'
                            : 'Reminders, calendar alerts and nudges from your tasks, habits and bills show up here.'
                        }
                        className="py-10"
                      />
                    ) : (
                      <NotificationList
                        items={items}
                        now={now}
                        tz={tz}
                        compact
                        swipe={!desktop}
                        actions={actions}
                        onOpen={onOpen}
                        onPickTime={setPick}
                        resetKey={`${filter.query}|${filter.kind}|${status}`}
                      />
                    )}
                  </div>

                  <footer className="relative flex items-center justify-between gap-3 border-t border-border px-4 pb-safe-3 pt-3 md:px-5">
                    <Link to="/notifications" className="text-[13px] font-medium text-mod-text underline-offset-2 hover:underline">
                      Open Notification Center
                    </Link>
                    <Link
                      to="/notifications?tab=reminders&new=1"
                      className="text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      New reminder
                    </Link>
                  </footer>
                </m.aside>
              </D.Content>
            </D.Portal>
          )}
        </AnimatePresence>
      </D.Root>
      <SnoozeDialog
        open={!!pick}
        onOpenChange={(o) => !o && setPick(null)}
        title="Snooze until…"
        description={pick?.title}
        onConfirm={(ms) => actions.snooze(pick, ms)}
      />
    </>
  )
}
