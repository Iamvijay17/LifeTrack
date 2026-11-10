import { useRouter } from 'expo-router'
import { View } from 'react-native'
import { MODULES } from '../../../src/lib/modules'
import { signOutCleanly } from '../../../src/lib/signOut'
import { useAuth } from '../../../src/providers/AuthProvider'
import { moduleForSegment } from '../../../src/ui/accent'
import { IconTile } from '../../../src/ui/motion'
import { Button, Card, Screen, Txt } from '../../../src/ui'

export default function More() {
  const router = useRouter()
  const { email } = useAuth()
  return (
    <Screen>
      <Txt variant="title">More</Txt>
      {MODULES.map((m) => (
        <Card key={m.slug} onPress={() => router.push(m.href as never)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconTile name={m.icon} size={38} module={moduleForSegment(m.slug)} />
            <Txt>{m.title}</Txt>
          </View>
        </Card>
      ))}
      <Card onPress={() => router.push('/module/settings')}><Txt variant="heading">Settings</Txt><Txt variant="small" muted>Profile, preferences, score weights, account</Txt></Card>
      <Card onPress={() => router.push('/help')}><Txt variant="heading">Help &amp; Support</Txt><Txt variant="small" muted>Getting around, your data, and common questions</Txt></Card>
      <Card onPress={() => router.push('/sync-check')}><Txt variant="heading">Account &amp; sync check</Txt><Txt variant="small" muted>{email}</Txt></Card>
      <Button title="Sign out" variant="ghost" onPress={() => { signOutCleanly().catch(() => {}) }} />
    </Screen>
  )
}
