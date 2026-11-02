import { useState } from 'react'
import { View } from 'react-native'
import { WATER_PRESETS, isValidCustomWater } from '@lifetrack/core/health'
import { api } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { Sheet } from '../../ui/Sheet'
import { ProgressBar } from '../../ui/controls'
import { Button, Field, Txt } from '../../ui'

export function WaterSheet({ visible, onClose, date, current, goal }: { visible: boolean; onClose: () => void; date: string; current: number; goal: number }) {
  const [custom, setCustom] = useState('')
  const [add, pending] = useAction((ml: number) => api.addWater(date, ml))
  const n = Number(custom)
  return (
    <Sheet visible={visible} title="Log water" onClose={onClose}>
      <Txt muted>{current} ml{goal ? ` of ${goal} ml` : ''} today</Txt>
      {goal > 0 ? <ProgressBar value={(current / goal) * 100} label="Water progress" /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {WATER_PRESETS.map((ml: number) => <View key={ml} style={{ minWidth: '45%', flexGrow: 1 }}><Button title={`+${ml} ml`} variant="ghost" disabled={pending} onPress={() => add(ml)} /></View>)}
      </View>
      <Field label="Custom amount (ml)" value={custom} onChangeText={setCustom} keyboardType="number-pad" maxLength={4} />
      <Button title="Add" disabled={pending || !isValidCustomWater(n)} onPress={async () => { if (await add(Math.floor(n)) !== undefined) setCustom('') }} />
      {current > 0 ? <Button title="Undo last 250 ml" variant="ghost" disabled={pending} onPress={() => add(-250)} /> : null}
    </Sheet>
  )
}
