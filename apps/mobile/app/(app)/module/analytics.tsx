import { useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { addDays, fmtDay, fmtDuration, formatMoney } from '@lifetrack/utils'
import { ANALYTICS_PRESETS, analyticsRange, pctText, resolveRange } from '@lifetrack/core/analytics'
import { salaryProgression } from '@lifetrack/core/jobs'
import { useTables } from '../../../src/hooks/useTables'
import { useSettings } from '../../../src/hooks/useSettings'
import { useToday } from '../../../src/hooks/useToday'
import { useTheme } from '../../../src/providers/ThemeProvider'
import { BarChart, LineChart } from '../../../src/ui/charts'
import { ModuleHeader } from '../../../src/ui/ModuleHeader'
import { DataGate, DateField, ProgressBar, Segmented, StatTile, pullToRefresh } from '../../../src/ui/controls'
import { Card, Txt } from '../../../src/ui'

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme()
  return <View style={{ gap: 10 }}><Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700', color: colors.foreground }}>{title}</Text>{children}</View>
}
const Tiles = ({ children }: { children: React.ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>
const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => <Card><Txt variant="heading">{title}</Txt>{children}</Card>
const Empty = ({ text }: { text: string }) => <Txt muted style={{ paddingVertical: 8 }}>{text}</Txt>

export default function Analytics() {
  const { colors } = useTheme()
  const today = useToday()
  const { settings } = useSettings()
  const w = settings.week_starts_on
  const money = (p: number) => formatMoney(p, settings.currency)
  const { data, loading, refreshing, error, refetch } = useTables('study_sessions', 'goals', 'job_applications', 'application_history', 'interview_events', 'workouts', 'exercise_logs', 'health_logs', 'transactions', 'habits', 'habit_logs')
  const [preset, setPreset] = useState('month')
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today })
  const { from, to, upto } = resolveRange(preset, custom, today, w)

  const a: any = useMemo(() => analyticsRange({ studySessions: data.study_sessions, goals: data.goals, applications: data.job_applications, history: data.application_history, interviews: data.interview_events, workouts: data.workouts, healthLogs: data.health_logs, transactions: data.transactions, habits: data.habits, habitLogs: data.habit_logs },
    { from, to, upto, today, weekStartsOn: w, workoutPlan: settings.workout_plan ?? {} }), [data, from, to, upto, w, today, settings.workout_plan])
  const bars = (b: any, round = 1) => b.data.map((x: any) => ({ label: x.label, value: Math.round(x.value * round) / round }))
  const salary = (salaryProgression(a.salaryApps, settings.timezone) as any[]).map((x) => ({ label: fmtDay(x.date, 'd MMM'), value: x.lpa }))

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView refreshControl={pullToRefresh(refreshing, refetch)} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        <ModuleHeader title="Analytics" />
        <Txt muted>Everything here is computed from your real records. Empty ranges stay empty.</Txt>
        <Segmented value={preset} onChange={setPreset} options={ANALYTICS_PRESETS as { value: string; label: string }[]} />
        {preset === 'custom' ? (<>
          <DateField label="From" value={custom.from} onChange={(v) => v && setCustom({ ...custom, from: v })} />
          <DateField label="To" value={custom.to} onChange={(v) => v && setCustom({ ...custom, to: v })} />
        </>) : null}
        <Txt variant="small" muted>{fmtDay(from, 'd MMM yyyy')} – {fmtDay(to, 'd MMM yyyy')}</Txt>
        <DataGate loading={loading} error={error} onRetry={refetch}>
          <Block title="Career & learning">
            <Tiles><StatTile label="Study hours" value={fmtDuration(a.studyMinutes)} sub={`${a.studySessionCount} sessions`} /><StatTile label="DSA problems solved" value={a.problems} /></Tiles>
            <Panel title={`Study hours per ${a.study.unit}`}>{a.studyMinutes === 0 ? <Empty text="No completed study sessions in this range." /> : <BarChart data={bars(a.study, 100)} unit="h" summary={`Study hours per ${a.study.unit}, total ${fmtDuration(a.studyMinutes)}`} />}</Panel>
            <Panel title="Learning goals">{a.goalRows.length === 0 ? <Empty text="No goals yet." /> : a.goalRows.map(({ g, p }: any) => (
              <View key={g.id} style={{ gap: 4, paddingVertical: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text numberOfLines={1} style={{ color: colors.foreground, flex: 1 }}>{g.title}</Text><Txt variant="small" muted>{p.percent == null ? '—' : `${p.percent}%`}</Txt></View>
                <ProgressBar value={p.percent ?? 0} color={(p.percent ?? 0) >= 100 ? colors.success : colors.primary} label={g.title} />
              </View>))}</Panel>
          </Block>

          <Block title="Job search">
            <Tiles>
              <StatTile label="Applications" value={a.jobs.applied} /><StatTile label="Interviews" value={a.jobs.interviews} /><StatTile label="Rejections" value={a.jobs.rejections} />
              <StatTile label="Interview conversion" value={pctText(a.jobs.conversion)} sub={a.jobs.applied ? `${a.jobs.interviews}/${a.jobs.applied} applications` : 'no applications'} />
            </Tiles>
            <Panel title={`Applications per ${a.jobBuckets.unit}`}>{a.apps.length === 0 ? <Empty text="No applications with an applied date in this range." /> : <BarChart data={bars(a.jobBuckets)} color={colors.secondary} summary={`Applications per ${a.jobBuckets.unit}, total ${a.apps.length}`} />}</Panel>
            <Panel title="Package progression (LPA)">{salary.length === 0 ? <Empty text="No packages recorded in this range." /> : <LineChart data={salary} unit="L" summary={`Package progression, latest ${salary.at(-1)!.value} LPA`} />}</Panel>
          </Block>

          <Block title="Fitness">
            <Tiles>
              <StatTile label="Workouts completed" value={a.done.length} />
              <StatTile label="Plan consistency" value={a.planConsistency == null ? '—' : pctText(a.planConsistency)} sub={a.plannedDays.length ? `${a.hit.length}/${a.plannedDays.length} planned days` : 'no planned days'} progress={a.planConsistency == null ? null : a.planConsistency * 100} tone="success" />
            </Tiles>
            <Panel title={`Workouts per ${a.wBuckets.unit}`}>{a.done.length === 0 ? <Empty text="No workouts in this range." /> : <BarChart data={bars(a.wBuckets)} color={colors.success} summary={`Workouts per ${a.wBuckets.unit}, total ${a.done.length}`} />}</Panel>
            <Panel title="Weight trend (kg)">{a.weights.length < 2 ? <Empty text="Log weight on two or more days in this range." /> : <LineChart data={a.weights.map((p: any) => ({ label: p.label, value: p.kg }))} unit=" kg" summary={`Weight trend, latest ${a.weights.at(-1).kg} kg`} />}</Panel>
          </Block>

          <Block title="Sleep & health">
            <Tiles>
              <StatTile label="Average sleep" value={a.sleepAvg == null ? '—' : fmtDuration(a.sleepAvg)} />
              <StatTile label="Average water" value={a.waterAvg == null ? '—' : `${Math.round(a.waterAvg)} ml`} />
              <StatTile label="Average steps" value={a.stepsAvg == null ? '—' : Math.round(a.stepsAvg).toLocaleString('en-IN')} />
            </Tiles>
            <Panel title="Sleep (hours)">{a.sleepSeries.every((x: any) => x.hours == null) ? <Empty text="No sleep logged in this range." /> : <BarChart data={a.sleepSeries.map((x: any) => ({ label: x.label, value: x.hours ?? null }))} unit="h" refLine={8} maxValue={10} color={colors.secondary} summary={`Average sleep ${a.sleepAvg == null ? 'none' : fmtDuration(a.sleepAvg)}`} />}</Panel>
          </Block>

          <Block title="Finance">
            <Tiles>
              <StatTile label="Income" value={money(a.sum.income)} /><StatTile label="Expenses" value={money(a.sum.expense)} />
              <StatTile label="Savings" value={money(a.sum.savings)} sub={a.sum.income ? `${Math.round((a.sum.savings / a.sum.income) * 100)}% of income` : undefined} />
            </Tiles>
            <Panel title={`Spending per ${a.spend.unit}`}>{a.sum.expense === 0 ? <Empty text="No expenses in this range." /> : <BarChart data={bars(a.spend)} color={colors.danger} summary={`Spending per ${a.spend.unit}, total ${money(a.sum.expense)}`} />}</Panel>
            <Panel title="Top expense categories">{a.categories.length === 0 ? <Empty text="No expenses in this range." /> : a.categories.slice(0, 6).map((c: any) => (
              <View key={c.category} style={{ gap: 4, paddingVertical: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.foreground }}>{c.category}</Text><Txt variant="small" muted>{money(c.paise)} · {Math.round(c.share * 100)}%</Txt></View>
                <ProgressBar value={c.share * 100} color={colors.danger} label={c.category} />
              </View>))}</Panel>
          </Block>

          <Block title="Habits">
            <Tiles>
              <StatTile label="Completion" value={pctText(a.habitRate)} progress={a.habitRate == null ? null : a.habitRate * 100} tone="success" />
              <StatTile label="Longest streak" value={a.longestStreak} sub="any habit, all time" />
              <StatTile label="Active habits" value={a.activeHabits} />
            </Tiles>
            <Panel title="Most consistent habits">{a.ranked.length === 0 ? <Empty text="No habit activity in this range." /> : a.ranked.slice(0, 8).map((x: any) => (
              <View key={x.h.id} style={{ gap: 4, paddingVertical: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text numberOfLines={1} style={{ color: colors.foreground, flex: 1 }}>{x.h.name}</Text><Txt variant="small" muted>{pctText(x.rate)} · {x.done}/{x.expected}</Txt></View>
                <ProgressBar value={x.rate * 100} color={x.h.color} label={`${x.h.name} completion`} />
              </View>))}</Panel>
          </Block>
        </DataGate>
      </ScrollView>
    </SafeAreaView>
  )
}
