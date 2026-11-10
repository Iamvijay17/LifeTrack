import { memo } from 'react'
import { Bell, CircleAlert, Link2, MapPin, Repeat } from 'lucide-react'
import { PRIORITY_META, categoryMeta } from '@/domain/calendar'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useDrag } from './dnd'
import { HOUR_PX, MIN_BLOCK_PX, clock, tint, timeText } from './format'

// The three shapes an item takes on the calendar: a block on the hour grid, a one-line chip (month cells, the all-day lane) and a row (lists).
// They share one look: the item's colour as a tinted fill and a solid edge, finished items faded and struck through, overdue ones outlined.

const KIND_LABEL = { task: 'Task', event: 'Event', interview: 'Interview', reminder: 'Reminder', deadline: 'Deadline' }

export const itemLabel = (item, prefs) =>
  `${KIND_LABEL[item.kind]}: ${item.title}, ${timeText(item, prefs)}${item.done ? ', done' : ''}${item.overdue ? ', overdue' : ''}${item.recurring ? ', repeats' : ''}`

/** A small round tick for tasks. It stops the press, so ticking never starts a drag or opens the item. */
export function TinyCheck({ item, onToggle, className }) {
  if (!item.completable) return null
  return (
    <button
      type="button"
      aria-label={item.done ? `Mark "${item.title}" as not done` : `Mark "${item.title}" as done`}
      aria-pressed={item.done}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(item)
      }}
      className={cn(
        'relative grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px] before:absolute before:-inset-2 before:content-[""]',
        className,
      )}
      style={{ borderColor: item.color, background: item.done ? item.color : 'transparent' }}
    >
      {item.done && (
        <svg
          viewBox="0 0 16 16"
          className="h-2.5 w-2.5"
          fill="none"
          stroke="white"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      )}
    </button>
  )
}

/** Small marks that say more about an item without a second line of text: repeats, linked, alerts, priority, overdue. */
export function Marks({ item, className }) {
  const urgent = item.priority === 'urgent' || item.priority === 'high'
  return (
    <span className={cn('flex shrink-0 items-center gap-1 text-current opacity-70', className)}>
      {item.overdue && <CircleAlert className="h-3 w-3 text-danger" aria-label="Overdue" />}
      {urgent && !item.done && (
        <span
          aria-label={`${PRIORITY_META[item.priority].label} priority`}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: PRIORITY_META[item.priority].color }}
        />
      )}
      {item.recurring && <Repeat className="h-3 w-3" aria-label="Repeats" />}
      {(item.row?.goal_id || item.row?.topic_id || item.row?.application_id || item.row?.routine_id) && (
        <Link2 className="h-3 w-3" aria-label="Linked" />
      )}
      {item.alertMinutes?.length > 0 && <Bell className="h-3 w-3" aria-label="Has alerts" />}
    </span>
  )
}

const frame = (item, { faded, selected } = {}) => ({
  background: tint(item.color, item.done ? 0.1 : 0.2),
  borderLeft: `3px solid ${item.color}`,
  opacity: faded ? 0.35 : item.done ? 0.62 : 1,
  boxShadow: item.overdue ? 'inset 0 0 0 1px rgb(var(--danger) / 0.55)' : selected ? `0 0 0 2px ${item.color}` : undefined,
})

/** Opens on click or Enter, and moves with Alt+arrows (a day or 15 minutes at a time) for people who can't drag. */
function useItemEvents(item, { onOpen, onKeyMove }) {
  const { startDrag, wasDrag } = useDrag()
  return {
    onClick: (e) => {
      e.stopPropagation()
      if (!wasDrag()) onOpen(item)
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        onOpen(item)
      } else if (e.altKey && onKeyMove && item.movable && e.key.startsWith('Arrow')) {
        e.preventDefault()
        e.stopPropagation()
        onKeyMove(item, e.key, e.shiftKey)
      }
    },
    startDrag,
  }
}

