import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { countUnread } from '@lifetrack/core/notifications'
import { AnimatePresence, m, spring } from '@/components/motion/primitives'
import { NotificationDrawer } from '@/features/notifications/NotificationDrawer'
import { toggleNotificationDrawer, useNotificationDrawerOpen } from '@/features/notifications/drawerState'
import { useTable } from '@/hooks/store'
import { useNow } from '@/hooks/useNow'

/** The bell in the header: opens the notification drawer, shows how many you haven't seen, and rings when a new one arrives. */
export function NotificationBell() {
  const { rows } = useTable('notifications')
  const open = useNotificationDrawerOpen()
  const now = useNow(15_000) // a snoozed notification comes back on its own, so the count has to be re-read
  const unread = countUnread(rows, now)
  const before = useRef(unread)
  const [rings, setRings] = useState(0)
  useEffect(() => {
    if (unread > before.current) setRings((r) => r + 1)
    before.current = unread
  }, [unread])
  return (
    <>
      <button
        type="button"
        data-notification-bell
        onClick={toggleNotificationDrawer}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="lt-press group relative grid h-10 w-10 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground md:h-9 md:w-9"
      >
        <m.span
          key={rings}
          className="origin-top"
          animate={rings ? { rotate: [0, -16, 14, -10, 6, 0] } : undefined}
          transition={{ duration: 0.7 }}
        >
          <Bell className="h-4 w-4 transition-transform duration-200 group-hover:rotate-12" />
        </m.span>
        <AnimatePresence>
          {unread > 0 && (
            <m.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={spring.bouncy}
              className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-gradient-to-b from-[#8B5CF6] to-[#6D28D9] px-1 text-[10px] font-semibold text-white ring-2 ring-background"
              data-testid="unread-count"
            >
              {unread > 9 ? '9+' : unread}
            </m.span>
          )}
        </AnimatePresence>
      </button>
      <NotificationDrawer />
    </>
  )
}
