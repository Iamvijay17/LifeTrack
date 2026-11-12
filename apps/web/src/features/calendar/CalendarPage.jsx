import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useContextMenu, usePageContextMenu } from '@/components/context-menu'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState } from '@/components/shared/states'
import { Skeleton } from '@/components/ui/misc'
import { AnimatePresence, ease, m } from '@/components/motion/primitives'
import { useConfirm } from '@/components/shared/Confirm'
import { useTables } from '@/hooks/store'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useNow } from '@/hooks/useNow'
import { useToday } from '@/hooks/useToday'
import { toAppError } from '@/services/errors'
import { applyCalendarChange, deleteCalendarEvent, setTaskStatus } from '@/services/api'
import * as store from '@/hooks/store'
import { addDays } from '@/lib/dates'
import { cn } from '@/lib/utils'
import {
  agendaSections,
  applyPreview,
  buildCalendarItems,
  categoryOfTask,
  filterItems,
  overdueItems,
  planMove,
  planResize,
  planSchedule,
  unscheduledTasks,
} from '@/domain/calendar'
import { AgendaView, SearchResults } from './AgendaView'
import { DragProvider } from './dnd'
import { useCalendarPrefs } from './calendarPrefs'
import { VIEWS, clock, rangeTitle, stepDate, tint, viewRange } from './format'
import { ItemDetails } from './ItemDetails'
import { ItemDialog } from './ItemDialog'
import { calendarHit, calendarItemItems, calendarPageItems, calendarSlotItems } from './contextMenu'
import { DayPanel, MonthView } from './MonthView'
import { useScopePrompt } from './ScopePrompt'
import { SettingsDialog } from './SettingsDialog'
import { ShortcutsDialog } from './ShortcutsDialog'
import { TimeGrid } from './TimeGrid'
import { Toolbar } from './Toolbar'
import { UnscheduledTray } from './UnscheduledTray'
import { useCalendarFilters, useCalendarView } from './useCalendarState'
import './calendar.css'

const TABLES = [
  'tasks',
  'calendar_events',
  'calendar_event_exceptions',
  'interview_events',
  'job_applications',
  'reminders',
  'goals',
  'milestones',
  'recurring_rules',
  'learning_topics',
]
const AGENDA_DAYS = 30
const SEARCH_SPAN = 365
const KEY_STEP = 15

const taskAsItem = (t) => ({ kind: 'task', key: `task:${t.id}`, id: t.id, row: t, title: t.title, recurring: false })
const typing = (el) => !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
const sameSpot = (item, p) =>
  item.date === p.date &&
  item.endDate === p.endDate &&
  item.startMin === p.startMin &&
  item.endMin === p.endMin &&
  item.allDay === (p.allDay ?? item.allDay) &&
  !!item.untimed === !!(p.untimed ?? item.untimed)

function CalendarSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-3 p-3">
      <span className="sr-only">Loading your calendar…</span>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="ml-auto h-9 w-56" />
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const desktop = useIsDesktop()
  const confirm = useConfirm()
  const today = useToday()
  const nowMs = useNow(60_000)
  const { prefs, update } = useCalendarPrefs()
  const { data, loading, error, refetch } = useTables(...TABLES)
  const { view, date, go } = useCalendarView(prefs.view, today)
  const filters = useCalendarFilters()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(date)
  const [trayOpen, setTrayOpen] = useState(false)
  const [agendaDays, setAgendaDays] = useState(AGENDA_DAYS)
  const [form, setForm] = useState({ open: false, state: null })
  const [details, setDetails] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [pending, setPending] = useState({}) // item key -> the position it is being saved at (optimistic), until the save settles
  const searchRef = useRef(null)
  const [askScope, scopePrompt] = useScopePrompt()

  const tz = prefs.timezone
  const range = useMemo(() => viewRange(view, date, prefs.week_starts_on), [view, date, prefs.week_starts_on])
  const days = useMemo(
    () =>
      prefs.show_weekends || view === 'month'
        ? range.days
        : range.days.filter((d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())),
    [range.days, prefs.show_weekends, view],
  )
  const searching = query.trim().length > 0

  // Everything shown comes from one pass over your records, for the dates on screen only.
  const windowRange = useMemo(() => {
    if (searching) return { from: addDays(today, -SEARCH_SPAN), to: addDays(today, SEARCH_SPAN) }
    if (view === 'agenda') return { from: addDays(today, -14), to: addDays(today, agendaDays) }
    return { from: range.from, to: range.to }
  }, [searching, view, today, agendaDays, range.from, range.to])
  const source = useMemo(
    () => ({
      tasks: data.tasks,
      events: data.calendar_events,
      exceptions: data.calendar_event_exceptions,
      interviews: data.interview_events,
      applications: data.job_applications,
      reminders: data.reminders,
      goals: data.goals,
      milestones: data.milestones,
      recurringRules: data.recurring_rules,
      topics: data.learning_topics,
    }),
    [data],
  )
  const built = useMemo(() => buildCalendarItems(source, { ...windowRange, tz, today, nowMs }), [source, windowRange, tz, today, nowMs])
  const shown = useMemo(() => {
    const live = built.map((i) => (pending[i.key] ? applyPreview(i, pending[i.key]) : i))
    return filterItems(live, { ...filters.filters, query })
  }, [built, pending, filters.filters, query])
  const sections = useMemo(() => {
    if (view !== 'agenda' || searching) return null
    const overdue = filterItems(overdueItems(source, { tz, today, nowMs }), { ...filters.filters })
    return agendaSections(shown, { today, days: agendaDays, overdue, tasks: filterTasks(data.tasks, filters.filters) })
  }, [view, searching, shown, source, tz, today, nowMs, agendaDays, filters.filters, data.tasks])
  const tray = useMemo(() => filterTasks(unscheduledTasks(data.tasks), filters.filters), [data.tasks, filters.filters])

  const title = rangeTitle(view, date, range)
  const defaultDuration = prefs.default_duration

  // ------------------------------------------------------------------ navigation
  const setView = useCallback((next) => go({ view: next }), [go])
  const step = (dir) => {
    const next = stepDate(view, date, dir)
    go({ date: next })
    setSelected(next)
  }
  const toToday = () => {
    go({ date: today })
    setSelected(today)
  }
  const jump = (next) => {
    go({ date: next })
    setSelected(next)
  }
  const openDay = (d) => {
    go({ view: 'day', date: d })
    setSelected(d)
  }
  useEffect(() => setSelected(date), [date, view])

  // ------------------------------------------------------------------- opening things
  const create = useCallback((at = {}, kind = 'event') => setForm({ open: true, state: { kind, at } }), [])
  const open = useCallback((item) => setDetails(item), [])
  const edit = (item) => {
    setDetails(null)
    setForm({ open: true, state: { item } })
  }
  const editTask = (t) => setForm({ open: true, state: { item: taskAsItem(t) } })

  // ------------------------------------------------------------------- changes
  const guarded = useCallback(async (label, fn) => {
    try {
      return await fn()
    } catch (e) {
      toast.error(`${label}: ${toAppError(e).message}`)
      return undefined
    }
  }, [])

  const toggleDone = (item) => {
    if (!item.completable) return
    const done = item.row.status === 'done'
    setPending((p) => ({ ...p, [item.key]: { done: !done } }))
    return guarded('Could not update the task', () => setTaskStatus(item.row, done ? 'pending' : 'done', today)).finally(() =>
      setPending((p) => omit(p, item.key)),
    )
  }

  const remove = async (item) => {
    setDetails(null)
    setForm((f) => ({ ...f, open: false }))
    if (item.kind === 'event' && item.row.rrule) {
      const scope = await askScope('delete', { title: item.title })
      if (!scope) return
      await guarded('Could not delete', () => deleteCalendarEvent(item.row, { scope, occurrenceDate: item.occurrenceDate }))
      toast.success(
        scope === 'this' ? 'Event removed from this day' : scope === 'following' ? 'This and following events deleted' : 'Event deleted',
      )
      return
    }
    const ok = await confirm({
      title: `Delete “${item.title}”?`,
      description: item.kind === 'task' ? 'The task is removed from the Planner too.' : 'This cannot be undone.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    const done = await guarded('Could not delete', async () => {
      if (item.kind === 'event') await deleteCalendarEvent(item.row, { scope: 'all' })
      else await store.remove('tasks', item.id)
      return true
    })
    if (done) toast.success('Deleted')
  }

  /**
   * A drop, a resize or a keyboard move. The item is shown at its new place at once (`pending`); if saving fails it snaps back and says why.
   * A repeating event asks how far the change reaches first.
   */
  const commit = useCallback(
    async (item, planned) => {
      if (!planned || (item.key && sameSpot(item, planned.preview))) return
      let scope = 'all'
      if (planned.change.table === 'calendar_events' && item.row?.rrule) {
        scope = await askScope('move', { title: item.title })
        if (!scope) return
      }
      const key = item.key
      if (key) setPending((p) => ({ ...p, [key]: planned.preview }))
      try {
        await applyCalendarChange(planned.change, { scope })
        return true
      } catch (e) {
        toast.error(`Could not move it: ${toAppError(e).message}`)
        void refetch()
        return false
      } finally {
        if (key) setPending((p) => omit(p, key))
      }
    },
    [refetch, askScope],
  )

  const ctx = useMemo(() => ({ tz, defaultDuration }), [tz, defaultDuration])
  const plan = useCallback(
    (spec, over) => {
      if (spec.mode === 'resize') return planResize(spec.item, spec.edge, { date: over.date, minutes: over.minutes }, ctx)
      const target = { date: over.date, startMin: over.startMin }
      return spec.task ? planSchedule(spec.task, target, ctx) : planMove(spec.item, target, ctx)
    },
    [ctx],
  )
  const onCommit = useCallback(
    (spec, planned) => {
      if (spec.task)
        return void guarded('Could not schedule it', () => applyCalendarChange(planned.change)).then((r) => r && toast.success('Scheduled'))
      return commit(spec.item, planned)
    },
    [commit, guarded],
  )
  const renderGhost = (spec, planned) => {
    const it = spec.item ?? { title: spec.task.title, color: '#8B5CF6' }
    const p = planned?.preview
    return (
      <div
        className={cn('max-w-[16rem] rounded-md px-2 py-1 text-xs shadow-overlay', planned ? '' : 'opacity-60')}
        style={{ background: tint(it.color, 0.9), color: '#fff' }}
      >
        <p className="truncate font-semibold">{it.title}</p>
        <p className="opacity-90">
          {planned
            ? p.untimed || p.allDay
              ? 'All day'
              : `${clock(p.startMin, prefs)} – ${clock(p.endMin === 1440 ? 0 : p.endMin, prefs)}`
            : 'Drop on a day or time'}
        </p>
      </div>
    )
  }

  // Alt + arrow keys move the focused item without a mouse: a day sideways, 15 minutes up or down; with Shift, the end moves instead.
  const keyMove = useCallback(
    (item, key, shift) => {
      const dayDelta = { ArrowLeft: -1, ArrowRight: 1 }[key] ?? 0
      const minDelta = { ArrowUp: -KEY_STEP, ArrowDown: KEY_STEP }[key] ?? 0
      let planned
      if (shift && minDelta)
        planned = planResize(
          item,
          'end',
          { date: item.endDate, minutes: (item.endMin === 1440 && item.endDate !== item.date ? 1440 : item.endMin) + minDelta },
          ctx,
        )
      else if (dayDelta) planned = planMove(item, { date: addDays(item.date, dayDelta), startMin: 'keep' }, ctx)
      else if (minDelta && !item.allDay && !item.untimed)
        planned = planMove(item, { date: item.date, startMin: item.startMin + minDelta }, ctx)
      if (planned) void commit(item, planned)
    },
    [ctx, commit],
  )

  // ------------------------------------------------------------------- right-click
  // One region for the whole calendar: what is under the pointer (an item, or a day and time) decides the menu. Touch keeps its own press-and-drag.
  const menu = useContextMenu()
  const deps = {
    today,
    ctx,
    view,
    date,
    commit,
    edit,
    open,
    remove,
    toggleDone,
    navigate,
    create,
    openDay,
    toToday,
    refresh: () => refetch(),
  }
  const calendarMenu = ({ target, point }) => {
    const hit = calendarHit(target, point, shown)
    if (hit.item) return calendarItemItems(hit.item, deps)
    if (hit.slot) return calendarSlotItems(hit.slot, deps)
    return []
  }
  usePageContextMenu(() => calendarPageItems(deps))

  // ------------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || form.open || details || settingsOpen || helpOpen) return
      if (document.querySelector('[role="dialog"][data-state="open"]')) return
      const k = e.key
      const view_ = VIEWS.find((v) => v.key === k.toLowerCase() && !e.shiftKey)
      if (view_) return void (e.preventDefault(), setView(view_.value))
      if (k === 't') return void (e.preventDefault(), toToday())
      if ((k === 'j' || k === 'ArrowRight') && view !== 'agenda') return void (e.preventDefault(), step(1))
      if ((k === 'k' || k === 'ArrowLeft') && view !== 'agenda') return void (e.preventDefault(), step(-1))
      if (k === 'n' || k === 'c') return void (e.preventDefault(), create({ date: view === 'month' ? selected : date, allDay: false }))
      if (k === 'N') return void (e.preventDefault(), create({ date: view === 'month' ? selected : date, allDay: false }, 'task'))
      if (k === '/') return void (e.preventDefault(), searchRef.current?.focus())
      if (k === 'g') return void (e.preventDefault(), document.getElementById('cal-jump')?.click())
      if (k === '?') return void (e.preventDefault(), setHelpOpen(true))
      if (k === 'Escape' && query) return void setQuery('')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // --------------------------------------------------------------------- render
  const hasData = !loading
  const body = (() => {
    if (searching)
      return (
        <SearchResults
          query={query.trim()}
          items={shown}
          today={today}
          prefs={prefs}
          onOpen={open}
          onToggle={toggleDone}
          onClear={() => setQuery('')}
        />
      )
    if (view === 'agenda')
      return (
        <AgendaView
          sections={sections}
          today={today}
          prefs={prefs}
          days={agendaDays}
          onLoadMore={() => setAgendaDays((d) => d + 30)}
          onOpen={open}
          onToggle={toggleDone}
          onCreate={create}
          onEditTask={editTask}
        />
      )
    if (view === 'month')
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain lg:flex-row lg:overflow-visible">
          <div className="flex shrink-0 flex-col lg:min-h-0 lg:flex-1 lg:shrink">
            <MonthView
              days={range.days}
              month={date.slice(0, 7)}
              items={shown}
              today={today}
              selected={selected}
              prefs={prefs}
              onSelect={setSelected}
              onOpenDay={openDay}
              onCreate={create}
              onOpen={open}
              onToggle={toggleDone}
              onKeyMove={keyMove}
            />
          </div>
          <div className="shrink-0 border-t border-border lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
            <DayPanel
              date={selected}
              items={shown}
              today={today}
              prefs={prefs}
              onOpen={open}
              onToggle={toggleDone}
              onCreate={create}
              onOpenDay={openDay}
            />
          </div>
        </div>
      )
    return (
      <TimeGrid
        days={days}
        items={shown}
        today={today}
        nowMs={nowMs}
        tz={tz}
        prefs={prefs}
        defaultDuration={defaultDuration}
        scrollKey={`${view}|${date}`}
        onCreateAt={(at) => create(at)}
        onOpen={open}
        onToggle={toggleDone}
        onKeyMove={keyMove}
        onGoDay={openDay}
      />
    )
  })()

  const direction = useRef(1)
  const lastKey = useRef(`${view}|${date}`)
  const key = `${searching ? 'search' : view}|${view === 'month' ? date.slice(0, 7) : view === 'week' ? range.from : date}`
  if (key !== lastKey.current) {
    direction.current = key > lastKey.current ? 1 : -1
    lastKey.current = key
  }

  return (
    <>
      <PageHeader title="Calendar" description={desktop ? 'Tasks, events, interviews, reminders and deadlines in one place.' : undefined} />
      <DragProvider
        plan={plan}
        onCommit={onCommit}
        onCreate={(range_) => create({ date: range_.date, startMin: range_.startMin, endMin: range_.endMin })}
        renderGhost={renderGhost}
      >
        <div
          className="lt-card flex h-[calc(100dvh-13rem)] min-h-[30rem] flex-col overflow-hidden p-0 md:h-[calc(100dvh-16rem)]"
          data-testid="calendar"
          {...menu.bind(calendarMenu, { label: 'Calendar actions', longPress: false })}
        >
          <Toolbar
            view={view}
            date={date}
            title={searching ? 'Search' : title}
            today={today}
            query={query}
            searchRef={searchRef}
            filters={filters}
            trayCount={tray.length}
            trayOpen={trayOpen}
            hideNav={view === 'agenda' || searching}
            onView={setView}
            onStep={step}
            onToday={toToday}
            onJump={jump}
            onQuery={setQuery}
            onToggleTray={() => setTrayOpen((o) => !o)}
            onSettings={() => setSettingsOpen(true)}
            onShortcuts={() => setHelpOpen(true)}
            onCreate={() => create({ date: view === 'month' ? selected : date, allDay: false })}
          />
          {trayOpen && (
            <div className="border-b border-border bg-muted/20 px-3 py-2" data-testid="tray-panel">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Unscheduled tasks · drag onto a day or time
              </p>
              <UnscheduledTray tasks={tray} layout="strip" onEdit={editTask} />
            </div>
          )}
          {error ? (
            <div className="p-4">
              <ErrorState message={error} onRetry={refetch} />
            </div>
          ) : !hasData ? (
            <CalendarSkeleton />
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={key}
                className="flex min-h-0 flex-1 flex-col"
                initial={{ opacity: 0, x: 18 * direction.current }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={{ duration: 0.18, ease: ease.out }}
              >
                {body}
              </m.div>
            </AnimatePresence>
          )}
        </div>
      </DragProvider>

      <ItemDetails
        item={details}
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        prefs={prefs}
        onEdit={edit}
        onDelete={remove}
        onToggle={(i) => void toggleDone(i)?.then(() => setDetails(null))}
        onNavigate={(to) => navigate(to)}
      />
      <ItemDialog
        open={form.open}
        onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))}
        state={form.state}
        prefs={prefs}
        today={today}
        askScope={askScope}
        onDelete={remove}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} prefs={prefs} update={update} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      {scopePrompt}
    </>
  )
}

const omit = (obj, key) => {
  const { [key]: _gone, ...rest } = obj
  return rest
}
/** The tray follows the same filters as the grid (hidden categories, priority). */
const filterTasks = (tasks, f) =>
  tasks.filter((t) => (f.priorities.length ? f.priorities.includes(t.priority) : true) && !f.hiddenCategories.includes(categoryOfTask(t)))
