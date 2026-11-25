import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { layoutSegments, segmentOn, splitDay } from '@/domain/calendar'
import { fmtDay, localDayMinutes } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useDrag } from './dnd'
import { HOUR_PX, clock, hourLabel, tint } from './format'
import { ItemBlock, ItemChip } from './Item'

const HOURS = Array.from({ length: 23 }, (_, i) => i + 1)

/**
 * The hour-by-hour grid behind the Day and Week views: one column per day, an all-day lane above it and the current time drawn across today.
 * Columns and the lane are drop targets (data-drop); the engine in dnd.jsx reads them, this component never handles a drag itself except
 * to start "drag out a new item" on empty space.
 */
export function TimeGrid({
  days,
  items,
  today,
  nowMs,
  tz,
  prefs,
  defaultDuration,
  scrollKey,
  onCreateAt,
  onOpen,
  onToggle,
  onKeyMove,
  onGoDay,
}) {
  const { state, startDrag, registerScroller, wasDrag } = useDrag()
  const scroller = useRef(null)
  const columns = useRef(new Map()) // date -> { current: element }, so an item can find its column when a resize starts
  const colRef = (d) => {
    if (!columns.current.has(d)) columns.current.set(d, { current: null })
    return columns.current.get(d)
  }

  const parts = useMemo(
    () =>
      days.map((d) => {
        const { lane, timed } = splitDay(items, d)
        return {
          date: d,
          lane,
          timed,
          layout: layoutSegments(timed.map((t) => ({ key: t.item.key, startMin: t.startMin, endMin: t.endMin }))),
        }
      }),
    [days, items],
  )
  const total = useMemo(() => parts.reduce((n, p) => n + p.lane.length + p.timed.length, 0), [parts])

  const setScroller = useCallback(
    (el) => {
      scroller.current = el
      registerScroller(el)
    },
    [registerScroller],
  )
  // Open on the part of the day that matters: a little before now when today is showing, otherwise the start of a working day.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const showsToday = days.includes(today)
    const min = showsToday ? Math.max(0, localDayMinutes(nowMs, tz).minutes - 90) : 7 * 60
    el.scrollTop = (min / 60) * HOUR_PX
    // Only when the page changes, never on the minute tick (which would yank the grid back while you scroll).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey])

  const nowMin = localDayMinutes(nowMs, tz).minutes
  const over = state.active ? state.over : null
  const spec = state.active ? state.spec : null
  const preview = spec?.mode === 'move' && over?.kind === 'grid' ? state.plan?.preview : null

  const slot = (e, date) => {
    if (e.target !== e.currentTarget || wasDrag()) return
    const minutes = ((e.clientY - e.currentTarget.getBoundingClientRect().top) / HOUR_PX) * 60
    const startMin = Math.min(Math.floor(minutes / 30) * 30, 1440 - 15)
    onCreateAt({ date, startMin, endMin: Math.min(1440, startMin + defaultDuration) })
  }
  const press = (e, date) => {
    if (e.target !== e.currentTarget) return
    const el = e.currentTarget
    const anchorMin = ((e.clientY - el.getBoundingClientRect().top) / HOUR_PX) * 60
    startDrag(e, { mode: 'create', date, column: el, anchorMin })
  }

  const cols = `grid grid-cols-[2.75rem_repeat(var(--n),minmax(0,1fr))] md:grid-cols-[3.5rem_repeat(var(--n),minmax(0,1fr))]`
  const nCols = { '--n': days.length }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* day headers */}
      <div className={cn(cols, 'shrink-0 border-b border-border')} style={nCols}>
        <div />
        {parts.map(({ date }) => {
          const isToday = date === today
          return (
            <button
              key={date}
              type="button"
              onClick={() => onGoDay(date)}
              aria-label={`Open ${fmtDay(date, 'EEEE d MMMM')}`}
              className="group flex flex-col items-center gap-0.5 border-l border-border/60 py-2 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/60"
            >
              <span
                className={cn('text-[10.5px] font-semibold uppercase tracking-wider', isToday ? 'text-mod-text' : 'text-muted-foreground')}
              >
                {fmtDay(date, 'EEE')}
              </span>
              <span
                className={cn(
                  'grid h-7 min-w-7 place-items-center rounded-full px-1 text-sm font-semibold tabular-nums transition-colors',
                  isToday ? 'bg-mod text-white' : 'group-hover:bg-muted',
                )}
              >
                {Number(date.slice(8))}
              </span>
            </button>
          )
        })}
      </div>

      {/* all-day lane */}
      <div className={cn(cols, 'shrink-0 border-b border-border')} style={nCols}>
        <div className="flex items-start justify-end px-1.5 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span className="hidden md:inline">All day</span>
          <span className="md:hidden">all</span>
        </div>
        {parts.map(({ date, lane }) => (
          <div
            key={date}
            data-drop="lane"
            data-date={date}
            className={cn(
              'min-h-8 space-y-0.5 border-l border-border/60 p-0.5 transition-colors',
              date === today && 'bg-mod/[0.05]',
              over?.kind === 'lane' && over.date === date && 'bg-mod/15 ring-1 ring-inset ring-mod/60',
            )}
          >
            {lane.map((item) => (
              <ItemChip
                key={item.key}
                item={item}
                prefs={prefs}
                onOpen={onOpen}
                onToggle={onToggle}
                onKeyMove={onKeyMove}
                start={item.date === date}
                end={item.endDate === date}
                showTime={false}
              />
            ))}
          </div>
        ))}
      </div>

      {/* hours */}
      <div ref={setScroller} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="calendar-scroller">
        <div className={cn(cols, 'relative')} style={{ ...nCols, height: HOUR_PX * 24 }}>
          <div className="relative" aria-hidden>
            {HOURS.map((h) => (
              <span
                key={h}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground md:right-2 md:text-[10.5px]"
                style={{ top: h * HOUR_PX }}
              >
                {hourLabel(h, prefs)}
              </span>
            ))}
          </div>
          {parts.map(({ date, timed, layout }) => (
            <div
              key={date}
              ref={(el) => {
                colRef(date).current = el
              }}
              data-drop="grid"
              data-date={date}
              data-testid={`day-${date}`}
              onClick={(e) => slot(e, date)}
              onPointerDown={(e) => press(e, date)}
              className={cn('cal-hours relative cursor-cell border-l border-border/60', date === today && 'bg-mod/[0.05]')}
              style={{ '--hour': `${HOUR_PX}px` }}
            >
              {timed.map(({ item, startMin, endMin }) => (
                <ItemBlock
                  key={item.key}
                  item={item}
                  seg={{ startMin, endMin }}
                  layout={layout.get(item.key)}
                  date={date}
                  column={colRef(date)}
                  prefs={prefs}
                  onOpen={onOpen}
                  onToggle={onToggle}
                  onKeyMove={onKeyMove}
                />
              ))}

              {/* where a dragged item would land */}
              {preview && preview.date <= date && preview.endDate >= date && (
                <DropGhost preview={preview} date={date} prefs={prefs} color={spec.item?.color ?? '#8B5CF6'} />
              )}
              {/* a new item being dragged out */}
              {spec?.mode === 'create' && over?.date === date && (
                <div
                  className="pointer-events-none absolute inset-x-0.5 z-[3] rounded-md border border-mod bg-mod/20 px-1.5 py-1 text-[11px] font-medium text-mod-text"
                  style={{ top: (over.startMin / 60) * HOUR_PX, height: ((over.endMin - over.startMin) / 60) * HOUR_PX - 2 }}
                >
                  {clock(over.startMin, prefs)} – {clock(over.endMin === 1440 ? 0 : over.endMin, prefs)}
                </div>
              )}

              {date === today && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-[4] flex items-center"
                  style={{ top: (nowMin / 60) * HOUR_PX }}
                  aria-label={`Now, ${clock(nowMin, prefs)}`}
                  data-testid="now-line"
                >
                  <span className="-ml-1 h-2 w-2 rounded-full bg-danger" />
                  <span className="h-px flex-1 bg-danger" />
                </div>
              )}
            </div>
          ))}
        </div>
        {total === 0 && (
          <p
            className="pointer-events-none absolute inset-x-0 top-1/3 px-6 text-center text-sm text-muted-foreground"
            data-testid="grid-empty"
          >
            Nothing scheduled here. Click a time to add something, or drag a task in from Unscheduled.
          </p>
        )}
      </div>
    </div>
  )
}

function DropGhost({ preview, date, prefs, color }) {
  const seg = segmentOn(preview, date)
  const c = color || '#8B5CF6'
  return (
    <div
      aria-hidden
      data-testid="drop-preview"
      className="pointer-events-none absolute inset-x-0.5 z-[3] rounded-md border border-dashed px-1.5 py-1 text-[11px] font-semibold"
      style={{
        top: (seg.startMin / 60) * HOUR_PX,
        height: Math.max(((seg.endMin - seg.startMin) / 60) * HOUR_PX - 2, 22),
        background: tint(c, 0.25),
        borderColor: c,
      }}
    >
      {preview.date === date && `${clock(preview.startMin, prefs)} – ${clock(preview.endMin === 1440 ? 0 : preview.endMin, prefs)}`}
    </div>
  )
}
