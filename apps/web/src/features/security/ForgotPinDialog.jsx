import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/form'
import { useAuth } from '@/hooks/useAuth'
import { auth } from '@/services/auth'
import { toAppError } from '@/services/errors'

/**
 * "I forgot my PIN", from the Security page. Typing the account password signs in afresh; the server then lets a session that fresh set a new PIN
 * (reset_app_lock, only within 10 minutes of signing in), and locks every other device again.
 */
export function ForgotPinDialog({ open, onOpenChange, onVerified }) {
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setPassword('')
      setError('')
      setBusy(false)
    }
  }, [open])
  const submit = async (e) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError('')
    try {
      await auth.signIn(user.email, password)
      onVerified()
    } catch (err) {
      setError(toAppError(err).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Reset your PIN"
      description="Enter your account password to prove it's you. Your other devices will be locked again."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="forgot-pin-form" loading={busy} disabled={!password}>
            Continue
          </Button>
        </>
      }
    >
      <form id="forgot-pin-form" onSubmit={submit} noValidate className="space-y-3">
        {error && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Field label="Account password">
          <Input type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  )
}
