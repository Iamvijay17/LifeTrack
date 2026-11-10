import { useMemo, useState } from 'react'
import { Bar, BarChart, Cell, Pie, PieChart, ReferenceLine } from 'recharts'
import { Droplets, Flame, TrendingDown, TrendingUp, Target, CalendarCheck } from 'lucide-react'
import { Chart, C, G, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { StatCard } from '@/components/shared/StatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress, Segmented } from '@/components/ui/misc'
import { MonthNav } from '@/features/finance/MonthNav'
import { analyze, fmtKcal, viewRange, weeklyTrend } from '@/domain/nutrition'
import { eachDay, fmtDay, monthStart } from '@/lib/dates'

export const MACRO_COLOR = { protein_g: '#84CC16', carbs_g: '#F59E0B', fat_g: '#F43F5E' }
const MACRO_NAME = { protein_g: 'Protein', carbs_g: 'Carbs', fat_g: 'Fat' }
const VIEWS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]
const SUBTITLE = { daily: 'last 14 days', weekly: 'last 8 weeks', monthly: '' }

function DayCard({ icon, label, point, onOpen, tone }) {
  return (
    <button
      type="button"
      disabled={!point}
      onClick={() => point && onOpen(point.d)}
      className="lt-press flex w-full items-center gap-3 rounded-xl border border-border bg-card/60 p-3 text-left transition-colors enabled:hover:border-mod/50 disabled:opacity-60"
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block text-sm font-semibold tabular-nums">{point ? fmtKcal(point.kcal) : '—'}</span>
        <span className="block truncate text-xs text-muted-foreground">{point ? fmtDay(point.d, 'EEE, d MMM yyyy') : 'No data yet'}</span>
      </span>
    </button>
  )
}

