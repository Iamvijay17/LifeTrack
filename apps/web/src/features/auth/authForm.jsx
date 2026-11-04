import { useState } from 'react'
import { z } from 'zod'
import { Field, Input } from '@/components/ui/form'
import { toAppError } from '@/services/errors'

export const email = z.string().trim().toLowerCase().min(1, 'Enter your email').email('Enter a valid email')
export const password = z.string().min(8, 'Use at least 8 characters').max(72, 'Too long')

/** Adds "password and confirm must match" (reported on the confirm field) to any object schema that has both. */
export const passwordsMatch = (schema) =>
  schema.refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

/** `{ password, confirm }`, used when choosing a new password. */
export const newPasswordPair = passwordsMatch(z.object({ password, confirm: z.string() }))

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

/** Password + confirmation inputs for choosing a new password (register / reset). */
export function NewPasswordFields({ register, errors, passwordLabel = 'Password', hint }) {
  return (
    <>
      <Field label={passwordLabel} error={errors.password?.message} hint={hint}>
        <Input type="password" autoComplete="new-password" {...register('password')} />
      </Field>
      <Field label="Confirm password" error={errors.confirm?.message}>
        <Input type="password" autoComplete="new-password" {...register('confirm')} />
      </Field>
    </>
  )
}
