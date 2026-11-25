import { useState } from 'react'
import { z } from 'zod'
import { assessPassword } from '@lifetrack/core/security'
import { Field, Input } from '@/components/ui/form'
import { PasswordStrength } from '@/features/security/PasswordStrength'
import { toAppError } from '@/services/errors'

export const email = z.string().trim().toLowerCase().min(1, 'Enter your email').email('Enter a valid email')
export const password = z.string().min(8, 'Use at least 8 characters').max(72, 'Too long')

/** Adds "password and confirm must match" (reported on the confirm field) to any object schema that has both. */
export const passwordsMatch = (schema) =>
  schema.refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

/**
 * Adds "the new password must not be easy to guess" (reported on the password field): not a common password or a small variation of one, not built
 * from the name or email in the same form, no runs like 1234. The length rule above speaks first. Signing IN is never checked this way, so
 * existing accounts with older passwords keep working and are simply asked for a stronger one the next time they choose one.
 */
export const passwordStrong = (schema) =>
  schema.superRefine((v, ctx) => {
    if (typeof v.password !== 'string' || v.password.length < 8) return
    const r = assessPassword(v.password, { email: v.email, name: v.name })
    if (!r.ok) ctx.addIssue({ code: 'custom', path: ['password'], message: r.issues[0] })
  })

/** `{ password, confirm }`, used when choosing a new password. */
export const newPasswordPair = passwordsMatch(passwordStrong(z.object({ password, confirm: z.string() })))

/** Wraps a form action: clears the previous error, runs it, and turns any failure into a friendly message. */
export function useSubmit(fn) {
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const submit = async (values) => {
    setError(null)
    try {
      await fn(values, setNotice)
    } catch (e) {
      setError(toAppError(e).message)
    }
  }
  return { error, notice, submit }
}

export const Err = ({ children }) =>
  children ? (
    <p role="alert" className="animate-slide-down rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {children}
    </p>
  ) : null

export const Note = ({ children }) =>
  children ? (
    <p role="status" className="animate-slide-down rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
      {children}
    </p>
  ) : null

/** Password + confirmation inputs for choosing a new password (register / reset). Pass `watch` to show the live strength meter. */
export function NewPasswordFields({ register, errors, passwordLabel = 'Password', hint, watch, email, name }) {
  return (
    <>
      <Field label={passwordLabel} error={errors.password?.message} hint={hint}>
        <Input type="password" autoComplete="new-password" {...register('password')} />
      </Field>
      {watch && (
        <PasswordStrength
          password={watch('password')}
          email={email ?? watch('email')}
          name={name ?? watch('name')}
          error={errors.password?.message}
        />
      )}
      <Field label="Confirm password" error={errors.confirm?.message}>
        <Input type="password" autoComplete="new-password" {...register('confirm')} />
      </Field>
    </>
  )
}
