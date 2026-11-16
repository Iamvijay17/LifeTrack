import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, CalendarClock, NotebookPen, PiggyBank, Receipt, Timer } from 'lucide-react'
import { Card, CardContent, CardHeader, CardLink, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { MonthCalendar } from '@/components/shared/MonthCalendar'
import { notePreview } from '@/domain/notes'
import { useTable } from '@/hooks/store'
import { budgetTone, signFor } from '@lifetrack/core/finance'
import { fmtDateTime, fmtDay, monthStart } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { WidgetEmpty } from './parts'

// The dashboard cards that have no module page card of their own. Each reads rows the page has already loaded (or, for notes, the same store
// the Notes page reads), so none of them fetches anything extra, and every figure can be traced to a real record.

/** Study and focus minutes today against the daily target, with a shortcut to the timer. `minutes` is worked out by the page. */
export function FocusCard({ minutes, targetMinutes, running, className }) {
  const pct = targetMinutes > 0 ? Math.min(100, (minutes / targetMinutes) * 100) : null
  return (
    <Card data-module="learning" data-testid="focus-card" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-mod-text" aria-hidden />
          Focus timer
        </CardTitle>
        <CardLink to="/focus">Focus</CardLink>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="lt-stat-value text-[1.75rem] leading-tight">{minutes} min</span>
          <span className="text-xs text-muted-foreground">{targetMinutes > 0 ? `of ${targetMinutes} min today` : 'focused today'}</span>
        </div>
        {pct != null && <Progress value={pct} label="Focus time today" />}
        <Link
          to="/focus"
          className="flex min-h-10 items-center justify-center rounded-lg border border-border bg-surface-2/40 px-3 text-sm font-medium transition-colors hover:bg-muted/40"
        >
          {running ? 'A session is running. Open it' : 'Start a focus session'}
        </Link>
      </CardContent>
    </Card>
  )
}

/** The latest notes (pinned first). Reads the Notes table itself; a locked Notes module never reaches here (the page shows a locked card). */
export function NotesCard({ count = 4, className }) {
  const { rows, loading } = useTable('notes')
  const shown = useMemo(
    () =>
      [...rows]
        .sort(
          (a, b) =>
            Number(!!b.pinned) - Number(!!a.pinned) ||
            String(b.updated_at ?? b.created_at ?? '').localeCompare(String(a.updated_at ?? a.created_at ?? '')),
        )
        .slice(0, count),
    [rows, count],
  )
  return (
    <Card data-module="notes" data-testid="notes-card" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <NotebookPen className="h-4 w-4 text-mod-text" aria-hidden />
          Quick notes
        </CardTitle>
        <CardLink to="/notes">Notes</CardLink>
      </CardHeader>
      <CardContent>
        {loading && !rows.length ? (
          <p className="py-4 text-xs text-muted-foreground">Loading notes…</p>
        ) : shown.length === 0 ? (
          <WidgetEmpty to="/notes" cta="Write a note">
            No notes yet.
          </WidgetEmpty>
        ) : (
          <ul className="space-y-2">
            {shown.map((n) => (
              <li key={n.id}>
                <Link
                  to="/notes"
                  className="block rounded-lg border border-border bg-surface-2/40 px-3 py-2 transition-colors hover:bg-muted/40"
                >
                  <span className="block truncate text-sm font-medium">{n.title || 'Untitled'}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{notePreview(n.body) || ' '}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** A month grid. A day is marked when a task is due on it or an interview is scheduled for it. */
export function CalendarCard({ today, weekStartsOn, tasks, interviews, className }) {
  const navigate = useNavigate()
  const [month, setMonth] = useState(monthStart(today))
  const busy = useMemo(() => {
    const m = new Map()
    for (const t of tasks) if (t.due_date && t.status !== 'done') m.set(t.due_date, (m.get(t.due_date) ?? 0) + 1)
    for (const i of interviews)
      if (i.status === 'scheduled' && i.scheduled_at) m.set(i.scheduled_at.slice(0, 10), (m.get(i.scheduled_at.slice(0, 10)) ?? 0) + 1)
    return m
  }, [tasks, interviews])
  return (
    <Card data-module="calendar" data-testid="calendar-card" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-mod-text" aria-hidden />
          Calendar
        </CardTitle>
        <CardLink to="/calendar">Open calendar</CardLink>
      </CardHeader>
      <CardContent>
        <MonthCalendar
          month={month}
          onMonth={setMonth}
          today={today}
          weekStartsOn={weekStartsOn}
          selected={null}
          onSelect={() => navigate('/calendar')}
          labelFor={(d) => (busy.get(d) ? `${busy.get(d)} due` : '')}
          markFor={(d) =>
            busy.get(d) && <span aria-hidden className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-mod" />
          }
        />
      </CardContent>
    </Card>
  )
}

/** This month's budget: used, left, and the spend so far. `sum` is summarize() for the month. */
export function BudgetCard({ sum, money, className }) {
  return (
    <Card data-module="finance" data-testid="budget-card" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PiggyBank className="h-4 w-4 text-mod-text" aria-hidden />
          Budget
        </CardTitle>
        <CardLink to="/finance">Finance</CardLink>
      </CardHeader>
      <CardContent className="space-y-3">
        {sum.budget > 0 ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="lt-stat-value text-[1.75rem] leading-tight">{money(sum.expense)}</span>
              <span className="text-xs text-muted-foreground">of {money(sum.budget)}</span>
            </div>
            <Progress value={Math.min(100, (sum.budgetUsed ?? 0) * 100)} tone={budgetTone(sum.budgetUsed)} label="Budget used" />
            <p className="text-xs text-muted-foreground">
              {Math.round((sum.budgetUsed ?? 0) * 100)}% used ·{' '}
              {sum.remaining >= 0 ? `${money(sum.remaining)} left` : `${money(-sum.remaining)} over`}
            </p>
          </>
        ) : (
          <WidgetEmpty to="/finance" cta="Set a monthly budget">
            No budget set for this month.
          </WidgetEmpty>
        )}
      </CardContent>
    </Card>
  )
}

/** The newest transactions (`count` of them). */
export function TransactionsCard({ transactions, count = 5, money, className }) {
  const recent = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => (b.txn_date + (b.created_at ?? '')).localeCompare(a.txn_date + (a.created_at ?? '')))
        .slice(0, count),
    [transactions, count],
  )
  return (
    <Card data-module="finance" data-testid="transactions-card" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-mod-text" aria-hidden />
          Recent transactions
        </CardTitle>
        <CardLink to="/finance">Finance</CardLink>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <WidgetEmpty to="/finance" cta="Add a transaction">
            Nothing recorded yet.
          </WidgetEmpty>
        ) : (
          <ul className="space-y-2">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {t.category}
                  {t.note ? <span className="text-muted-foreground"> · {t.note}</span> : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{fmtDay(t.txn_date, 'd MMM')}</span>
                <span className={cn('shrink-0 text-xs font-medium tabular-nums', t.type === 'income' && 'text-success')}>
                  {signFor(t.type)}
                  {money(t.amount_paise)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** Interviews still ahead, with how much of the application's prep checklist is ticked. */
export function InterviewsCard({ interviews, applications, tz, count = 4, nowMs = Date.now(), className }) {
  const ahead = useMemo(() => {
    const byId = new Map(applications.map((a) => [a.id, a]))
    return interviews
      .filter((i) => i.status === 'scheduled' && new Date(i.scheduled_at).getTime() >= nowMs && byId.has(i.application_id))
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
      .slice(0, count)
      .map((i) => ({ ...i, app: byId.get(i.application_id) }))
  }, [interviews, applications, count, nowMs])
  return (
    <Card data-module="jobs" data-testid="interviews-card" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-mod-text" aria-hidden />
          Interview preparation
        </CardTitle>
        <CardLink to="/jobs">Applications</CardLink>
      </CardHeader>
      <CardContent>
        {ahead.length === 0 ? (
          <WidgetEmpty to="/jobs" cta="Open applications">
            No interviews scheduled.
          </WidgetEmpty>
        ) : (
          <ul className="space-y-2">
            {ahead.map((i) => {
              const list = i.app.prep_checklist ?? []
              const done = list.filter((c) => c.done).length
              return (
                <li key={i.id}>
                  <Link
                    to={`/jobs?app=${i.app.id}`}
                    className="block rounded-lg border border-border bg-surface-2/40 px-3 py-2 transition-colors hover:bg-muted/40"
                  >
                    <span className="block truncate text-sm font-medium">
                      {i.app.company}
                      {i.round_name ? ` · ${i.round_name}` : ''}
                    </span>
                    <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{fmtDateTime(i.scheduled_at, tz)}</span>
                      <span>{list.length ? `Prep ${done}/${list.length}` : 'No prep list'}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
