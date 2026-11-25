import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart } from 'recharts'
import { Chart, C, PALETTE, grid, seriesSummary, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { Segmented } from '@/components/ui/misc'
import { Reveal } from '@/components/motion/primitives'
import { fmtDuration } from '@/lib/dates'
import { Delta, Panel, legend, Metric } from './parts'
import { formatValue } from './format'

const TREND = [
  { value: 'studyHours', label: 'Study', unit: 'h', area: false },
  { value: 'workouts', label: 'Workouts', unit: '', area: false },
  { value: 'expense', label: 'Spending', money: true, area: false },
  { value: 'habitRate', label: 'Habits', unit: '%', area: true, max: 100 },
  { value: 'taskRate', label: 'Tasks', unit: '%', area: true, max: 100 },
  { value: 'sleepHours', label: 'Sleep', unit: 'h', area: true },
]

/** The headline stat tiles: each shows the figure, or an em dash when that area has no data. */
export function Headline({ report, money }) {
  const by = (k) => report.comparison.find((r) => r.key === k)
  const tile = (key, label, module, sub) => {
    const r = by(key)
    return <Metric key={key} label={label} module={module} value={formatValue(r.kind, r.cur, money)} row={r} money={money} sub={sub} />
  }
  const c = report.current
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {tile('studyMinutes', 'Study time', 'learning', c.learning ? `${c.learning.sessions} sessions` : 'not tracked yet')}
      {tile('workouts', 'Workouts', 'fitness', c.fitness ? `${fmtDuration(c.fitness.minutes)} trained` : 'not tracked yet')}
      {tile('expense', 'Spent', 'finance', c.finance ? `${formatValue('money', c.finance.income, money)} income` : 'not tracked yet')}
      {tile('habitRate', 'Habit completion', 'habits', c.habits ? `${c.habits.done} of ${c.habits.expected} done` : 'not tracked yet')}
      {tile('taskRate', 'Task completion', 'planner', c.tasks ? `${c.tasks.done} of ${c.tasks.planned} done` : 'not tracked yet')}
      {tile('savingsRate', 'Savings rate', 'finance', c.finance?.income ? undefined : c.finance ? 'no income recorded' : 'not tracked yet')}
    </div>
  )
}

/** One metric over time, chosen from a short list. Buckets before the module existed are gaps. */
export function TrendPanel({ series, money }) {
  const usable = TREND.filter((t) => series.rows.some((r) => r[t.value] != null))
  const [pick, setPick] = useState('studyHours')
  const t = usable.find((x) => x.value === pick) ?? usable[0]
  const rows = useMemo(
    () => (t ? series.rows.map((r) => ({ ...r, v: r[t.value] == null ? null : t.money ? r[t.value] / 100 : r[t.value] })) : []),
    [series, t],
  )
  const fmt = (v) => (t.money ? money(Math.round(v * 100)) : `${v}${t.unit ?? ''}`)
  return (
    <Panel
      title="Progress over time"
      hint={`Per ${series.unit}. Gaps mean nothing had been recorded yet.`}
      actions={
        usable.length > 1 ? (
          <Segmented
            aria-label="Trend metric"
            value={t.value}
            onChange={setPick}
            options={usable.map(({ value, label }) => ({ value, label }))}
          />
        ) : null
      }
    >
      <Chart
        height={240}
        empty={!t}
        emptyText="Nothing recorded in this period yet."
        summary={
          t
            ? seriesSummary(
                t.label,
                rows.map((r) => ({ label: r.label, v: r.v })),
                'v',
                t.unit,
              )
            : undefined
        }
      >
        {t?.area ? (
          <AreaChart data={rows}>
            {grid()}
            {xAxis({ dataKey: 'label', minTickGap: 18 })}
            {yAxis({ domain: [0, t.max ?? 'auto'], width: 40 })}
            {tooltip({ formatter: (v) => [fmt(v), t.label] })}
            <Area
              type="monotone"
              dataKey="v"
              name={t.label}
              stroke={C.mod}
              strokeWidth={2.25}
              fill={C.mod}
              fillOpacity={0.14}
              connectNulls={false}
              dot={rows.length <= 14}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        ) : (
          <BarChart data={rows}>
            {grid()}
            {xAxis({ dataKey: 'label', minTickGap: 18 })}
            {yAxis({ width: t.money ? 52 : 36, allowDecimals: !!t.unit })}
            {tooltip({ formatter: (v) => [fmt(v), t.label] })}
            <Bar dataKey="v" name={t.label} fill={C.mod} radius={[5, 5, 2, 2]} maxBarSize={36} />
          </BarChart>
        )}
      </Chart>
    </Panel>
  )
}

