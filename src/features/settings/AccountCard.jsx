import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LogOut, Trash2 } from 'lucide-react'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { TypedConfirmDialog } from '@/components/shared/TypedConfirmDialog'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { useAction } from '@/hooks/useAction'
import { useAuth } from '@/hooks/useAuth'
import { auth } from '@/services/auth'

const schema = z
  .object({ password: z.string().min(8, 'Use at least 8 characters.').max(72, 'Use at most 72 characters.'), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match.' })

export function AccountCard() {
  const { user } = useAuth()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } })

  const [changePassword, changing] = useAction(
    async (v) => {
      await auth.updatePassword(v.password)
      reset()
    },
    { success: 'Password updated' },
  )
  const [deleteAccount, deleting] = useAction(() => auth.deleteAccount())

  return (
    <SettingsSection title="Account" desc={user?.email}>
      <form className="grid gap-3 sm:grid-cols-3 sm:items-start" noValidate onSubmit={handleSubmit(changePassword)}>
        <Field label="New password" error={errors.password?.message}>
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <Field label="Confirm" error={errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" {...register('confirm')} />
        </Field>
        <Button type="submit" variant="outline" className="sm:mt-[1.65rem]" loading={changing} disabled={!watch('password')}>
          Change password
        </Button>
      </form>
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={() => auth.signOut()}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
        <Button variant="ghost" className="text-danger" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4" />
          Delete account…
        </Button>
      </div>
      <TypedConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete your account?"
        description="This permanently deletes your account and ALL data on every device. Export a backup first."
        phrase="DELETE"
        confirmLabel="Delete everything"
        pending={deleting}
        onConfirm={() => deleteAccount()}
      />
    </SettingsSection>
  )
}
