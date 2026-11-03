import { useCallback, useEffect, useState } from 'react'
import { Linking, View } from 'react-native'
import { useAction } from '../../hooks/useAction'
import { Card, Button, Txt } from '../../ui'
import { describeEnableResult } from './pushService'
import { pushService } from './index'

/** Turn push on/off for THIS device. Asks for the OS permission only when the user taps Enable. */
export function PushDeviceCard() {
  const [state, setState] = useState<{ supported: boolean; permission: 'granted' | 'ask' | 'blocked'; enabled: boolean } | null>(null)
  const [message, setMessage] = useState('')
  const reload = useCallback(() => { pushService.status().then(setState).catch(() => {}) }, [])
  useEffect(reload, [reload])
  const [enable, enabling] = useAction(async () => { const r = await pushService.enable(); setMessage(describeEnableResult(r)); reload() })
  const [disable, disabling] = useAction(async () => { await pushService.disable(); setMessage('Push notifications are off for this device. Your inbox still works.'); reload() })
  if (!state) return null
  return (
    <Card>
      <Txt variant="heading">Push on this device</Txt>
      <Txt variant="small" muted>
        {state.enabled ? 'On — reminders arrive here even when LifeTrack is closed.' : state.permission === 'blocked' ? 'Blocked in your phone settings.' : 'Off — reminders appear in your inbox, but not as push notifications.'}
      </Txt>
      <View style={{ gap: 8, marginTop: 6 }}>
        {state.enabled ? <Button title="Turn off for this device" variant="ghost" onPress={disable} loading={disabling} />
          : state.permission === 'blocked' ? <Button title="Open phone settings" onPress={() => Linking.openSettings().catch(() => {})} />
          : <Button title="Enable push notifications" onPress={enable} loading={enabling} />}
      </View>
      {message ? <Txt variant="small" style={{ marginTop: 6 }}>{message}</Txt> : null}
    </Card>
  )
}