/** Where recorded time went: share by activity, and which weekdays carry it. */
export function TimePanel({ time }) {
  if (!time || time.totalMinutes === 0)
    return (
      <Panel title="Time distribution" hint="Study, focus and workout time you recorded.">
        <Chart height={220} empty emptyText="No study, focus or workout time recorded in this period." />
      </Panel>
    )
  const parts = time.parts.filter((p) => p.minutes > 0)
  const colors = { study: PALETTE[0], focus: PALETTE[3], workout: PALETTE[1] }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="Time distribution" hint="Study and focus are logged separately and can overlap.">
        <div className="flex flex-wrap items-center gap-6">
          <div
            className="h-44 w-44 shrink-0"
            role="img"
            aria-label={`Time by activity: ${parts.map((p) => `${p.label} ${fmtDuration(p.minutes)}`).join(', ')}.`}
          >
            <Chart height={176}>
              <PieChart>
                <Pie data={parts} dataKey="minutes" nameKey="label" innerRadius={48} outerRadius={80} paddingAngle={2} stroke="none">
                  {parts.map((p) => (
                    <Cell key={p.key} fill={colors[p.key]} />
                  ))}
                </Pie>
                {tooltip({ formatter: (v, n) => [fmtDuration(v), n] })}
              </PieChart>
            </Chart>
          </div>
          <ul className="min-w-[10rem] flex-1 space-y-2.5 text-sm">
            {time.parts.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: colors[p.key] }} />
                  {p.label}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {fmtDuration(p.minutes)} · {p.share == null ? '—' : `${Math.round(p.share * 100)}%`}
                </span>
              </li>
            ))}
            {time.sleepAvgMinutes != null && (
              <li className="flex items-center justify-between gap-3 border-t border-border pt-2.5 text-muted-foreground">
                <span>Average sleep (not included above)</span>
                <span className="tabular-nums">{fmtDuration(time.sleepAvgMinutes)}</span>
              </li>
            )}
          </ul>
        </div>
      </Panel>
      <Panel title="Time by weekday" hint="Total minutes recorded on each weekday.">
        <Chart height={200} summary={seriesSummary('Minutes by weekday', time.byWeekday, 'total', ' min')}>
          <BarChart data={time.byWeekday}>
            {grid()}
            {xAxis({ dataKey: 'label' })}
            {yAxis({ width: 40 })}
            {tooltip({ formatter: (v, n) => [fmtDuration(v), n] })}
            {legend()}
            <Bar dataKey="study" name="Study" stackId="t" fill={colors.study} />
            <Bar dataKey="focus" name="Focus" stackId="t" fill={colors.focus} />
            <Bar dataKey="workout" name="Workouts" stackId="t" fill={colors.workout} radius={[5, 5, 0, 0]} />
          </BarChart>
        </Chart>
      </Panel>
    </div>
  )
}

