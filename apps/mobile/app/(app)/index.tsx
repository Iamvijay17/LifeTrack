import { useAuth } from '../../src/providers/AuthProvider'
import { useTable } from '../../src/data/useTable'
import { Card, Screen, Txt } from '../../src/ui'
import { todayStr } from '@lifetrack/utils'

export default function Dashboard() {
  const { displayName } = useAuth()
  const { rows: settings } = useTable<{ id: string; timezone: string }>('user_settings')
  const tz = settings[0]?.timezone ?? 'Asia/Kolkata'
  return (
    <Screen>
      <Txt variant="title">Hello, {displayName}</Txt>
      <Txt muted>{todayStr(tz)}</Txt>
      <Card><Txt variant="heading">Dashboard</Txt><Txt muted>Today&apos;s score, tasks and habits arrive in Phase 4.</Txt></Card>
    </Screen>
  )
}
