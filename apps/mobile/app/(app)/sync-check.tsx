import { useState } from 'react'
import { toAppError } from '@lifetrack/data'
import { useAuth } from '../../src/providers/AuthProvider'
import { store } from '../../src/data/client'
import { useTable } from '../../src/data/useTable'
import type { Row } from '../../src/data/queryStore'
import { Button, Card, Screen, Txt } from '../../src/ui'
import { useTheme } from '../../src/providers/ThemeProvider'

interface Settings extends Row { id: string; user_id: string; daily_study_target_minutes: number; timezone: string; currency: string }

/** Proves the same account/RLS/realtime path works from mobile: edit here, watch it change on web (and vice versa). */
export default function SyncCheck() {
  const { email, session } = useAuth()
  const { colors } = useTheme()
  const { rows, loading, error, fetching, refetch } = useTable<Settings>('user_settings')
  const [err, setErr] = useState('')
  const s = rows[0]
  const bump = async (d: number) => {
    setErr('')
    try { await store.update('user_settings', s.id, { daily_study_target_minutes: Math.max(0, Math.min(1440, s.daily_study_target_minutes + d)) }) }
    catch (e) { setErr(toAppError(e).message) }
  }
  return (
    <Screen>
      <Txt variant="title">Account &amp; sync check</Txt>
      <Card><Txt variant="small" muted>Signed in as</Txt><Txt>{email}</Txt><Txt variant="small" muted>User id</Txt><Txt variant="small">{session?.user.id}</Txt></Card>
      <Card>
        <Txt variant="heading">Daily study target</Txt>
        {loading ? <Txt muted>Loading…</Txt> : error ? <Txt style={{ color: colors.danger }}>{toAppError(error).message}</Txt> : s ? (
          <>
            <Txt variant="title">{s.daily_study_target_minutes} min</Txt>
            <Txt variant="small" muted>{s.timezone} · {s.currency}{fetching ? ' · syncing…' : ''}</Txt>
          </>
        ) : <Txt muted>No settings row found.</Txt>}
      </Card>
      {s ? <><Button title="+15 min" onPress={() => bump(15)} /><Button title="−15 min" variant="ghost" onPress={() => bump(-15)} /></> : null}
      {err ? <Txt style={{ color: colors.danger }}>{err}</Txt> : null}
      <Button title="Refresh" variant="ghost" onPress={() => refetch()} />
    </Screen>
  )
}
