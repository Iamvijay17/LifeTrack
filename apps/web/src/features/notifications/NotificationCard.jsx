import { memo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Check, Eye, EyeOff, Trash2, Undo2 } from 'lucide-react'
import { useMotionValue, useTransform } from 'motion/react'
import { categoryLabel, isMissed, isSnoozed, isUnread, normalizePriority, priorityLabel, safeLink } from '@lifetrack/core/notifications'
import { m, spring } from '@/components/motion/primitives'
import { Badge } from '@/components/ui/misc'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatWhen } from './notificationFormat'
import { categoryStyle, PRIORITY_STYLE } from './notificationTheme'
import { SnoozeMenu } from './SnoozeMenu'

const iconButton =
  'lt-press grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted'

/**
 * One notification. The same card serves the drawer (`compact`), the inbox and the history, so what a notification looks like and what you can do to
 * it never differ between them. `view` decides which actions make sense: an inbox card can be snoozed or dismissed, a history card restored or deleted.
 * On a phone a card can also be swiped right to dismiss; the buttons do the same, so nothing depends on the gesture.
 */
export const NotificationCard = memo(function NotificationCard({
  n,
  now,
  tz,
  view = 'inbox',
  compact = false,
  swipe = false,
  actions,
  onOpen,
  onPickTime,
}) {
  const unread = isUnread(n, now)
  const snoozed = isSnoozed(n, now)
  const priority = normalizePriority(n.priority)
  const style = categoryStyle(n.kind)
  const Icon = style.icon
  const pstyle = PRIORITY_STYLE[priority]
  const missed = isMissed(n)
  const dismissed = !!n.dismissed_at

  const x = useMotionValue(0)
  const hint = useTransform(x, [0, 110], [0, 1])

  return (
    <m.li
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 56, transition: { duration: 0.16 } }}
      transition={spring.soft}
      className="relative list-none"
      data-testid="notification"
      data-unread={unread || undefined}
    >
      <div className="relative overflow-hidden rounded-xl">
        {swipe && view === 'inbox' && (
          <m.div
            aria-hidden
            style={{ opacity: hint }}
            className="absolute inset-0 flex items-center gap-2 bg-success/15 pl-5 text-sm font-medium text-success"
          >
            <Check className="h-4 w-4" /> Dismiss
          </m.div>
        )}
        <m.div
          drag={swipe && view === 'inbox' ? 'x' : false}
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0, right: 0.6 }}
          style={{ x, touchAction: swipe ? 'pan-y' : undefined }}
          onDragEnd={(_, info) => {
            if (info.offset.x > 96 || info.velocity.x > 520) actions.dismiss(n)
          }}
          className={cn(
            'group relative flex gap-3 rounded-xl border bg-card transition-colors',
            compact ? 'p-3' : 'p-3.5 md:p-4',
            unread
              ? 'border-mod/30 bg-gradient-to-r from-mod/[0.09] via-card to-card shadow-card'
              : 'border-border hover:border-border/80 hover:bg-muted/20',
            (dismissed || snoozed) && 'opacity-80',
          )}
        >
          <span aria-hidden className={cn('absolute inset-y-3 left-0 w-[3px] rounded-r-full', pstyle.bar)} />
          <div className="relative mt-0.5 shrink-0">
            <span
              className={cn(
                'grid place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm',
                style.tile,
                compact ? 'h-8 w-8' : 'h-9 w-9',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            {unread && (
              <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5" aria-hidden>
                <span className="lt-pulse-ring absolute inset-0 rounded-full bg-mod" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-mod ring-2 ring-card" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p className={cn('text-sm leading-snug', unread ? 'font-semibold' : 'font-medium text-foreground/90')}>
                {unread && <span className="sr-only">Unread: </span>}
                {n.title}
              </p>
              <time
                dateTime={n.created_at}
                title={formatWhen(Date.parse(n.created_at), tz, now)}
                className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground"
              >
                {snoozed
                  ? `Returns ${formatWhen(Date.parse(n.snoozed_until), tz, now)}`
                  : relativeTime(n.snoozed_until && Date.parse(n.snoozed_until) <= now ? n.snoozed_until : n.created_at, now)}
              </time>
            </div>
            {n.body && (
              <p className={cn('mt-0.5 text-[13px] leading-relaxed text-muted-foreground', compact ? 'line-clamp-1' : 'line-clamp-2')}>
                {n.body}
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge>{categoryLabel(n.kind)}</Badge>
              {pstyle.show && <Badge tone={pstyle.tone}>{priorityLabel(priority)}</Badge>}
              {missed && <Badge tone="warning">Missed · was due {formatWhen(Date.parse(n.due_at), tz, now)}</Badge>}
              {snoozed && <Badge tone="primary">Snoozed</Badge>}
              {dismissed && <Badge>Dismissed</Badge>}

              {/* Always there on a phone; on a computer they appear when you point at or tab into the card. They share the badges' row, so they add no height. */}
              <div className="-my-1.5 ml-auto flex items-center gap-0.5 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                {n.link && view !== 'history' && (
                  <Link
                    to={safeLink(n.link)}
                    onClick={() => onOpen?.(n)}
                    className="inline-flex h-8 items-center gap-1 rounded-md bg-mod/15 px-2.5 text-xs font-medium text-mod-text transition-colors hover:bg-mod/25"
                    aria-label={`Open ${n.title}`}
                  >
                    Open <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                )}
                {view === 'inbox' && <SnoozeMenu title={n.title} onSnooze={(ms) => actions.snooze(n, ms)} onPick={() => onPickTime(n)} />}
                {view === 'inbox' && (
                  <button
                    type="button"
                    className={iconButton}
                    aria-label={`Dismiss ${n.title}`}
                    title="Dismiss"
                    onClick={() => actions.dismiss(n)}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
                {(view === 'history' || view === 'snoozed') && (
                  <button
                    type="button"
                    className={cn(iconButton, 'w-auto gap-1 px-2.5 text-xs font-medium')}
                    aria-label={`${snoozed ? 'Bring back' : 'Restore'} ${n.title}`}
                    onClick={() => actions.restore(n)}
                  >
                    <Undo2 className="h-3.5 w-3.5" aria-hidden /> {snoozed ? 'Bring back' : 'Restore'}
                  </button>
                )}
                {!dismissed && !snoozed && (
                  <button
                    type="button"
                    className={iconButton}
                    aria-label={n.read_at ? `Mark ${n.title} as unread` : `Mark ${n.title} as read`}
                    title={n.read_at ? 'Mark as unread' : 'Mark as read'}
                    onClick={() => (n.read_at ? actions.unread(n) : actions.read(n))}
                  >
                    {n.read_at ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )}
                {view === 'history' && (
                  <button
                    type="button"
                    className={cn(iconButton, 'hover:text-danger')}
                    aria-label={`Delete ${n.title}`}
                    title="Delete"
                    onClick={() => actions.remove([n])}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </m.div>
      </div>
    </m.li>
  )
})
