import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, BarChart3, CalendarDays, CheckCircle2, Copy, Flame, ListChecks, Play, Target, Trash2, TrendingUp } from 'lucide-react'
import { Badge, Progress } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Heatmap } from '@/components/shared/Heatmap'
import { EmptyState } from '@/components/shared/states'
import { StatCard } from '@/components/shared/StatCard'
import { MonthCalendar } from '@/components/shared/MonthCalendar'
import { useConfirm } from '@/components/shared/Confirm'
import { useSettings } from '@/hooks/useSettings'
import { useAction } from '@/hooks/useAction'
import { fmtDay, monthStart } from '@/lib/dates'
import { BUILT_IN_TEMPLATES, activeCards, calendarMarkers, historyEntries, rhythmText } from '@/domain/challenges'
import { deleteRow } from '@/services/api'

// ------------------------------------------------------------------------------------------------------------- analytics
export function AnalyticsPanel({ analytics: a, cards, today }) {
  const { settings } = useSettings()
  const levels = useMemo(() => new Map([...a.byDay].map(([d, n]) => [d, Math.min(4, n)])), [a.byDay])
  const titles = useMemo(() => new Map([...a.byDay].map(([d, n]) => [d, `${n} check-in${n === 1 ? '' : 's'}`])), [a.byDay])
  const peak = Math.max(1, ...a.activity.map((w) => w.count))
  const live = activeCards(cards)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Target}
          label="Running"
          value={a.active}
          sub={a.paused ? `${a.paused} paused` : `${a.checkedInToday} checked in today`}
        />
        <StatCard
          icon={Award}
          label="Success rate"
          value={a.successRate == null ? '—' : `${a.successRate}%`}
          sub={`${a.achieved} of ${a.completed} finished in full`}
          tone="success"
        />
        <StatCard
          icon={Flame}
          label="Best streak"
          value={a.bestStreak}
          sub={a.currentStreak ? `${a.currentStreak} right now` : 'Start one today'}
        />
        <StatCard
          icon={TrendingUp}
          label="Average progress"
          value={a.averageProgress == null ? '—' : `${a.averageProgress}%`}
          progress={a.averageProgress ?? undefined}
          sub={a.behind ? `${a.behind} behind pace` : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Check-ins per week</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex h-36 items-end gap-2"
            role="img"
            aria-label={`Check-ins per week for the last ${a.activity.length} weeks: ${a.activity.map((w) => w.count).join(', ')}`}
          >
            {a.activity.map((w, i) => (
              <div key={w.from} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[11px] tabular-nums text-muted-foreground">{w.count || ''}</span>
                <div
                  className="w-full max-w-10 rounded-t-md bg-gradient-to-t from-mod to-mod-2 transition-[height] duration-700"
                  style={{ height: `${(w.count / peak) * 100}%`, minHeight: w.count ? 4 : 2, opacity: w.count ? 1 : 0.25 }}
                />
                <span className="text-[10px] text-muted-foreground">{i === a.activity.length - 1 ? 'Now' : fmtDay(w.from, 'd MMM')}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Progress by challenge</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {live.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing running right now.</p>
            ) : (
              live.map((x) => (
                <div key={x.challenge.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{x.challenge.title}</span>
                    <span className="tabular-nums text-muted-foreground">{x.progress.pct}%</span>
                  </div>
                  <Progress value={x.progress.pct} label={`${x.challenge.title} progress`} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {a.categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No challenges yet.</p>
            ) : (
              a.categories.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-sm">
                  <span>{c.name}</span>
                  <Badge>{c.count}</Badge>
                </div>
              ))
            )}
            <p className="pt-2 text-xs text-muted-foreground">
              {a.checkins} check-ins on {a.activeDays} different days in total.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Heatmap levels={levels} titles={titles} today={today} weeks={26} weekStartsOn={settings.week_starts_on} />
        </CardContent>
      </Card>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------------------- calendar
/** All running challenges on one month: a dot per challenge on each day, hollow when still open, filled when done. */
export function CalendarPanel({ challenges, checkins, habitLogs, today, onOpen }) {
  const { settings } = useSettings()
  const [month, setMonth] = useState(monthStart(today))
  const [selected, setSelected] = useState(today)
  const from = month
  const to = fmtDayEnd(month)
  const markers = useMemo(
    () => calendarMarkers(challenges, checkins, habitLogs, { from, to, today }),
    [challenges, checkins, habitLogs, from, to, today],
  )
  const byDay = useMemo(() => {
    const m = new Map()
    for (const k of markers) (m.get(k.day) ?? m.set(k.day, []).get(k.day)).push(k)
    return m
  }, [markers])
  const day = byDay.get(selected) ?? []
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardContent>
          <MonthCalendar
            month={month}
            onMonth={setMonth}
            selected={selected}
            onSelect={setSelected}
            today={today}
            weekStartsOn={settings.week_starts_on}
            labelFor={(d) =>
              byDay.get(d)?.length ? `${byDay.get(d).filter((k) => k.done).length} of ${byDay.get(d).length} challenges done` : ''
            }
            markFor={(d) => (
              <span className="mt-0.5 flex justify-center gap-0.5">
                {(byDay.get(d) ?? []).slice(0, 4).map((k) => (
                  <span
                    key={k.challenge.id}
                    className="h-1.5 w-1.5 rounded-full border"
                    style={{ borderColor: k.challenge.color, background: k.done ? k.challenge.color : 'transparent' }}
                  />
                ))}
              </span>
            )}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{fmtDay(selected, 'EEEE d MMMM')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {day.length === 0 ? (
            <p className="text-sm text-muted-foreground">No challenge covers this day.</p>
          ) : (
            day.map((k) => (
              <button
                key={k.challenge.id}
                type="button"
                onClick={() => onOpen(k.challenge.id)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-border p-2.5 text-left text-sm hover:bg-muted/50"
              >
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full border"
                  style={{ borderColor: k.challenge.color, background: k.done ? k.challenge.color : 'transparent' }}
                >
                  {k.done && <CheckCircle2 className="h-3.5 w-3.5 text-white" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1 truncate">{k.challenge.title}</span>
                <span className="text-xs text-muted-foreground">
                  {{ done: 'Done', partial: 'Part', missed: 'Missed', open: 'Open', upcoming: 'Upcoming', none: '' }[k.state]}
                </span>
              </button>
            ))
          )}
          <Link to="/calendar" className="inline-flex items-center gap-1.5 pt-1 text-xs text-mod-text hover:underline">
            <CalendarDays className="h-3.5 w-3.5" /> Open the full calendar
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
const fmtDayEnd = (month) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

// --------------------------------------------------------------------------------------------------------------- history
export function HistoryPanel({ cards, onOpen, onRepeat }) {
  const list = useMemo(() => historyEntries(cards), [cards])
  if (!list.length)
    return (
      <EmptyState
        icon={Award}
        title="Nothing finished yet"
        description="Challenges you complete or cancel are kept here, with what you achieved."
      />
    )
  const TONE = { achieved: 'success', finished: 'primary', cancelled: 'neutral' }
  const WORDS = { achieved: 'Achieved', finished: 'Finished', cancelled: 'Cancelled' }
  return (
    <ul className="space-y-3">
      {list.map((e) => {
        const c = e.challenge
        return (
          <li key={c.id}>
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span aria-hidden className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: c.color }} />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    className="block max-w-full truncate text-left font-medium hover:underline"
                  >
                    {c.title}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {rhythmText(c)} · {fmtDay(c.start_date, 'd MMM yyyy')} to {fmtDay(c.end_date, 'd MMM yyyy')} · {e.progress.checkinDays}{' '}
                    check-in days · best streak {e.progress.bestStreak}
                  </p>
                </div>
                <Badge tone={TONE[e.outcome]}>
                  {WORDS[e.outcome]}
                  {e.outcome !== 'cancelled' ? ` · ${e.pct}%` : ''}
                </Badge>
                <Button size="sm" variant="outline" onClick={() => onRepeat(c)}>
                  <Copy className="h-4 w-4" /> Run again
                </Button>
              </div>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}

// ------------------------------------------------------------------------------------------------------------- templates
export function TemplatesPanel({ templates, onUse }) {
  const confirm = useConfirm()
  const [remove] = useAction(async (t) => {
    if (
      await confirm({
        title: `Delete “${t.name}”?`,
        description: 'Challenges already started from it are not affected.',
        confirmLabel: 'Delete',
        cancelLabel: 'Keep it',
      })
    )
      await deleteRow('challenge_templates', t.id)
  })
  const Row = ({ t, mine }) => (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-1 h-8 w-1.5 shrink-0 rounded-full" style={{ background: t.color }} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t.name}</p>
          <p className="text-xs text-muted-foreground">
            {rhythmText(t)} · {t.duration_days} days · {t.category}
          </p>
          {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onUse(t)}>
          <Play className="h-4 w-4" /> Use
        </Button>
        {mine && (
          <Button size="sm" variant="ghost" aria-label={`Delete template ${t.name}`} onClick={() => remove(t)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Card>
  )
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="h-4 w-4" aria-hidden /> Your templates
        </h2>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Open any challenge and choose “Save as template” to reuse it later.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map((t) => (
              <Row key={t.id} t={t} mine />
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="h-4 w-4" aria-hidden /> Built-in
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {BUILT_IN_TEMPLATES.map((t) => (
            <Row key={t.key} t={t} />
          ))}
        </div>
      </section>
    </div>
  )
}
