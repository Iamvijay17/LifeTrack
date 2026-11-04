import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { AnimatePresence, ease, m, spring } from '@/components/motion/primitives'
import { useTable } from '@/hooks/store'
import { markAllRead, markNotificationRead } from '@/services/api'
import { unreadCount } from '@lifetrack/core/reminders'
import { useAction } from '@/hooks/useAction'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/lib/format'

export function NotificationBell() {
  const { rows } = useTable('notifications')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const [readAll] = useAction(markAllRead)
  const [read] = useAction(markNotificationRead)
  useEffect(() => {
    if (!open) return
    const off = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', off)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', off)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const unread = unreadCount(rows)
  const latest = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6)
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
        className="lt-press group relative grid h-10 w-10 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground md:h-9 md:w-9"
      >
        <Bell className="h-4 w-4 origin-top transition-transform duration-200 group-hover:rotate-12" />
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
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18, ease: ease.out }}
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-overlay max-md:fixed max-md:inset-x-4 max-md:top-14 max-md:w-auto max-md:max-w-none"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <span className="text-sm font-semibold tracking-tight">Notifications</span>
              <button
                disabled={!unread}
                onClick={() => readAll()}
                className="text-xs text-secondary underline underline-offset-2 disabled:opacity-40 disabled:no-underline"
              >
                Mark all read
              </button>
            </div>
            {latest.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
            ) : (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {latest.map((n) => (
                  <li key={n.id}>
                    <Link
                      to={n.link || '/notifications'}
                      onClick={() => {
                        read(n)
                        setOpen(false)
                      }}
                      className={cn('block px-3 py-2.5 transition-colors hover:bg-muted/50', !n.read_at && 'bg-primary/5')}
                    >
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {!n.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />}
                        <span className="truncate">
                          {!n.read_at && <span className="sr-only">Unread: </span>}
                          {n.title}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">{relativeTime(n.created_at)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-border px-3 py-2 text-center text-xs text-secondary hover:bg-muted/50"
            >
              Open notification centre
            </Link>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
