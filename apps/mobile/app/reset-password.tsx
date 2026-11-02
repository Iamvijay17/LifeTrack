import { useEffect, useRef, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { z } from 'zod'
import { passwordSchema } from '@lifetrack/schemas'
import { toAppError } from '@lifetrack/data'
import { authService, supabase } from '../src/lib/supabase'
import { useAuth } from '../src/providers/AuthProvider'
import { Button, Field, Screen, Txt } from '../src/ui'
import { useTheme } from '../src/providers/ThemeProvider'

const schema = z.object({ password: passwordSchema, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

/** lifetrack://reset-password?code=… — exchanges the recovery code, then lets the user choose a new password. */
export default function ResetPassword() {
  const { code } = useLocalSearchParams<{ code?: string }>()
  const { session } = useAuth()
  const { colors } = useTheme()
  const router = useRouter()
  const [v, setV] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [linkError, setLinkError] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const tried = useRef(false)

  useEffect(() => {
    if (tried.current || !code) return
    tried.current = true
    supabase!.auth.exchangeCodeForSession(String(code)).then(({ error }) => { if (error) setLinkError('This reset link is invalid or has expired. Request a new one.') })
  }, [code])

  const submit = async () => {
    setFormError('')
    const r = schema.safeParse(v)
    if (!r.success) { setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]))); return }
    setErrors({}); setBusy(true)
    try { await authService!.updatePassword(r.data.password); router.replace('/') } catch (e) { setFormError(toAppError(e).message) } finally { setBusy(false) }
  }

  if (linkError || (!code && !session)) {
    return <Screen><Txt variant="heading">Link problem</Txt><Txt muted>{linkError || 'Open the reset link from your email on this device.'}</Txt><Button title="Back to sign in" onPress={() => router.replace('/')} /></Screen>
  }
  if (!session) return <Screen><Txt muted>Verifying link…</Txt></Screen>
  return (
    <Screen>
      <Txt variant="title">New password</Txt>
      <Field label="New password" value={v.password} onChangeText={(password) => setV({ ...v, password })} error={errors.password} secureTextEntry autoComplete="new-password" />
      <Field label="Confirm password" value={v.confirm} onChangeText={(confirm) => setV({ ...v, confirm })} error={errors.confirm} secureTextEntry autoComplete="new-password" onSubmitEditing={submit} />
      {formError ? <Txt style={{ color: colors.danger }}>{formError}</Txt> : null}
      <Button title="Update password" onPress={submit} loading={busy} />
    </Screen>
  )
}
