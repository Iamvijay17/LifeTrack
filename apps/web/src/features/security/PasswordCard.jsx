import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { assessPassword } from '@lifetrack/core/security'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { useAction } from '@/hooks/useAction'
import { useAuth } from '@/hooks/useAuth'
import { auth } from '@/services/auth'
import { PasswordStrength } from './PasswordStrength'

/** Zod schema for the change form. The strength rule needs the user's name and email, so it is built per user. */
export const changePasswordSchema = ({ email, name } = {}) =>
  z
    .object({
      current: z.string().min(1, 'Enter your current password.'),
      password: z.string().superRefine((value, ctx) => {
        const r = assessPassword(value, { email, name })
        if (!r.ok) ctx.addIssue({ code: 'custom', message: r.issues[0] })
      }),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match.' })
    .refine((v) => v.password !== v.current, { path: ['password'], message: 'Choose a password different from the current one.' })

export function PasswordCard() {
  const { user, displayName } = useAuth()
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(changePasswordSchema({ email: user?.email, name: displayName })),
    defaultValues: { current: '', password: '', confirm: '' },
  })
  const [change, changing] = useAction(
    async (v) => {
      const r = await auth.changePassword(v.current, v.password)
      reset()
      return r
    },
    { success: (r) => (r?.othersSignedOut === false ? 'Password changed' : 'Password changed. Your other devices were signed out.') },
  )
  const next = watch('password')

  return (
    <SettingsSection
      headingAs="h3"
      icon={KeyRound}
      title="Account password"
      desc="Protects your whole account. We store only a salted hash of it, never the password."
    >
      <form className="grid gap-3 sm:grid-cols-2" noValidate onSubmit={handleSubmit(change)} aria-label="Change password">
        <Field label="Current password" error={errors.current?.message} className="sm:col-span-2">
          <Input type="password" autoComplete="current-password" {...register('current')} />
        </Field>
        <div className="space-y-2">
          <Field label="New password" error={errors.password?.message}>
            <Input type="password" autoComplete="new-password" {...register('password')} />
          </Field>
          <PasswordStrength password={next} email={user?.email} name={displayName} error={errors.password?.message} />
        </div>
        <Field label="Confirm new password" error={errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" {...register('confirm')} />
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" loading={changing}>
            Change password
          </Button>
          <span className="text-xs text-muted-foreground">
            Changing it signs your other devices out.{' '}
            <Link to="/forgot-password" className="text-mod-text underline underline-offset-2">
              Forgot it? Email me a reset link
            </Link>
          </span>
        </div>
      </form>
    </SettingsSection>
  )
}
