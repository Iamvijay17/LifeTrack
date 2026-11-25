import { CalendarDays, Repeat, SearchX } from 'lucide-react'
import { PRIORITY_META, describeRule } from '@/domain/calendar'
import { RECURRENCES } from '@/domain/recurrence'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/states'
import { dayLabel, isRelativeLabel } from './format'
import { ItemRow } from './Item'

function Section({ id, title, count, tone, children, hint }) {
  if (!count) return null
  return (
    <section id={`agenda-${id}`} aria-labelledby={`agenda-${id}-h`} className="scroll-mt-4">
      <div className="mb-1 flex items-baseline gap-2 px-2.5">
        <h3
          id={`agenda-${id}-h`}
          className={cn('text-[11px] font-semibold uppercase tracking-wider', tone === 'danger' ? 'text-danger' : 'text-muted-foreground')}
        >
          {title}
        </h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
        {hint && <span className="hidden text-[11px] text-muted-foreground sm:inline">· {hint}</span>}
      </div>
      <div className="space-y-0.5">{children}</div>
    </section>
  )
}

/** A task with no date yet. It has no place on the calendar until it is scheduled, here or by dragging it in. */
function PendingRow({ task, onEdit }) {
  const pr = PRIORITY_META[task.priority]
  return (
    <button
      type="button"
      onClick={() => onEdit(task)}
      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-muted/60"
    >
      <span aria-hidden className="h-9 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{task.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{task.category}</span>
      </span>
      {pr && task.priority !== 'medium' && <Badge tone={task.priority === 'low' ? 'neutral' : 'warning'}>{pr.label}</Badge>}
      <span className="text-xs font-medium text-mod-text">Schedule</span>
    </button>
  )
}

const repeatText = (item) =>
  item.kind === 'event'
    ? describeRule(item.row.rrule, item.occurrenceDate ?? item.date, (d) => fmtDay(d, 'd MMM yyyy'))
    : (RECURRENCES.find((r) => r.value === item.row?.recurrence)?.label ?? 'Repeats')

/**
 * Everything coming up, in the order you would do it: overdue first, then today, then each upcoming day, then what has no date, what repeats, and
 * what is done. `sections` comes from agendaSections() in core.
 */