/** Every headline metric, this period against the previous one. */
export function ComparisonTable({ report, money }) {
  const { previous, partial } = report.ranges
  const groups = [...new Set(report.comparison.map((r) => r.group))]
  return (
    <Panel
      title="Compared with the previous period"
      hint={
        previous.days
          ? partial
            ? `The period is still running, so it is compared with the same ${previous.days} days of the one before.`
            : 'Complete periods, side by side.'
          : 'There is no earlier period to compare with.'
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Metric</th>
              <th className="pb-2 text-right font-medium">This period</th>
              <th className="pb-2 text-right font-medium">Previous</th>
              <th className="pb-2 text-right font-medium">Change</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g} className="border-t border-border">
              <tr>
                <th
                  colSpan={4}
                  scope="colgroup"
                  className="pb-1 pt-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {g}
                </th>
              </tr>
              {report.comparison
                .filter((r) => r.group === g)
                .map((r) => (
                  <tr key={r.key}>
                    <th scope="row" className="py-1.5 text-left font-normal">
                      {r.label}
                    </th>
                    <td className="py-1.5 text-right tabular-nums">{formatValue(r.kind, r.cur, money)}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{formatValue(r.kind, r.prev, money)}</td>
                    <td className="py-1.5 text-right">
                      <Delta row={r} money={money} />
                    </td>
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </div>
    </Panel>
  )
}

const HISTORY = [
  { value: 'studyMinutes', label: 'Study', kind: 'minutes' },
  { value: 'workouts', label: 'Workouts', kind: 'count' },
  { value: 'expense', label: 'Spending', kind: 'money' },
  { value: 'habitRate', label: 'Habits', kind: 'rate' },
  { value: 'taskRate', label: 'Tasks', kind: 'rate' },
]

/** Month-over-month: the last six months of one metric. The running month is drawn lighter and labelled "so far". */
export function HistoryPanel({ history, money }) {
  const usable = HISTORY.filter((h) => history.some((m) => m.values[h.value] != null))
  const [pick, setPick] = useState('studyMinutes')
  const h = usable.find((x) => x.value === pick) ?? usable[0]
  const rows = h
    ? history.map((m) => {
        const v = m.values[h.value]
        return {
          label: m.label + (m.partial ? ' *' : ''),
          partial: m.partial,
          v:
            v == null
              ? null
              : h.kind === 'money'
                ? v / 100
                : h.kind === 'rate'
                  ? Math.round(v * 100)
                  : h.kind === 'minutes'
                    ? Math.round((v / 60) * 10) / 10
                    : v,
        }
      })
    : []
  const unit = h?.kind === 'rate' ? '%' : h?.kind === 'minutes' ? ' h' : ''
  const fmt = (v) => (h.kind === 'money' ? money(Math.round(v * 100)) : `${v}${unit}`)
  return (
    <Panel
      title="Month over month"
      hint="Last six months. * is the month still in progress."
      actions={
        usable.length > 1 ? (
          <Segmented
            aria-label="Monthly metric"
            value={h.value}
            onChange={setPick}
            options={usable.map(({ value, label }) => ({ value, label }))}
          />
        ) : null
      }
    >
      <Chart
        height={220}
        empty={!h}
        emptyText="Not enough history yet: record something to start the monthly view."
        summary={h ? seriesSummary(h.label, rows, 'v', unit) : undefined}
      >
        <BarChart data={rows}>
          {grid()}
          {xAxis({ dataKey: 'label' })}
          {yAxis({ width: h?.kind === 'money' ? 52 : 38, ...(h?.kind === 'rate' ? { domain: [0, 100] } : {}) })}
          {tooltip({ formatter: (v) => [fmt(v), h.label] })}
          <Bar dataKey="v" name={h?.label} fill={C.mod} radius={[5, 5, 2, 2]} maxBarSize={44}>
            {rows.map((r) => (
              <Cell key={r.label} fill={C.mod} fillOpacity={r.partial ? 0.45 : 1} />
            ))}
          </Bar>
        </BarChart>
      </Chart>
    </Panel>
  )
}

export function Overview({ report, money }) {
  return (
    <Reveal className="space-y-4">
      <Headline report={report} money={money} />
      <TrendPanel series={report.current.series} money={money} />
      <TimePanel time={report.current.time} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ComparisonTable report={report} money={money} />
        <HistoryPanel history={report.history} money={money} />
      </div>
    </Reveal>
  )
}
