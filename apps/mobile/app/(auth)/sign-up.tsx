import { useState } from 'react'
import { Link } from 'expo-router'
import { signUpSchema } from '@lifetrack/schemas'
import { toAppError } from '@lifetrack/data'
import { authService } from '../../src/lib/supabase'
import { Button, Field, Screen, Txt } from '../../src/ui'
import { useTheme } from '../../src/providers/ThemeProvider'

export default function SignUp() {
  const { colors } = useTheme()
  const [v, setV] = useState({ name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setFormError(''); setNotice('')
    const r = signUpSchema.safeParse(v)
    if (!r.success) { setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]))); return }
    setErrors({}); setBusy(true)
    try {
      const { needsConfirmation } = await authService!.signUp(r.data.email, r.data.password, r.data.name)
      if (needsConfirmation) setNotice('Check your email and open the confirmation link on this device.')
    } catch (e) { setFormError(toAppError(e).message) } finally { setBusy(false) }
  }
  const set = (k: keyof typeof v) => (t: string) => setV({ ...v, [k]: t })
  return (
    <Screen>
      <Txt variant="title">Create account</Txt>
      <Field label="Name" value={v.name} onChangeText={set('name')} error={errors.name} autoComplete="name" textContentType="name" />
      <Field label="Email" value={v.email} onChangeText={set('email')} error={errors.email} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <Field label="Password" value={v.password} onChangeText={set('password')} error={errors.password} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <Field label="Confirm password" value={v.confirm} onChangeText={set('confirm')} error={errors.confirm} secureTextEntry autoComplete="new-password" onSubmitEditing={submit} />
      {formError ? <Txt style={{ color: colors.danger }}>{formError}</Txt> : null}
      {notice ? <Txt style={{ color: colors.success }}>{notice}</Txt> : null}
      <Button title="Create account" onPress={submit} loading={busy} />
      <Link href="/sign-in" style={{ color: colors.primary, textAlign: 'center', padding: 8, fontWeight: '600' }}>I already have an account</Link>
    </Screen>
  )
}
