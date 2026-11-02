import { Link, Stack } from 'expo-router'
import { useTheme } from '../src/providers/ThemeProvider'
import { Screen, Txt } from '../src/ui'

export default function NotFound() {
  const { colors } = useTheme()
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Screen>
        <Txt variant="title">Page not found</Txt>
        <Txt muted>That link doesn&apos;t lead anywhere in LifeTrack.</Txt>
        <Link href="/" style={{ color: colors.primary, fontWeight: '600', padding: 12 }}>Go to the dashboard</Link>
      </Screen>
    </>
  )
}
