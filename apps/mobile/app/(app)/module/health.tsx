import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { fmtDay, fmtDuration, sleepMinutes } from '@lifetrack/utils'
import { healthSummary, historyLine, signedKg } from '@lifetrack/core/health'
import { averageEnergy, sleepConsistency, sleepGoalOf } from '@lifetrack/core/sleep'
import { healthFormSchema, healthFormToPayload, healthToForm } from '@lifetrack/schemas'
import { api, store } from '../../../src/data/client'
import { useTables } from '../../../src/hooks/useTables'
import { useSettings } from '../../../src/hooks/useSettings'
import { useToday } from '../../../src/hooks/useToday'
import { useAction } from '../../../src/hooks/useAction'
import { useZodForm } from '../../../src/hooks/useZodForm'
import { useTheme } from '../../../src/providers/ThemeProvider'
import { WaterSheet } from '../../../src/features/health/WaterSheet'
import { BarChart, LineChart } from '../../../src/ui/charts'
import { ModuleHeader } from '../../../src/ui/ModuleHeader'
import { confirm } from '../../../src/ui/confirm'
import { Chip, DataGate, DateNav, StatTile, TimeField, pullToRefresh } from '../../../src/ui/controls'
import { Button, Card, Field, Txt } from '../../../src/ui'