/** An item on the hour grid, positioned by its time. `layout` = { col, cols, span } from layoutSegments. */
export const ItemBlock = memo(function ItemBlock({ item, seg, layout, date, column, prefs, onOpen, onToggle, onKeyMove }) {
  const { state } = useDrag()
  const { onClick, onKeyDown, startDrag } = useItemEvents(item, { onOpen, onKeyMove })
  const top = (seg.startMin / 60) * HOUR_PX
  const height = Math.max(((seg.endMin - seg.startMin) / 60) * HOUR_PX - 2, MIN_BLOCK_PX)
  const carried = state.active && state.spec?.item?.key === item.key
  const roomy = height >= 44
  const startsHere = item.date === date
  const endsHere = item.endDate === date
  const grab = (e) => {
    if (!item.movable) return
    const box = e.currentTarget.getBoundingClientRect()
    const grabMin = Math.max(0, ((e.clientY - box.top) / HOUR_PX) * 60)
    startDrag(e, { mode: 'move', item, grabMin: item.date === date ? grabMin : 0 })
  }
  const grip = (edge) => (e) => {
    e.stopPropagation()
    startDrag(e, { mode: 'resize', item, edge, date, column: column.current })
  }
  return (
    <div
      role="button"
      tabIndex={0}
      data-cal-item={item.key}
      data-movable={item.movable}
      aria-label={itemLabel(item, prefs)}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onPointerDown={grab}
      className={cn(
        'cal-item group absolute overflow-hidden rounded-md px-1.5 py-1 text-left text-foreground outline-none transition-[box-shadow,opacity] focus-visible:ring-2 focus-visible:ring-primary/70',
        item.pending && 'cal-pending',
        !startsHere && 'rounded-t-none',
        !endsHere && 'rounded-b-none',
      )}
      style={{
        top,
        height,
        left: `calc(${(layout.col / layout.cols) * 100}% + 1px)`,
        width: `calc(${(layout.span / layout.cols) * 100}% - 3px)`,
        zIndex: carried ? 1 : 2 + layout.col,
        ...frame(item, { faded: carried }),
      }}
    >
      {item.resizable && startsHere && (
        <span
          className="cal-grip absolute inset-x-0 top-0 z-10 flex h-2.5 cursor-ns-resize items-start justify-center"
          onPointerDown={grip('start')}
        >
          <span className="mt-0.5 h-0.5 w-6 rounded-full bg-foreground" />
        </span>
      )}
      <div className="flex min-w-0 items-start gap-1">
        <TinyCheck item={item} onToggle={onToggle} className={roomy ? 'mt-px' : 'hidden'} />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-[12px] font-semibold leading-tight', item.done && 'line-through')}>{item.title}</p>
          {height >= 34 && <p className="truncate text-[11px] leading-tight text-muted-foreground">{timeText(item, prefs)}</p>}
          {height >= 58 && item.location && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] leading-tight text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{item.location}</span>
            </p>
          )}
        </div>
        {height >= 34 && <Marks item={item} className="mt-0.5" />}
      </div>
      {item.resizable && endsHere && (
        <span
          className="cal-grip absolute inset-x-0 bottom-0 z-10 flex h-3 cursor-ns-resize items-end justify-center"
          onPointerDown={grip('end')}
        >
          <span className="mb-0.5 h-0.5 w-6 rounded-full bg-foreground" />
        </span>
      )}
    </div>
  )
})

/** One line: a coloured edge, the time (if it has one) and the title. Used in month cells and the all-day lane. */
export const ItemChip = memo(function ItemChip({
  item,
  prefs,
  onOpen,
  onToggle,
  onKeyMove,
  showTime = true,
  start = true,
  end = true,
  className,
}) {
  const { state } = useDrag()
  const { onClick, onKeyDown, startDrag } = useItemEvents(item, { onOpen, onKeyMove })
  const carried = state.active && state.spec?.item?.key === item.key
  return (
    <div
      role="button"
      tabIndex={0}
      data-cal-item={item.key}
      data-movable={item.movable}
      aria-label={itemLabel(item, prefs)}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => item.movable && startDrag(e, { mode: 'move', item, grabMin: 0 })}
      className={cn(
        'cal-item flex min-w-0 items-center gap-1 px-1.5 py-[3px] text-[11.5px] leading-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/70',
        start ? 'rounded-l-md' : 'rounded-l-none',
        end ? 'rounded-r-md' : 'rounded-r-none',
        item.pending && 'cal-pending',
        className,
      )}
      style={frame(item, { faded: carried })}
    >
      <TinyCheck item={item} onToggle={onToggle} className="h-3.5 w-3.5" />
      {showTime && !item.allDay && !item.untimed && (
        <span className="hidden shrink-0 tabular-nums text-muted-foreground 2xl:inline">
          {clock(item.startMin, prefs).replace(':00', '')}
        </span>
      )}
      <span className={cn('min-w-0 flex-1 truncate font-medium', item.done && 'line-through')}>
        {start ? item.title : `${item.title} (cont.)`}
      </span>
      <Marks item={item} className="hidden xl:flex" />
    </div>
  )
})

/** A full row for lists (agenda, a day's schedule, search results). */
export const ItemRow = memo(function ItemRow({ item, prefs, onOpen, onToggle, withDate = false, className }) {
  const cat = categoryMeta(item.category)
  return (
    <div
      role="button"
      tabIndex={0}
      data-cal-item={item.key}
      aria-label={itemLabel(item, prefs)}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(item)
        }
      }}
      className={cn(
        'group flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary/70',
        item.pending && 'cal-pending',
        className,
      )}
    >
      <span aria-hidden className="h-9 w-1 shrink-0 rounded-full" style={{ background: item.color, opacity: item.done ? 0.4 : 1 }} />
      <div className={cn('w-[4.75rem] shrink-0 text-xs tabular-nums text-muted-foreground', item.overdue && 'text-danger')}>
        {item.allDay || item.untimed || item.kind === 'deadline' ? timeText(item, prefs) : clock(item.startMin, prefs)}
        {!item.allDay && !item.untimed && !item.point && item.kind !== 'deadline' && (
          <span className="block opacity-70">{clock(item.endMin === 1440 ? 0 : item.endMin, prefs)}</span>
        )}
      </div>
      <div className={cn('min-w-0 flex-1', item.done && 'opacity-60')}>
        <p className={cn('truncate text-sm font-medium', item.done && 'line-through')}>{item.title}</p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <span className="truncate">
            {item.kind === 'event' && item.category === 'custom' && item.categoryLabel ? item.categoryLabel : cat.short}
          </span>
          {item.location && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{item.location}</span>
            </>
          )}
          {withDate && (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0">{fmtDay(item.date, 'EEE d MMM')}</span>
            </>
          )}
        </p>
      </div>
      <Marks item={item} />
      <TinyCheck item={item} onToggle={onToggle} className="h-5 w-5" />
    </div>
  )
})
