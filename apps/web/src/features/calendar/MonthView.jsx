import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { itemsOnDate } from '@/domain/calendar'
import { fmtDay, weekday } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useDrag } from './dnd'
import { dayLabel } from './format'
import { ItemChip, ItemRow } from './Item'

const CHIP_PX = 22 // one chip, with its gap
const CELL_CHROME_PX = 34 // the date number row and the cell's padding
const MIN_ROW = 88
const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The month as a grid of days. Days are drop targets (data-drop="cell"): dropping an item on one changes its date and keeps its time. */
export function MonthView({ days, month, items, today, selected, prefs, onSelect, onOpenDay, onCreate, onOpen, onToggle, onKeyMove }) {
  const { state } = useDrag()
  const shown = prefs.show_weekends ? days : days.filter((d) => ![0, 6].includes(weekday(d)))
  const cols = prefs.show_weekends ? 7 : 5
  const byDay = useMemo(() => Object.fromEntries(days.map((d) => [d, itemsOnDate(items, d)])), [days, items])
  const over = state.active && state.over?.kind === 'cell' ? state.over.date : null
  const heads = shown.slice(0, cols).map((d) => NAMES[weekday(d)])

  // Weeks share the card's height when it allows, never getting shorter than MIN_ROW (then the grid scrolls). How many chips fit follows from
  // the row height, so a chip is never drawn over the next week: what does not fit becomes "+N more".
  const grid = useRef(null)
  const [rowPx, setRowPx] = useState(140)
  const weeks = shown.length / cols
  useLayoutEffect(() => {
    const el = grid.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const measure = () => setRowPx(Math.max(MIN_ROW, el.clientHeight / weeks))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [weeks])
  const capacity = Math.max(1, Math.min(4, Math.floor((rowPx - CELL_CHROME_PX) / CHIP_PX)))

  return (
    <div className="flex flex-col lg:min-h-0 lg:flex-1" role="grid" aria-label={fmtDay(`${month}-01`, 'MMMM yyyy')}>
      <div className="grid shrink-0 border-b border-border" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="row">
        {heads.map((h) => (
          <div
            key={h}
            role="columnheader"
            className="py-2 text-center text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            <span className="md:hidden">{h[0]}</span>
            <span className="hidden md:inline">{h}</span>
          </div>
        ))}
      </div>
      <div
        ref={grid}
        className="grid auto-rows-[3.75rem] md:auto-rows-[minmax(5.5rem,1fr)] lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        data-testid="month-grid"
      >
        {shown.map((d) => {
          const list = byDay[d]
          const isToday = d === today
          const inMonth = d.slice(0, 7) === month
          // When everything fits, show it all; otherwise leave room for the "+N more" line.
          const chips = list.length <= capacity ? list.length : capacity - 1
          const hidden = list.length - chips
          return (
            <div
              key={d}
              role="gridcell"
              data-drop="cell"
              data-date={d}
              data-testid={`cell-${d}`}
              aria-selected={d === selected}
              data-sound="select"
              onClick={() => onSelect(d)}
              onDoubleClick={() => onOpenDay(d)}
              className={cn(
                'group relative flex min-h-0 cursor-pointer flex-col gap-0.5 overflow-hidden border-b border-l border-border/60 p-1 transition-colors first:border-l-0 md:p-1.5',
                !inMonth && 'bg-muted/20 text-muted-foreground',
                isToday && 'bg-mod/[0.05]',
                d === selected && 'bg-mod/[0.09]',
                over === d && 'bg-mod/20 ring-2 ring-inset ring-mod',
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-semibold tabular-nums',
                    isToday ? 'bg-mod text-white' : d === selected ? 'bg-foreground/10' : '',
                    !inMonth && !isToday && 'font-medium opacity-60',
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                <button
                  type="button"
                  aria-label={`Add on ${fmtDay(d, 'd MMMM')}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onCreate({ date: d, allDay: true })
                  }}
                  className="hidden rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 md:block"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* desktop: chips */}
              <div className="hidden min-w-0 flex-1 flex-col gap-0.5 md:flex">
                {list.slice(0, chips).map((item) => (
                  <ItemChip
                    key={item.key}
                    item={item}
                    prefs={prefs}
                    onOpen={onOpen}
                    onToggle={onToggle}
                    onKeyMove={onKeyMove}
                    start={item.date === d}
                    end={item.endDate === d}
                  />
                ))}
                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect(d)
                    }}
                    className="rounded px-1.5 py-0.5 text-left text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`${hidden} more on ${fmtDay(d, 'd MMMM')}`}
                  >
                    +{hidden} more
                  </button>
                )}
              </div>
              {/* phone: dots, so the grid stays compact */}
              {list.length > 0 && (
                <div
                  className="flex flex-wrap items-center justify-center gap-0.5 md:hidden"
                  aria-label={`${list.length} item${list.length === 1 ? '' : 's'}`}
                >
                  {list.slice(0, 4).map((i) => (
                    <span key={i.key} className="h-1.5 w-1.5 rounded-full" style={{ background: i.color, opacity: i.done ? 0.4 : 1 }} />
                  ))}
                  {list.length > 4 && (
                    <span className="text-[9px] font-semibold leading-none text-muted-foreground">+{list.length - 4}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The detailed schedule of one day: the panel beside the month on a wide screen, and under it on a phone. */
export function DayPanel({ date, items, today, prefs, onOpen, onToggle, onCreate, onOpenDay }) {
  const list = itemsOnDate(items, date)
  const lane = list.filter((i) => i.allDay || i.untimed || i.kind === 'deadline')
  const timed = list.filter((i) => !lane.includes(i))
  return (
    <section aria-label={`Schedule for ${fmtDay(date, 'EEEE d MMMM')}`} data-testid="day-panel" className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{dayLabel(date, today)}</h3>
          <p className="text-xs text-muted-foreground">
            {fmtDay(date, 'EEEE d MMMM')} · {list.length === 0 ? 'nothing scheduled' : `${list.length} item${list.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => onOpenDay(date)}>
            Open day
          </Button>
          <Button size="sm" variant="outline" onClick={() => onCreate({ date, allDay: false })}>
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {list.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">A free day. Add something, or drag a task here.</p>
        ) : (
          [...lane, ...timed].map((item) => <ItemRow key={item.key} item={item} prefs={prefs} onOpen={onOpen} onToggle={onToggle} />)
        )}
      </div>
    </section>
  )
}
