import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useTable } from '@/hooks/store'
import { markAllRead, markNotificationRead } from '@/services/api'
import { unreadCount } from '@/domain/reminders'
import { useAction } from '@/hooks/useAction'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

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
        className="relative grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span
            className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white"
            data-testid="unread-count"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-card shadow-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-sm font-medium">Notifications</span>
            <button
              disabled={!unread}
              onClick={() => readAll()}
              className="text-xs text-secondary hover:underline disabled:opacity-40 disabled:no-underline"
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
                    className={cn('block px-3 py-2.5 hover:bg-muted/50', !n.read_at && 'bg-primary/5')}
                  >
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {!n.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="unread" />}
                      <span className="truncate">{n.title}</span>
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
        </div>
      )}
    </div>
  )
}
