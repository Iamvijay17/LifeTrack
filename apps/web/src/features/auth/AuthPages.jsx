import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { emailSchema, passwordSchema } from '@lifetrack/schemas'
import { AuthLayout } from './AuthLayout'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { auth } from '@/services/auth'
import { toAppError } from '@/services/errors'
import { useAuth } from '@/hooks/useAuth'

const email = emailSchema
const password = passwordSchema

function useSubmit(fn) {
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const submit = async (values) => {
    setError(null)
    try { await fn(values, setNotice) } catch (e) { setError(toAppError(e).message) }
  }
  return { error, notice, submit }
}
const Err = ({ children }) => children ? <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{children}</p> : null
const Note = ({ children }) => children ? <p role="status" className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{children}</p> : null

export function LoginPage() {
  const { session } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(z.object({ email, password: z.string().min(1, 'Enter your password') })) })
  const { error, submit } = useSubmit(async (v) => { await auth.signIn(v.email, v.password); nav(loc.state?.from ?? '/', { replace: true }) })
  if (session) return <Navigate to="/" replace />
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your LifeTrack." footer={<>New here? <Link className="text-secondary hover:underline" to="/register">Create an account</Link></>}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <Err>{error}</Err>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" inputMode="email" {...register('email')} /></Field>
        <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register('password')} /></Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>Sign in</Button>
        <p className="text-center text-sm"><Link className="text-muted-foreground hover:text-foreground" to="/forgot-password">Forgot password?</Link></p>
      </form>
    </AuthLayout>
  )
}

export function RegisterPage() {
  const { session } = useAuth()
  const nav = useNavigate()
  const schema = z.object({ name: z.string().trim().min(1, 'Enter your name').max(80), email, password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })
  const { error, notice, submit } = useSubmit(async (v, setNotice) => {
    const r = await auth.signUp(v.email, v.password, v.name)
    if (r.needsConfirmation) setNotice('Account created. Check your email and click the confirmation link, then sign in.')
    else nav('/', { replace: true })
  })
  if (session) return <Navigate to="/" replace />
  return (
    <AuthLayout title="Create your account" subtitle="Your private life dashboard, synced on every device." footer={<>Already registered? <Link className="text-secondary hover:underline" to="/login">Sign in</Link></>}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <Err>{error}</Err><Note>{notice}</Note>
        <Field label="Name" error={errors.name?.message}><Input autoComplete="name" {...register('name')} /></Field>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" inputMode="email" {...register('email')} /></Field>
        <Field label="Password" error={errors.password?.message} hint="At least 8 characters"><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
        <Field label="Confirm password" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" {...register('confirm')} /></Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>Create account</Button>
      </form>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(z.object({ email })) })
  const { error, notice, submit } = useSubmit(async (v, setNotice) => { await auth.sendPasswordReset(v.email); setNotice('If that email has an account, a reset link is on its way.') })
  return (
    <AuthLayout title="Reset password" subtitle="We'll email you a link to choose a new password." footer={<Link className="text-secondary hover:underline" to="/login">Back to sign in</Link>}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <Err>{error}</Err><Note>{notice}</Note>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>Send reset link</Button>
      </form>
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const { session, recovery, clearRecovery, loading } = useAuth()
  const nav = useNavigate()
  const schema = z.object({ password, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })
  const { error, submit } = useSubmit(async (v) => { await auth.updatePassword(v.password); clearRecovery(); nav('/', { replace: true }) })
  if (!loading && !session) return (
    <AuthLayout title="Link expired" subtitle="This reset link is invalid or has expired." footer={<Link className="text-secondary hover:underline" to="/forgot-password">Request a new link</Link>} />
  )
  return (
    <AuthLayout title="Choose a new password" subtitle={recovery ? undefined : 'You are signed in. Set a new password below.'}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <Err>{error}</Err>
        <Field label="New password" error={errors.password?.message}><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
        <Field label="Confirm password" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" {...register('confirm')} /></Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>Update password</Button>
      </form>
    </AuthLayout>
  )
}
