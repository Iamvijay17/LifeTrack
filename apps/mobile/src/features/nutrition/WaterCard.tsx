import { useState } from 'react'
import { Text, View } from 'react-native'
import { MAX_WATER_ML, WATER_PRESETS, fmtMl, isValidWaterAmount, percentOfGoal } from '@lifetrack/core/nutrition'
import { api } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useTheme } from '../../providers/ThemeProvider'
import { confirm } from '../../ui/confirm'
import { ProgressBar } from '../../ui/controls'
import { AnimatedNumber } from '../../ui/motion'
import { Button, Card, Field, Txt } from '../../ui'

/** The day's water: +250 / +500 / custom, undo the last drink, and the drinks logged. `day` comes from waterDay(). */
export function WaterCard({ day, goal, date, nowTime, isToday }: { day: any; goal: number; date: string; nowTime: () => string; isToday: boolean }) {
  const { colors } = useTheme()
  const [custom, setCustom] = useState('')
  const [show, setShow] = useState(false)
  const [add, adding] = useAction((ml: number) => api.logWater(date, ml, isToday ? nowTime() : null))
  const [remove, removing] = useAction((entry: any) => api.removeWaterLog(entry))
  const n = Math.floor(Number(custom))
  const busy = adding || removing
  return (
    <Card>
      <Txt variant="small" muted>Water{isToday ? ' today' : ''}</Txt>
      <AnimatedNumber value={fmtMl(day.total)} style={{ color: colors.foreground, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 }} />
      <Txt variant="small" muted>{goal > 0 ? (day.total >= goal ? `Goal of ${fmtMl(goal)} reached` : `${fmtMl(goal - day.total)} to go · goal ${fmtMl(goal)}`) : 'No water goal set'}</Txt>
      {goal > 0 ? <ProgressBar value={percentOfGoal(day.total, goal) ?? 0} label="Water progress" color={colors.secondary} /> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        {WATER_PRESETS.map((ml: number) => <View key={ml} style={{ flex: 1 }}><Button title={`+${ml}`} variant="ghost" disabled={busy} onPress={() => add(ml)} /></View>)}
        <View style={{ flex: 1 }}><Button title="Custom" variant="ghost" disabled={busy} onPress={() => setShow((s) => !s)} /></View>
      </View>
      {show ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}><Field label="Custom amount (ml)" value={custom} onChangeText={setCustom} keyboardType="number-pad" maxLength={String(MAX_WATER_ML).length} /></View>
          <Button title="Add" disabled={busy || !isValidWaterAmount(n)} onPress={async () => { if ((await add(n)) !== undefined) { setCustom(''); setShow(false) } }} />
        </View>
      ) : null}
      {day.last ? <Button title={`Undo last (${day.last.amount_ml} ml)`} variant="ghost" disabled={busy} onPress={() => remove(day.last)} /> : null}
      {[...day.entries].reverse().slice(0, 5).map((w: any) => (
        <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 }}>
          <Text style={{ color: colors.mutedForeground }}>{w.log_time ? w.log_time.slice(0, 5) : '—'}</Text>
          <Text style={{ color: colors.foreground }}>{w.amount_ml} ml</Text>
          <Text accessibilityRole="button" accessibilityLabel={`Delete ${w.amount_ml} ml entry`} onPress={async () => { if (await confirm('Delete this water entry?', `${w.amount_ml} ml will come off the day's total.`)) remove(w) }} style={{ color: colors.danger, padding: 10 }}>Delete</Text>
        </View>
      ))}
      {day.other > 0 ? <Txt variant="small" muted>+ {fmtMl(day.other)} logged in Sleep &amp; Health</Txt> : null}
    </Card>
  )
}
