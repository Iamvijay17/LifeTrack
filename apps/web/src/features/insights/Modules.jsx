import { Bar, BarChart, Line, LineChart, ComposedChart, Area, AreaChart } from 'recharts'
import { Briefcase, Dumbbell, GraduationCap, Repeat, Wallet } from 'lucide-react'
import { Chart, C, PALETTE, grid, seriesSummary, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { Reveal } from '@/components/motion/primitives'
import { fmtDuration } from '@/lib/dates'
import { pctText } from '@/lib/format'
import { formatValue } from './format'
import { BarList, Metric, ModuleEmpty, Panel, legend } from './parts'

const rowOf = (report, key) => report.comparison.find((r) => r.key === key)
const M = ({ report, k, label, money, module, sub, value }) => {
  const r = rowOf(report, k)
  return <Metric label={label} module={module} value={value ?? formatValue(r.kind, r.cur, money)} row={r} money={money} sub={sub} />
}
const Grid = ({ children }) => <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
const Two = ({ children }) => <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>
const hasAny = (rows, ...keys) => rows.some((r) => keys.some((k) => r[k] != null))

// ------------------------------------------------------------ Career & Learning
export function LearningTab({ report, money, locked }) {
  const c = report.current
  const l = c.learning
  const k = c.career
  return (
    <Reveal className="space-y-4">
      {!l ? (
        <ModuleEmpty
          module="learning"
          label="study"
          icon={GraduationCap}
          first={report.first.learning}
          to="/learning"
          cta="Log a study session"
        />
      ) : (
        <>
          <Grid>
            <M report={report} k="studyMinutes" label="Study time" money={money} module="learning" sub={`${l.sessions} sessions`} />
            <M
              report={report}
              k="learnConsistency"
              label="Study consistency"
              money={money}
              module="learning"
              sub={`${l.activeDays} active days`}
            />
            <M
              report={report}
              k="problems"
              label="Problems solved"
              money={money}
              module="learning"
              sub={l.avgSessionMinutes == null ? undefined : `${fmtDuration(Math.round(l.avgSessionMinutes))} avg session`}
            />
            <M
              report={report}
              k="focusMinutes"
              label="Focus time"
              money={money}
              module="learning"
              sub={l.focusCompletion == null ? 'no focus sessions' : `${pctText(l.focusCompletion)} ran to the end`}
            />
          </Grid>
          <Two>
            <Panel title="Study and focus hours" hint={`Per ${c.series.unit}`}>
              <Chart
                height={220}
                empty={!hasAny(c.series.rows, 'studyHours', 'focusHours') || (l.studyMinutes === 0 && l.focusMinutes === 0)}
                emptyText="No study or focus time in this period."
                summary={seriesSummary(
                  'Study hours',
                  c.series.rows.map((r) => ({ label: r.label, v: r.studyHours })),
                  'v',
                  ' h',
                )}
              >
                <BarChart data={c.series.rows}>
                  {grid()}
                  {xAxis({ dataKey: 'label', minTickGap: 18 })}
                  {yAxis({ width: 36 })}
                  {tooltip({ formatter: (v, n) => [`${v} h`, n] })}
                  {legend()}
                  <Bar dataKey="studyHours" name="Study" fill={PALETTE[0]} radius={[5, 5, 2, 2]} maxBarSize={28} />
                  <Bar dataKey="focusHours" name="Focus" fill={PALETTE[3]} radius={[5, 5, 2, 2]} maxBarSize={28} />
                </BarChart>
              </Chart>
            </Panel>
            <Panel title="Where study time went" hint="By topic or goal">
              <BarList
                empty="No study sessions in this period."
                items={l.topics.slice(0, 7).map((t) => ({
                  label: t.label,
                  value: l.studyMinutes ? t.minutes / l.studyMinutes : 0,
                  text: `${fmtDuration(Math.round(t.minutes))} · ${Math.round((t.minutes / l.studyMinutes) * 100)}%`,
                }))}
              />
            </Panel>
          </Two>
        </>
      )}
      <Two>
        <Panel title="Job search" hint="Applications sent in this period and how far they got">
          {!k?.available ? (
            <ModuleEmpty
              module="jobs"
              label="job application"
              icon={Briefcase}
              first={report.first.career}
              locked={locked.jobs}
              to="/jobs"
              cta="Add an application"
            />
          ) : (
            <div className="space-y-4">
              <BarList
                empty=""
                items={[
                  { label: 'Applications', value: 1, text: String(k.applications) },
                  {
                    label: 'Interviews',
                    value: k.applications ? k.interviews / k.applications : 0,
                    text: `${k.interviews}${k.interviewRate == null ? '' : ` · ${pctText(k.interviewRate)}`}`,
                  },
                  { label: 'Offers', value: k.applications ? k.offers / k.applications : 0, text: String(k.offers) },
                  {
                    label: 'Rejections',
                    value: k.applications ? k.rejections / k.applications : 0,
                    text: String(k.rejections),
                    color: 'var(--c-danger)',
                  },
                ]}
              />
              {k.applications === 0 && <p className="text-xs text-muted-foreground">No applications were sent in this period.</p>}
            </div>
          )}
        </Panel>
        <Panel title="Goals" hint="Progress right now (goals do not keep a history)">
          <BarList
            empty="No active goals. Set one on the Goals page."
            items={(k?.goals ?? []).slice(0, 6).map((g) => ({ key: g.id, label: g.title, value: g.percent / 100, text: `${g.percent}%` }))}
          />
        </Panel>
      </Two>
    </Reveal>
  )
}

// ----------------------------------------------------------------------- Fitness
export function FitnessTab({ report, money, locked }) {
  const c = report.current
  const f = c.fitness
  const h = c.health
  if (!f)
    return (
      <Reveal>
        <ModuleEmpty
          module="fitness"
          label="workout"
          icon={Dumbbell}
          first={report.first.fitness}
          locked={locked.fitness}
          to="/fitness"
          cta="Log a workout"
        />
      </Reveal>
    )
  const weights = f.weights.map((w) => ({ label: w.date.slice(5), kg: w.kg }))
  const sleep = c.series.rows.filter((r) => r.sleepHours != null)
  return (
    <Reveal className="space-y-4">
      <Grid>
        <M
          report={report}
          k="workouts"
          label="Workouts"
          money={money}
          module="fitness"
          sub={f.perWeek == null ? undefined : `${f.perWeek} per week`}
        />
        <M
          report={report}
          k="fitConsistency"
          label="Plan consistency"
          money={money}
          module="fitness"
          sub={f.plannedDays ? `${f.hitDays} of ${f.plannedDays} planned days` : 'no weekly plan set'}
        />
        <M
          report={report}
          k="workoutMinutes"
          label="Training time"
          money={money}
          module="fitness"
          sub={f.skipped ? `${f.skipped} skipped` : undefined}
        />
        <M
          report={report}
          k="volumeKg"
          label="Training volume"
          money={money}
          module="fitness"
          sub={f.sets ? `${f.sets} sets` : 'no sets logged'}
        />
      </Grid>
      <Two>
        <Panel title="Workouts and training time" hint={`Per ${c.series.unit}`}>
          <Chart
            height={220}
            empty={f.workouts === 0}
            emptyText="No workouts completed in this period."
            summary={seriesSummary(
              'Workouts',
              c.series.rows.map((r) => ({ label: r.label, v: r.workouts })),
              'v',
            )}
          >
            <ComposedChart data={c.series.rows}>
              {grid()}
              {xAxis({ dataKey: 'label', minTickGap: 18 })}
              {yAxis({ yAxisId: 'l', allowDecimals: false, width: 32 })}
              {yAxis({ yAxisId: 'r', orientation: 'right', width: 40 })}
              {tooltip({ formatter: (v, n) => [n === 'Minutes' ? fmtDuration(v) : v, n] })}
              {legend()}
              <Bar yAxisId="l" dataKey="workouts" name="Workouts" fill={C.mod} radius={[5, 5, 2, 2]} maxBarSize={28} />
              <Line yAxisId="r" type="monotone" dataKey="workoutMinutes" name="Minutes" stroke={PALETTE[2]} strokeWidth={2} dot={false} />
            </ComposedChart>
          </Chart>
        </Panel>
        <Panel
          title="Weight"
          hint={
            f.weightChangeKg == null
              ? 'Log weight on two or more days to see a trend'
              : `${f.weightChangeKg > 0 ? '+' : ''}${f.weightChangeKg} kg over the period`
          }
        >
          <Chart
            height={220}
            empty={weights.length < 2}
            emptyText="Log weight on two or more days in this period."
            summary={seriesSummary('Weight', weights, 'kg', ' kg')}
          >
            <LineChart data={weights}>
              {grid()}
              {xAxis({ dataKey: 'label', minTickGap: 18 })}
              {yAxis({ domain: ['dataMin - 1', 'dataMax + 1'], width: 40 })}
              {tooltip({ formatter: (v) => [`${v} kg`, 'Weight'] })}
              <Line
                type="monotone"
                dataKey="kg"
                name="Weight"
                stroke={C.mod}
                strokeWidth={2.5}
                dot={weights.length <= 20}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </Chart>
        </Panel>
        <Panel title="Top exercises by volume" hint="Reps × weight">
          <BarList
            empty="No sets with weight logged in this period."
            items={f.topExercises.map((e) => ({
              label: e.name,
              value: e.volume / f.topExercises[0].volume,
              text: `${e.volume.toLocaleString('en-IN')} kg`,
            }))}
          />
        </Panel>
        <Panel
          title="Sleep"
          hint={
            h
              ? `${h.nightsLogged} nights logged${h.sleepAvgMinutes == null ? '' : ` · ${fmtDuration(h.sleepAvgMinutes)} average`}`
              : 'No sleep logged'
          }
        >
          {locked.health ? (
            <ModuleEmpty module="health" label="sleep" icon={Dumbbell} locked />
          ) : (
            <Chart
              height={200}
              empty={sleep.length === 0}
              emptyText="No sleep logged in this period."
              summary={seriesSummary('Sleep hours', sleep, 'sleepHours', ' h')}
            >
              <AreaChart data={c.series.rows}>
                {grid()}
                {xAxis({ dataKey: 'label', minTickGap: 18 })}
                {yAxis({ width: 32, domain: [0, 'auto'] })}
                {tooltip({ formatter: (v) => [`${v} h`, 'Sleep'] })}
                <Area
                  type="monotone"
                  dataKey="sleepHours"
                  name="Sleep"
                  stroke={PALETTE[3]}
                  fill={PALETTE[3]}
                  fillOpacity={0.14}
                  strokeWidth={2}
                />
              </AreaChart>
            </Chart>
          )}
        </Panel>
      </Two>
    </Reveal>
  )
}

// ----------------------------------------------------------------------- Finance
export function FinanceTab({ report, money, locked }) {
  const c = report.current
  const f = c.finance
  if (!f)
    return (
      <Reveal>
        <ModuleEmpty
          module="finance"
          label="finance"
          icon={Wallet}
          first={report.first.finance}
          locked={locked.finance}
          to="/finance"
          cta="Add a transaction"
        />
      </Reveal>
    )
  const rows = c.series.rows.map((r) => ({
    ...r,
    incomeMajor: r.income == null ? null : r.income / 100,
    expenseMajor: r.expense == null ? null : r.expense / 100,
  }))
  return (
    <Reveal className="space-y-4">
      <Grid>
        <M report={report} k="income" label="Income" money={money} module="finance" sub={`${f.transactions} transactions`} />
        <M
          report={report}
          k="expense"
          label="Expenses"
          money={money}
          module="finance"
          sub={f.avgDailySpend == null ? undefined : `${money(f.avgDailySpend)} a day`}
        />
        <M report={report} k="savings" label="Saved" money={money} module="finance" sub={`${money(f.net)} left after spending`} />
        <M
          report={report}
          k="savingsRate"
          label="Savings rate"
          money={money}
          module="finance"
          sub={f.savingsRate == null ? 'no income recorded' : 'of income'}
        />
      </Grid>
      <Two>
        <Panel title="Income and expenses" hint={`Per ${c.series.unit}`}>
          <Chart
            height={240}
            empty={f.income === 0 && f.expense === 0}
            emptyText="No income or expenses in this period."
            summary={seriesSummary(
              'Expenses',
              rows.map((r) => ({ label: r.label, v: r.expenseMajor })),
              'v',
            )}
          >
            <BarChart data={rows}>
              {grid()}
              {xAxis({ dataKey: 'label', minTickGap: 18 })}
              {yAxis({ width: 52 })}
              {tooltip({ formatter: (v, n) => [money(Math.round(v * 100)), n] })}
              {legend()}
              <Bar dataKey="incomeMajor" name="Income" fill={PALETTE[1]} radius={[5, 5, 2, 2]} maxBarSize={26} />
              <Bar dataKey="expenseMajor" name="Expenses" fill={PALETTE[4]} radius={[5, 5, 2, 2]} maxBarSize={26} />
            </BarChart>
          </Chart>
        </Panel>
        <Panel
          title="Where the money went"
          hint={f.noSpendDays ? `${f.noSpendDays} no-spend ${f.noSpendDays === 1 ? 'day' : 'days'}` : undefined}
        >
          <BarList
            empty="No expenses in this period."
            items={f.categories.slice(0, 8).map((x, i) => ({
              key: x.category,
              label: x.category,
              value: x.share,
              text: `${money(x.paise)} · ${Math.round(x.share * 100)}%`,
              color: PALETTE[i % PALETTE.length],
            }))}
          />
          {f.biggest && (
            <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
              Largest expense: <span className="font-medium text-foreground">{money(f.biggest.paise)}</span> on {f.biggest.category}
              {f.biggest.note ? ` (${f.biggest.note})` : ''}, {f.biggest.date}.
            </p>
          )}
        </Panel>
      </Two>
    </Reveal>
  )
}

// ------------------------------------------------------------- Habits & Routine
export function HabitsTab({ report, money }) {
  const c = report.current
  const h = c.habits
  const t = c.tasks
  if (!h && !t)
    return (
      <Reveal>
        <ModuleEmpty
          module="habits"
          label="habit or task"
          icon={Repeat}
          first={report.first.habits ?? report.first.tasks}
          to="/habits"
          cta="Create a habit"
        />
      </Reveal>
    )
  const best = h ? [...h.byWeekday].filter((d) => d.perDay != null).sort((a, b) => b.perDay - a.perDay)[0] : null
  return (
    <Reveal className="space-y-4">
      <Grid>
        <M
          report={report}
          k="habitRate"
          label="Habit completion"
          money={money}
          module="habits"
          sub={h ? `${h.done} of ${h.expected} expected` : undefined}
        />
        <M
          report={report}
          k="habitsDone"
          label="Habits done"
          money={money}
          module="habits"
          sub={h ? `${h.active} active habits` : undefined}
        />
        <M
          report={report}
          k="taskRate"
          label="Task completion"
          money={money}
          module="planner"
          sub={t ? `${t.done} of ${t.planned} due` : undefined}
        />
        <Metric
          label="Longest streak"
          module="habits"
          value={h ? `${h.longestStreak}` : '—'}
          sub={h ? 'days or weeks, per habit' : undefined}
        />
      </Grid>
      <Two>
        <Panel title="Completion over time" hint={`Per ${c.series.unit}, as a percentage of what was expected`}>
          <Chart
            height={220}
            empty={!hasAny(c.series.rows, 'habitRate', 'taskRate')}
            emptyText="No habits or tasks were due in this period."
            summary={seriesSummary(
              'Habit completion',
              c.series.rows.map((r) => ({ label: r.label, v: r.habitRate })),
              'v',
              '%',
            )}
          >
            <LineChart data={c.series.rows}>
              {grid()}
              {xAxis({ dataKey: 'label', minTickGap: 18 })}
              {yAxis({ domain: [0, 100], width: 36 })}
              {tooltip({ formatter: (v, n) => [`${v}%`, n] })}
              {legend()}
              <Line
                type="monotone"
                dataKey="habitRate"
                name="Habits"
                stroke={C.mod}
                strokeWidth={2.25}
                dot={c.series.rows.length <= 14}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="taskRate"
                name="Tasks"
                stroke={PALETTE[2]}
                strokeWidth={2.25}
                dot={c.series.rows.length <= 14}
                connectNulls={false}
              />
            </LineChart>
          </Chart>
        </Panel>
        <Panel title="Habits by weekday" hint={best ? `Strongest on ${best.label}s` : 'Completions per day, by weekday'}>
          <Chart
            height={220}
            empty={!h || h.done === 0}
            emptyText="No habits completed in this period."
            summary={seriesSummary('Habits per day', h?.byWeekday ?? [], 'perDay')}
          >
            <BarChart data={h?.byWeekday ?? []}>
              {grid()}
              {xAxis({ dataKey: 'label' })}
              {yAxis({ width: 32, allowDecimals: true })}
              {tooltip({ formatter: (v) => [v, 'Habits done per day'] })}
              <Bar dataKey="perDay" name="Per day" fill={C.mod} radius={[5, 5, 2, 2]} maxBarSize={36} />
            </BarChart>
          </Chart>
        </Panel>
      </Two>
      <Two>
        <Panel title="Habit by habit" hint="Completion against the days each habit was expected">
          <BarList
            empty="No habit was expected in this period."
            items={(h?.perHabit ?? []).slice(0, 10).map((x) => ({
              key: x.id,
              label: x.name,
              value: x.rate ?? 0,
              text: `${Math.round((x.rate ?? 0) * 100)}% · ${x.done}/${x.expected}`,
              color: x.color,
            }))}
          />
        </Panel>
        <Panel title="Tasks" hint="Tasks with a due date in this period (cancelled and skipped ones are left out)">
          {t ? (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {[
                ['Due', t.planned],
                ['Done', t.done],
                ['Still open', t.open],
                ['Done on time', t.onTimeRate == null ? '—' : pctText(t.onTimeRate)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="lt-stat-value mt-0.5 text-xl tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No tasks with a due date yet.</p>
          )}
        </Panel>
      </Two>
    </Reveal>
  )
}