export function AgendaView({ sections, today, prefs, days, onLoadMore, onOpen, onToggle, onCreate, onEditTask }) {
  const { overdue, today: now, upcoming, pending, recurring, completed } = sections
  const empty = !overdue.length && !now.length && !upcoming.length && !pending.length && !recurring.length && !completed.length
  const nav = [
    ['overdue', 'Overdue', overdue.length, 'danger'],
    ['today', 'Today', now.length],
    ['upcoming', 'Upcoming', upcoming.reduce((n, g) => n + g.items.length, 0)],
    ['pending', 'No date', pending.length],
    ['recurring', 'Repeating', recurring.length],
    ['completed', 'Done', completed.length],
  ].filter(([, , n]) => n)

  if (empty)
    return (
      <div className="p-4">
        <EmptyState
          icon={CalendarDays}
          title="Your agenda is clear"
          description="Nothing is scheduled, overdue or waiting. Add an event or a task and it will show up here."
          action={
            <Button size="sm" onClick={() => onCreate({})}>
              Add something
            </Button>
          }
        />
      </div>
    )

  const jump = (id) => document.getElementById(`agenda-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="agenda">
      <nav
        aria-label="Agenda sections"
        className="scrollbar-none sticky top-0 z-10 flex gap-1.5 overflow-x-auto border-b border-border bg-card/95 px-3 py-2 backdrop-blur"
      >
        {nav.map(([id, label, n, tone]) => (
          <button
            key={id}
            type="button"
            onClick={() => jump(id)}
            className={cn(
              'lt-press shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted',
              tone === 'danger' && 'border-danger/40 text-danger',
            )}
          >
            {label} <span className="tabular-nums opacity-70">{n}</span>
          </button>
        ))}
      </nav>
      <div className="space-y-5 p-2 pb-6 md:p-3">
        <Section id="overdue" title="Overdue" tone="danger" count={overdue.length}>
          {overdue.map((i) => (
            <ItemRow key={i.key} item={i} prefs={prefs} onOpen={onOpen} onToggle={onToggle} withDate />
          ))}
        </Section>
        <Section id="today" title="Today" count={now.length} hint={fmtDay(today, 'EEEE d MMMM')}>
          {now.map((i) => (
            <ItemRow key={i.key} item={i} prefs={prefs} onOpen={onOpen} onToggle={onToggle} />
          ))}
        </Section>
        {upcoming.length > 0 && (
          <section id="agenda-upcoming" aria-label="Upcoming" className="scroll-mt-4 space-y-3">
            {upcoming.map((g) => (
              <div key={g.date}>
                <h3 className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {dayLabel(g.date, today)}
                  {isRelativeLabel(dayLabel(g.date, today)) && (
                    <span className="font-normal normal-case tracking-normal"> · {fmtDay(g.date, 'd MMM')}</span>
                  )}
                </h3>
                <div className="space-y-0.5">
                  {g.items.map((i) => (
                    <ItemRow key={i.key} item={i} prefs={prefs} onOpen={onOpen} onToggle={onToggle} />
                  ))}
                </div>
              </div>
            ))}
            <div className="px-2.5">
              <Button variant="outline" size="sm" onClick={onLoadMore}>
                Show the next 30 days
              </Button>
              <span className="ml-2 text-xs text-muted-foreground">Showing the next {days} days</span>
            </div>
          </section>
        )}
        <Section id="pending" title="No date yet" count={pending.length} hint="drag onto the calendar, or press Schedule">
          {pending.map((t) => (
            <PendingRow key={t.id} task={t} onEdit={onEditTask} />
          ))}
        </Section>
        <Section id="recurring" title="Repeating" count={recurring.length} hint="next time each one comes round">
          {recurring.map((i) => (
            <div key={i.key}>
              <ItemRow item={i} prefs={prefs} onOpen={onOpen} onToggle={onToggle} withDate />
              <p className="-mt-1 mb-1 flex items-center gap-1 pl-[5.5rem] text-[11px] text-muted-foreground">
                <Repeat className="h-3 w-3" aria-hidden />
                {repeatText(i)}
              </p>
            </div>
          ))}
        </Section>
        <Section id="completed" title="Done" count={completed.length} hint="the last two weeks">
          {completed.map((i) => (
            <ItemRow key={i.key} item={i} prefs={prefs} onOpen={onOpen} onToggle={onToggle} withDate />
          ))}
        </Section>
      </div>
    </div>
  )
}

/** Matches for the search box, across a year either side of today, grouped by day. */
export function SearchResults({ query, items, today, prefs, onOpen, onToggle, onClear }) {
  const groups = []
  for (const i of items) {
    const last = groups.at(-1)
    if (last?.date === i.date) last.items.push(i)
    else groups.push({ date: i.date, items: [i] })
  }
  if (!items.length)
    return (
      <div className="p-4">
        <EmptyState
          icon={SearchX}
          title={`No matches for “${query}”`}
          description="Search looks at titles, notes, places and categories for a year either side of today. Check the filters if you expected a result."
          action={
            <Button size="sm" variant="outline" onClick={onClear}>
              Clear search
            </Button>
          }
        />
      </div>
    )
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 md:p-3" data-testid="search-results">
      <p className="mb-3 px-2.5 text-xs text-muted-foreground" role="status">
        {items.length} match{items.length === 1 ? '' : 'es'} for “{query}”
      </p>
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.date}>
            <h3 className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {dayLabel(g.date, today)}
              {isRelativeLabel(dayLabel(g.date, today)) ? (
                <span className="font-normal normal-case tracking-normal"> · {fmtDay(g.date, 'd MMM yyyy')}</span>
              ) : (
                <span className="font-normal normal-case tracking-normal"> · {fmtDay(g.date, 'yyyy')}</span>
              )}
            </h3>
            {g.items.map((i) => (
              <ItemRow key={i.key} item={i} prefs={prefs} onOpen={onOpen} onToggle={onToggle} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
