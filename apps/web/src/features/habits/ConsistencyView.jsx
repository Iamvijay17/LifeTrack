import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, HeartHandshake, Info, Trophy } from 'lucide-react'
import { Badge, Progress } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form'
import { useAction } from '@/hooks/useAction'
import {
  dayKind,
  explainStreak,
  missedDays,
  monthMap,
  personalRecords,
  recoverable,
  recoveryHistory,
  weeklyConsistency,
  RECOVERY_WINDOW_DAYS,
} from '@/domain/consistency'
import { setHabitStatus, recoverHabitDay } from '@/services/api'
import { fmtDay } from '@/lib/dates'
import { pctText } from '@/lib/format'
import { cn } from '@/lib/utils'

/** How each kind of day looks, and what it is called in the legend. Colour is never the only signal: the cell's label and the legend say it too. */
const KINDS = {
  done: { label: 'Done', cell: 'bg-mod text-white' },
  recovered: { label: 'Made up', cell: 'bg-mod/55 text-white ring-1 ring-inset ring-mod' },
  skipped: { label: 'Skipped', cell: 'bg-muted text-muted-foreground' },
  rest: { label: 'Skipped', cell: 'bg-muted text-muted-foreground' },
  'planned-rest': { label: 'Planned rest', cell: 'bg-surface-2 text-muted-foreground ring-1 ring-inset ring-border' },
  paused: {
    label: 'Paused',
    cell: 'bg-surface-2 text-muted-foreground ring-1 ring-inset ring-border [background-image:repeating-linear-gradient(135deg,transparent_0_4px,rgb(var(--border)/.55)_4px_5px)]',
  },
  missed: { label: 'Missed', cell: 'text-muted-foreground ring-1 ring-inset ring-warning/45' },
  pending: { label: 'Today', cell: 'ring-1 ring-inset ring-foreground/60' },
  upcoming: { label: 'Upcoming', cell: 'text-muted-foreground/50' },
  off: { label: 'Not scheduled', cell: 'text-muted-foreground/50' },
  before: { label: 'Before start', cell: 'text-muted-foreground/30' },
}
const LEGEND = ['done', 'recovered', 'skipped', 'planned-rest', 'paused', 'missed']

const monthOf = (d) => d.slice(0, 7)
const shiftMonth = (m, by) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + by, 1))
  return d.toISOString().slice(0, 7)
}
const monthTitle = (m) => fmtDay(`${m}-01`, 'MMMM yyyy')

/** What to say about a week, kindly. Never "failure": a quiet week gets a way back, a good one gets credit. */
function encouragement(w) {
  if (w.rate == null) return 'A fresh start. Nothing is expected of you yet this week.'
  if (w.rate >= 1) return 'Everything expected so far is done. Well kept.'
  if (w.rate >= 0.75) return 'Strong week. Consistency beats perfection.'
  if (w.rate >= 0.5) return 'More than half. You are still in the rhythm.'
  return 'A quiet week happens. One check-in today starts the next run.'
}