export default function Health() {
  const { colors } = useTheme()
  const today = useToday()
  const { settings } = useSettings()
  const { data, loading, refreshing, error, refetch } = useTables('health_logs')
  const [date, setDate] = useState<string | null>(null)
  const day = date ?? today
  const [water, setWater] = useState(false)
  const log = data.health_logs.find((h: any) => h.log_date === day)
  const { values, errors, set, reset, validate } = useZodForm(healthFormSchema, healthToForm(null))
  useEffect(() => { reset(healthToForm(log)) }, [day, log?.id, log?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps
  const liveSleep = sleepMinutes(values.bedtime, values.wake_time)

  const [save, saving] = useAction(async () => {
    const v = validate()
    if (!v) return
    await api.saveHealth(day, healthFormToPayload(v))
  })
  const [del] = useAction((id: string) => store.remove('health_logs', id))
  const h: any = useMemo(() => healthSummary(data.health_logs, today), [data.health_logs, today])
  const sleepData = h.week.map((w: any) => ({ label: w.label, value: w.sleep }))
  const waterData = h.week.map((w: any) => ({ label: w.label, value: w.water }))
  const sleepGoal = sleepGoalOf(settings)
  const { consistency, energy }: any = useMemo(() => {
    const recent = h.history.slice(0, 14)
    return { consistency: sleepConsistency(recent, { goalMinutes: sleepGoal }), energy: averageEnergy(recent) }
  }, [h, sleepGoal])

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView refreshControl={pullToRefresh(refreshing, refetch)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <ModuleHeader title="Sleep & Health" action={<Button title="Log water" variant="ghost" onPress={() => setWater(true)} />} />
        <DataGate loading={loading} error={error} onRetry={refetch}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <StatTile label="Avg sleep (7 days)" value={h.avgSleepMinutes == null ? '—' : fmtDuration(h.avgSleepMinutes)} sub={h.nightsLogged ? `goal ${fmtDuration(sleepGoal)} · ${h.nightsLogged} night${h.nightsLogged === 1 ? '' : 's'}` : 'No sleep logged'} progress={h.avgSleepMinutes == null ? null : Math.min(100, (h.avgSleepMinutes / sleepGoal) * 100)} />
            <StatTile label="Water today" value={`${h.todayLog?.water_ml ?? 0} ml`} sub={settings.water_goal_ml ? `goal ${settings.water_goal_ml} ml` : undefined} progress={settings.water_goal_ml ? ((h.todayLog?.water_ml ?? 0) / settings.water_goal_ml) * 100 : null} tone="success" />
            <StatTile label="Steps today" value={(h.todayLog?.steps ?? 0).toLocaleString('en-IN')} sub={settings.steps_goal ? `goal ${settings.steps_goal.toLocaleString('en-IN')}` : undefined} progress={settings.steps_goal ? ((h.todayLog?.steps ?? 0) / settings.steps_goal) * 100 : null} />
            <StatTile label="Latest weight" value={h.latestWeight != null ? `${h.latestWeight} kg` : '—'} sub={h.weightChange != null ? `${signedKg(h.weightChange)} since first log` : undefined} />
          </View>

          <Card>
            <Txt variant="heading">Daily log</Txt>
            <DateNav date={day} today={today} onChange={setDate} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TimeField label="Bedtime" value={values.bedtime} onChange={(v) => set('bedtime', v)} error={errors.bedtime} clearable />
              <TimeField label="Wake-up" value={values.wake_time} onChange={(v) => set('wake_time', v)} error={errors.wake_time} clearable />
            </View>
            {liveSleep != null ? <View accessibilityLiveRegion="polite"><Txt>Sleep: {fmtDuration(liveSleep)}</Txt></View> : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <View style={{ flex: 1 }}><Field label="Water (ml)" value={values.water_ml} onChangeText={(t) => set('water_ml', t)} error={errors.water_ml} keyboardType="number-pad" /></View>
              <View style={{ flex: 1 }}><Field label="Steps" value={values.steps} onChangeText={(t) => set('steps', t)} error={errors.steps} keyboardType="number-pad" /></View>
            </View>
            <Text style={{ color: colors.foreground, fontWeight: '500', marginTop: 8 }}>Energy level <Text style={{ color: colors.mutedForeground, fontWeight: '400', fontSize: 13 }}>1 low · 5 high</Text></Text>
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => <Chip key={n} label={String(n)} selected={values.energy_level === String(n)} onPress={() => set('energy_level', values.energy_level === String(n) ? '' : String(n))} />)}
            </View>
            <Field label="Weight (kg)" value={values.weight_kg} onChangeText={(t) => set('weight_kg', t)} error={errors.weight_kg} keyboardType="decimal-pad" />
            <Field label="Notes" value={values.notes} onChangeText={(t) => set('notes', t)} multiline numberOfLines={2} style={{ minHeight: 64, textAlignVertical: 'top', paddingTop: 12 }} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {log ? <View style={{ flex: 1 }}><Button title="Delete" variant="ghost" onPress={async () => { if (await confirm(`Delete the log for ${fmtDay(day, 'd MMM')}?`)) del(log.id) }} /></View> : null}
              <View style={{ flex: 2 }}><Button title={log ? 'Update log' : 'Save log'} onPress={save} loading={saving} /></View>
            </View>
          </Card>

          <Card><Txt variant="heading">Sleep — last 7 days (hours)</Txt>
            <BarChart data={sleepData} unit="h" refLine={sleepGoal / 60} maxValue={12} color={colors.secondary} summary={`Hours of sleep, last 7 days: ${sleepData.map((d: any) => `${d.label} ${d.value ?? 'none'}`).join(', ')}. Goal ${sleepGoal / 60} hours.`} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
              {([['Goal', fmtDuration(sleepGoal)], ['Met goal', consistency.nightsLogged ? `${consistency.nightsMetGoal} of ${consistency.nightsLogged}` : null], ['Usual bedtime', consistency.avgBedtime], ['Usual wake-up', consistency.avgWake], ['Regularity', consistency.label], ['Avg energy', energy != null ? `${energy} / 5` : null]] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
                <View key={k} style={{ flexBasis: '45%', flexGrow: 1 }}><Txt variant="small" muted>{k}</Txt><Text style={{ color: colors.foreground, fontWeight: '500' }}>{v}</Text></View>
              ))}
            </View></Card>
          <Card><Txt variant="heading">Water (ml)</Txt>
            <BarChart data={waterData} refLine={settings.water_goal_ml || undefined} color={colors.success} summary={`Water in ml, last 7 days: ${waterData.map((d: any) => `${d.label} ${d.value ?? 0}`).join(', ')}`} /></Card>
          <Card><Txt variant="heading">Weight trend (kg)</Txt>
            {h.weightSeries.length < 2 ? <Txt muted>Log weight on two or more days.</Txt> : <LineChart data={h.weightSeries.map((p: any) => ({ label: p.label, value: p.kg }))} unit=" kg" summary={`Weight trend, latest ${h.latestWeight} kg`} />}</Card>
          <Card>
            <Txt variant="heading">History</Txt>
            {h.history.length === 0 ? <Txt muted>Your daily logs will appear here.</Txt> : h.history.map((x: any) => (
              <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`Open ${fmtDay(x.log_date, 'd MMMM')}`} onPress={() => setDate(x.log_date)} style={{ paddingVertical: 10, minHeight: 44 }}>
                <Text style={{ color: colors.foreground, fontWeight: '500' }}>{fmtDay(x.log_date, 'EEE, d MMM')}</Text>
                <Txt variant="small" muted>{historyLine(x)}</Txt>
              </Pressable>
            ))}
          </Card>
        </DataGate>
      </ScrollView>
      <WaterSheet visible={water} onClose={() => setWater(false)} date={today} current={h.todayLog?.water_ml ?? 0} goal={settings.water_goal_ml} />
    </SafeAreaView>
  )
}
