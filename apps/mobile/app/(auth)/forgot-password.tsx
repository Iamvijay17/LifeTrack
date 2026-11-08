import { useState } from 'react'
import { Link } from 'expo-router'
import { forgotPasswordSchema } from '@lifetrack/schemas'
import { toAppError } from '@lifetrack/data'
import { authService } from '../../src/lib/supabase'
import { Button, Field, Screen, Txt } from '../../src/ui'
import { BrandMark } from '../../src/ui/BrandMark'
import { useTheme } from '../../src/providers/ThemeProvider'

export default function ForgotPassword() {
  const { colors } = useTheme()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setError('')
    const r = forgotPasswordSchema.safeParse({ email })
    if (!r.success) { setError(r.error.issues[0].message); return }
    setBusy(true)
    try { await authService!.sendPasswordReset(r.data.email); setSent(true) } catch (e) { setError(toAppError(e).message) } finally { setBusy(false) }
  }
  return (
    <Screen>
      <BrandMark />
      <Txt variant="title">Reset password</Txt>
      <Txt muted>We will email you a link. Open it on this device.</Txt>
      <Field label="Email" value={email} onChangeText={setEmail} error={error} autoCapitalize="none" keyboardType="email-address" autoComplete="email" onSubmitEditing={submit} />
      {sent ? <Txt style={{ color: colors.success }}>If that email has an account, a reset link is on its way.</Txt> : null}
      <Button title="Send reset link" onPress={submit} loading={busy} />
      <Link href="/sign-in" style={{ color: colors.primary, textAlign: 'center', padding: 8, fontWeight: '600' }}>Back to sign in</Link>
    </Screen>
  )
}