/** Calories, macros, meals and water over a range, switchable between daily (14 days), weekly (8 weeks) and monthly views. */
export function AnalyticsTab({ n, today, weekStartsOn, onOpenDay, waterGoal }) {
  const [view, setView] = useState('daily')
  const [month, setMonth] = useState(null)
  const anchor = view === 'monthly' ? (month ?? monthStart(today)) : today
  const range = useMemo(() => viewRange(view, anchor, weekStartsOn), [view, anchor, weekStartsOn])
  const a = useMemo(() => analyze(n.logs, range.from, range.to, n.goals), [n.logs, range, n.goals])
  const weeks = useMemo(() => (view === 'weekly' ? weeklyTrend(n.logs, today, 8, weekStartsOn) : []), [view, n.logs, today, weekStartsOn])
  const goal = n.goals.kcal
  const monthly = view === 'monthly'

  const calorieData =
    view === 'weekly'
      ? weeks.map((w) => ({ label: w.label, kcal: w.kcal }))
      : a.series.map((p) => ({ label: monthly ? String(p.day) : p.label, kcal: p.logged ? Math.round(p.kcal) : null }))
  const macroData =
    view === 'weekly'
      ? weeks.map((w) => ({ label: w.label, protein_g: w.protein_g, carbs_g: w.carbs_g, fat_g: w.fat_g }))
      : a.series.map((p) => ({
          label: monthly ? String(p.day) : p.label,
          protein_g: p.logged ? p.protein_g : null,
          carbs_g: p.logged ? p.carbs_g : null,
          fat_g: p.logged ? p.fat_g : null,
        }))
  const waterByDay = useMemo(() => new Map(n.healthLogs.map((h) => [h.log_date, h.water_ml])), [n.healthLogs])
  const waterData = useMemo(
    () =>
      eachDay(range.from, range.to).map((d) => ({
        label: monthly ? String(Number(d.slice(8))) : fmtDay(d, 'd MMM'),
        ml: waterByDay.get(d) || null,
      })),
    [range, waterByDay, monthly],
  )
  const waterDays = waterData.filter((w) => w.ml)
  const avgWater = waterDays.length ? Math.round(waterDays.reduce((s, w) => s + w.ml, 0) / waterDays.length) : null
  const loggedDays = a.averages.loggedDays
  const macroTotal = a.macros.reduce((s, m) => s + m.kcal, 0)
  const hasData = loggedDays > 0
  const periodLabel = monthly ? fmtDay(range.from, 'MMMM yyyy') : SUBTITLE[view]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={view} onChange={setView} options={VIEWS} />
        {monthly ? (
          <MonthNav month={anchor} today={today} onChange={setMonth} />
        ) : (
          <p className="text-sm text-muted-foreground">{periodLabel}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Flame}
          label="Avg daily calories"
          value={a.averages.kcal == null ? '—' : fmtKcal(a.averages.kcal)}
          sub={goal && a.averages.kcal != null ? `goal ${fmtKcal(goal)}` : 'on days you logged'}
        />
        <StatCard
          icon={CalendarCheck}
          label="Days logged"
          value={`${loggedDays} / ${a.series.filter((p) => p.d <= today).length}`}
          sub={`${Math.round(a.totals.kcal).toLocaleString('en-IN')} kcal in total`}
        />
        <StatCard
          icon={Target}
          label="Avg protein"
          value={a.averages.protein_g == null ? '—' : `${a.averages.protein_g} g`}
          sub={n.goals.protein_g ? `goal ${n.goals.protein_g} g` : 'per logged day'}
        />
        <StatCard
          icon={Droplets}
          label="Avg water"
          value={avgWater == null ? '—' : `${avgWater} ml`}
          sub={waterGoal ? `goal ${waterGoal} ml` : 'per day with water'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{view === 'weekly' ? 'Average daily calories per week' : 'Calories per day'}</CardTitle>
        </CardHeader>
        <CardContent>
          <Chart
            height={220}
            empty={!hasData}
            emptyText="Log some meals to see your calories here."
            summary={`Calories ${periodLabel}: ${calorieData
              .filter((d) => d.kcal != null)
              .map((d) => `${d.label} ${d.kcal}`)
              .join(', ')}`}
          >
            <BarChart data={calorieData}>
              {grid()}
              {xAxis({ dataKey: 'label', interval: monthly ? 1 : 'preserveStartEnd' })}
              {yAxis({ width: 44 })}
              {tooltip({ formatter: (v) => [`${v} kcal`, view === 'weekly' ? 'Daily average' : 'Calories'] })}
              {goal > 0 && <ReferenceLine y={goal} stroke={C.success} strokeDasharray="4 4" />}
              <Bar dataKey="kcal" fill={G.mod} radius={[6, 6, 2, 2]} />
            </BarChart>
          </Chart>
          {goal > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Dashed line: your {fmtKcal(goal)} goal. Days with nothing logged are left empty, not counted as zero.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Protein, carbs and fat</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {macroTotal > 0 && (
                <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="text-[11px] text-muted-foreground">avg per day</p>
                    <p className="text-sm font-semibold tabular-nums tracking-tight">{fmtKcal(a.averages.kcal)}</p>
                  </div>
                </div>
              )}
              <Chart
                height={190}
                empty={macroTotal === 0}
                emptyText="Macros appear once you log food."
                summary={a.macros.map((m) => `${MACRO_NAME[m.key]} ${m.percent}%`).join(', ')}
              >
                <PieChart>
                  <Pie
                    data={a.macros.map((m) => ({ name: MACRO_NAME[m.key], value: m.kcal }))}
                    dataKey="value"
                    innerRadius={56}
                    outerRadius={80}
                    paddingAngle={3}
                    cornerRadius={5}
                    stroke="none"
                  >
                    {a.macros.map((m) => (
                      <Cell key={m.key} fill={MACRO_COLOR[m.key]} aria-label={MACRO_NAME[m.key]} />
                    ))}
                  </Pie>
                  {tooltip({ formatter: (v, name) => [`${Math.round(v)} kcal`, name] })}
                </PieChart>
              </Chart>
            </div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {a.macros.map((m) => (
                <li key={m.key} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: MACRO_COLOR[m.key] }} aria-hidden />
                  <span className="flex-1">{MACRO_NAME[m.key]}</span>
                  <span className="tabular-nums text-muted-foreground">{m.grams} g avg</span>
                  <b className="w-10 text-right tabular-nums">{m.percent}%</b>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Macros (g)</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart height={240} empty={!hasData} emptyText="No macros to chart yet." summary={`Macros in grams ${periodLabel}`}>
              <BarChart data={macroData}>
                {grid()}
                {xAxis({ dataKey: 'label', interval: monthly ? 1 : 'preserveStartEnd' })}
                {yAxis({})}
                {tooltip({ formatter: (v, name) => [`${v} g`, name] })}
                <Bar dataKey="protein_g" name="Protein" stackId="m" fill={MACRO_COLOR.protein_g} />
                <Bar dataKey="carbs_g" name="Carbs" stackId="m" fill={MACRO_COLOR.carbs_g} />
                <Bar dataKey="fat_g" name="Fat" stackId="m" fill={MACRO_COLOR.fat_g} radius={[6, 6, 0, 0]} />
              </BarChart>
            </Chart>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Calories by meal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {a.meals.map((m) => (
              <div key={m.id}>
                <div className="flex items-baseline justify-between text-sm">
                  <span>{m.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {Math.round(m.kcal).toLocaleString('en-IN')} kcal · <b className="text-foreground">{m.percent}%</b>
                  </span>
                </div>
                <Progress value={m.percent} className="mt-1.5" label={`${m.label} share of calories`} />
              </div>
            ))}
            {!hasData && <p className="text-sm text-muted-foreground">Meal split appears once you log food.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Water (ml)</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart
              height={170}
              empty={waterDays.length === 0}
              emptyText="No water logged in this range."
              summary={`Water in millilitres ${periodLabel}`}
            >
              <BarChart data={waterData}>
                {xAxis({ dataKey: 'label', interval: monthly ? 1 : 'preserveStartEnd' })}
                {tooltip({ formatter: (v) => [`${v} ml`, 'Water'] })}
                {waterGoal > 0 && <ReferenceLine y={waterGoal} stroke={C.success} strokeDasharray="4 4" />}
                <Bar dataKey="ml" fill={G.mod} radius={[6, 6, 2, 2]} />
              </BarChart>
            </Chart>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Standout days</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {goal > 0 && (
              <DayCard
                icon={<Target className="h-4 w-4" />}
                label="Closest to your calorie goal"
                point={a.days.closest}
                onOpen={onOpenDay}
                tone="bg-success/15 text-success"
              />
            )}
            <DayCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Highest calories"
              point={a.days.highest}
              onOpen={onOpenDay}
              tone="bg-warning/15 text-warning"
            />
            <DayCard
              icon={<TrendingDown className="h-4 w-4" />}
              label="Lowest calories"
              point={a.days.lowest}
              onOpen={onOpenDay}
              tone="bg-sky-400/15 text-sky-500"
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Food history</CardTitle>
            <span className="text-xs text-muted-foreground">most eaten {periodLabel}</span>
          </CardHeader>
          <CardContent>
            {a.top.length === 0 ? (
              <p className="text-sm text-muted-foreground">Foods you log will be counted here.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {a.top.map((f) => (
                  <li key={f.name} className="flex items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">last {fmtDay(f.last, 'd MMM')}</span>
                    <span className="w-14 shrink-0 text-right tabular-nums">{f.count}×</span>
                    <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">{Math.round(f.kcal)} kcal</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
