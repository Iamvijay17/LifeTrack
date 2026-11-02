import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { View } from 'react-native'
import { MODULES } from '../../src/lib/modules'
import { authService } from '../../src/lib/supabase'
import { useAuth } from '../../src/providers/AuthProvider'
import { useTheme } from '../../src/providers/ThemeProvider'
import { Button, Card, Screen, Txt } from '../../src/ui'

export default function More() {
  const router = useRouter()
  const { email } = useAuth()
  const { colors } = useTheme()
  return (
    <Screen>
      <Txt variant="title">More</Txt>
      {MODULES.map((m) => (
        <Card key={m.slug} onPress={() => router.push({ pathname: '/module/[slug]', params: { slug: m.slug } })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name={m.icon} size={22} color={colors.primary} />
            <Txt>{m.title}</Txt>
          </View>
        </Card>
      ))}
      <Card onPress={() => router.push('/sync-check')}><Txt variant="heading">Account &amp; sync check</Txt><Txt variant="small" muted>{email}</Txt></Card>
      <Button title="Sign out" variant="ghost" onPress={() => { authService!.signOut().catch(() => {}) }} />
    </Screen>
  )
}