function RecoveryPanel({ stats, today }) {
  const items = useMemo(() => recoverable(stats, today), [stats, today])
  const [recover] = useAction((habitId, date) => recoverHabitDay(habitId, date, today), { success: 'Marked as made up' })
  const [skip] = useAction((habitId, date) => setHabitStatus(habitId, date, 'skipped'), { success: 'Skipped. Your streak is kept.' })
  if (!items.length) return null
  return (
    <Card className="border-warning/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HeartHandshake className="h-4 w-4 text-warning" aria-hidden />
          Pick up where you left off
        </CardTitle>
        <span className="text-xs text-muted-foreground">Last {RECOVERY_WINDOW_DAYS} days. Nothing changes unless you choose.</span>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map(({ habit, dates }) => (
          <div key={habit.id}>
            <p className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              <span className="h-2 w-2 rounded-full" style={{ background: habit.color }} aria-hidden />
              {habit.name}
            </p>
            <ul className="space-y-1.5">
              {dates.map((d) => (
                <li key={d} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2/60 px-3 py-2">
                  <span className="text-sm">{fmtDay(d, 'EEEE d MMM')}</span>
                  <span className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => recover(habit.id, d)}
                      aria-label={`I did ${habit.name} on ${fmtDay(d, 'EEEE d MMM')}`}
                    >
                      I did it
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => skip(habit.id, d)}
                      aria-label={`Skip ${habit.name} on ${fmtDay(d, 'EEEE d MMM')}`}
                    >
                      Skip day
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          &ldquo;I did it&rdquo; records a check-in for that day, marked as made up. &ldquo;Skip day&rdquo; keeps your streak without
          counting it as done. Your schedule is not changed.
        </p>
      </CardContent>
    </Card>
  )
}

function MonthGrid({ habit, logs, month, today, weekStartsOn }) {
  const { days, lead } = useMemo(() => monthMap(habit, logs, month, today, weekStartsOn), [habit, logs, month, today, weekStartsOn])
  const names = weekStartsOn === 1 ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  return (
    <div role="group" aria-label={`${habit.name}, ${monthTitle(month)}`}>
      <div aria-hidden className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
        {names.map((n, i) => (
          <span key={i}>{n}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`b${i}`} aria-hidden />
        ))}
        {days.map(({ date, kind }) => (
          <div
            key={date}
            role="img"
            aria-label={`${fmtDay(date, 'EEEE d MMMM')}: ${KINDS[kind].label}`}
            title={`${fmtDay(date, 'EEE d MMM')} · ${KINDS[kind].label}`}
            className={cn(
              'flex aspect-square items-center justify-center rounded-md text-[11px] tabular-nums transition-colors',
              KINDS[kind].cell,
            )}
          >
            {Number(date.slice(8))}
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-label="Legend">
        {LEGEND.map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('inline-block h-3 w-3 rounded-[4px]', KINDS[k].cell)} />
            {KINDS[k].label}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Records({ rec, unit }) {
  const items = [
    ['Longest streak', rec.longestStreak ? `${rec.longestStreak}${unit}` : '—'],
    ['Best week', rec.bestWeek ? `${rec.bestWeek.count} check-ins` : '—', rec.bestWeek && `week of ${fmtDay(rec.bestWeek.start, 'd MMM')}`],
    ['Best month', rec.bestMonth ? `${rec.bestMonth.count} check-ins` : '—', rec.bestMonth && monthTitle(rec.bestMonth.month)],
    ['All-time check-ins', String(rec.totalDone), rec.firstDone && `since ${fmtDay(rec.firstDone, 'd MMM yyyy')}`],
  ]
  return (
    <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {items.map(([k, v, sub]) => (
        <div key={k} className="rounded-lg bg-surface-2/60 p-3">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">{v}</dd>
          {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
      ))}
    </dl>
  )
}

/** The consistency view of Habits: made-up days, the month at a glance, this week's number with its working, records and recovery history. */
export function ConsistencyView({ stats, habits, logs, today, weekStartsOn }) {
  const active = stats.filter((s) => !s.habit.archived_at)
  const [pick, setPick] = useState(null)
  const [month, setMonth] = useState(monthOf(today))
  const [open, setOpen] = useState(false)
  const row = active.find((s) => s.habit.id === pick) ?? active[0]
  const history = useMemo(() => recoveryHistory(habits, logs).slice(0, 8), [habits, logs])
  if (!row) return <p className="py-10 text-center text-sm text-muted-foreground">No active habits yet.</p>

  const { habit } = row
  const week = weeklyConsistency(habit, row.logs, today, weekStartsOn)
  const records = personalRecords(habit, row.logs, today, weekStartsOn)
  const why = explainStreak(habit, row.logs, today, weekStartsOn)
  const missedCount = missedDays(habit, row.logs, today).length
  const first = monthOf(habit.start_date)

  return (
    <div className="space-y-5">
      <RecoveryPanel stats={stats} today={today} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select aria-label="Habit" className="h-9 w-56" value={habit.id} onChange={(e) => setPick(e.target.value)}>
          {active.map((s) => (
            <option key={s.habit.id} value={s.habit.id}>
              {s.habit.name}
            </option>
          ))}
        </Select>
        <div className="flex gap-1.5">
          {(habit.rest_days ?? []).length > 0 && <Badge>Rest days set</Badge>}
          {(habit.pauses ?? []).some((p) => p.end_date == null) && <Badge>Paused</Badge>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>This week</CardTitle>
            <span className="text-2xl font-semibold tabular-nums">{pctText(week.rate)}</span>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={(week.rate ?? 0) * 100} label={`${habit.name} this week`} />
            <p className="text-sm">
              {week.unit === 'week'
                ? `${week.done} of ${week.expected} check-ins this week.`
                : week.expected
                  ? `${week.done} of ${week.expected} expected days${week.neutral.length ? `. Not counted: ${week.neutral.join(', ')}.` : '.'}`
                  : 'No days expected yet this week.'}
            </p>
            <p className="text-sm text-muted-foreground">{encouragement(week)}</p>
            <div className="flex items-center gap-4 border-t border-border pt-3 text-sm">
              <span>
                Current streak{' '}
                <b className="tabular-nums">
                  {row.current}
                  {row.unit}
                </b>
              </span>
              <span>
                Longest{' '}
                <b className="tabular-nums">
                  {row.longest}
                  {row.unit}
                </b>
              </span>
              <span className="text-muted-foreground">30 days {pctText(row.rate30)}</span>
            </div>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              <Info className="h-3.5 w-3.5" aria-hidden />
              How is this calculated?
            </button>
            {open && (
              <ul className="space-y-1.5 rounded-lg bg-surface-2/60 p-3 text-xs text-muted-foreground">
                {why.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
                {missedCount > 0 && (
                  <li>
                    {missedCount} day(s) in the last {RECOVERY_WINDOW_DAYS} can still be made up.
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{monthTitle(month)}</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Previous month"
                disabled={month <= first}
                onClick={() => setMonth((m) => shiftMonth(m, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Next month"
                disabled={month >= monthOf(today)}
                onClick={() => setMonth((m) => shiftMonth(m, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <MonthGrid habit={habit} logs={row.logs} month={month} today={today} weekStartsOn={weekStartsOn} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-warning" aria-hidden />
            Personal records
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Records rec={records} unit={row.unit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recovery history</CardTitle>
          <span className="text-xs text-muted-foreground">Days you made up, across all habits</span>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nothing made up yet. Missed a day? You&apos;ll find a way back here.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: h.habit.color }} aria-hidden />
                    <span className="truncate">{h.habit.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fmtDay(h.date, 'EEE d MMM')} · {h.daysLate === 0 ? 'same day' : `${h.daysLate}d later`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
