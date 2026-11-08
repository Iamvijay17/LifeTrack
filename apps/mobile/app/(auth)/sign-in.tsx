import { useRef, useState } from 'react'
import { Link } from 'expo-router'
import { signInSchema } from '@lifetrack/schemas'
import { toAppError } from '@lifetrack/data'
import { authService } from '../../src/lib/supabase'
import { Button, Field, Screen, Txt, type InputRef } from '../../src/ui'
import { BrandMark } from '../../src/ui/BrandMark'
import { useTheme } from '../../src/providers/ThemeProvider'

export default function SignIn() {
  const { colors } = useTheme()
  const [v, setV] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const passwordRef = useRef<InputRef>(null)

  const submit = async () => {
    setFormError('')
    const r = signInSchema.safeParse(v)
    if (!r.success) { setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]))); return }
    setErrors({}); setBusy(true)
    try { await authService!.signIn(r.data.email, r.data.password) } // the auth guard navigates on success
    catch (e) { setFormError(toAppError(e).message) } finally { setBusy(false) }
  }
  return (
    <Screen>
      <BrandMark />
      <Txt variant="title">Welcome back</Txt>
      <Txt muted>Sign in to your LifeTrack account.</Txt>
      <Field label="Email" value={v.email} onChangeText={(email) => setV({ ...v, email })} error={errors.email} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} blurOnSubmit={false} />
      <Field inputRef={passwordRef} label="Password" value={v.password} onChangeText={(password) => setV({ ...v, password })} error={errors.password} secureTextEntry autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} />
      {formError ? <Txt style={{ color: colors.danger }}>{formError}</Txt> : null}
      <Button title="Sign in" onPress={submit} loading={busy} />
      <Link href="/forgot-password" style={{ color: colors.mutedForeground, textAlign: 'center', padding: 8 }}>Forgot password?</Link>
      <Link href="/sign-up" style={{ color: colors.primary, textAlign: 'center', padding: 8, fontWeight: '600' }}>Create an account</Link>
    </Screen>
  )
}
